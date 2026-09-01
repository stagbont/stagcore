from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import OWNER_MANAGER_CLERK, get_current_user, require_business_roles
from app.models.purchase import Purchase, PurchaseItem
from app.schemas.purchase import PurchaseCreate, PurchaseResponse, PurchaseUpdate
from app.services.purchasing import PurchasingService

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


@router.get("", response_model=list[PurchaseResponse])
async def list_purchases(
    business_id: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    supplier_id: Annotated[str | None, Query()] = None,
    location_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    require_business_roles(bid, current_user, OWNER_MANAGER_CLERK)
    query = select(Purchase).where(Purchase.business_id == bid).order_by(Purchase.purchase_date.desc())
    if status_filter:
        query = query.where(Purchase.status == status_filter)
    if supplier_id:
        query = query.where(Purchase.supplier_id == supplier_id)
    if location_id:
        query = query.where(Purchase.location_id == location_id)
    result = await db.execute(query)
    purchases = result.scalars().all()
    out = []
    for p in purchases:
        # Load items for each
        r = await db.execute(select(PurchaseItem).where(PurchaseItem.purchase_id == p.id))
        items = r.scalars().all()
        out.append(
            PurchaseResponse(
                id=p.id,
                business_id=p.business_id,
                supplier_id=p.supplier_id,
                location_id=p.location_id,
                invoice_reference=p.invoice_reference,
                purchase_date=p.purchase_date,
                status=p.status,
                payment_status=p.payment_status,
                notes=p.notes,
                created_by=p.created_by,
                created_at=p.created_at,
                updated_at=p.updated_at,
                items=items,
            )
        )
    return out


@router.post("", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase(payload: PurchaseCreate, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    require_business_roles(bid, current_user, OWNER_MANAGER_CLERK)
    try:
        purchase = await PurchasingService.create_purchase(db, bid, payload, current_user["id"])
        await db.commit()
        await db.refresh(purchase)
        r = await db.execute(select(PurchaseItem).where(PurchaseItem.purchase_id == purchase.id))
        items = r.scalars().all()
        return PurchaseResponse(
            id=purchase.id,
            business_id=purchase.business_id,
            supplier_id=purchase.supplier_id,
            location_id=purchase.location_id,
            invoice_reference=purchase.invoice_reference,
            purchase_date=purchase.purchase_date,
            status=purchase.status,
            payment_status=purchase.payment_status,
            notes=purchase.notes,
            created_by=purchase.created_by,
            created_at=purchase.created_at,
            updated_at=purchase.updated_at,
            items=items,
        )
    except ValueError as e:
        msg = str(e)
        if "already exists" in msg:
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.get("/{purchase_id}", response_model=PurchaseResponse)
async def get_purchase(purchase_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    require_business_roles(bid, current_user, OWNER_MANAGER_CLERK)
    result = await db.execute(select(Purchase).where(Purchase.id == purchase_id))
    purchase = result.scalars().first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    r = await db.execute(select(PurchaseItem).where(PurchaseItem.purchase_id == purchase.id))
    items = r.scalars().all()
    return PurchaseResponse(
        id=purchase.id,
        business_id=purchase.business_id,
        supplier_id=purchase.supplier_id,
        location_id=purchase.location_id,
        invoice_reference=purchase.invoice_reference,
        purchase_date=purchase.purchase_date,
        status=purchase.status,
        payment_status=purchase.payment_status,
        notes=purchase.notes,
        created_by=purchase.created_by,
        created_at=purchase.created_at,
        updated_at=purchase.updated_at,
        items=items,
    )


@router.patch("/{purchase_id}", response_model=PurchaseResponse)
async def update_purchase(purchase_id: str, payload: PurchaseUpdate, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    require_business_roles(bid, current_user, OWNER_MANAGER_CLERK)
    result = await db.execute(select(Purchase).where(Purchase.id == purchase_id))
    purchase = result.scalars().first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if purchase.status != "draft":
        raise HTTPException(status_code=409, detail=f"Cannot update purchase in status {purchase.status}")
    # Validate supplier/location if provided
    if payload.supplier_id is not None:
        await PurchasingService._validate_supplier(db, bid, payload.supplier_id)
        purchase.supplier_id = payload.supplier_id
    if payload.location_id is not None:
        await PurchasingService._validate_location(db, bid, payload.location_id)
        purchase.location_id = payload.location_id if payload.location_id else None
    if payload.invoice_reference is not None:
        purchase.invoice_reference = payload.invoice_reference
    if payload.payment_status is not None:
        purchase.payment_status = payload.payment_status
    if payload.notes is not None:
        purchase.notes = payload.notes
    from datetime import datetime, timezone

    purchase.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(purchase)
    r = await db.execute(select(PurchaseItem).where(PurchaseItem.purchase_id == purchase.id))
    items = r.scalars().all()
    return PurchaseResponse(
        id=purchase.id,
        business_id=purchase.business_id,
        supplier_id=purchase.supplier_id,
        location_id=purchase.location_id,
        invoice_reference=purchase.invoice_reference,
        purchase_date=purchase.purchase_date,
        status=purchase.status,
        payment_status=purchase.payment_status,
        notes=purchase.notes,
        created_by=purchase.created_by,
        created_at=purchase.created_at,
        updated_at=purchase.updated_at,
        items=items,
    )


@router.post("/{purchase_id}/receive", response_model=PurchaseResponse)
async def receive_purchase(purchase_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    require_business_roles(bid, current_user, OWNER_MANAGER_CLERK)
    try:
        purchase = await PurchasingService.receive_purchase(db, bid, purchase_id, current_user["id"])
        await db.commit()
        await db.refresh(purchase)
        r = await db.execute(select(PurchaseItem).where(PurchaseItem.purchase_id == purchase.id))
        items = r.scalars().all()
        return PurchaseResponse(
            id=purchase.id,
            business_id=purchase.business_id,
            supplier_id=purchase.supplier_id,
            location_id=purchase.location_id,
            invoice_reference=purchase.invoice_reference,
            purchase_date=purchase.purchase_date,
            status=purchase.status,
            payment_status=purchase.payment_status,
            notes=purchase.notes,
            created_by=purchase.created_by,
            created_at=purchase.created_at,
            updated_at=purchase.updated_at,
            items=items,
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            # Check if cross-tenant 403 vs 404
            result = await db.execute(select(Purchase).where(Purchase.id == purchase_id))
            p = result.scalars().first()
            if p and p.business_id != bid:
                raise HTTPException(status_code=403, detail="Not a member of this business")
            raise HTTPException(status_code=404, detail=msg)
        if "already exists" in msg:
            raise HTTPException(status_code=409, detail=msg)
        if "cannot be received" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.post("/{purchase_id}/cancel", response_model=PurchaseResponse)
async def cancel_purchase(purchase_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    require_business_roles(bid, current_user, OWNER_MANAGER_CLERK)
    try:
        purchase = await PurchasingService.cancel_purchase(db, bid, purchase_id)
        await db.commit()
        await db.refresh(purchase)
        r = await db.execute(select(PurchaseItem).where(PurchaseItem.purchase_id == purchase.id))
        items = r.scalars().all()
        return PurchaseResponse(
            id=purchase.id,
            business_id=purchase.business_id,
            supplier_id=purchase.supplier_id,
            location_id=purchase.location_id,
            invoice_reference=purchase.invoice_reference,
            purchase_date=purchase.purchase_date,
            status=purchase.status,
            payment_status=purchase.payment_status,
            notes=purchase.notes,
            created_by=purchase.created_by,
            created_at=purchase.created_at,
            updated_at=purchase.updated_at,
            items=items,
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            result = await db.execute(select(Purchase).where(Purchase.id == purchase_id))
            p = result.scalars().first()
            if p and p.business_id != bid:
                raise HTTPException(status_code=403, detail="Not a member of this business")
            raise HTTPException(status_code=404, detail=msg)
        if "cannot be cancelled" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.delete("/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase(purchase_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    require_business_roles(bid, current_user, OWNER_MANAGER_CLERK)
    result = await db.execute(select(Purchase).where(Purchase.id == purchase_id))
    purchase = result.scalars().first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if purchase.status != "draft":
        raise HTTPException(status_code=409, detail=f"Cannot delete purchase in status {purchase.status}")
    await db.delete(purchase)
    await db.commit()
