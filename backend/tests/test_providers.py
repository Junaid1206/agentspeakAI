"""Calling provider tests — fully offline (no network calls in browser mode)."""
from __future__ import annotations

import pytest

from app.calling.providers import (
    BrowserCallingProvider,
    CallSession,
    TwilioCallingProvider,
    make_calling_provider,
)


@pytest.mark.asyncio
async def test_browser_provider_creates_session():
    provider = BrowserCallingProvider()
    session = await provider.initiate_call(to="+919876543210")
    assert session.provider_call_id.startswith("browser-")
    assert session.status == "connected"
    assert await provider.get_call_status(session) == "connected"
    await provider.end_call(session)


@pytest.mark.asyncio
async def test_twilio_provider_requires_credentials():
    provider = TwilioCallingProvider("", "", "")
    assert provider.available is False
    with pytest.raises(RuntimeError, match="Twilio credentials not configured"):
        await provider.initiate_call(to="+919876543210")


def test_factory_browser_by_default(monkeypatch):
    monkeypatch.setenv("CALL_MODE", "browser")
    provider = make_calling_provider("browser")
    assert isinstance(provider, BrowserCallingProvider)


def test_call_session_model():
    session = CallSession(provider_call_id="twilio-abc", status="calling")
    assert session.status == "calling"
