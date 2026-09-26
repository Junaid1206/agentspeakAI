"""Test fixtures: in-memory async SQLite (same models), fake LLM, no external APIs."""
from __future__ import annotations

import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base, get_db
from main import app


class FakeLLM:
    """Deterministic LLM stub — records calls, returns scripted decisions."""

    name = "fake-llm"

    def __init__(self) -> None:
        self.calls: list[list[dict]] = []
        self.script: list[dict] = []

    async def complete_json(self, messages, *, temperature=0.2, max_tokens=400):
        self.calls.append(messages)
        if self.script:
            return {"ok": True, "data": self.script.pop(0), "error": None}
        return {"ok": False, "data": None, "error": "script exhausted"}

    async def health_check(self):
        return {"ok": True, "detail": "fake"}


@pytest_asyncio.fixture
async def fake_llm():
    return FakeLLM()


@pytest_asyncio.fixture
async def client(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest_asyncio.fixture
async def customer(client):
    resp = await client.post(
        "/api/customers",
        json={
            "name": "Rahul Kumar",
            "phone_number": "+919876543210",
            "company_name": "Grand Lotus Hotels",
            "purpose": "Product enquiry",
            "product": "Commercial RO System",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest_asyncio.fixture
async def call(client, customer):
    resp = await client.post(
        "/api/calls", json={"customer_id": customer["id"], "mode": "browser"}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
