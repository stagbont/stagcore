import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate

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


@router.get("/", response_model=list[CategoryResponse])
async def list_categories(
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    result = await db.execute(select(Category).where(Category.business_id == bid).order_by(Category.name))
    return result.scalars().all()


@router.post("/", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryCreate,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    slug = payload.slug or Category.slugify(payload.name)
    # Check unique
    existing = await db.execute(select(Category).where(Category.business_id == bid, Category.slug == slug))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail=f"Category slug '{slug}' already exists")
    existing_name = await db.execute(select(Category).where(Category.business_id == bid, Category.name == payload.name))
    if existing_name.scalars().first():
        raise HTTPException(status_code=409, detail=f"Category name '{payload.name}' already exists")
    now = datetime.now(timezone.utc)
    cat = Category(
        id=str(uuid.uuid4()),
        business_id=bid,
        name=payload.name,
        slug=slug,
        default_warranty_months=payload.default_warranty_months,
        created_at=now,
        updated_at=now,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if cat.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    return cat


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: str, payload: CategoryUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if cat.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if payload.name is not None:
        # Check duplicate name
        dup = await db.execute(select(Category).where(Category.business_id == cat.business_id, Category.name == payload.name, Category.id != cat.id))
        if dup.scalars().first():
            raise HTTPException(status_code=409, detail=f"Category name '{payload.name}' already exists")
        cat.name = payload.name
    if payload.slug is not None:
        dup = await db.execute(select(Category).where(Category.business_id == cat.business_id, Category.slug == payload.slug, Category.id != cat.id))
        if dup.scalars().first():
            raise HTTPException(status_code=409, detail=f"Slug '{payload.slug}' already exists")
        cat.slug = payload.slug
    elif payload.name is not None and payload.slug is None:
        # If name changed but slug not provided, keep existing slug
        pass
    if payload.default_warranty_months is not None:
        cat.default_warranty_months = payload.default_warranty_months
    cat.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if cat.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    # Check if any products/devices reference it
    from app.models.product import Product
    from app.models.device import Device

    prod_check = await db.execute(select(Product).where(Product.category_id == category_id).limit(1))
    if prod_check.scalars().first():
        raise HTTPException(status_code=409, detail="Cannot delete category with products")
    dev_check = await db.execute(select(Device).where(Device.category_id == category_id).limit(1))
    if dev_check.scalars().first():
        raise HTTPException(status_code=409, detail="Cannot delete category with devices")
    await db.delete(cat)
    await db.commit()
