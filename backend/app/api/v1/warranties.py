from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.feature import BusinessFeature
from app.models.warranty import Warranty, WarrantyClaim
from app.schemas.warranty import WarrantyClaimCreate, WarrantyClaimResponse, WarrantyClaimUpdate, WarrantyResponse, WarrantyValidityResponse
from app.services.warranty import WarrantyService, _validity

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


async def _require_warranty_feature(business_id: str, db: AsyncSession):
    r = await db.execute(select(BusinessFeature).where(BusinessFeature.business_id == business_id, BusinessFeature.feature_key == "warranty"))
    feat = r.scalars().first()
    if not feat or not feat.enabled:
        raise HTTPException(status_code=403, detail="Feature 'warranty' is disabled for this business")


def _enrich_warranty(w: Warranty) -> WarrantyResponse:
    is_expired, days_remaining, is_valid = _validity(w)
    return WarrantyResponse(
        id=w.id,
        business_id=w.business_id,
        device_id=w.device_id,
        sale_id=w.sale_id,
        sale_item_id=w.sale_item_id,
        customer_id=w.customer_id,
        warranty_months=w.warranty_months,
        start_date=w.start_date,
        expires_at=w.expires_at,
        status=w.status,
        created_by=w.created_by,
        created_at=w.created_at,
        updated_at=w.updated_at,
        is_expired=is_expired,
        days_remaining=days_remaining,
        is_valid=is_valid,
    )


def _enrich_claim(c: WarrantyClaim, warranty: Warranty | None = None) -> WarrantyClaimResponse:
    is_expired = False
    days_remaining = None
    if warranty:
        is_expired, days_remaining, _ = _validity(warranty)
    return WarrantyClaimResponse(
        id=c.id,
        business_id=c.business_id,
        warranty_id=c.warranty_id,
        device_id=c.device_id,
        customer_id=c.customer_id,
        status=c.status,
        diagnosis=c.diagnosis,
        resolution=c.resolution,
        resolution_notes=c.resolution_notes,
        created_by=c.created_by,
        created_at=c.created_at,
        updated_at=c.updated_at,
        is_expired=is_expired,
        days_remaining=days_remaining,
    )


@router.get("/warranties", response_model=list[WarrantyResponse])
async def list_warranties(
    business_id: Annotated[str | None, Query()] = None,
    device_id: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _require_warranty_feature(bid, db)
    query = select(Warranty).where(Warranty.business_id == bid).order_by(Warranty.expires_at.desc())
    if device_id:
        query = query.where(Warranty.device_id == device_id)
    if status_filter:
        query = query.where(Warranty.status == status_filter)
    # q searches device_id; for IMEI search we rely on device join in frontend, but support id filter
    if q:
        query = query.where(Warranty.device_id.ilike(f"%{q}%"))
    result = await db.execute(query)
    warranties = result.scalars().all()
    return [_enrich_warranty(w) for w in warranties]


@router.get("/warranties/{warranty_id}", response_model=WarrantyResponse)
async def get_warranty(warranty_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_warranty_feature(bid, db)
    r = await db.execute(select(Warranty).where(Warranty.id == warranty_id))
    w = r.scalars().first()
    if not w:
        raise HTTPException(status_code=404, detail="Warranty not found")
    if w.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    return _enrich_warranty(w)


@router.get("/warranties/{warranty_id}/validity", response_model=WarrantyValidityResponse)
async def get_validity(warranty_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_warranty_feature(bid, db)
    try:
        data = await WarrantyService.get_validity(db, bid, warranty_id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    return WarrantyValidityResponse(**data)


@router.get("/warranty-claims", response_model=list[WarrantyClaimResponse])
async def list_claims(
    business_id: Annotated[str | None, Query()] = None,
    warranty_id: Annotated[str | None, Query()] = None,
    device_id: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _require_warranty_feature(bid, db)
    query = select(WarrantyClaim).where(WarrantyClaim.business_id == bid).order_by(WarrantyClaim.created_at.desc())
    if warranty_id:
        query = query.where(WarrantyClaim.warranty_id == warranty_id)
    if device_id:
        query = query.where(WarrantyClaim.device_id == device_id)
    if status_filter:
        query = query.where(WarrantyClaim.status == status_filter)
    result = await db.execute(query)
    claims = result.scalars().all()
    # Enrich with warranty validity
    out = []
    for c in claims:
        w = None
        r = await db.execute(select(Warranty).where(Warranty.id == c.warranty_id))
        w = r.scalars().first()
        out.append(_enrich_claim(c, w))
    return out


@router.post("/warranty-claims", response_model=WarrantyClaimResponse, status_code=status.HTTP_201_CREATED)
async def create_claim(
    payload: WarrantyClaimCreate,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _require_warranty_feature(bid, db)
    try:
        claim = await WarrantyService.create_claim(db, bid, payload.warranty_id, payload.device_id, payload.customer_id, payload.diagnosis, current_user["id"])
        await db.commit()
        await db.refresh(claim)
        # enrich
        r = await db.execute(select(Warranty).where(Warranty.id == claim.warranty_id))
        w = r.scalars().first()
        return _enrich_claim(claim, w)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/warranty-claims/{claim_id}", response_model=WarrantyClaimResponse)
async def update_claim(
    claim_id: str,
    payload: WarrantyClaimUpdate,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _require_warranty_feature(bid, db)
    try:
        claim = await WarrantyService.update_claim(db, bid, claim_id, payload)
        await db.commit()
        await db.refresh(claim)
        r = await db.execute(select(Warranty).where(Warranty.id == claim.warranty_id))
        w = r.scalars().first()
        return _enrich_claim(claim, w)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        if "Cannot transition" in msg or "Invalid" in msg:
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.get("/warranty-claims/{claim_id}", response_model=WarrantyClaimResponse)
async def get_claim(claim_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_warranty_feature(bid, db)
    r = await db.execute(select(WarrantyClaim).where(WarrantyClaim.id == claim_id))
    c = r.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Claim not found")
    if c.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    rw = await db.execute(select(Warranty).where(Warranty.id == c.warranty_id))
    w = rw.scalars().first()
    return _enrich_claim(c, w)
