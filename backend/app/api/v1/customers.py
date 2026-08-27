import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.customer import Customer
from app.models.feature import BusinessFeature
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate

router = APIRouter()


def _get_business_id(current_user: dict, business_id: str | None = None) -> str:
    memberships = current_user.get("memberships", [])
    if not memberships:
        raise HTTPException(status_code=403, detail="No business membership")
    if business_id:
        allowed = {m["business_id"] for m in memberships}
        if business_id not in allowed:
            raise HTTPException(status_code=403, detail="Not a member of this business")
        return business_id
    return memberships[0]["business_id"]


async def _check_feature(db: AsyncSession, business_id: str):
    result = await db.execute(select(BusinessFeature).where(BusinessFeature.business_id == business_id, BusinessFeature.feature_key == "customers"))
    feat = result.scalars().first()
    if feat and not feat.enabled:
        raise HTTPException(status_code=403, detail="Customers feature is disabled for this business")


@router.get("/", response_model=list[CustomerResponse])
async def list_customers(
    q: Annotated[str | None, Query()] = None,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _check_feature(db, bid)
    query = select(Customer).where(Customer.business_id == bid)
    if q:
        like = f"%{q}%"
        query = query.where(or_(Customer.name.ilike(like), Customer.phone.ilike(like), Customer.email.ilike(like)))
    query = query.order_by(Customer.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _check_feature(db, bid)
    now = datetime.now(timezone.utc)
    cust = Customer(id=str(uuid.uuid4()), business_id=bid, name=payload.name, phone=payload.phone, email=payload.email, created_at=now, updated_at=now)
    db.add(cust)
    await db.commit()
    await db.refresh(cust)
    return cust


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(customer_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    cust = result.scalars().first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if cust.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    await _check_feature(db, cust.business_id)
    return cust


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(customer_id: str, payload: CustomerUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    cust = result.scalars().first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if cust.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    await _check_feature(db, cust.business_id)
    if payload.name is not None:
        cust.name = payload.name
    if payload.phone is not None:
        cust.phone = payload.phone
    if payload.email is not None:
        cust.email = payload.email
    cust.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(cust)
    return cust


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    cust = result.scalars().first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if cust.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    await _check_feature(db, cust.business_id)
    await db.delete(cust)
    await db.commit()
