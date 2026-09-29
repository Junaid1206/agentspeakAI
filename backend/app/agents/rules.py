"""Agent decision rules — pure functions, unit-tested without any I/O.

Ported 1:1 from the original TypeScript implementation so behaviour is
identical across the two backends.
"""
from __future__ import annotations

import json
import re
from typing import Any

AGENT_FIELD_NAMES = [
    "customer_name",
    "company_name",
    "requirement",
    "ro_capacity",
    "location",
    "budget",
    "timeline",
    "application",
    "additional_requirements",
]

REQUIRED_FIELDS = [
    "requirement",
    "ro_capacity",
    "location",
    "budget",
    "timeline",
    "application",
]

FIELD_LABELS = {
    "customer_name": "customer name",
    "company_name": "company name",
    "requirement": "requirement",
    "ro_capacity": "RO capacity",
    "location": "location / city",
    "budget": "budget",
    "timeline": "timeline",
    "application": "application / use case",
    "additional_requirements": "additional requirements",
}

STAGES = ["greeting", "discovery", "qualifying", "closing", "ended"]

NEXT_ACTIONS = ["ask_question", "clarify", "confirm_details", "close_call"]
LEAD_STATUSES = ["new", "interested", "qualified", "not_interested", "follow_up"]

SILENCE_MAX_ATTEMPTS = 3


def silence_response(strike: int) -> str:
    if strike == 1:
        return "Are you still there?"
    if strike == 2:
        return "I'll wait a little longer — just let me know when you're ready."
    return "Thank you for your time. I'll wrap up the call now — have a great day."


def should_end_for_silence(strike: int) -> bool:
    return strike >= SILENCE_MAX_ATTEMPTS


