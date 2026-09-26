"""Unit tests for pure agent decision rules (no I/O)."""
from __future__ import annotations

import pytest

from app.agents import rules

ALL_MISSING = {f: None for f in rules.AGENT_FIELD_NAMES}


def test_missing_fields_all_when_empty():
    assert rules.missing_fields(ALL_MISSING) == rules.REQUIRED_FIELDS


def test_missing_fields_never_reasks():
    collected = {**ALL_MISSING, "ro_capacity": "500 LPH", "location": "Bangalore"}
    missing = rules.missing_fields(collected)
    assert "budget" in missing
    assert "ro_capacity" not in missing
    assert "location" not in missing


def test_missing_fields_whitespace_is_missing():
    collected = {**ALL_MISSING, "budget": "   "}
    assert "budget" in rules.missing_fields(collected)


def test_stage_greeting_to_closing():
    assert rules.stage_for(ALL_MISSING, "greeting") == "greeting"
    full = {
        **ALL_MISSING,
        "requirement": "Commercial RO",
        "ro_capacity": "500 LPH",
        "location": "Bangalore",
        "budget": "₹1,00,000",
        "timeline": "Within 1 month",
        "application": "Hotel",
    }
    assert rules.stage_for(full, "discovery") == "closing"
    assert rules.stage_for(ALL_MISSING, "ended") == "ended"


def test_lead_status_negative():
    assert rules.derive_lead_status("Not interested, stop calling.", "interested", 0) == "not_interested"


def test_lead_status_promotes_to_qualified():
    assert rules.derive_lead_status("Yes, we need it.", "new", 2) == "qualified"


def test_lead_status_sticky_not_interested():
    assert rules.derive_lead_status("well maybe", "not_interested", 1) == "not_interested"


def test_silence_escalation():
    assert rules.silence_response(1) == "Are you still there?"
    assert "wait a little longer" in rules.silence_response(2)
    assert rules.should_end_for_silence(rules.SILENCE_MAX_ATTEMPTS) is True
    assert rules.should_end_for_silence(1) is False


def test_coerce_decision_valid():
    d = rules.coerce_decision(
        {
            "extracted_data": {"ro_capacity": "500 LPH"},
            "missing_fields": ["location", "budget"],
            "next_action": "ask_question",
            "response": "Great. Which city?",
            "should_end_call": False,
            "lead_status": "interested",
        }
    )
    assert d is not None
    assert d["extracted_data"]["ro_capacity"] == "500 LPH"
    assert d["missing_fields"] == ["location", "budget"]


def test_coerce_decision_garbage_clamped():
    d = rules.coerce_decision(
        {
            "extracted_data": {"evil": "x", "budget": 42},
            "missing_fields": ["nope", "location"],
            "next_action": "dance",
            "lead_status": "super_hot",
            "response": "ok",
        }
    )
    assert d["extracted_data"] == {}
    assert d["missing_fields"] == ["location"]
    assert d["next_action"] == "ask_question"
    assert d["lead_status"] == "new"


def test_coerce_decision_rejects_non_dict():
    assert rules.coerce_decision("hello") is None
    assert rules.coerce_decision(None) is None


def test_parse_json_loose_fenced_and_salvage():
    assert rules.parse_json_loose('```json\n{"a": 1}\n```') == {"a": 1}
    assert rules.parse_json_loose('noise {"a": 2} trailing') == {"a": 2}
    assert rules.parse_json_loose("no json at all") is None


def test_count_new_fields():
    before = dict(ALL_MISSING)
    after = {**ALL_MISSING, "ro_capacity": "500 LPH", "location": "Bangalore"}
    assert rules.count_new_fields(before, after) == 2


def test_system_prompt_contains_state_and_rules():
    collected = {**ALL_MISSING, "ro_capacity": "500 LPH"}
    prompt = rules.build_system_prompt(collected, "discovery", "Rahul", "Commercial RO System")
    assert "ro_capacity: 500 LPH" in prompt
    assert "Sam" in prompt
    assert "NEVER ask for a field already filled" in prompt
    assert "STRICT JSON" in prompt
