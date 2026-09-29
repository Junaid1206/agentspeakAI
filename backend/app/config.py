"""Application configuration via environment variables (12-factor style)."""
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Core -----------------------------------------------------------------
    app_name: str = "AgentSpeak AI"
    database_url: str = "postgresql+asyncpg://agentspeak:agentspeak@localhost:5432/agentspeak"
    cors_origins: str = "http://localhost:3000,http://localhost:5173,https://agentspeakai-frontend.onrender.com"

    # --- AI / LLM -------------------------------------------------------------
    llm_provider: str = "openai-compatible"
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"

    # --- Calling --------------------------------------------------------------
    call_mode: str = "browser"  # browser | telephony
    calling_provider: str = "browser"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # --- Voice ----------------------------------------------------------------
    stt_provider: str = "browser"
    tts_provider: str = "browser"

    # --- Conversation tuning --------------------------------------------------
    silence_timeout_seconds: int = 8
    silence_max_strikes: int = 3
    max_conversation_turns: int = 40

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
