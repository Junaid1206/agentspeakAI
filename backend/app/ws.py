"""Real-time communication: WebSocket relay for live call sessions.

Protocol (JSON frames):
  client -> server:
    {"type": "customer_message", "message": "..."}     # utterance finalized
    {"type": "silence"}                                 # client detected silence
    {"type": "interrupt"}                               # barge-in notice
    {"type": "phase", "phase": "listening"}             # UI phase sync
  server -> client:
    {"type": "phase", "phase": "processing"}
    {"type": "ai_message", "message": "...", "turn": {...}}
    {"type": "call_ended", ...}
    {"type": "error", "detail": "..."}
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from . import models
from .agents import orchestrator
from .db import SessionLocal

logger = logging.getLogger("agentspeak.ws")

router = APIRouter()


async def _load_call(call_id: int) -> models.Call | None:
    async with SessionLocal() as db:
        result = await db.execute(
            select(models.Call).options(selectinload(models.Call.customer)).where(models.Call.id == call_id)
        )
        call = result.scalar_one_or_none()
        if call is not None:
            await db.refresh(call)
        return call


@router.websocket("/ws/calls/{call_id}")
async def call_socket(websocket: WebSocket, call_id: int):
    """Real-time conversation channel for the browser voice console."""
    await websocket.accept()
    call = await _load_call(call_id)
    if call is None:
        await websocket.send_json({"type": "error", "detail": "Call not found."})
        await websocket.close()
        return

    await websocket.send_json({"type": "phase", "phase": "connected", "call_id": call_id})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                frame = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "detail": "Invalid JSON frame."})
                continue

            frame_type = frame.get("type")

            if frame_type == "customer_message":
                message = (frame.get("message") or "").strip()
                if not message:
                    continue
                await websocket.send_json({"type": "phase", "phase": "processing"})
                try:
                    async with SessionLocal() as db:
                        result_db = await db.execute(
                            select(models.Call).options(selectinload(models.Call.customer)).where(models.Call.id == call_id)
                        )
                        call = result_db.scalar_one_or_none()

                        if call is None:
                            await websocket.send_json({
                                "type": "error",
                                "detail": "Call not found."
                            })
                            break

                        result = await orchestrator.handle_turn(db, call, message)
                    await websocket.send_json(
                        {
                            "type": "ai_message",
                            "message": result["response"],
                            "should_end_call": result["should_end_call"],
                            "collected": result.get("collected"),
                            "missing_fields": result.get("missing_fields"),
                            "stage": result.get("stage"),
                        }
                    )
                    if result["should_end_call"]:
                        async with SessionLocal() as db:
                            result_db = await db.execute(
                                select(models.Call).options(selectinload(models.Call.customer)).where(models.Call.id == call_id)
                            )
                            call = result_db.scalar_one_or_none()

                            if call is not None:
                                await orchestrator.end_call(
                                    db, call,
                                    reason="Agent completed the objective."
                                )
                                await orchestrator.generate_summary(db, call)

                        await websocket.send_json({"type": "call_ended"})
                        break
                except ValueError as exc:
                    await websocket.send_json({"type": "error", "detail": str(exc)})
                    if "already ended" in str(exc):
                        break

            elif frame_type == "silence":
                call = await _load_call(call_id)
                async with SessionLocal() as db:
                    result = await orchestrator.handle_silence(db, call)
                await websocket.send_json(
                    {
                        "type": "ai_message",
                        "message": result["response"],
                        "should_end_call": result["should_end_call"],
                    }
                )
                if result["should_end_call"]:
                    call = await _load_call(call_id)
                    async with SessionLocal() as db:
                        await orchestrator.end_call(
                            db, call, reason="Customer remained silent after repeated prompts."
                        )
                        await orchestrator.generate_summary(db, call)
                    await websocket.send_json({"type": "call_ended"})
                    break

            elif frame_type == "interrupt":
                await orchestrator_log(call_id, "customer_interrupted", "Barge-in requested")
                await websocket.send_json({"type": "phase", "phase": "listening"})

            elif frame_type == "phase":
                pass  # client UI sync; no server action needed

            else:
                await websocket.send_json({"type": "error", "detail": f"Unknown frame: {frame_type}"})

    except WebSocketDisconnect:
        logger.info("ws disconnect call_id=%s", call_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("ws error call_id=%s: %s", call_id, exc)
        try:
            await websocket.send_json({"type": "error", "detail": "Internal session error."})
        except Exception:  # noqa: BLE001
            pass


async def orchestrator_log(call_id: int, event: str, detail: str | None = None) -> None:
    async with SessionLocal() as db:
        call = await _load_call(call_id)
        if call is not None:
            await orchestrator.log_event(db, call_id, event, detail)
            await db.commit()
