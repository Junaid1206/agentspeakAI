"""Call REST API — lifecycle, transcript, summary, agent loop, events."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from . import models, schemas
from .agents import orchestrator
from .calling.providers import make_calling_provider
from .db import get_db

logger = logging.getLogger("agentspeak.api")

router = APIRouter(prefix="/api/calls", tags=["calls"])


async def _load_call(db: AsyncSession, call_id: int) -> models.Call:
    result = await db.execute(
        select(models.Call)
        .options(selectinload(models.Call.customer))
        .where(models.Call.id == call_id)
    )
    call = result.scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found.")
    return call


@router.post("", response_model=schemas.CallOut, status_code=201)
async def create_call(body: schemas.CallCreate, db: AsyncSession = Depends(get_db)):
    """Initiate a call. Telephony mode dials via the provider; browser mode opens
    a demo session that the frontend voice console attaches to."""
    customer = await db.get(models.Customer, body.customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found.")

    mode = body.mode if body.mode in ("browser", "telephony") else "browser"
    provider = make_calling_provider(mode)
    session = await provider.initiate_call(to=customer.phone_number)

    call = models.Call(
        customer_id=customer.id,
        provider_call_id=session.provider_call_id,
        mode=mode,
        direction="outbound",
        status="calling",
        outcome="pending",
        lead_status="new",
        silence_strike_count=0,
        started_at=datetime.now(timezone.utc),
    )
    db.add(call)
    await db.flush()
    await orchestrator.log_event(db, call.id, "call_initiated", f"provider={provider.name}")
    await db.commit()
    await db.refresh(call)
    call.customer = customer
    return call


@router.get("", response_model=list[schemas.CallOut])
async def list_calls(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.Call)
        .options(selectinload(models.Call.customer))
        .order_by(models.Call.started_at.desc())
    )
    return result.scalars().all()


@router.get("/{call_id}", response_model=schemas.CallOut)
async def get_call(call_id: int, db: AsyncSession = Depends(get_db)):
    return await _load_call(db, call_id)


@router.get("/{call_id}/transcript", response_model=list[schemas.MessageOut])
async def get_transcript(call_id: int, db: AsyncSession = Depends(get_db)):
    await _load_call(db, call_id)
    result = await db.execute(
        select(models.ConversationMessage)
        .where(models.ConversationMessage.call_id == call_id)
        .order_by(models.ConversationMessage.sequence_number.asc())
    )
    return result.scalars().all()


@router.get("/{call_id}/summary", response_model=schemas.SummaryOut)
async def get_summary(call_id: int, db: AsyncSession = Depends(get_db)):
    await _load_call(db, call_id)
    result = await db.execute(
        select(models.CallSummary).where(models.CallSummary.call_id == call_id)
    )
    summary = result.scalar_one_or_none()
    if summary is None:
        call = await _load_call(db, call_id)
        if call.status not in ("completed", "failed", "no_answer"):
            raise HTTPException(status_code=404, detail="Summary is available after the call ends.")
        try:
            await orchestrator.generate_summary(db, call)
        except Exception as exc:  # noqa: BLE001 — report a useful error, never fabricate a summary
            logger.warning("summary generation retry failed for call %s: %s", call_id, exc)
            raise HTTPException(status_code=503, detail="Summary could not be generated. Please retry shortly.") from exc
        result = await db.execute(
            select(models.CallSummary).where(models.CallSummary.call_id == call_id)
        )
        summary = result.scalar_one_or_none()
        if summary is None:
            raise HTTPException(status_code=503, detail="Summary is not available yet.")
    return summary


@router.get("/{call_id}/state", response_model=schemas.AgentStateOut)
async def get_agent_state(call_id: int, db: AsyncSession = Depends(get_db)):
    await _load_call(db, call_id)
    state = await orchestrator.get_state(db, call_id)
    return state


@router.get("/{call_id}/events", response_model=list[schemas.EventOut])
async def get_events(call_id: int, db: AsyncSession = Depends(get_db)):
    await _load_call(db, call_id)
    result = await db.execute(
        select(models.CallEvent)
        .where(models.CallEvent.call_id == call_id)
        .order_by(models.CallEvent.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{call_id}/agent/greeting")
async def agent_greeting(call_id: int, db: AsyncSession = Depends(get_db)):
    """Produce the opening AI message for a freshly-created call."""
    call = await _load_call(db, call_id)
    if call.status not in ("queued", "calling", "connected"):
        raise HTTPException(status_code=409, detail="Call is not in a startable state.")
    call.status = "connected"
    await db.commit()
    text = await orchestrator.greeting(db, call)
    return {"greeting": text}


@router.post("/{call_id}/agent/message", response_model=schemas.AgentTurnResponse)
async def agent_turn(
    call_id: int, body: schemas.AgentTurnRequest, db: AsyncSession = Depends(get_db)
):
    """One full agentic turn: store utterance → LLM decision → persist → respond."""
    call = await _load_call(db, call_id)
    try:
        result = await orchestrator.handle_turn(db, call, body.message.strip())
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return result


@router.post("/{call_id}/agent/silence")
async def agent_silence(call_id: int, db: AsyncSession = Depends(get_db)):
    """Record a silence strike and get the escalating prompt."""
    call = await _load_call(db, call_id)
    return await orchestrator.handle_silence(db, call)


@router.post("/{call_id}/end", response_model=schemas.CallOut)
async def end_call(
    call_id: int,
    body: schemas.CallEndRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """End the call and generate the AI summary from the actual transcript."""
    call = await _load_call(db, call_id)
    body = body or schemas.CallEndRequest()
    if call.status in ("completed", "failed", "no_answer"):
        raise HTTPException(status_code=409, detail="Call has already ended.")
    await orchestrator.end_call(db, call, final_status=body.final_status,
                                outcome=body.outcome, reason=body.reason)
    try:
        await orchestrator.generate_summary(db, call)
    except Exception as exc:  # noqa: BLE001 — summary failure must not break call end
        logger.warning("summary generation failed for call %s: %s", call.id, exc)
        await orchestrator.log_event(db, call.id, "agent_error", "summary generation failed")
        await db.commit()
    await db.refresh(call)
    return call


@router.delete("/{call_id}/force", response_model=schemas.CallOut)
async def force_end(call_id: int, db: AsyncSession = Depends(get_db)):
    """Abandon a stuck call (e.g. browser tab closed mid-session)."""
    call = await _load_call(db, call_id)
    if call.status in ("completed", "failed", "no_answer"):
        return call
    await orchestrator.force_end(db, call)
    await db.refresh(call)
    return call
