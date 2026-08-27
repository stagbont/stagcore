import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device, DeviceStatus
from app.models.repair import REPAIR_ALLOWED_TRANSITIONS, Repair, RepairStatus
from app.services.inventory import InventoryService


class RepairService:
    @staticmethod
    async def _validate_customer(db: AsyncSession, business_id: str, customer_id: str | None):
        if not customer_id:
            return
        from app.models.customer import Customer

        r = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.business_id == business_id))
        if not r.scalars().first():
            raise ValueError("Invalid customer_id for this business")

    @staticmethod
    async def _validate_device(db: AsyncSession, business_id: str, device_id: str | None) -> Device | None:
        if not device_id:
            return None
        r = await db.execute(select(Device).where(Device.id == device_id, Device.business_id == business_id))
        dev = r.scalars().first()
        if not dev:
            raise ValueError("Invalid device_id for this business")
        return dev

    @staticmethod
    async def _validate_location(db: AsyncSession, business_id: str, location_id: str | None):
        if not location_id:
            return
        from app.models.location import Location

        r = await db.execute(select(Location).where(Location.id == location_id, Location.business_id == business_id))
        if not r.scalars().first():
            raise ValueError("Invalid location_id for this business")

    @staticmethod
    async def create_repair(db: AsyncSession, business_id: str, payload, created_by: str | None) -> Repair:
        if not payload.device_id and not payload.device_description:
            raise ValueError("Either device_id or device_description is required")
        if payload.device_id and payload.device_description and payload.device_id:
            # device_id present, device_description optional but not required; we allow both
            pass
        await RepairService._validate_customer(db, business_id, payload.customer_id)
        dev = await RepairService._validate_device(db, business_id, payload.device_id)
        await RepairService._validate_location(db, business_id, payload.location_id)

        now = datetime.now(timezone.utc)
        rep = Repair(
            id=str(uuid.uuid4()),
            business_id=business_id,
            customer_id=payload.customer_id,
            device_id=payload.device_id,
            device_description=payload.device_description,
            problem_description=payload.problem_description,
            technician_name=payload.technician_name,
            status=RepairStatus.RECEIVED.value,
            estimated_cost=payload.estimated_cost,
            actual_cost=payload.actual_cost,
            location_id=payload.location_id,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        db.add(rep)
        await db.flush()

        # Auto-couple: if device_id present and device is sold, set to in_repair
        if dev and dev.status == DeviceStatus.SOLD.value:
            try:
                await InventoryService.record_device_movement(
                    db,
                    business_id,
                    dev.id,
                    DeviceStatus.IN_REPAIR.value,
                    location_id=payload.location_id,
                    reference=rep.id,
                    notes=f"Repair {rep.id} received",
                    created_by=created_by,
                )
            except ValueError:
                # Non-fatal; device already in_repair etc.
                pass

        return rep

    @staticmethod
    async def get_repair(db: AsyncSession, business_id: str, repair_id: str) -> Repair:
        r = await db.execute(select(Repair).where(Repair.id == repair_id, Repair.business_id == business_id))
        rep = r.scalars().first()
        if not rep:
            raise ValueError("Repair not found for this business")
        return rep

    @staticmethod
    async def update_repair(db: AsyncSession, business_id: str, repair_id: str, payload, actor_id: str | None) -> Repair:
        rep = await RepairService.get_repair(db, business_id, repair_id)
        if payload.customer_id is not None:
            await RepairService._validate_customer(db, business_id, payload.customer_id)
            rep.customer_id = payload.customer_id
        if payload.device_id is not None:
            dev = await RepairService._validate_device(db, business_id, payload.device_id)
            rep.device_id = payload.device_id
            # if device_id cleared, keep description requirement check later
        if payload.device_description is not None:
            rep.device_description = payload.device_description
        # Validate at least one of device_id/description after update
        if not rep.device_id and not rep.device_description:
            raise ValueError("Either device_id or device_description is required")
        if payload.problem_description is not None:
            rep.problem_description = payload.problem_description
        if payload.technician_name is not None:
            rep.technician_name = payload.technician_name
        if payload.estimated_cost is not None:
            rep.estimated_cost = payload.estimated_cost
        if payload.actual_cost is not None:
            rep.actual_cost = payload.actual_cost
        if payload.location_id is not None:
            await RepairService._validate_location(db, business_id, payload.location_id)
            rep.location_id = payload.location_id

        if payload.status is not None:
            await RepairService.transition_status(db, business_id, repair_id, payload.status, actor_id)
            # transition already flushes; avoid double flush for status
            # But we need to refresh rep; re-fetch
            rep = await RepairService.get_repair(db, business_id, repair_id)
            return rep

        rep.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return rep

    @staticmethod
    async def transition_status(db: AsyncSession, business_id: str, repair_id: str, to_status: str, actor_id: str | None) -> Repair:
        rep = await RepairService.get_repair(db, business_id, repair_id)
        current = rep.status
        if to_status not in [s.value for s in RepairStatus]:
            raise ValueError(f"Invalid status: {to_status}")
        allowed = REPAIR_ALLOWED_TRANSITIONS.get(current, [])
        if to_status not in allowed:
            # Allow staying same (no-op)
            if to_status == current:
                return rep
            raise ValueError(f"Cannot transition from {current} to {to_status}")

        rep.status = to_status
        rep.updated_at = datetime.now(timezone.utc)
        if to_status in (RepairStatus.COLLECTED.value, RepairStatus.CANCELLED.value):
            rep.completed_at = datetime.now(timezone.utc)
            # On collected/cancelled, if device was in_repair, restore to sold (if device_id present)
            if rep.device_id:
                # Check device current status
                r = await db.execute(select(Device).where(Device.id == rep.device_id, Device.business_id == business_id))
                dev = r.scalars().first()
                if dev and dev.status == DeviceStatus.IN_REPAIR.value:
                    # Determine target: if collected, back to sold; if cancelled, back to sold as well (was sold before)
                    target = DeviceStatus.SOLD.value
                    try:
                        await InventoryService.record_device_movement(
                            db,
                            business_id,
                            dev.id,
                            target,
                            location_id=rep.location_id,
                            reference=rep.id,
                            notes=f"Repair {rep.id} {to_status}",
                            created_by=actor_id,
                        )
                    except ValueError:
                        dev.status = target
                        dev.updated_at = datetime.now(timezone.utc)
        elif to_status == RepairStatus.REPAIRING.value:
            # Ensure device is in_repair if linked
            if rep.device_id:
                r = await db.execute(select(Device).where(Device.id == rep.device_id, Device.business_id == business_id))
                dev = r.scalars().first()
                if dev and dev.status == DeviceStatus.SOLD.value:
                    await InventoryService.record_device_movement(
                        db, business_id, dev.id, DeviceStatus.IN_REPAIR.value, location_id=rep.location_id, reference=rep.id, notes=f"Repair {rep.id} repairing", created_by=actor_id
                    )

        await db.flush()
        return rep

    @staticmethod
    async def get_device_history(db: AsyncSession, business_id: str, device_id: str) -> dict:
        # Validate device
        r = await db.execute(select(Device).where(Device.id == device_id, Device.business_id == business_id))
        dev = r.scalars().first()
        if not dev:
            raise ValueError("Device not found for this business")

        from app.models.inventory import InventoryMovement
        from app.models.sale import Sale, SaleItem
        from app.models.warranty import Warranty, WarrantyClaim

        # Warranties
        w_r = await db.execute(select(Warranty).where(Warranty.business_id == business_id, Warranty.device_id == device_id).order_by(Warranty.created_at.desc()))
        warranties = w_r.scalars().all()

        # Claims
        c_r = await db.execute(select(WarrantyClaim).where(WarrantyClaim.business_id == business_id, WarrantyClaim.device_id == device_id).order_by(WarrantyClaim.created_at.desc()))
        claims = c_r.scalars().all()

        # Repairs
        rep_r = await db.execute(select(Repair).where(Repair.business_id == business_id, Repair.device_id == device_id).order_by(Repair.created_at.desc()))
        repairs = rep_r.scalars().all()

        # Sale via sale_items
        s_r = await db.execute(
            select(Sale, SaleItem)
            .join(SaleItem, SaleItem.sale_id == Sale.id)
            .where(SaleItem.device_id == device_id, Sale.business_id == business_id)
            .order_by(Sale.sale_date.desc())
        )
        sale_row = s_r.first()
        sale_data = None
        if sale_row:
            s, si = sale_row
            sale_data = {"sale": s, "sale_item": si}

        # Movements
        m_r = await db.execute(
            select(InventoryMovement).where(InventoryMovement.business_id == business_id, InventoryMovement.device_id == device_id).order_by(InventoryMovement.created_at.desc())
        )
        movements = m_r.scalars().all()

        return {
            "device": dev,
            "warranties": warranties,
            "warranty_claims": claims,
            "repairs": repairs,
            "sale": sale_data,
            "movements": movements,
        }
