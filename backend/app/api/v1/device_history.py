from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.services.repairs import RepairService

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


@router.get("/devices/{device_id}/history")
async def get_device_history(device_id: str, business_id: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bid = _get_business_id(current_user, business_id)
    try:
        data = await RepairService.get_device_history(db, bid, device_id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)

    # Serialize
    def ser_w(w):
        from app.services.warranty import _validity
        is_expired, days_remaining, is_valid = _validity(w)
        return {
            "id": w.id, "business_id": w.business_id, "device_id": w.device_id, "sale_id": w.sale_id, "sale_item_id": w.sale_item_id,
            "customer_id": w.customer_id, "warranty_months": w.warranty_months, "start_date": w.start_date.isoformat(), "expires_at": w.expires_at.isoformat(),
            "status": w.status, "created_by": w.created_by, "created_at": w.created_at.isoformat(), "updated_at": w.updated_at.isoformat(),
            "is_expired": is_expired, "days_remaining": days_remaining, "is_valid": is_valid,
        }

    def ser_c(c):
        return {"id": c.id, "business_id": c.business_id, "warranty_id": c.warranty_id, "device_id": c.device_id, "customer_id": c.customer_id, "status": c.status, "diagnosis": c.diagnosis, "resolution": c.resolution, "resolution_notes": c.resolution_notes, "created_by": c.created_by, "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat()}

    def ser_r(r):
        return {"id": r.id, "business_id": r.business_id, "customer_id": r.customer_id, "device_id": r.device_id, "device_description": r.device_description, "problem_description": r.problem_description, "technician_name": r.technician_name, "status": r.status, "estimated_cost": str(r.estimated_cost) if r.estimated_cost is not None else None, "actual_cost": str(r.actual_cost) if r.actual_cost is not None else None, "location_id": r.location_id, "created_by": r.created_by, "created_at": r.created_at.isoformat(), "updated_at": r.updated_at.isoformat(), "completed_at": r.completed_at.isoformat() if r.completed_at else None}

    def ser_m(m):
        return {"id": m.id, "business_id": m.business_id, "product_id": m.product_id, "device_id": m.device_id, "location_id": m.location_id, "type": m.type, "quantity": m.quantity, "reference": m.reference, "created_by": m.created_by, "created_at": m.created_at.isoformat(), "notes": m.notes}

    dev = data["device"]
    return {
        "device": {"id": dev.id, "business_id": dev.business_id, "product_name": dev.product_name, "serial_number": dev.serial_number, "imei": dev.imei, "status": dev.status, "category_id": dev.category_id, "brand": dev.brand, "cost_price": str(dev.cost_price), "selling_price": str(dev.selling_price), "location_id": dev.location_id, "created_at": dev.created_at.isoformat(), "updated_at": dev.updated_at.isoformat()},
        "warranties": [ser_w(w) for w in data["warranties"]],
        "warranty_claims": [ser_c(c) for c in data["warranty_claims"]],
        "repairs": [ser_r(r) for r in data["repairs"]],
        "sale": {"sale_id": data["sale"]["sale"].id, "sale_date": data["sale"]["sale"].sale_date.isoformat(), "status": data["sale"]["sale"].status, "sale_item_id": data["sale"]["sale_item"].id} if data["sale"] else None,
        "movements": [ser_m(m) for m in data["movements"]],
    }
