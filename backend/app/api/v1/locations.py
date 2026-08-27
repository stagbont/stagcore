import re
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.location import Location
from app.schemas.location import LocationCreate, LocationResponse, LocationUpdate

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


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "location"


@router.get("/", response_model=list[LocationResponse])
async def list_locations(
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    result = await db.execute(select(Location).where(Location.business_id == bid).order_by(Location.name))
    return result.scalars().all()


@router.post("/", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
async def create_location(
    payload: LocationCreate,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    slug = payload.slug or _slugify(payload.name)
    # Check duplicate name/slug per business
    existing = await db.execute(select(Location).where(Location.business_id == bid, Location.name == payload.name))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail=f"Location name '{payload.name}' already exists")
    if slug:
        existing_slug = await db.execute(select(Location).where(Location.business_id == bid, Location.slug == slug))
        if existing_slug.scalars().first():
            raise HTTPException(status_code=409, detail=f"Slug '{slug}' already exists")
    now = datetime.now(timezone.utc)
    loc = Location(id=str(uuid.uuid4()), business_id=bid, name=payload.name, slug=slug, address=payload.address, is_active=payload.is_active, created_at=now, updated_at=now)
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    return loc


@router.get("/{location_id}", response_model=LocationResponse)
async def get_location(location_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Location).where(Location.id == location_id))
    loc = result.scalars().first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if loc.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    return loc


@router.patch("/{location_id}", response_model=LocationResponse)
async def update_location(location_id: str, payload: LocationUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Location).where(Location.id == location_id))
    loc = result.scalars().first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if loc.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if payload.name is not None:
        dup = await db.execute(select(Location).where(Location.business_id == loc.business_id, Location.name == payload.name, Location.id != loc.id))
        if dup.scalars().first():
            raise HTTPException(status_code=409, detail=f"Name '{payload.name}' already exists")
        loc.name = payload.name
    if payload.slug is not None:
        dup = await db.execute(select(Location).where(Location.business_id == loc.business_id, Location.slug == payload.slug, Location.id != loc.id))
        if dup.scalars().first():
            raise HTTPException(status_code=409, detail=f"Slug '{payload.slug}' already exists")
        loc.slug = payload.slug
    if payload.address is not None:
        loc.address = payload.address
    if payload.is_active is not None:
        loc.is_active = payload.is_active
    loc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(loc)
    return loc


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location(location_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Location).where(Location.id == location_id))
    loc = result.scalars().first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if loc.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    # Check references: devices or movements
    from app.models.device import Device
    from app.models.inventory import InventoryMovement

    dev_check = await db.execute(select(Device).where(Device.location_id == location_id).limit(1))
    if dev_check.scalars().first():
        raise HTTPException(status_code=409, detail="Cannot delete location with devices")
    mov_check = await db.execute(select(InventoryMovement).where(InventoryMovement.location_id == location_id).limit(1))
    if mov_check.scalars().first():
        raise HTTPException(status_code=409, detail="Cannot delete location with movements")
    await db.delete(loc)
    await db.commit()
