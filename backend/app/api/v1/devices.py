import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.device import Device
from app.schemas.device import DeviceCreate, DeviceResponse, DeviceUpdate

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


async def _validate_refs(db: AsyncSession, business_id: str, category_id: str | None, supplier_id: str | None):
    if category_id:
        from app.models.category import Category

        result = await db.execute(select(Category).where(Category.id == category_id, Category.business_id == business_id))
        if not result.scalars().first():
            raise HTTPException(status_code=400, detail="Invalid category_id for this business")
    if supplier_id:
        from app.models.supplier import Supplier

        result = await db.execute(select(Supplier).where(Supplier.id == supplier_id, Supplier.business_id == business_id))
        if not result.scalars().first():
            raise HTTPException(status_code=400, detail="Invalid supplier_id for this business")


@router.get("/", response_model=list[DeviceResponse])
async def list_devices(
    q: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    query = select(Device).where(Device.business_id == bid)
    if q:
        like = f"%{q}%"
        query = query.where(or_(Device.product_name.ilike(like), Device.serial_number.ilike(like), Device.imei.ilike(like), Device.brand.ilike(like)))
    if status:
        query = query.where(Device.status == status)
    query = query.order_by(Device.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
async def create_device(
    payload: DeviceCreate,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    await _validate_refs(db, bid, payload.category_id, payload.supplier_id)
    existing = await db.execute(select(Device).where(Device.business_id == bid, Device.serial_number == payload.serial_number))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail=f"Serial '{payload.serial_number}' already exists for this business")
    if payload.imei:
        existing_imei = await db.execute(select(Device).where(Device.business_id == bid, Device.imei == payload.imei))
        if existing_imei.scalars().first():
            raise HTTPException(status_code=409, detail=f"IMEI '{payload.imei}' already exists for this business")
    now = datetime.now(timezone.utc)
    dev = Device(
        id=str(uuid.uuid4()),
        business_id=bid,
        product_name=payload.product_name,
        serial_number=payload.serial_number,
        imei=payload.imei,
        category_id=payload.category_id,
        supplier_id=payload.supplier_id,
        brand=payload.brand,
        spec=payload.spec,
        cost_price=payload.cost_price,
        selling_price=payload.selling_price,
        status=payload.status,
        location_id=payload.location_id,
        created_at=now,
        updated_at=now,
    )
    db.add(dev)
    await db.commit()
    await db.refresh(dev)
    return dev


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(device_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device).where(Device.id == device_id))
    dev = result.scalars().first()
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if dev.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    return dev


@router.patch("/{device_id}", response_model=DeviceResponse)
async def update_device(device_id: str, payload: DeviceUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device).where(Device.id == device_id))
    dev = result.scalars().first()
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if dev.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    await _validate_refs(db, dev.business_id, payload.category_id, payload.supplier_id)
    if payload.serial_number is not None and payload.serial_number != dev.serial_number:
        existing = await db.execute(select(Device).where(Device.business_id == dev.business_id, Device.serial_number == payload.serial_number, Device.id != dev.id))
        if existing.scalars().first():
            raise HTTPException(status_code=409, detail=f"Serial '{payload.serial_number}' already exists")
        dev.serial_number = payload.serial_number
    if payload.imei is not None and payload.imei != dev.imei:
        if payload.imei:
            existing = await db.execute(select(Device).where(Device.business_id == dev.business_id, Device.imei == payload.imei, Device.id != dev.id))
            if existing.scalars().first():
                raise HTTPException(status_code=409, detail=f"IMEI '{payload.imei}' already exists")
        dev.imei = payload.imei
    # Handle status change via InventoryService to create ledger entry
    if payload.status is not None and payload.status != dev.status:
        from app.services.inventory import InventoryService

        try:
            await InventoryService.record_device_movement(db, dev.business_id, dev.id, payload.status, payload.location_id, created_by=current_user["id"])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        # Status and location handled by service; remove them from generic handling
        payload_status_handled = True
    else:
        payload_status_handled = False
        # If status not changing but location_id is being set alone, handle it
        if payload.location_id is not None and payload.location_id != dev.location_id:
            # Validate location belongs to business
            if payload.location_id:
                from app.models.location import Location

                result = await db.execute(select(Location).where(Location.id == payload.location_id, Location.business_id == dev.business_id))
                if not result.scalars().first():
                    raise HTTPException(status_code=400, detail="Invalid location_id for this business")
            dev.location_id = payload.location_id

    for field in ["product_name", "category_id", "supplier_id", "brand", "spec", "cost_price", "selling_price"]:
        val = getattr(payload, field)
        if val is not None:
            setattr(dev, field, val)
        elif field in payload.model_fields_set and val is None:
            setattr(dev, field, None)
    # Only set status/location via generic path if not already handled
    if not payload_status_handled:
        if payload.status is not None:
            dev.status = payload.status
    dev.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(dev)
    return dev


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(device_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device).where(Device.id == device_id))
    dev = result.scalars().first()
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if dev.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    await db.delete(dev)
    await db.commit()
