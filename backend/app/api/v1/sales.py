from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.sale import Sale, SaleItem
from app.schemas.sale import SaleCreate, SaleResponse, SaleUpdate
from app.services.sales import SalesService

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


@router.get("", response_model=list[SaleResponse])
async def list_sales(
    business_id: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    customer_id: Annotated[str | None, Query()] = None,
    location_id: Annotated[str | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    query = select(Sale).where(Sale.business_id == bid).order_by(Sale.sale_date.desc())
    if status_filter:
        query = query.where(Sale.status == status_filter)
    if customer_id:
        query = query.where(Sale.customer_id == customer_id)
    if location_id:
        query = query.where(Sale.location_id == location_id)
    result = await db.execute(query)
    sales = result.scalars().all()
    out = []
    for s in sales:
        r = await db.execute(select(SaleItem).where(SaleItem.sale_id == s.id))
        items = r.scalars().all()
        out.append(
            SaleResponse(
                id=s.id,
                business_id=s.business_id,
                customer_id=s.customer_id,
                location_id=s.location_id,
                payment_method=s.payment_method,
                status=s.status,
                sale_date=s.sale_date,
                total_amount=s.total_amount,
                notes=s.notes,
                created_by=s.created_by,
                created_at=s.created_at,
                updated_at=s.updated_at,
                items=items,
            )
        )
    return out


@router.post("", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def create_sale(payload: SaleCreate, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        sale = await SalesService.create_sale(db, bid, payload, current_user["id"])
        await db.commit()
        await db.refresh(sale)
        r = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))
        items = r.scalars().all()
        return SaleResponse(
            id=sale.id,
            business_id=sale.business_id,
            customer_id=sale.customer_id,
            location_id=sale.location_id,
            payment_method=sale.payment_method,
            status=sale.status,
            sale_date=sale.sale_date,
            total_amount=sale.total_amount,
            notes=sale.notes,
            created_by=sale.created_by,
            created_at=sale.created_at,
            updated_at=sale.updated_at,
            items=items,
        )
    except ValueError as e:
        msg = str(e)
        if "already" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        if "not available" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(sale_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    result = await db.execute(select(Sale).where(Sale.id == sale_id))
    sale = result.scalars().first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if sale.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    r = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))
    items = r.scalars().all()
    return SaleResponse(
        id=sale.id,
        business_id=sale.business_id,
        customer_id=sale.customer_id,
        location_id=sale.location_id,
        payment_method=sale.payment_method,
        status=sale.status,
        sale_date=sale.sale_date,
        total_amount=sale.total_amount,
        notes=sale.notes,
        created_by=sale.created_by,
        created_at=sale.created_at,
        updated_at=sale.updated_at,
        items=items,
    )


@router.patch("/{sale_id}", response_model=SaleResponse)
async def update_sale(sale_id: str, payload: SaleUpdate, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    result = await db.execute(select(Sale).where(Sale.id == sale_id))
    sale = result.scalars().first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if sale.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if sale.status != "draft":
        raise HTTPException(status_code=409, detail=f"Cannot update sale in status {sale.status}")
    if payload.customer_id is not None:
        await SalesService._validate_customer(db, bid, payload.customer_id)
        sale.customer_id = payload.customer_id
    if payload.location_id is not None:
        await SalesService._validate_location(db, bid, payload.location_id)
        sale.location_id = payload.location_id if payload.location_id else None
    if payload.notes is not None:
        sale.notes = payload.notes
    from datetime import datetime, timezone

    sale.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(sale)
    r = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))
    items = r.scalars().all()
    return SaleResponse(
        id=sale.id,
        business_id=sale.business_id,
        customer_id=sale.customer_id,
        location_id=sale.location_id,
        payment_method=sale.payment_method,
        status=sale.status,
        sale_date=sale.sale_date,
        total_amount=sale.total_amount,
        notes=sale.notes,
        created_by=sale.created_by,
        created_at=sale.created_at,
        updated_at=sale.updated_at,
        items=items,
    )


@router.post("/{sale_id}/complete", response_model=SaleResponse)
async def complete_sale(sale_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        sale = await SalesService.complete_sale(db, bid, sale_id, current_user["id"])
        await db.commit()
        await db.refresh(sale)
        r = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))
        items = r.scalars().all()
        return SaleResponse(
            id=sale.id,
            business_id=sale.business_id,
            customer_id=sale.customer_id,
            location_id=sale.location_id,
            payment_method=sale.payment_method,
            status=sale.status,
            sale_date=sale.sale_date,
            total_amount=sale.total_amount,
            notes=sale.notes,
            created_by=sale.created_by,
            created_at=sale.created_at,
            updated_at=sale.updated_at,
            items=items,
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            result = await db.execute(select(Sale).where(Sale.id == sale_id))
            s = result.scalars().first()
            if s and s.business_id != bid:
                raise HTTPException(status_code=403, detail="Not a member of this business")
            raise HTTPException(status_code=404, detail=msg)
        if "cannot be completed" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        if "Insufficient stock" in msg:
            raise HTTPException(status_code=400, detail=msg)
        if "not available" in msg.lower() or "already" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.post("/{sale_id}/cancel", response_model=SaleResponse)
async def cancel_sale(sale_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        sale = await SalesService.cancel_sale(db, bid, sale_id, current_user["id"])
        await db.commit()
        await db.refresh(sale)
        r = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))
        items = r.scalars().all()
        return SaleResponse(
            id=sale.id,
            business_id=sale.business_id,
            customer_id=sale.customer_id,
            location_id=sale.location_id,
            payment_method=sale.payment_method,
            status=sale.status,
            sale_date=sale.sale_date,
            total_amount=sale.total_amount,
            notes=sale.notes,
            created_by=sale.created_by,
            created_at=sale.created_at,
            updated_at=sale.updated_at,
            items=items,
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            result = await db.execute(select(Sale).where(Sale.id == sale_id))
            s = result.scalars().first()
            if s and s.business_id != bid:
                raise HTTPException(status_code=403, detail="Not a member of this business")
            raise HTTPException(status_code=404, detail=msg)
        if "cannot be cancelled" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        if "not available" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.delete("/{sale_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sale(sale_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    result = await db.execute(select(Sale).where(Sale.id == sale_id))
    sale = result.scalars().first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if sale.business_id != bid:
        raise HTTPException(status_code=403, detail="Not a member of this business")
    if sale.status != "draft":
        raise HTTPException(status_code=409, detail=f"Cannot delete sale in status {sale.status}")
    await db.delete(sale)
    await db.commit()
