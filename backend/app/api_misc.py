"""Miscellaneous API surfaces: dashboard stats, campaigns, scheduling,
comments, knowledge base, billing, configuration status."""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from . import models, schemas
from .db import get_db

router = APIRouter(tags=["platform"])

CREDIT_PACKS = {
    "starter": {"name": "Starter Pack", "credits": 25, "amount_usd": 19.0},
    "growth": {"name": "Growth Pack", "credits": 120, "amount_usd": 79.0},
    "scale": {"name": "Scale Pack", "credits": 400, "amount_usd": 229.0},
}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@router.get("/api/dashboard/stats", response_model=schemas.DashboardStats)
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    calls = (await db.execute(select(models.Call))).scalars().all()
    total_customers = (
        await db.execute(select(func.count(models.Customer.id)))
    ).scalar_one()

    completed = [c for c in calls if c.status == "completed"]
    failed = [c for c in calls if c.status in ("failed", "no_answer")]
    active = [c for c in calls if c.status in ("queued", "calling", "connected", "in_conversation")]
    interested = [c for c in calls if c.lead_status in ("interested", "qualified")]
    follow_ups = [c for c in calls if c.follow_up_required]
    durations = [c.duration_seconds for c in calls if c.duration_seconds is not None]
    total_leads = len([c for c in calls if c.lead_status != "new"])

    return {
        "total_calls": len(calls),
        "completed_calls": len(completed),
        "failed_calls": len(failed),
        "active_calls": len(active),
        "interested_leads": len(interested),
        "follow_ups_required": len(follow_ups),
        "avg_duration_seconds": round(sum(durations) / len(durations)) if durations else 0,
        "total_customers": total_customers,
        "conversion_rate": round(len(interested) / total_leads * 100) if total_leads else 0,
        "calls_by_status": {
            "queued": len([c for c in calls if c.status == "queued"]),
            "calling": len([c for c in calls if c.status == "calling"]),
            "connected": len([c for c in calls if c.status == "connected"]),
            "in_conversation": len([c for c in calls if c.status == "in_conversation"]),
            "completed": len(completed),
            "failed": len(failed),
        },
    }


@router.get("/api/config/status")
async def config_status():
    """Report which capabilities are configured (never returns secrets)."""
    from .config import get_settings
    from .calling.providers import make_calling_provider

    s = get_settings()
    provider = make_calling_provider()
    return {
        "llm_configured": bool(s.llm_api_key),
        "llm_model": s.llm_model,
        "llm_provider": s.llm_provider,
        "call_mode": s.call_mode,
        "calling_provider": provider.name,
        "calling_available": provider.available,
        "stt": "browser Web Speech API (demo mode)",
        "tts": "browser SpeechSynthesis (demo mode)",
    }


# ---------------------------------------------------------------------------
# Campaigns (catalog)
# ---------------------------------------------------------------------------

@router.get("/api/campaigns", response_model=list[schemas.CampaignOut])
async def list_campaigns(search: str | None = Query(default=None), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(select(models.Campaign).order_by(models.Campaign.created_at.desc()))
    ).scalars().all()
    if search:
        q = search.lower()
        rows = [
            r for r in rows
            if q in r.name.lower() or q in r.product.lower() or q in r.category.lower()
        ]
    return rows


