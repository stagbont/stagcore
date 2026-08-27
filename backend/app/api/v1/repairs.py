from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.feature import BusinessFeature
from app.models.repair import Repair
from app.schemas.repair import RepairCreate, RepairResponse, RepairTransitionRequest, RepairUpdate
from app.services.repairs import RepairService

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


async def _require_repairs_feature(business_id: str, db: AsyncSession):
    r = await db.execute(select(BusinessFeature).where(BusinessFeature.business_id == business_id, BusinessFeature.feature_key == "repairs"))
    feat = r.scalars().first()
    if not feat or not feat.enabled:
        raise HTTPException(status_code=403, detail="Feature 'repairs' is disabled for this business")


@router.get("", response_model=list[RepairResponse])
async def list_repairs(
    business_id: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    customer_id: Annotated[str | None, Query()] = None,
    device_id: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _require_repairs_feature(bid, db)
    query = select(Repair).where(Repair.business_id == bid).order_by(Repair.created_at.desc())
    if status_filter:
        query = query.where(Repair.status == status_filter)
    if customer_id:
        query = query.where(Repair.customer_id == customer_id)
    if device_id:
        query = query.where(Repair.device_id == device_id)
    if q:
        like = f"%{q}%"
        query = query.where(Repair.device_description.ilike(like) | Repair.problem_description.ilike(like) | Repair.technician_name.ilike(like))
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=RepairResponse, status_code=status.HTTP_201_CREATED)
async def create_repair(
    payload: RepairCreate,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _require_repairs_feature(bid, db)
    try:
        rep = await RepairService.create_repair(db, bid, payload, current_user["id"])
        await db.commit()
        await db.refresh(rep)
        return rep
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{repair_id}", response_model=RepairResponse)
async def get_repair(repair_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_repairs_feature(bid, db)
    r = await db.execute(select(Repair).where(Repair.id == repair_id))
    rep = r.scalars().first()
    if not rep:
        raise HTTPException(status_code=404, detail="Repair not found")
    if rep.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    return rep


@router.patch("/{repair_id}", response_model=RepairResponse)
async def update_repair(repair_id: str, payload: RepairUpdate, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_repairs_feature(bid, db)
    # Check existence/tenancy first
    r = await db.execute(select(Repair).where(Repair.id == repair_id))
    rep = r.scalars().first()
    if not rep:
        raise HTTPException(status_code=404, detail="Repair not found")
    if rep.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    try:
        updated = await RepairService.update_repair(db, bid, repair_id, payload, current_user["id"])
        await db.commit()
        await db.refresh(updated)
        return updated
    except ValueError as e:
        msg = str(e)
        if "Cannot transition" in msg:
            raise HTTPException(status_code=409, detail=msg)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.post("/{repair_id}/transition", response_model=RepairResponse)
async def transition_repair(repair_id: str, payload: RepairTransitionRequest, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_repairs_feature(bid, db)
    r = await db.execute(select(Repair).where(Repair.id == repair_id))
    rep = r.scalars().first()
    if not rep:
        raise HTTPException(status_code=404, detail="Repair not found")
    if rep.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    try:
        updated = await RepairService.transition_status(db, bid, repair_id, payload.to_status, current_user["id"])
        await db.commit()
        await db.refresh(updated)
        return updated
    except ValueError as e:
        msg = str(e)
        if "Cannot transition" in msg or "Invalid status" in msg:
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.delete("/{repair_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repair(repair_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_repairs_feature(bid, db)
    r = await db.execute(select(Repair).where(Repair.id == repair_id))
    rep = r.scalars().first()
    if not rep:
        raise HTTPException(status_code=404, detail="Repair not found")
    if rep.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if rep.status not in ("received", "cancelled"):
        raise HTTPException(status_code=409, detail=f"Cannot delete repair in status {rep.status}")
    await db.delete(rep)
    await db.commit()
