from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.device import Device
from app.models.feature import BusinessFeature
from app.models.product import Product

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


async def _require_barcode_feature(business_id: str, db: AsyncSession):
    r = await db.execute(select(BusinessFeature).where(BusinessFeature.business_id == business_id, BusinessFeature.feature_key == "barcode_scanning"))
    feat = r.scalars().first()
    if not feat or not feat.enabled:
        raise HTTPException(status_code=403, detail="Feature 'barcode_scanning' is disabled for this business")


def _normalize(code: str) -> str:
    return code.strip()


@router.get("/by-barcode/{barcode}")
async def lookup_by_barcode(barcode: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_barcode_feature(bid, db)
    norm = _normalize(barcode)
    # exact match, case-sensitive? barcode is alphanumeric, keep exact
    r = await db.execute(select(Product).where(Product.business_id == bid, Product.barcode == norm))
    prod = r.scalars().first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found for barcode")
    return prod


@router.get("/by-imei/{imei}")
async def lookup_by_imei(imei: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_barcode_feature(bid, db)
    norm = _normalize(imei)
    r = await db.execute(select(Device).where(Device.business_id == bid, Device.imei == norm))
    dev = r.scalars().first()
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found for IMEI")
    return dev


@router.get("/by-serial/{serial}")
async def lookup_by_serial(serial: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    await _require_barcode_feature(bid, db)
    norm = _normalize(serial)
    r = await db.execute(select(Device).where(Device.business_id == bid, Device.serial_number == norm))
    dev = r.scalars().first()
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found for serial")
    return dev