def is_filled(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def missing_fields(collected: dict, required: list[str] | None = None) -> list[str]:
    required = required or REQUIRED_FIELDS
    return [f for f in required if not is_filled(collected.get(f))]


def stage_for(collected: dict, stage: str) -> str:
    if stage == "ended":
        return "ended"
    missing = missing_fields(collected)
    if not missing:
        return "closing"
    if len(missing) == len(REQUIRED_FIELDS):
        return "greeting"
    if is_filled(collected.get("requirement")):
        return "qualifying" if len(missing) <= 2 else "discovery"
    return "discovery"


_NEGATIVE_PATTERNS = [
    re.compile(r"\bnot interested\b", re.I),
    re.compile(r"\bno thank", re.I),
    re.compile(r"\bno thanks\b", re.I),
    re.compile(r"\bstop calling\b", re.I),
    re.compile(r"\bremove me\b", re.I),
    re.compile(r"\bdo not call\b", re.I),
    re.compile(r"\bdon'?t call\b", re.I),
    re.compile(r"\bnot looking\b", re.I),
]

_POSITIVE_PATTERNS = [
    re.compile(r"\binterested\b", re.I),
    re.compile(r"\bsounds good\b", re.I),
    re.compile(r"\bsure\b", re.I),
    re.compile(r"\byes please\b", re.I),
    re.compile(r"\bthat works\b", re.I),
    re.compile(r"\bi want\b", re.I),
    re.compile(r"\bi need\b", re.I),
    re.compile(r"\bwe need\b", re.I),
    re.compile(r"\blooking for\b", re.I),
    re.compile(r"\bcould you send\b", re.I),
    re.compile(r"\bquote\b", re.I),
    re.compile(r"\bprice\b", re.I),
]


def derive_lead_status(message: str, current: str, new_fields_filled: int) -> str:
    text = message or ""
    if any(p.search(text) for p in _NEGATIVE_PATTERNS):
        return "not_interested"
    if current == "not_interested":
        return "not_interested"
    if new_fields_filled > 1:
        return "qualified"
    if (
        current in ("qualified", "interested")
        or any(p.search(text) for p in _POSITIVE_PATTERNS)
        or new_fields_filled > 0
    ):
        return "interested"
    return current


def count_new_fields(before: dict, after: dict) -> int:
    n = 0
    for f in AGENT_FIELD_NAMES:
        was = before.get(f)
        is_now = after.get(f)
        if isinstance(is_now, str) and is_now.strip() and not isinstance(was, str):
            n += 1
    return n


def coerce_decision(raw: Any) -> dict | None:
    """Clamp an LLM JSON decision into a valid decision dict. Never trusts output."""
    if not isinstance(raw, dict):
        return None

    extracted: dict = {}
    raw_extracted = raw.get("extracted_data")
    if isinstance(raw_extracted, dict):
        for key, value in raw_extracted.items():
            if key in AGENT_FIELD_NAMES:
                if isinstance(value, str) and value.strip():
                    extracted[key] = value.strip()
                elif value is None:
                    extracted[key] = None

    missing = []
    if isinstance(raw.get("missing_fields"), list):
        missing = [
            f for f in raw["missing_fields"]
            if isinstance(f, str) and f in AGENT_FIELD_NAMES
        ]

    next_action = raw.get("next_action")
    if next_action not in NEXT_ACTIONS:
        next_action = "ask_question"

    lead_status = raw.get("lead_status")
    if lead_status not in LEAD_STATUSES:
        lead_status = "new"

    response = raw.get("response")
    response = response.strip() if isinstance(response, str) else ""

    return {
        "extracted_data": extracted,
        "missing_fields": missing,
        "next_action": next_action,
        "response": response,
        "should_end_call": raw.get("should_end_call") is True,
        "lead_status": lead_status,
    }


def parse_json_loose(text: str) -> Any:
    """Best-effort JSON extraction from an LLM text response."""
    trimmed = (text or "").strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", trimmed)
    candidate = fenced.group(1) if fenced else trimmed
    try:
        return json.loads(candidate)
    except (json.JSONDecodeError, TypeError):
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(candidate[start : end + 1])
            except json.JSONDecodeError:
                return None
        return None


def build_system_prompt(
    collected: dict,
    stage: str,
    customer_name: str | None,
    product: str,
    recent_turns: int = 12,
    customer_language: str | None = None,
) -> str:
    """Build the compact system prompt: persona + structured state + rules."""
    state_lines = [
        f"{f}: {collected.get(f) if is_filled(collected.get(f)) else '—'}"
        for f in AGENT_FIELD_NAMES
    ]
    missing = missing_fields(collected)
    if stage == "greeting":
        stage_hint = "The call just started. Confirm the person and state the purpose of the call."
    elif stage == "closing":
        stage_hint = (
            "All key details are collected. Recap the details, ask if anything else is needed, "
            "then close politely."
        )
    else:
        stage_hint = "Continue discovery/qualifying for the missing details."

    fields_schema = json.dumps({field: None for field in AGENT_FIELD_NAMES}, ensure_ascii=False)
    return "\n".join(
        [
            "You are Sam, the professional outbound AI calling agent for AgentSpeak AI. "
            "AgentSpeak AI places AI voice agents that contact a business's customers on its behalf.",
            "You are speaking over a live voice call. Mirror the customer's language when clear; support English, Hindi, and natural Hinglish. If the customer asks to switch languages, switch. Keep responses simple and suitable for spoken TTS. Keep every response to ONE or TWO short, natural spoken sentences (under 45 words). No emojis, no markdown, no lists.",
            f"Purpose of the call: introduce {product} and collect the customer's requirements.",
            "Infer language from the latest customer utterance and conversation context. Ask for confirmation rather than pretending to understand unclear speech.",
            (
                f"The customer's name is {customer_name}."
                if customer_name
                else "You don't know the customer's name yet; learn it naturally."
            ),
            "",
            "CURRENT AGENT STATE (structured):",
            *state_lines,
            "",
            f"MISSING FIELDS: {', '.join(missing) if missing else 'none'}",
            f"CONVERSATION STAGE: {stage}. {stage_hint}",
            "",
            "RULES:",
            "- NEVER ask for a field already filled in the state. Never repeat an answered question.",
            "- Ask for exactly ONE missing field per turn.",
            '- If the latest customer message is unclear, set next_action="clarify", do not extract a guess, and ask a short clarifying question. Treat speech-recognition garbling as uncertain, not confirmed.',
            '- If the customer asks for suggestions, recommendations, or options, help using only known product facts. Never invent prices, stock, specifications, or promises.',
            '- If a new answer conflicts with a previously collected value, ask for confirmation before changing it.',
            '- Do not treat requests such as "can you suggest me" or "give me options" as answers to the current field.',
            '- Resolve references like "same hotel", "that city", "around one lakh", "next month" into state.',
            '- If the customer declines or asks you to stop: should_end_call=true, lead_status="not_interested".',
            '- When all key fields are collected: recap once, then next_action="close_call", should_end_call=true.',
            "- extracted_data should include fields learnable from the WHOLE conversation (null when unknown).",
            "",
            "Respond with STRICT JSON only, no prose:",
            '{"extracted_data": '
            + fields_schema
            + ', "missing_fields": [], "next_action": "ask_question", '
            '"response": "A short spoken response.", "should_end_call": false, '
            '"lead_status": "new"}',
        ]
    )
