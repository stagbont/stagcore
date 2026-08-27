from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.feature import BusinessFeature
from app.models.transfer import StockTransfer
from app.schemas.transfer import TransferCreate, TransferResponse
from app.services.transfer_service import TransferService

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


async def _require_multi_location(business_id: str, db: AsyncSession):
    r = await db.execute(select(BusinessFeature).where(BusinessFeature.business_id == business_id, BusinessFeature.feature_key == "multi_location"))
    feat = r.scalars().first()
    if not feat or not feat.enabled:
        raise HTTPException(status_code=403, detail="Feature 'multi_location' is disabled for this business")


@router.get("", response_model=list[TransferResponse])
async def list_transfers(
    business_id: Annotated[str | None, Query()] = None,
    product_id: Annotated[str | None, Query()] = None,
    device_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _require_multi_location(bid, db)
    q = select(StockTransfer).where(StockTransfer.business_id == bid).order_by(StockTransfer.created_at.desc())
    if product_id:
        q = q.where(StockTransfer.product_id == product_id)
    if device_id:
        q = q.where(StockTransfer.device_id == device_id)
    res = await db.execute(q)
    return res.scalars().all()


@router.post("", response_model=TransferResponse, status_code=status.HTTP_201_CREATED)
async def create_transfer(
    payload: TransferCreate,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _require_multi_location(bid, db)
    # XOR check
    is_product = payload.product_id is not None
    is_device = payload.device_id is not None
    if is_product and is_device:
        raise HTTPException(status_code=400, detail="Transfer cannot have both product_id and device_id")
    if not is_product and not is_device:
        raise HTTPException(status_code=400, detail="Transfer must have product_id or device_id")
    try:
        if is_product:
            tr = await TransferService.create_product_transfer(db, bid, payload.product_id, payload.quantity, payload.from_location_id, payload.to_location_id, payload.notes, current_user["id"])
        else:
            # For device, quantity is always 1; ignore payload.quantity if device
            tr = await TransferService.create_device_transfer(db, bid, payload.device_id, payload.from_location_id, payload.to_location_id, payload.notes, current_user["id"])
        await db.commit()
        await db.refresh(tr)
        return tr
    except ValueError as e:
        msg = str(e)
        if "Insufficient stock" in msg:
            raise HTTPException(status_code=409, detail=msg)
        if "must differ" in msg.lower() or "Invalid location" in msg or "Invalid device" in msg or "already at" in msg:
            raise HTTPException(status_code=400, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.get("/{transfer_id}", response_model=TransferResponse)
async def get_transfer(transfer_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_multi_location(bid, db)
    r = await db.execute(select(StockTransfer).where(StockTransfer.id == transfer_id))
    tr = r.scalars().first()
    if not tr:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if tr.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    return tr
