"""Industry-aware call context helpers.

Industry is inferred conservatively from existing customer purpose/product fields,
so this feature does not require a database migration or change existing records.
"""
from __future__ import annotations

INDUSTRY_PROFILES = {
    "water_treatment": {
        "label": "water treatment / RO",
        "objective": "understand the customer's water-treatment requirements and arrange a suitable next step",
        "guidance": "Ask relevant questions about water source, intended use, approximate daily demand or capacity, site location, and whether this is a new installation or service request. Ask one at a time and skip anything already answered. Do not invent technical specifications, prices, certifications, or treatment guarantees.",
    },
    "medical": {
        "label": "medical / healthcare administration",
        "objective": "handle the stated administrative purpose, such as appointment booking or reminder",
        "guidance": "Ask only relevant administrative questions (appointment date/time, clinic, confirmation). Never diagnose, recommend treatment, interpret symptoms, or request unnecessary sensitive health information. Escalate clinical questions to qualified staff.",
    },
    "shopping": {
        "label": "shopping / e-commerce",
        "objective": "help with the stated shopping, order, delivery, return, or product inquiry",
        "guidance": "Ask only relevant questions about the order, product, delivery, or return. Never invent stock, prices, delivery promises, or refund outcomes.",
    },
    "business": {
        "label": "business / B2B",
        "objective": "understand the business enquiry and arrange an appropriate next step",
        "guidance": "Ask relevant questions about business needs, scope, timeline, budget, and meeting preference only when useful. Do not pressure the lead or invent capabilities/pricing.",
    },
    "support": {
        "label": "customer support",
        "objective": "understand and follow up on the customer's support issue",
        "guidance": "Ask for the issue or ticket reference and whether it is resolved. Do not claim an issue is fixed unless verified; offer human escalation when needed.",
    },
    "general": {
        "label": "general",
        "objective": "fulfil the customer-specific purpose supplied in the customer record",
        "guidance": "Use the supplied purpose and product as context. If the purpose is unclear, ask one concise clarifying question instead of assuming a sales script.",
    },
}

def infer_industry(purpose: str | None, product: str | None, industry: str | None = None) -> str:
    if industry in INDUSTRY_PROFILES:
        return industry
    text = f"{purpose or ''} {product or ''}".casefold()
    if any(word in text for word in ("medical", "clinic", "doctor", "patient", "healthcare", "hospital", "appointment")):
        return "medical"
    if any(word in text for word in ("shopping", "ecommerce", "e-commerce", "order", "delivery", "retail", "store", "return", "refund")):
        return "shopping"
    if any(word in text for word in ("business", "b2b", "enterprise", "lead", "quotation", "quote", "project", "client")):
        return "business"
    if any(word in text for word in ("support", "complaint", "ticket", "issue", "service request")):
        return "support"
    return "general"

def get_call_profile(purpose: str | None, product: str | None, industry: str | None = None) -> tuple[str, dict]:
    key = infer_industry(purpose, product, industry)
    return key, INDUSTRY_PROFILES[key]
