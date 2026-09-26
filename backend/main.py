"""AgentSpeak AI — FastAPI entrypoint.

Run:  uvicorn main:app --reload --port 8000   (from /backend)
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.llm import get_llm
from app.api_calls import router as calls_router
from app.api_customers import router as customers_router
from app.api_misc import router as misc_router
from app.config import get_settings
from app.db import Base, engine
from app.ws import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("agentspeak")

settings = get_settings()

app = FastAPI(
    title="AgentSpeak AI — Calling Agent API",
    description=(
        "AI-powered two-way calling agent: outbound call orchestration, agentic "
        "conversation with structured state extraction, PostgreSQL persistence, "
        "AI call summaries and a real-time WebSocket channel for the voice console."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(customers_router)
app.include_router(calls_router)
app.include_router(misc_router)
app.include_router(ws_router)


@app.on_event("startup")
async def startup() -> None:
    # Tables are created from the SQLAlchemy models; database/schema.sql is the
    # canonical DDL for manual/psql provisioning (they match one-to-one).
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database ready. call_mode=%s llm_model=%s", settings.call_mode, settings.llm_model)


@app.get("/api/health", tags=["platform"])
async def health():
    llm = get_llm()
    return {
        "status": "ok",
        "app": settings.app_name,
        "call_mode": settings.call_mode,
        "llm_configured": bool(getattr(llm, "configured", False)),
    }


@app.get("/api/health/llm", tags=["platform"])
async def health_llm():
    """Live LLM reachability probe."""
    return await get_llm().health_check()
