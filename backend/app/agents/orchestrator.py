"""Agent orchestrator — the core agentic loop, backed by PostgreSQL.

Per customer turn:
  store customer message -> load agent state + recent transcript -> LLM
  structured decision -> coerce/validate -> merge into state -> persist state,
  AI message, lead status -> return the spoken response.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from sqlalchemy.orm import selectinload
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models
from ..config import get_settings
from . import rules
from .llm import LLMProvider, get_llm

logger = logging.getLogger("agentspeak.agent")

_FALLBACK_FIELD_ORDER = [
    "requirement", "ro_capacity", "location", "budget", "timeline", "application"
]
_FALLBACK_QUESTIONS = {
    "requirement": "What product or service are you enquiring about?",
    "ro_capacity": "What capacity or size do you need?",
    "location": "Which city or location will this be used in?",
    "budget": "Do you have an approximate budget in mind?",
    "timeline": "When are you hoping to get this?",
    "application": "What will you use it for?",
}
_ACK_RE = re.compile(
    r"^(?:(?:yes|yeah|yep|yup|ok|okay|sure|right|hello|hi|listen)"
    r"(?:\s+(?:i am|i'm)\s+here)?(?:\s+listen)?|"
    r"i am here(?:\s+listen)?|i'm here(?:\s+listen)?|i have|"
    r"what(?:'s| is) (?:the )?(?:problem|issue))[.!?,\s]*$",
    re.I,
)
_DECLINE_RE = re.compile(
    r"\b(?:not interested|no thanks|no thank you|stop calling|remove me|"
    r"do not call|don't call|not looking)\b",
    re.I,
)


def _fallback_turn(
    message: str, collected: dict, pending_field: str | None
) -> tuple[dict, str, bool, str | None]:
    """Continue a call without an LLM, collecting one field at a time."""
    text = (message or "").strip()
    merged = dict(collected)
    if _DECLINE_RE.search(text) or (pending_field is None and re.fullmatch(r"(?:no|nope|nah)", text, re.I)):
        return merged, "Understood. I won't take more of your time. Have a good day.", True, None

    if pending_field in _FALLBACK_FIELD_ORDER and text and not _ACK_RE.fullmatch(text):
        if re.fullmatch(r"(?:no|nope|nah|not sure|i don't know|dont know|not decided)", text, re.I):
            merged[pending_field] = "Not specified"
        else:
            merged[pending_field] = text[:500]

    next_field = next((field for field in _FALLBACK_FIELD_ORDER if not rules.is_filled(merged.get(field))), None)
    if next_field:
        return merged, _FALLBACK_QUESTIONS[next_field], False, next_field

    recap = "; ".join(
        f"{label}: {merged[field]}"
        for field, label in (
            ("requirement", "requirement"), ("ro_capacity", "capacity"),
            ("location", "location"), ("budget", "budget"),
            ("timeline", "timeline"), ("application", "use case"),
        )
        if rules.is_filled(merged.get(field))
    )
    response = f"Thanks, I have noted {recap}. I'll close this demo now." if recap else "I'm having a technical issue, so I'll close this demo for now. Please try again later."
    return merged, response, True, None



async def _next_sequence(db: AsyncSession, call_id: int) -> int:
    result = await db.execute(
        select(func.count(models.ConversationMessage.id)).where(
            models.ConversationMessage.call_id == call_id
        )
    )
    return (result.scalar_one() or 0) + 1


async def _add_message(
    db: AsyncSession,
    call_id: int,
    speaker: str,
    message: str,
    metadata: dict | None = None,
) -> models.ConversationMessage:
    msg = models.ConversationMessage(
        call_id=call_id,
        speaker=speaker,
        message=message,
        sequence_number=await _next_sequence(db, call_id),
        metadata_json=metadata,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(msg)
    await db.flush()
    return msg


async def log_event(
    db: AsyncSession, call_id: int, event: str, detail: str | None = None
) -> None:
    db.add(models.CallEvent(call_id=call_id, event=event, detail=detail))
    await db.flush()


async def _get_state(db: AsyncSession, call_id: int) -> models.AgentState:
    result = await db.execute(
        select(models.AgentState).where(models.AgentState.call_id == call_id)
    )
    state = result.scalar_one_or_none()
    if state is None:
        state = models.AgentState(call_id=call_id, collected={}, missing_fields=[], stage="greeting")
        db.add(state)
        await db.flush()
    return state


async def get_state(db: AsyncSession, call_id: int) -> models.AgentState:
    return await _get_state(db, call_id)


async def greeting(db: AsyncSession, call: models.Call) -> str:
    """Open the call: connected status + AI greeting message + initial state row."""
    customer = call.customer
    first_name = (customer.name or "").split(" ")[0] or customer.name
    product = customer.product or "water treatment"
    text = (
        f"Hello {first_name}, this is Sam calling from AgentSpeak AI on behalf of your "
        f"service team, regarding your {product} enquiry. Do you have a couple of minutes?"
    )
    await _add_message(db, call.id, "ai", text, {"event": "greeting"})
    await _get_state(db, call.id)
    await log_event(db, call.id, "call_connected", "Greeting delivered")
    await db.commit()
    return text


async def handle_turn(
    db: AsyncSession,
    call: models.Call,
    message: str,
    llm: LLMProvider | None = None,
) -> dict:
    """One full agent turn for a customer utterance."""
    llm = llm or get_llm()
        # Reload the call and customer inside the active DB session.
    result = await db.execute(
        select(models.Call)
        .options(selectinload(models.Call.customer))
        .where(models.Call.id == call.id)
    )
    call = result.scalar_one_or_none()

    if call is None:
        raise ValueError("Call not found.")
    settings = get_settings()

    if call.status in ("completed", "failed", "no_answer"):
        raise ValueError("Call has already ended.")

    # 1. Store the raw customer message.
    await _add_message(db, call.id, "customer", message)

    # 2. Load state + bounded recent transcript.
    state = await _get_state(db, call.id)
    collected = dict(state.collected or {})
    stage = state.stage or "greeting"

    result = await db.execute(
        select(models.ConversationMessage)
        .where(models.ConversationMessage.call_id == call.id)
        .order_by(models.ConversationMessage.sequence_number.asc())
    )
    all_messages = result.scalars().all()
    recent = all_messages[-12:]
    previous_ai = next((m for m in reversed(all_messages[:-1]) if m.speaker == "ai"), None)
    previous_metadata = previous_ai.metadata_json if previous_ai and isinstance(previous_ai.metadata_json, dict) else {}
    fallback_mode = bool(previous_metadata.get("fallback_mode"))
    pending_field = previous_metadata.get("pending_field") if fallback_mode else None

    # 3. Use the LLM when available; after a provider failure, stay in a
    # deterministic collection flow for this call instead of repeating errors.
    if fallback_mode:
        outcome = {"ok": False, "data": None, "error": "LLM fallback mode active"}
    else:
        messages = [{"role": "system", "content": rules.build_system_prompt(
            collected, stage, customer_name=None, product=call.customer.product or "commercial RO systems"
        )}]
        for m in recent:
            role = "assistant" if m.speaker == "ai" else "user"
            messages.append({"role": role, "content": m.message})
        try:
            outcome = await llm.complete_json(messages, temperature=0.2, max_tokens=400)
        except Exception as exc:  # noqa: BLE001 — provider crashes degrade to fallback
            logger.warning("LLM provider raised for call %s: %s", call.id, exc)
            outcome = {"ok": False, "data": None, "error": f"provider error: {exc}"}

    if outcome["ok"] and rules.coerce_decision(outcome.get("data")) is None:
        outcome = {"ok": False, "data": None, "error": "LLM decision failed validation"}

    await log_event(
        db,
        call.id,
        "agent_fallback_turn" if fallback_mode else ("agent_processing" if outcome["ok"] else "agent_error"),
        "Deterministic collection mode" if fallback_mode else (f"decision via {llm.name}" if outcome["ok"] else str(outcome["error"])[:300]),
    )

    # 4. Degrade gracefully: keep collecting requirements without looping the
    # same "please repeat" message when the LLM quota/provider is unavailable.
    if not outcome["ok"]:
        merged, fallback, should_end, fallback_field = _fallback_turn(message, collected, pending_field)
        state.collected = merged
        state.missing_fields = rules.missing_fields(merged)
        state.stage = "discovery" if fallback_field else rules.stage_for(merged, stage)
        state.turn_count += 1
        state.updated_at = datetime.now(timezone.utc)
        declined = bool(_DECLINE_RE.search(message or "")) or (
            pending_field is None and bool(re.fullmatch(r"(?:no|nope|nah)", (message or "").strip(), re.I))
        )
        call.lead_status = "not_interested" if should_end and declined else (
            "interested" if any(rules.is_filled(merged.get(f)) for f in _FALLBACK_FIELD_ORDER) else call.lead_status
        )
        call.silence_strike_count = 0
        call.follow_up_required = bool(should_end and rules.missing_fields(merged))
        await _add_message(db, call.id, "ai", fallback, {
            "event": "agent_error_fallback", "fallback_mode": True, "pending_field": fallback_field
        })
        await db.commit()
        return {
            "response": fallback,
            "should_end_call": should_end,
            "lead_status": call.lead_status,
            "collected": merged,
            "missing_fields": rules.missing_fields(merged),
            "stage": state.stage,
            "agent_error": True,
        }

    # 5. Validate/repair decision; merge extracted fields into state.
    decision = rules.coerce_decision(outcome["data"])
    if decision is None:
        await log_event(db, call.id, "agent_error", "LLM decision failed validation")
        fallback = "Sorry, one moment please."
        await _add_message(db, call.id, "ai", fallback, {"event": "agent_error_fallback"})
        await db.commit()
        return {
            "response": fallback,
            "should_end_call": False,
            "lead_status": call.lead_status,
            "agent_error": True,
        }

    merged = dict(collected)
    for field in rules.AGENT_FIELD_NAMES:
        incoming = decision["extracted_data"].get(field)
        if isinstance(incoming, str) and incoming.strip():
            merged[field] = incoming

    # 6. Lead status (sticky), stage, follow-up flag.
    new_fields = rules.count_new_fields(collected, merged)
    lead_status = rules.derive_lead_status(message, call.lead_status, new_fields)
    next_stage = rules.stage_for(merged, stage)
    follow_up_required = (
        (len(rules.missing_fields(merged)) > 0 or lead_status == "follow_up")
        if decision["should_end_call"]
        else call.follow_up_required
    )

    # 7. Persist state + AI message + call row.
    state.collected = merged
    state.missing_fields = rules.missing_fields(merged)
    state.stage = next_stage
    state.turn_count += 1
    state.updated_at = datetime.now(timezone.utc)

    await _add_message(
        db,
        call.id,
        "ai",
        decision["response"],
        {
            "extracted": decision["extracted_data"],
            "missing_fields": rules.missing_fields(merged),
            "next_action": decision["next_action"],
        },
    )

    call.lead_status = lead_status
    call.follow_up_required = follow_up_required
    call.silence_strike_count = 0  # customer responded
    if call.status != "in_conversation":
        call.status = "in_conversation"

    await db.commit()
    return {
        "response": decision["response"],
        "should_end_call": decision["should_end_call"],
        "lead_status": lead_status,
        "collected": merged,
        "missing_fields": rules.missing_fields(merged),
        "stage": next_stage,
    }


async def handle_silence(db: AsyncSession, call: models.Call) -> dict:
    """Customer silence: escalating prompts, persisted like normal messages."""
    strike = call.silence_strike_count + 1
    ended = rules.should_end_for_silence(strike)
    text = rules.silence_response(strike)

    await _add_message(db, call.id, "ai", text, {"event": "silence_prompt", "strike": strike})
    call.silence_strike_count = strike
    await log_event(
        db, call.id, "customer_silent", f"Strike {strike}{' — ending call' if ended else ''}"
    )
    await db.commit()
    return {"response": text, "should_end_call": ended}


async def generate_summary(db: AsyncSession, call: models.Call, llm: LLMProvider | None = None) -> dict:
    """Generate and persist the structured call summary from the actual transcript."""
    llm = llm or get_llm()

    existing = await db.execute(
        select(models.CallSummary).where(models.CallSummary.call_id == call.id)
    )
    found = existing.scalar_one_or_none()
    if found is not None:
        return {"id": found.id, "reused": True}

    result = await db.execute(
        select(models.ConversationMessage)
        .where(models.ConversationMessage.call_id == call.id)
        .order_by(models.ConversationMessage.sequence_number.asc())
    )
    messages = result.scalars().all()

    if not messages:
        summary = models.CallSummary(
            call_id=call.id,
            summary="No conversation took place on this call.",
            customer_intent="unknown",
            key_requirements=[],
            follow_up_required=False,
            lead_status=call.lead_status,
            outcome=call.outcome,
        )
        db.add(summary)
        await db.flush()
        await db.commit()
        return {"id": summary.id, "reused": False}

    state_result = await db.execute(
        select(models.AgentState).where(models.AgentState.call_id == call.id)
    )
    state = state_result.scalar_one_or_none()
    state_lines = (
        "; ".join(f"{k}: {v}" for k, v in (state.collected or {}).items() if rules.is_filled(v))
        if state
        else "none"
    )

    dialogue = "\n".join(
        f"{'AI' if m.speaker == 'ai' else m.speaker.upper()}: {m.message}" for m in messages
    )[-6000:]

    fallback_mode = any(
        m.speaker == "ai" and isinstance(m.metadata_json, dict) and m.metadata_json.get("fallback_mode")
        for m in messages
    )
    if fallback_mode:
        outcome = {"ok": False, "data": None, "error": "LLM fallback mode active"}
    else:
        try:
            outcome = await llm.complete_json(
                [
                    {
                        "role": "system",
                        "content": (
                            'You are an analyst summarizing an AI sales call. Respond with STRICT JSON '
                            'only. Schema: {"summary": string (2-3 sentences), "customer_intent": string, '
                            '"key_requirements": string[], "budget": string|null, "timeline": string|null, '
                            '"location": string|null, "application": string|null, "lead_status": '
                            '"new"|"interested"|"qualified"|"not_interested"|"follow_up", '
                            '"follow_up_required": boolean, "outcome": "interested"|"not_interested"|'
                            '"follow_up_required"|"information_collected"|"customer_unavailable"|'
                            '"customer_declined"|"technical_failure"|"completed"|"failed"}'
                        ),
                    },
                    {"role": "user", "content": f"Agent state at end of call: {state_lines}\n\nCALL TRANSCRIPT:\n{dialogue}"},
                ],
                temperature=0.1,
                max_tokens=500,
            )
        except Exception as exc:  # noqa: BLE001 — summaries must survive provider failures
            logger.warning("summary LLM failed for call %s: %s", call.id, exc)
            outcome = {"ok": False, "data": None, "error": str(exc)}
    fallback_mode = fallback_mode or not outcome.get("ok", False)

    lead_options = rules.LEAD_STATUSES
    outcome_options = [
        "interested", "not_interested", "follow_up_required", "information_collected",
        "customer_unavailable", "customer_declined", "technical_failure", "completed", "failed",
    ]

    payload = {
        "summary": (
            f"Call with {call.customer.name}: {len(messages)} transcript entries recorded; "
            "AI summary generation was unavailable."
        ),
        "customer_intent": "unknown",
        "key_requirements": [],
        "budget": None,
        "timeline": None,
        "location": None,
        "application": None,
        "lead_status": call.lead_status,
        "follow_up_required": call.follow_up_required,
        "outcome": call.outcome,
    }

    if fallback_mode:
        captured = {field: (state.collected or {}).get(field) for field in _FALLBACK_FIELD_ORDER if state and rules.is_filled((state.collected or {}).get(field))}
        payload["customer_intent"] = str(captured.get("requirement") or "unknown")
        payload["key_requirements"] = [f"{field}: {value}" for field, value in captured.items()]
        payload["budget"] = captured.get("budget")
        payload["timeline"] = captured.get("timeline")
        payload["location"] = captured.get("location")
        payload["application"] = captured.get("application")
        payload["follow_up_required"] = bool(rules.missing_fields(state.collected or {})) if state else True
        if call.lead_status == "not_interested":
            payload["outcome"] = "customer_declined"
        elif captured:
            payload["outcome"] = "information_collected"
        else:
            payload["outcome"] = "technical_failure"
        details = "; ".join(f"{field}: {value}" for field, value in captured.items())
        payload["summary"] = f"Call with {call.customer.name}. The LLM quota was unavailable, so deterministic collection mode was used. Captured details: {details or 'none'}."

    if outcome["ok"] and isinstance(outcome["data"], dict):
        d = outcome["data"]
        payload.update(
            {
                "summary": d.get("summary") if isinstance(d.get("summary"), str) else payload["summary"],
                "customer_intent": d.get("customer_intent") if isinstance(d.get("customer_intent"), str) else "unknown",
                "key_requirements": [
                    r for r in d.get("key_requirements", []) if isinstance(r, str)
                ][:8] if isinstance(d.get("key_requirements"), list) else [],
                "budget": d.get("budget") if isinstance(d.get("budget"), str) else None,
                "timeline": d.get("timeline") if isinstance(d.get("timeline"), str) else None,
                "location": d.get("location") if isinstance(d.get("location"), str) else None,
                "application": d.get("application") if isinstance(d.get("application"), str) else None,
                "lead_status": d.get("lead_status") if d.get("lead_status") in lead_options else call.lead_status,
                "follow_up_required": d.get("follow_up_required") if isinstance(d.get("follow_up_required"), bool) else call.follow_up_required,
                "outcome": d.get("outcome") if d.get("outcome") in outcome_options else call.outcome,
            }
        )

    summary = models.CallSummary(
        call_id=call.id,
        summary=payload["summary"],
        customer_intent=payload["customer_intent"],
        key_requirements=payload["key_requirements"],
        budget=payload["budget"],
        timeline=payload["timeline"],
        location=payload["location"],
        application=payload["application"],
        follow_up_required=payload["follow_up_required"],
        lead_status=payload["lead_status"],
        outcome=payload["outcome"],
    )
    db.add(summary)

    call.lead_status = payload["lead_status"]
    call.outcome = payload["outcome"]
    call.follow_up_required = payload["follow_up_required"]

    await db.commit()
    return {"id": summary.id, "reused": False}


async def end_call(
    db: AsyncSession,
    call: models.Call,
    final_status: str = "completed",
    outcome: str = "completed",
    reason: str | None = None,
) -> models.Call:
    """Terminate the call and stamp duration."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    started = call.started_at if call.started_at.tzinfo else call.started_at.replace(tzinfo=timezone.utc)
    call.status = final_status
    call.outcome = outcome
    call.ended_at = now
    call.duration_seconds = max(0, int((now - started).total_seconds()))
    call.error_message = reason
    await db.commit()
    return call


async def force_end(db: AsyncSession, call: models.Call) -> models.Call:
    return await end_call(db, call, final_status="failed", outcome="technical_failure",
                          reason="Call force-ended by operator.")


async def mark_silence_reset(db: AsyncSession, call: models.Call) -> None:
    call.silence_strike_count = 0
    await db.flush()


_ = get_settings  # keep import referenced for tuning readers
