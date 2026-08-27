import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.feature import BusinessFeature
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierResponse, SupplierUpdate

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
    result = await db.execute(select(BusinessFeature).where(BusinessFeature.business_id == business_id, BusinessFeature.feature_key == "suppliers"))
    feat = result.scalars().first()
    if feat and not feat.enabled:
        raise HTTPException(status_code=403, detail="Suppliers feature is disabled for this business")


@router.get("/", response_model=list[SupplierResponse])
async def list_suppliers(
    q: Annotated[str | None, Query()] = None,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _check_feature(db, bid)
    query = select(Supplier).where(Supplier.business_id == bid)
    if q:
        like = f"%{q}%"
        query = query.where(or_(Supplier.name.ilike(like), Supplier.phone.ilike(like), Supplier.email.ilike(like)))
    query = query.order_by(Supplier.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    payload: SupplierCreate,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _check_feature(db, bid)
    now = datetime.now(timezone.utc)
    sup = Supplier(id=str(uuid.uuid4()), business_id=bid, name=payload.name, phone=payload.phone, email=payload.email, address=payload.address, created_at=now, updated_at=now)
    db.add(sup)
    await db.commit()
    await db.refresh(sup)
    return sup


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    sup = result.scalars().first()
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if sup.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    await _check_feature(db, sup.business_id)
    return sup


@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(supplier_id: str, payload: SupplierUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    sup = result.scalars().first()
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if sup.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    await _check_feature(db, sup.business_id)
    if payload.name is not None:
        sup.name = payload.name
    if payload.phone is not None:
        sup.phone = payload.phone
    if payload.email is not None:
        sup.email = payload.email
    if payload.address is not None:
        sup.address = payload.address
    sup.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(sup)
    return sup


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(supplier_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    sup = result.scalars().first()
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if sup.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    await _check_feature(db, sup.business_id)
    # Check references
    from app.models.product import Product
    from app.models.device import Device

    prod_check = await db.execute(select(Product).where(Product.supplier_id == supplier_id).limit(1))
    if prod_check.scalars().first():
        raise HTTPException(status_code=409, detail="Cannot delete supplier with products")
    dev_check = await db.execute(select(Device).where(Device.supplier_id == supplier_id).limit(1))
    if dev_check.scalars().first():
        raise HTTPException(status_code=409, detail="Cannot delete supplier with devices")
    await db.delete(sup)
    await db.commit()
