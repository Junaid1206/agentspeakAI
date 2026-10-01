"""Customer REST API."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import models, schemas
from .db import get_db

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.post("", response_model=schemas.CustomerOut, status_code=201)
async def create_customer(body: schemas.CustomerCreate, db: AsyncSession = Depends(get_db)):
    customer = models.Customer(
        name=body.name.strip(),
        phone_number=body.phone_number,
        company_name=(body.company_name or "").strip() or None,
        purpose=(body.purpose or "").strip() or None,
        product=(body.product or "").strip() or None,
        industry=body.industry,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.get("", response_model=list[schemas.CustomerOut])
async def list_customers(
    search: str | None = Query(default=None, description="Filter by name/phone/company"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(models.Customer).order_by(models.Customer.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    if search:
        q = search.lower()
        rows = [
            r for r in rows
            if q in r.name.lower()
            or q in r.phone_number.lower()
            or (r.company_name or "").lower().find(q) >= 0
        ]
    return rows


@router.get("/{customer_id}", response_model=schemas.CustomerOut)
async def get_customer(customer_id: int, db: AsyncSession = Depends(get_db)):
    customer = await db.get(models.Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return customer


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
async def update_customer(
    customer_id: int, body: schemas.CustomerUpdate, db: AsyncSession = Depends(get_db)
):
    customer = await db.get(models.Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found.")
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        if value is not None:
            setattr(customer, field, value.strip() if isinstance(value, str) else value)
    customer.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=204)
async def delete_customer(customer_id: int, db: AsyncSession = Depends(get_db)):
    customer = await db.get(models.Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found.")
    await db.delete(customer)  # calls cascade via FK ON DELETE CASCADE
    await db.commit()
    return None
