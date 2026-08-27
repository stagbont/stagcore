from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.inventory import InventoryMovement
from app.schemas.inventory import AdjustRequest, DeviceStatusChange, MovementResponse, ReceiveRequest, ReturnRequest, SellRequest, StockResponse
from app.services.inventory import InventoryService

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


@router.post("/receive", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def receive_stock(payload: ReceiveRequest, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        mv = await InventoryService.receive_stock(db, bid, payload.product_id, payload.quantity, payload.unit_cost, payload.location_id, payload.reference, payload.notes, current_user["id"])
        await db.commit()
        await db.refresh(mv)
        return mv
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sell", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def sell_stock(payload: SellRequest, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        mv = await InventoryService.sell_stock(db, bid, payload.product_id, payload.quantity, payload.location_id, payload.reference, payload.notes, current_user["id"])
        await db.commit()
        await db.refresh(mv)
        return mv
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/adjust", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def adjust_stock(payload: AdjustRequest, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        mv = await InventoryService.adjust_stock(db, bid, payload.product_id, payload.quantity, payload.direction, payload.location_id, payload.reference, payload.notes, current_user["id"])
        await db.commit()
        await db.refresh(mv)
        return mv
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/return", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def return_stock(payload: ReturnRequest, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        mv = await InventoryService.return_stock(db, bid, payload.product_id, payload.quantity, payload.kind, payload.location_id, payload.reference, payload.notes, current_user["id"])
        await db.commit()
        await db.refresh(mv)
        return mv
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/device-status", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def change_device_status(payload: DeviceStatusChange, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        mv = await InventoryService.record_device_movement(db, bid, payload.device_id, payload.to_status, payload.location_id, payload.reference, payload.notes, current_user["id"])
        await db.commit()
        await db.refresh(mv)
        return mv
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stock/{product_id}", response_model=StockResponse)
async def get_stock(product_id: str, location_id: Annotated[str | None, Query()] = None, business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    # Validate product belongs to business
    from app.models.product import Product

    result = await db.execute(select(Product).where(Product.id == product_id, Product.business_id == bid))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Product not found for this business")
    stock = await InventoryService.get_current_stock(db, bid, product_id, location_id)
    return StockResponse(product_id=product_id, business_id=bid, current_stock=stock, location_id=location_id)


@router.get("/movements", response_model=list[MovementResponse])
async def list_movements(
    product_id: Annotated[str | None, Query()] = None,
    location_id: Annotated[str | None, Query()] = None,
    business_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid = _get_business_id(current_user, business_id)
    movements = await InventoryService.get_movement_history(db, bid, product_id, location_id, limit, offset)
    return movements


@router.get("/low-stock", response_model=list[dict])
async def low_stock(business_id: Annotated[str | None, Query()] = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    low = await InventoryService.get_low_stock_products(db, bid)
    # Return simple list: product_id, name, current_stock, minimum
    result = []
    for item in low:
        prod = item["product"]
        result.append({"product_id": prod.id, "name": prod.name, "sku": prod.sku, "current_stock": item["current_stock"], "minimum_stock_level": prod.minimum_stock_level, "status": prod.status})
    return result
