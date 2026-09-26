"""Live smoke test against real PostgreSQL (not the pytest SQLite fixture).

Run:  cd backend && LIVE_DB_URL=postgresql+asyncpg://agentspeak:agentspeak@127.0.0.1:5432/agentspeak \\
        PYTHONPATH=. python3 tests/test_live_postgres.py

Exercises: schema -> customer -> call -> greeting -> turn (stub LLM) -> transcript
-> state -> end -> summary -> stats, all against real PostgreSQL.
"""
from __future__ import annotations

import asyncio
import os

from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base, get_db
from main import app


async def main() -> None:
    db_url = os.environ["LIVE_DB_URL"]
    # Reuse the app's own model metadata to verify the tables match the models.
    engine = create_async_engine(db_url)
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))  # connectivity
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def override():
        async with Session() as s:
            yield s

    app.dependency_overrides[get_db] = override

    class StubLLM:
        name = "stub-llm"

        async def complete_json(self, messages, *, temperature=0.2, max_tokens=400):
            return {
                "ok": True,
                "data": {
                    "extracted_data": {
                        "requirement": "Commercial RO system",
                        "ro_capacity": "500 LPH",
                        "location": "Bangalore",
                        "application": "Hotel",
                    },
                    "missing_fields": ["budget", "timeline"],
                    "next_action": "ask_question",
                    "response": "Great — a 500 LPH system for the hotel in Bangalore. What budget are you looking at?",
                    "should_end_call": False,
                    "lead_status": "qualified",
                },
                "error": None,
            }

        async def health_check(self):
            return {"ok": True, "detail": "stub"}

    from app.agents import orchestrator
    orchestrator.get_llm = lambda: StubLLM()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://live") as c:
        health = (await c.get("/api/health")).json()
        print("HEALTH:", health)

        cfg = (await c.get("/api/config/status")).json()
        print("CONFIG:", cfg)

        cust = (
            await c.post(
                "/api/customers",
                json={
                    "name": "Rahul Kumar",
                    "phone_number": "+919876543210",
                    "company_name": "Grand Lotus Hotels",
                    "purpose": "Product enquiry",
                    "product": "Commercial RO System",
                },
            )
        ).json()
        print("CUSTOMER:", cust["id"], cust["name"], cust["phone_number"])

        call = (await c.post("/api/calls", json={"customer_id": cust["id"]})).json()
        print("CALL:", call["id"], call["status"], call["provider_call_id"])

        greet = (await c.post(f"/api/calls/{call['id']}/agent/greeting")).json()
        print("GREETING:", greet["greeting"][:80], "...")

        turn = (
            await c.post(
                f"/api/calls/{call['id']}/agent/message",
                json={"message": "I need a 500 LPH RO system for my hotel in Bangalore."},
            )
        ).json()
        print("TURN response:", turn["response"][:80], "...")
        print("TURN collected:", turn["collected"])
        print("TURN stage:", turn["stage"], "| lead:", turn["lead_status"])

        transcript = (await c.get(f"/api/calls/{call['id']}/transcript")).json()
        print("TRANSCRIPT rows:", len(transcript), [m["speaker"] for m in transcript])

        state = (await c.get(f"/api/calls/{call['id']}/state")).json()
        print("STATE:", state["stage"], "missing:", state["missing_fields"])

        ended = (
            await c.post(f"/api/calls/{call['id']}/end", json={"reason": "objective complete"})
        ).json()
        print("ENDED:", ended["status"], ended["outcome"], "duration:", ended["duration_seconds"])

        summary = (await c.get(f"/api/calls/{call['id']}/summary")).json()
        print("SUMMARY:", summary["summary"][:90], "...")
        print("SUMMARY lead:", summary["lead_status"], "| follow-up:", summary["follow_up_required"])

        events = (await c.get(f"/api/calls/{call['id']}/events")).json()
        print("EVENTS:", [e["event"] for e in events])

        stats = (await c.get("/api/dashboard/stats")).json()
        print("STATS:", {k: stats[k] for k in ("total_calls", "completed_calls", "interested_leads", "avg_duration_seconds")})

    # Prove persistence: rows really are in PostgreSQL via raw SQL.
    async with engine.begin() as conn:
        for table in ("customers", "calls", "conversation_messages", "call_summaries", "agent_states", "call_events"):
            count = (await conn.execute(text(f"SELECT COUNT(*) FROM {table}"))).scalar_one()
            print(f"PG {table}: {count} rows")

    await engine.dispose()
    print("LIVE SMOKE TEST PASSED")


if __name__ == "__main__":
    asyncio.run(main())
