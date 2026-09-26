"""Calling provider abstraction.

The agent core never imports a provider directly. Providers only handle
transport specifics:

  - BrowserCallingProvider: WebRTC-style demo session (mic + browser STT/TTS)
  - TwilioCallingProvider: REST call initiation for real telephony mode
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import get_settings


@dataclass
class CallSession:
    provider_call_id: str
    status: str  # queued | calling | connected | ended


class CallingProvider:
    name: str = "base"
    available: bool = False

    async def initiate_call(self, to: str, _from: str | None = None) -> CallSession:
        raise NotImplementedError

    async def end_call(self, session: CallSession) -> None:
        raise NotImplementedError

    async def get_call_status(self, session: CallSession) -> str:
        raise NotImplementedError


class BrowserCallingProvider(CallingProvider):
    """Browser demo provider.

    The actual media transport lives client-side (getUserMedia + Web Speech
    API); this provider models the session locally and clearly labels calls as
    browser demo sessions, never as real phone calls.
    """

    name = "browser-demo"
    available = True
    _seq = 0

    async def initiate_call(self, to: str, _from: str | None = None) -> CallSession:
        BrowserCallingProvider._seq += 1
        return CallSession(
            provider_call_id=f"browser-{to}-{BrowserCallingProvider._seq}",
            status="connected",
        )

    async def end_call(self, session: CallSession) -> None:
        return None

    async def get_call_status(self, session: CallSession) -> str:
        return "ended" if session.status == "ended" else "connected"


class TwilioCallingProvider(CallingProvider):
    """Real telephony via the Twilio REST API (no SDK dependency)."""

    name = "twilio"

    def __init__(self, account_sid: str, auth_token: str, from_number: str) -> None:
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_number = from_number
        self.available = bool(account_sid and auth_token and from_number)

    @classmethod
    def from_settings(cls) -> "TwilioCallingProvider":
        s = get_settings()
        return cls(s.twilio_account_sid, s.twilio_auth_token, s.twilio_phone_number)

    def _auth(self) -> dict[str, str]:
        token = base64.b64encode(f"{self.account_sid}:{self.auth_token}".encode()).decode()
        return {"Authorization": f"Basic {token}"}

    async def initiate_call(self, to: str, _from: str | None = None) -> CallSession:
        if not self.available:
            raise RuntimeError(
                "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID / "
                "TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER to enable telephony mode."
            )
        data = {
            "To": to,
            "From": _from or self.from_number,
            "Twiml": '<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/></Response>',
        }
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Calls.json"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=self._auth(), data=data)
        if resp.status_code >= 400:
            raise RuntimeError(f"Twilio call failed ({resp.status_code}): {resp.text[:200]}")
        body: dict[str, Any] = resp.json()
        return CallSession(provider_call_id=body["sid"], status="calling")

    async def end_call(self, session: CallSession) -> None:
        if not self.available:
            return
        url = (
            f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Calls/"
            f"{session.provider_call_id}.json"
        )
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(url, headers=self._auth(), data={"Status": "completed"})
        except httpx.HTTPError:
            # end-call failure must not crash the lifecycle; event already logged.
            pass

    async def get_call_status(self, session: CallSession) -> str:
        if not self.available:
            return "ended"
        url = (
            f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Calls/"
            f"{session.provider_call_id}.json"
        )
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, headers=self._auth())
            if resp.status_code >= 400:
                return "ended"
            status = resp.json().get("status", "")
            return "calling" if status in ("in-progress", "ringing", "queued") else "ended"
        except httpx.HTTPError:
            return "ended"


def make_calling_provider(mode: str | None = None) -> CallingProvider:
    """Factory — swap providers without touching agent code."""
    s = get_settings()
    selected = (mode or s.call_mode or "browser").lower()
    if selected == "telephony":
        return TwilioCallingProvider.from_settings()
    return BrowserCallingProvider()
