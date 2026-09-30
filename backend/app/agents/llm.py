"""LLM provider abstraction.

The agent only depends on `LLMProvider`; the default implementation talks to
any OpenAI-compatible API (OpenAI, Groq, OpenRouter, local vLLM, …) using
plain httpx — no vendor SDK required.
"""
from __future__ import annotations

import logging
from typing import Any, Protocol

import httpx

from ..config import get_settings

logger = logging.getLogger("agentspeak.llm")


class LLMProvider(Protocol):
    name: str

    async def complete_json(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        max_tokens: int = 400,
    ) -> dict:  # {"ok": bool, "data": Any | None, "error": str | None}
        ...

    async def health_check(self) -> dict:
        ...


class OpenAICompatibleProvider:
    """Minimal OpenAI-compatible chat-completions client (no SDK dependency)."""

    def __init__(self, api_key: str, base_url: str, model: str, provider_name: str = "openai-compatible", timeout_seconds: float = 8) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.name = provider_name
        self.timeout_seconds = max(2.0, min(float(timeout_seconds), 60.0))

    @classmethod
    def from_settings(cls) -> "OpenAICompatibleProvider":
        s = get_settings()
        return cls(api_key=s.llm_api_key, base_url=s.llm_base_url, model=s.llm_model, provider_name=s.llm_provider, timeout_seconds=s.llm_timeout_seconds)

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    async def complete_json(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        max_tokens: int = 400,
    ) -> dict:
        if not self.api_key:
            return {"ok": False, "data": None, "error": "LLM_API_KEY is not configured"}

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
        try:
            # Retry only transient upstream failures. Quota/authentication errors
            # are returned immediately so a call does not waste its latency budget.
            import asyncio

            async with httpx.AsyncClient(timeout=httpx.Timeout(self.timeout_seconds, connect=min(3.0, self.timeout_seconds))) as client:
                resp = None
                for attempt in range(2):
                    try:
                        resp = await client.post(
                            f"{self.base_url}/chat/completions",
                            headers={"Authorization": f"Bearer {self.api_key}"},
                            json=payload,
                        )
                    except (httpx.TimeoutException, httpx.NetworkError) as exc:
                        if attempt == 0:
                            logger.warning("Transient LLM transport error; retrying once: %s", type(exc).__name__)
                            await asyncio.sleep(0.4)
                            continue
                        raise
                    if resp.status_code in (502, 503, 504, 408) and attempt == 0:
                        logger.warning("Transient LLM HTTP %s; retrying once", resp.status_code)
                        await asyncio.sleep(0.4)
                        continue
                    break

            if resp is None or resp.status_code != 200:
                status = resp.status_code if resp is not None else "unknown"
                detail = resp.text[:300] if resp is not None else "No response"
                logger.warning("LLM error %s: %s", status, detail)
                return {"ok": False, "data": None, "error": f"LLM HTTP {status}"}

            body = resp.json()
            choices = body.get("choices") if isinstance(body, dict) else None
            if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
                return {"ok": False, "data": None, "error": "LLM response missing choices"}
            message = choices[0].get("message")
            content = message.get("content") if isinstance(message, dict) else None
            if not isinstance(content, str) or not content.strip():
                return {"ok": False, "data": None, "error": "LLM response has empty content"}
            parsed = _extract_json(content)
            if parsed is None:
                return {"ok": False, "data": None, "error": "LLM returned non-JSON content"}
            return {"ok": True, "data": parsed, "error": None}
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
            logger.warning("LLM request failed: %s", type(exc).__name__)
            return {"ok": False, "data": None, "error": f"LLM response/request failed: {type(exc).__name__}"}

    async def health_check(self) -> dict:
        if not self.api_key:
            return {"ok": False, "detail": "LLM_API_KEY is not configured"}
        result = await self.complete_json(
            [{"role": "user", "content": 'Reply with {"ok": true}'}], max_tokens=16
        )
        return {
            "ok": result["ok"],
            "detail": "reachable" if result["ok"] else str(result["error"]),
        }


def _extract_json(text: str) -> Any:
    import json
    import re

    trimmed = (text or "").strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", trimmed)
    candidate = fenced.group(1) if fenced else trimmed
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(candidate[start : end + 1])
            except json.JSONDecodeError:
                return None
        return None


_provider: LLMProvider | None = None


def get_llm() -> LLMProvider:
    global _provider
    if _provider is None:
        _provider = OpenAICompatibleProvider.from_settings()
    return _provider
