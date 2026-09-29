"""API tests — customers, calls, agent loop (mocked LLM), summaries, stats."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

async def test_customer_creation(client, customer):
    assert customer["name"] == "Rahul Kumar"
    assert customer["phone_number"] == "+919876543210"


async def test_customer_retrieval(client, customer):
    resp = await client.get(f"/api/customers/{customer['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == customer["id"]


async def test_customer_list_and_search(client, customer):
    resp = await client.get("/api/customers", params={"search": "rahul"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    resp = await client.get("/api/customers", params={"search": "zzz"})
    assert resp.json() == []


@pytest.mark.parametrize(
    "phone",
    ["123", "abcdefghij", "+9112345678901234567", ""],
)
async def test_customer_invalid_phone_rejected(client, phone):
    resp = await client.post(
        "/api/customers", json={"name": "Test User", "phone_number": phone}
    )
    assert resp.status_code == 422


async def test_customer_update_and_delete(client, customer):
    resp = await client.put(
        f"/api/customers/{customer['id']}", json={"name": "Rahul K.", "product": "RO System"}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Rahul K."

    resp = await client.delete(f"/api/customers/{customer['id']}")
    assert resp.status_code == 204
    resp = await client.get(f"/api/customers/{customer['id']}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Call lifecycle
# ---------------------------------------------------------------------------

async def test_call_creation(client, call):
    assert call["status"] in ("calling", "queued")
    assert call["mode"] == "browser"
    assert call["customer"]["name"] == "Rahul Kumar"
    assert call["provider_call_id"].startswith("browser-")


async def test_greeting_persists_transcript(client, call):
    resp = await client.post(f"/api/calls/{call['id']}/agent/greeting")
    assert resp.status_code == 200
    assert "Sam" in resp.json()["greeting"]

    resp = await client.get(f"/api/calls/{call['id']}/transcript")
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["speaker"] == "ai"
    assert rows[0]["sequence_number"] == 1


async def test_call_end_and_summary_fallback(client, call):
    await client.post(f"/api/calls/{call['id']}/agent/greeting")
    resp = await client.post(f"/api/calls/{call['id']}/end", json={"reason": "demo end"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["duration_seconds"] is not None

    # Summary generated even without LLM script (fallback path).
    resp = await client.get(f"/api/calls/{call['id']}/summary")
    assert resp.status_code == 200
    assert "No conversation" in resp.json()["summary"] or "summary" in resp.json()["summary"].lower()


async def test_call_end_twice_conflicts(client, call):
    await client.post(f"/api/calls/{call['id']}/end")
    resp = await client.post(f"/api/calls/{call['id']}/end")
    assert resp.status_code == 409


async def test_agent_turn_rejected_after_end(client, call):
    await client.post(f"/api/calls/{call['id']}/agent/greeting")
    await client.post(f"/api/calls/{call['id']}/end")
    resp = await client.post(
        f"/api/calls/{call['id']}/agent/message", json={"message": "hello?"}
    )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Agent loop (mocked LLM)
# ---------------------------------------------------------------------------

async def test_agent_turn_extracts_and_persists(client, call, fake_llm, monkeypatch):
    from app.api_calls import orchestrator

    fake_llm.script.append(
        {
            "extracted_data": {"ro_capacity": "500 LPH", "application": "Hotel"},
            "missing_fields": ["location", "budget", "timeline"],
            "next_action": "ask_question",
            "response": "Great. Which city will the system be installed in?",
            "should_end_call": False,
            "lead_status": "interested",
        }
    )
    monkeypatch.setattr(orchestrator, "get_llm", lambda: fake_llm)

    await client.post(f"/api/calls/{call['id']}/agent/greeting")
    resp = await client.post(
        f"/api/calls/{call['id']}/agent/message",
        json={"message": "I need a 500 LPH RO system for my hotel."},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["response"] == "Great. Which city will the system be installed in?"
    assert body["collected"]["ro_capacity"] == "500 LPH"
    # Two fields filled in one turn (capacity + application) → qualified per rules.
    assert body["lead_status"] == "qualified"
    assert body["stage"] in ("discovery", "qualifying")

    # Transcript has customer + ai + greeting rows in order.
    transcript = (await client.get(f"/api/calls/{call['id']}/transcript")).json()
    speakers = [m["speaker"] for m in transcript]
    assert speakers == ["ai", "customer", "ai"]
    assert transcript[2]["message"] == "Great. Which city will the system be installed in?"

    # Agent state persisted.
    state = (await client.get(f"/api/calls/{call['id']}/state")).json()
    assert state["collected"]["ro_capacity"] == "500 LPH"
    assert "location" in state["missing_fields"]


async def test_summary_from_real_transcript_with_mocked_llm(client, call, fake_llm, monkeypatch):
    from app.api_calls import orchestrator

    fake_llm.script.append(
        {
            "extracted_data": {"ro_capacity": "500 LPH", "location": "Bangalore"},
            "missing_fields": ["budget"],
            "next_action": "ask_question",
            "response": "Understood. Do you have a specific budget range?",
            "should_end_call": False,
            "lead_status": "interested",
        }
    )
    monkeypatch.setattr(orchestrator, "get_llm", lambda: fake_llm)

    await client.post(f"/api/calls/{call['id']}/agent/greeting")
    await client.post(
        f"/api/calls/{call['id']}/agent/message",
        json={"message": "I need a 500 LPH system in Bangalore."},
    )

    fake_llm.script.append(
        {
            "summary": "Customer seeks a 500 LPH commercial RO system in Bangalore.",
            "customer_intent": "purchase enquiry",
            "key_requirements": ["500 LPH capacity", "Bangalore installation"],
            "budget": None,
            "timeline": "Within 1 month",
            "location": "Bangalore",
            "application": "Hotel",
            "lead_status": "qualified",
            "follow_up_required": True,
            "outcome": "follow_up_required",
        }
    )

    resp = await client.post(f"/api/calls/{call['id']}/end", json={"reason": "done"})
    assert resp.status_code == 200

    summary = (await client.get(f"/api/calls/{call['id']}/summary")).json()
    assert summary["lead_status"] == "qualified"
    assert "500 LPH" in summary["summary"]
    assert any("Bangalore" in r for r in summary["key_requirements"])

    # Call row updated from the summary.
    call_row = (await client.get(f"/api/calls/{call['id']}")).json()
    assert call_row["lead_status"] == "qualified"
    assert call_row["follow_up_required"] is True


async def test_llm_failure_graceful_fallback(client, call, fake_llm, monkeypatch):
    from app.api_calls import orchestrator

    async def broken(*args, **kwargs):
        raise RuntimeError("network down")

    fake_llm.complete_json = broken
    monkeypatch.setattr(orchestrator, "get_llm", lambda: fake_llm)

    await client.post(f"/api/calls/{call['id']}/agent/greeting")
    resp = await client.post(
        f"/api/calls/{call['id']}/agent/message", json={"message": "hello"}
    )
    assert resp.status_code == 200
    assert resp.json()["agent_error"] is True
    assert "repeat" in resp.json()["response"].lower()


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------

async def test_dashboard_stats_from_db(client, customer, fake_llm, monkeypatch):
    from app.api_calls import orchestrator

    stats0 = (await client.get("/api/dashboard/stats")).json()
    assert stats0["total_calls"] == 0

    resp = await client.post("/api/calls", json={"customer_id": customer["id"]})
    call_id = resp.json()["id"]
    await client.post(f"/api/calls/{call_id}/agent/greeting")

    fake_llm.script.append(
        {
            "extracted_data": {"ro_capacity": "500 LPH"},
            "missing_fields": ["location"],
            "next_action": "ask_question",
            "response": "Which city?",
            "should_end_call": False,
            "lead_status": "interested",
        }
    )
    monkeypatch.setattr(orchestrator, "get_llm", lambda: fake_llm)
    await client.post(f"/api/calls/{call_id}/agent/message", json={"message": "I need 500 LPH."})
    await client.post(f"/api/calls/{call_id}/end")

    stats = (await client.get("/api/dashboard/stats")).json()
    assert stats["total_calls"] == 1
    assert stats["completed_calls"] == 1
    assert stats["interested_leads"] == 1
    assert stats["total_customers"] == 1
    assert stats["calls_by_status"]["completed"] == 1


async def test_fallback_rejects_unclear_budget_and_timeline():
    from app.agents.orchestrator import _fallback_turn

    collected, response, should_end, pending = _fallback_turn("15 to paper", {}, "budget")
    assert collected == {}
    assert "budget" in response.lower()
    assert should_end is False
    assert pending == "budget"

    collected, response, should_end, pending = _fallback_turn("at home", {}, "timeline")
    assert collected == {}
    assert "When are you hoping" in response
    assert should_end is False
    assert pending == "timeline"


async def test_fallback_normalizes_location_and_accepts_capacity():
    from app.agents.orchestrator import _fallback_turn

    collected, _, should_end, pending = _fallback_turn("add Bhopal", {}, "location")
    assert collected["location"] == "Bhopal"
    assert should_end is False
    assert pending == "ro_capacity"

    collected, _, should_end, pending = _fallback_turn("25", collected, "ro_capacity")
    assert collected["ro_capacity"] == "25"
    assert should_end is False
    assert pending == "budget"