@router.post("/api/campaigns", response_model=schemas.CampaignOut, status_code=201)
async def create_campaign(body: schemas.CampaignCreate, db: AsyncSession = Depends(get_db)):
    campaign = models.Campaign(
        name=body.name.strip(),
        product=body.product.strip(),
        description=body.description,
        price=body.price,
        price_label=body.price_label,
        category=body.category,
        highlights=body.highlights[:6],
        active=True,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.post("/api/campaigns/seed", response_model=list[schemas.CampaignOut])
async def seed_campaigns(db: AsyncSession = Depends(get_db)):
    """Materialize default campaigns if the catalog is empty (idempotent)."""
    existing = (await db.execute(select(models.Campaign))).scalars().all()
    if existing:
        return existing
    defaults = [
        models.Campaign(
            name="Commercial RO Outreach",
            product="Commercial RO System",
            description=(
                "Outbound qualification for commercial reverse-osmosis systems — hotels, "
                "hospitals, apartments and factories. The agent captures capacity, location, "
                "budget, timeline and application."
            ),
            price=185000,
            price_label="From ₹1,85,000",
            category="Water Treatment",
            highlights=["500–5000 LPH capacities", "Installation + annual maintenance",
                        "Qualifies budget & timeline on the call"],
        ),
        models.Campaign(
            name="Solar Rooftop Program",
            product="Rooftop Solar Installation",
            description=(
                "The agent calls commercial property owners to qualify rooftop solar leads: "
                "tariff, roof area, consumption and payback expectations."
            ),
            price=650000,
            price_label="From ₹6,50,000",
            category="Energy",
            highlights=["Net-metering guidance", "Payback analysis captured live",
                        "Site visit scheduling built in"],
        ),
        models.Campaign(
            name="CCTV & Security Renewals",
            product="Surveillance & Security Systems",
            description=(
                "Renewal and upgrade calls for existing security-system customers — camera "
                "counts, storage, warranty status and upgrade interest."
            ),
            price=42000,
            price_label="From ₹42,000",
            category="Security",
            highlights=["Renewal + upgrade qualification", "Warranty status captured",
                        "Same-week site quotes"],
        ),
    ]
    for d in defaults:
        db.add(d)
    await db.commit()
    return (await db.execute(select(models.Campaign).order_by(models.Campaign.created_at.desc()))).scalars().all()


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------

@router.get("/api/schedule", response_model=list[schemas.ScheduledCallOut])
async def list_schedule(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.ScheduledCall)
        .options(selectinload(models.ScheduledCall.customer))
        .order_by(models.ScheduledCall.scheduled_for.desc())
    )
    return result.scalars().all()


