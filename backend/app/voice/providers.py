"""Voice provider interfaces (STT / TTS).

Demo mode keeps speech processing in the browser (Web Speech API), isolated
behind these interfaces so a server-side engine (e.g. Whisper STT, Piper or a
cloud TTS) can replace it without touching the agent or API surface.
"""
from __future__ import annotations

from typing import Protocol


class SpeechToTextProvider(Protocol):
    name: str

    async def transcribe(self, audio: bytes, language: str = "en") -> str:
        """Transcribe audio bytes to text. Raises on failure."""
        ...

    async def health_check(self) -> dict:
        ...


class TextToSpeechProvider(Protocol):
    name: str

    async def synthesize(self, text: str) -> bytes:
        """Synthesize speech audio bytes from text. Raises on failure."""
        ...

    async def health_check(self) -> dict:
        ...


class BrowserVoiceBridge:
    """Browser demo mode: STT/TTS happen in the browser.

    The backend only brokers the text transcript. These placeholders document
    exactly where a server-side implementation plugs in — they are intentionally
    not registered as active providers so demo mode never fakes cloud voice.
    """

    name = "browser"

    @staticmethod
    def capabilities() -> dict:
        return {
            "stt": "browser Web Speech API (client-side, demo mode)",
            "tts": "browser SpeechSynthesis (client-side, demo mode)",
            "server_side_available": False,
            "swap_note": "Implement SpeechToTextProvider/TextToSpeechProvider and register "
            "them in api_agent.py to move speech processing server-side.",
        }
