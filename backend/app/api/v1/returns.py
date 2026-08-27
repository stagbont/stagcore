from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.return_ import PurchaseReturn, SaleReturn
from app.schemas.return_schema import PurchaseReturnCreate, PurchaseReturnResponse, PurchaseReturnItemResponse, SaleReturnCreate, SaleReturnItemResponse, SaleReturnResponse
from app.services.return_service import PurchaseReturnService, SaleReturnService

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


@router.post("/sales/{sale_id}/return", response_model=SaleReturnResponse, status_code=status.HTTP_201_CREATED)
async def create_sale_return(sale_id: str, payload: SaleReturnCreate, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        sr = await SaleReturnService.create_sale_return(db, bid, sale_id, payload, current_user["id"])
        await db.commit()
        # reload with items
        await db.refresh(sr)
        r = await db.execute(select(SaleReturn).where(SaleReturn.id == sr.id))
        sr = r.scalars().first()
        # fetch items
        from app.models.return_ import SaleReturnItem

        ri = await db.execute(select(SaleReturnItem).where(SaleReturnItem.sale_return_id == sr.id))
        items = ri.scalars().all()
        return SaleReturnResponse(
            id=sr.id,
            business_id=sr.business_id,
            sale_id=sr.sale_id,
            location_id=sr.location_id,
            reason=sr.reason,
            refund_method=sr.refund_method,
            refund_amount=sr.refund_amount,
            restock=sr.restock,
            notes=sr.notes,
            created_by=sr.created_by,
            created_at=sr.created_at,
            updated_at=sr.updated_at,
            items=[SaleReturnItemResponse.model_validate(i) for i in items],
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.get("/sales/{sale_id}/returns", response_model=list[SaleReturnResponse])
async def list_sale_returns(sale_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    r = await db.execute(select(SaleReturn).where(SaleReturn.business_id == bid, SaleReturn.sale_id == sale_id).order_by(SaleReturn.created_at.desc()))
    srs = r.scalars().all()
    from app.models.return_ import SaleReturnItem

    out = []
    for sr in srs:
        ri = await db.execute(select(SaleReturnItem).where(SaleReturnItem.sale_return_id == sr.id))
        items = ri.scalars().all()
        out.append(
            SaleReturnResponse(
                id=sr.id,
                business_id=sr.business_id,
                sale_id=sr.sale_id,
                location_id=sr.location_id,
                reason=sr.reason,
                refund_method=sr.refund_method,
                refund_amount=sr.refund_amount,
                restock=sr.restock,
                notes=sr.notes,
                created_by=sr.created_by,
                created_at=sr.created_at,
                updated_at=sr.updated_at,
                items=[SaleReturnItemResponse.model_validate(i) for i in items],
            )
        )
    return out


@router.get("/sale-returns", response_model=list[SaleReturnResponse])
async def list_all_sale_returns(business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    r = await db.execute(select(SaleReturn).where(SaleReturn.business_id == bid).order_by(SaleReturn.created_at.desc()))
    srs = r.scalars().all()
    from app.models.return_ import SaleReturnItem

    out = []
    for sr in srs:
        ri = await db.execute(select(SaleReturnItem).where(SaleReturnItem.sale_return_id == sr.id))
        items = ri.scalars().all()
        out.append(
            SaleReturnResponse(
                id=sr.id,
                business_id=sr.business_id,
                sale_id=sr.sale_id,
                location_id=sr.location_id,
                reason=sr.reason,
                refund_method=sr.refund_method,
                refund_amount=sr.refund_amount,
                restock=sr.restock,
                notes=sr.notes,
                created_by=sr.created_by,
                created_at=sr.created_at,
                updated_at=sr.updated_at,
                items=[SaleReturnItemResponse.model_validate(i) for i in items],
            )
        )
    return out


@router.post("/purchases/{purchase_id}/return", response_model=PurchaseReturnResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase_return(purchase_id: str, payload: PurchaseReturnCreate, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        pr = await PurchaseReturnService.create_purchase_return(db, bid, purchase_id, payload, current_user["id"])
        await db.commit()
        await db.refresh(pr)
        from app.models.return_ import PurchaseReturnItem

        ri = await db.execute(select(PurchaseReturnItem).where(PurchaseReturnItem.purchase_return_id == pr.id))
        items = ri.scalars().all()
        return PurchaseReturnResponse(
            id=pr.id,
            business_id=pr.business_id,
            purchase_id=pr.purchase_id,
            location_id=pr.location_id,
            reason=pr.reason,
            notes=pr.notes,
            created_by=pr.created_by,
            created_at=pr.created_at,
            updated_at=pr.updated_at,
            items=[PurchaseReturnItemResponse.model_validate(i) for i in items],
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.get("/purchases/{purchase_id}/returns", response_model=list[PurchaseReturnResponse])
async def list_purchase_returns(purchase_id: str, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    r = await db.execute(select(PurchaseReturn).where(PurchaseReturn.business_id == bid, PurchaseReturn.purchase_id == purchase_id).order_by(PurchaseReturn.created_at.desc()))
    prs = r.scalars().all()
    from app.models.return_ import PurchaseReturnItem

    out = []
    for pr in prs:
        ri = await db.execute(select(PurchaseReturnItem).where(PurchaseReturnItem.purchase_return_id == pr.id))
        items = ri.scalars().all()
        out.append(
            PurchaseReturnResponse(
                id=pr.id,
                business_id=pr.business_id,
                purchase_id=pr.purchase_id,
                location_id=pr.location_id,
                reason=pr.reason,
                notes=pr.notes,
                created_by=pr.created_by,
                created_at=pr.created_at,
                updated_at=pr.updated_at,
                items=[PurchaseReturnItemResponse.model_validate(i) for i in items],
            )
        )
    return out


@router.get("/purchase-returns", response_model=list[PurchaseReturnResponse])
async def list_all_purchase_returns(business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    r = await db.execute(select(PurchaseReturn).where(PurchaseReturn.business_id == bid).order_by(PurchaseReturn.created_at.desc()))
    prs = r.scalars().all()
    from app.models.return_ import PurchaseReturnItem

    out = []
    for pr in prs:
        ri = await db.execute(select(PurchaseReturnItem).where(PurchaseReturnItem.purchase_return_id == pr.id))
        items = ri.scalars().all()
        out.append(
            PurchaseReturnResponse(
                id=pr.id,
                business_id=pr.business_id,
                purchase_id=pr.purchase_id,
                location_id=pr.location_id,
                reason=pr.reason,
                notes=pr.notes,
                created_by=pr.created_by,
                created_at=pr.created_at,
                updated_at=pr.updated_at,
                items=[PurchaseReturnItemResponse.model_validate(i) for i in items],
            )
        )
    return out
