"""Pydantic schemas — request validation and response shapes."""
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

PHONE_DIGITS_MIN = 8
PHONE_DIGITS_MAX = 15


def _normalize_phone(raw: str) -> str:
    return "".join(ch for ch in raw if ch.isdigit() or ch == "+")


class CustomerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    phone_number: str = Field(min_length=5, max_length=32)
    company_name: str | None = Field(default=None, max_length=200)
    purpose: str | None = Field(default=None, max_length=500)
    product: str | None = Field(default=None, max_length=200)
    industry: str = Field(default="general", pattern=r"^(general|water_treatment|medical|shopping|business|support)$")

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        phone = _normalize_phone(v)
        digits = phone.lstrip("+")
        if not digits.isdigit():
            raise ValueError("Phone number contains invalid characters.")
        if not (PHONE_DIGITS_MIN <= len(digits) <= PHONE_DIGITS_MAX):
            raise ValueError(
                f"Phone number must contain {PHONE_DIGITS_MIN}-{PHONE_DIGITS_MAX} digits."
            )
        return phone


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    phone_number: str | None = Field(default=None, min_length=5, max_length=32)
    company_name: str | None = None
    purpose: str | None = None
    product: str | None = None
    industry: str | None = Field(default=None, pattern=r"^(general|water_treatment|medical|shopping|business|support)$")

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        phone = _normalize_phone(v)
        digits = phone.lstrip("+")
        if not digits.isdigit():
            raise ValueError("Phone number contains invalid characters.")
        if not (PHONE_DIGITS_MIN <= len(digits) <= PHONE_DIGITS_MAX):
            raise ValueError(
                f"Phone number must contain {PHONE_DIGITS_MIN}-{PHONE_DIGITS_MAX} digits."
            )
        return phone


class CustomerOut(BaseModel):
    id: int
    name: str
    phone_number: str
    company_name: str | None
    purpose: str | None
    product: str | None
    industry: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CallCreate(BaseModel):
    customer_id: int
    mode: str = "browser"  # browser | telephony


class CallOut(BaseModel):
    id: int
    customer_id: int
    provider_call_id: str | None
    mode: str
    direction: str
    status: str
    outcome: str
    lead_status: str
    follow_up_required: bool
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int | None
    error_message: str | None
    customer: CustomerOut | None = None

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: int
    speaker: str
    message: str
    sequence_number: int
    timestamp: datetime

    model_config = {"from_attributes": True}


class SummaryOut(BaseModel):
    id: int
    call_id: int
    summary: str
    customer_intent: str | None
    key_requirements: list | None
    budget: str | None
    timeline: str | None
    location: str | None
    application: str | None
    follow_up_required: bool
    lead_status: str
    outcome: str
    generated_at: datetime

    model_config = {"from_attributes": True}


class AgentStateOut(BaseModel):
    collected: dict
    missing_fields: list
    stage: str
    turn_count: int

    model_config = {"from_attributes": True}


class EventOut(BaseModel):
    id: int
    event: str
    detail: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentTurnRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class AgentTurnResponse(BaseModel):
    response: str
    should_end_call: bool
    lead_status: str
    collected: dict | None = None
    missing_fields: list | None = None
    stage: str | None = None
    agent_error: bool = False


class CallEndRequest(BaseModel):
    reason: str = "Operator ended the call."
    final_status: str = "completed"
    outcome: str = "completed"


class DashboardStats(BaseModel):
    total_calls: int
    completed_calls: int
    failed_calls: int
    active_calls: int
    interested_leads: int
    follow_ups_required: int
    avg_duration_seconds: int
    total_customers: int
    conversion_rate: int
    calls_by_status: dict[str, int]


class CampaignCreate(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    product: str = Field(min_length=2, max_length=200)
    description: str | None = None
    price: float = 0
    price_label: str = "Price on request"
    category: str = "General"
    highlights: list[str] = []


class CampaignOut(BaseModel):
    id: int
    name: str
    product: str
    description: str | None
    price: float
    price_label: str
    category: str
    highlights: list
    active: bool

    model_config = {"from_attributes": True}


class ScheduleCreate(BaseModel):
    customer_id: int
    campaign_id: int | None = None
    scheduled_for: datetime
    notes: str | None = None


class ScheduledCallOut(BaseModel):
    id: int
    customer_id: int
    campaign_id: int | None
    campaign_name: str | None
    scheduled_for: datetime
    notes: str | None
    status: str
    customer: CustomerOut | None = None

    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    customer_id: int
    call_id: int | None = None
    body: str = Field(min_length=1, max_length=2000)


class CommentOut(BaseModel):
    id: int
    call_id: int | None
    customer_id: int
    author: str
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class KnowledgeCreate(BaseModel):
    title: str = Field(min_length=4, max_length=200)
    body: str = Field(min_length=20)
    summary: str | None = None
    publish: bool = True


class KnowledgeOut(BaseModel):
    id: int
    title: str
    body: str
    summary: str | None
    author: str
    published: bool
    created_at: datetime

    model_config = {"from_attributes": True}