@router.post("/api/schedule", response_model=schemas.ScheduledCallOut, status_code=201)
async def create_schedule(body: schemas.ScheduleCreate, db: AsyncSession = Depends(get_db)):
    if body.scheduled_for < datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Pick a time in the future.")
    customer = await db.get(models.Customer, body.customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found.")
    campaign_name = None
    if body.campaign_id:
        campaign = await db.get(models.Campaign, body.campaign_id)
        campaign_name = campaign.name if campaign else None
    slot = models.ScheduledCall(
        customer_id=body.customer_id,
        campaign_id=body.campaign_id,
        campaign_name=campaign_name,
        scheduled_for=body.scheduled_for,
        notes=(body.notes or "").strip() or None,
        status="scheduled",
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    slot.customer = customer
    return slot


@router.delete("/api/schedule/{slot_id}", status_code=204)
async def cancel_schedule(slot_id: int, db: AsyncSession = Depends(get_db)):
    slot = await db.get(models.ScheduledCall, slot_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="Scheduled call not found.")
    if slot.status != "scheduled":
        raise HTTPException(status_code=409, detail="Only scheduled calls can be cancelled.")
    slot.status = "cancelled"
    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@router.get("/api/customers/{customer_id}/comments", response_model=list[schemas.CommentOut])
async def list_comments(customer_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.CallComment)
        .where(models.CallComment.customer_id == customer_id)
        .order_by(models.CallComment.created_at.asc())
    )
    return result.scalars().all()


@router.post("/api/comments", response_model=schemas.CommentOut, status_code=201)
async def add_comment(body: schemas.CommentCreate, db: AsyncSession = Depends(get_db)):
    customer = await db.get(models.Customer, body.customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found.")
    comment = models.CallComment(
        call_id=body.call_id,
        customer_id=body.customer_id,
        author="Team member",
        body=body.body.strip(),
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


@router.get("/api/calls/{call_id}/comments", response_model=list[schemas.CommentOut])
async def list_call_comments(call_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.CallComment)
        .where(models.CallComment.call_id == call_id)
        .order_by(models.CallComment.created_at.asc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Knowledge base
# ---------------------------------------------------------------------------

@router.get("/api/knowledge", response_model=list[schemas.KnowledgeOut])
async def list_posts(search: str | None = Query(default=None), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(select(models.KnowledgePost).order_by(models.KnowledgePost.created_at.desc()))
    ).scalars().all()
    if search:
        q = search.lower()
        rows = [
            r for r in rows
            if q in r.title.lower() or q in r.body.lower() or (r.summary or "").lower().find(q) >= 0
        ]
    return rows


@router.post("/api/knowledge", response_model=schemas.KnowledgeOut, status_code=201)
async def create_post(body: schemas.KnowledgeCreate, db: AsyncSession = Depends(get_db)):
    post = models.KnowledgePost(
        title=body.title.strip(),
        body=body.body.strip(),
        summary=(body.summary or "").strip() or body.body.strip()[:140],
        author="Team member",
        published=body.publish,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post


@router.get("/api/knowledge/{post_id}", response_model=schemas.KnowledgeOut)
async def get_post(post_id: int, db: AsyncSession = Depends(get_db)):
    post = await db.get(models.KnowledgePost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    return post


@router.put("/api/knowledge/{post_id}/publish", response_model=schemas.KnowledgeOut)
async def set_published(post_id: int, published: bool = Query(...), db: AsyncSession = Depends(get_db)):
    post = await db.get(models.KnowledgePost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    post.published = published
    await db.commit()
    await db.refresh(post)
    return post


# ---------------------------------------------------------------------------
# Billing (credit packs — Stripe when configured, simulated otherwise)
# ---------------------------------------------------------------------------

@router.get("/api/billing/packs")
async def billing_packs():
    return [
        {"key": k, "name": v["name"], "credits": v["credits"], "amount_usd": v["amount_usd"]}
        for k, v in CREDIT_PACKS.items()
    ]


@router.post("/api/billing/checkout")
async def billing_checkout(pack_key: str = Query(...), user_email: str = Query(...),
                           db: AsyncSession = Depends(get_db)):
    """Create a checkout session. Uses Stripe Checkout when STRIPE_SECRET_KEY is
    configured; otherwise completes a clearly-labelled simulated purchase."""
    pack = CREDIT_PACKS.get(pack_key)
    if pack is None:
        raise HTTPException(status_code=404, detail="Unknown credit pack.")

    order = models.Order(
        user_email=user_email,
        pack_key=pack_key,
        pack_name=pack["name"],
        credits=pack["credits"],
        amount_usd=pack["amount_usd"],
        status="pending",
        provider="stripe" if os.getenv("STRIPE_SECRET_KEY") else "simulated",
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if stripe_key:
        # Real Stripe Checkout via REST (no SDK dependency).
        import httpx

        origin = os.getenv("PUBLIC_APP_URL", "http://localhost:3000")
        data = {
            "mode": "payment",
            "line_items[0][price_data][currency]": "usd",
            "line_items[0][price_data][unit_amount]": str(int(pack["amount_usd"] * 100)),
            "line_items[0][price_data][product_data][name]": f"AgentSpeak AI — {pack['name']}",
            "line_items[0][quantity]": "1",
            "success_url": f"{origin}/dashboard/billing?status=success",
            "cancel_url": f"{origin}/dashboard/billing?status=cancelled",
            "metadata[order_id]": str(order.id),
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.stripe.com/v1/checkout/sessions",
                headers={"Authorization": f"Bearer {stripe_key}"},
                data=data,
            )
        if resp.status_code >= 400:
            order.status = "cancelled"
            await db.commit()
            raise HTTPException(status_code=502, detail="Stripe checkout failed.")
        session = resp.json()
        order.provider_ref = session["id"]
        await db.commit()
        return {"order_id": order.id, "checkout_url": session["url"], "mode": "stripe"}

    # Simulated path: order completes on the demo pay page.
    order.status = "simulated"
    order.paid_at = datetime.now(timezone.utc)
    await db.commit()
    return {"order_id": order.id, "checkout_url": None, "mode": "simulated",
            "credits_added": pack["credits"]}


@router.get("/api/billing/orders")
async def billing_orders(user_email: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.Order)
        .where(models.Order.user_email == user_email)
        .order_by(models.Order.created_at.desc())
    )
    rows = result.scalars().all()
    balance = sum(o.credits for o in rows if o.status in ("paid", "simulated"))
    return {"credits": balance, "orders": rows}
