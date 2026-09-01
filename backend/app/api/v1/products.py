import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import OWNER_MANAGER_CLERK, get_current_user, require_business_roles
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductResponse, ProductUpdate

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


@router.get("/", response_model=list[ProductResponse])
async def list_products(
    q: Annotated[str | None, Query()] = None,
    category_id: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    query = select(Product).where(Product.business_id == bid)
    if q:
        like = f"%{q}%"
        query = query.where(or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode.ilike(like), Product.brand.ilike(like)))
    if category_id:
        query = query.where(Product.category_id == category_id)
    if status:
        query = query.where(Product.status == status)
    query = query.order_by(Product.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    business_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    require_business_roles(bid, current_user, OWNER_MANAGER_CLERK)
    await _validate_refs(db, bid, payload.category_id, payload.supplier_id)
    if payload.sku:
        existing = await db.execute(select(Product).where(Product.business_id == bid, Product.sku == payload.sku))
        if existing.scalars().first():
            raise HTTPException(status_code=409, detail=f"SKU '{payload.sku}' already exists for this business")
    now = datetime.now(timezone.utc)
    prod = Product(
        id=str(uuid.uuid4()),
        business_id=bid,
        name=payload.name,
        sku=payload.sku,
        barcode=payload.barcode,
        category_id=payload.category_id,
        supplier_id=payload.supplier_id,
        brand=payload.brand,
        cost_price=payload.cost_price,
        selling_price=payload.selling_price,
        minimum_stock_level=payload.minimum_stock_level,
        unit_of_measurement=payload.unit_of_measurement,
        status=payload.status,
        product_image=payload.product_image,
        created_at=now,
        updated_at=now,
    )
    db.add(prod)
    await db.commit()
    await db.refresh(prod)
    return prod


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    prod = result.scalars().first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if prod.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    return prod


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, payload: ProductUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    prod = result.scalars().first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if prod.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    require_business_roles(prod.business_id, current_user, OWNER_MANAGER_CLERK)
    # Validate refs if changing
    await _validate_refs(db, prod.business_id, payload.category_id, payload.supplier_id)
    if payload.sku is not None and payload.sku != prod.sku:
        if payload.sku:
            existing = await db.execute(select(Product).where(Product.business_id == prod.business_id, Product.sku == payload.sku, Product.id != prod.id))
            if existing.scalars().first():
                raise HTTPException(status_code=409, detail=f"SKU '{payload.sku}' already exists")
        prod.sku = payload.sku
    for field in ["name", "barcode", "category_id", "supplier_id", "brand", "cost_price", "selling_price", "minimum_stock_level", "unit_of_measurement", "status", "product_image"]:
        val = getattr(payload, field)
        if val is not None:
            setattr(prod, field, val)
        elif field in payload.model_fields_set and val is None:
            # Explicit null to clear
            setattr(prod, field, None)
    prod.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(prod)
    return prod


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    prod = result.scalars().first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    allowed = {m["business_id"] for m in current_user.get("memberships", [])}
    if prod.business_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    require_business_roles(prod.business_id, current_user, OWNER_MANAGER_CLERK)
    await db.delete(prod)
    await db.commit()
