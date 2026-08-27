import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.location import Location
from app.models.product import Product
from app.models.transfer import StockTransfer
from app.services.inventory import InventoryService


class TransferService:
    @staticmethod
    async def _validate_location(db: AsyncSession, business_id: str, location_id: str):
        r = await db.execute(select(Location).where(Location.id == location_id, Location.business_id == business_id))
        if not r.scalars().first():
            raise ValueError("Invalid location_id for this business")

    @staticmethod
    async def create_product_transfer(db: AsyncSession, business_id: str, product_id: str, quantity: int, from_location_id: str, to_location_id: str, notes: str | None, created_by: str | None) -> StockTransfer:
        if from_location_id == to_location_id:
            raise ValueError("from_location and to_location must differ")
        # validate product & locations via InventoryService (which checks stock)
        now = datetime.now(timezone.utc)
        tr_id = str(uuid.uuid4())
        tr = StockTransfer(
            id=tr_id,
            business_id=business_id,
            product_id=product_id,
            device_id=None,
            from_location_id=from_location_id,
            to_location_id=to_location_id,
            quantity=quantity,
            status="completed",
            notes=notes,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        db.add(tr)
        await db.flush()
        # Create ledger pair atomically in same TX
        await InventoryService.transfer_stock(db, business_id, product_id, quantity, from_location_id, to_location_id, notes=notes, reference=tr_id, created_by=created_by)
        return tr

    @staticmethod
    async def create_device_transfer(db: AsyncSession, business_id: str, device_id: str, from_location_id: str | None, to_location_id: str, notes: str | None, created_by: str | None) -> StockTransfer:
        if from_location_id and from_location_id == to_location_id:
            raise ValueError("from_location and to_location must differ")
        r = await db.execute(select(Device).where(Device.id == device_id, Device.business_id == business_id))
        dev = r.scalars().first()
        if not dev:
            raise ValueError("Invalid device_id for this business")
        # Use actual current location if from_location not supplied or mismatched? Validate
        actual_from = dev.location_id
        # If caller provided from_location, ensure matches device current (or at least valid)
        if from_location_id and actual_from and from_location_id != actual_from:
            # Allow if device has null location and we want to move from there
            raise ValueError(f"Device is at {actual_from}, not {from_location_id}")
        # Validate to_location
        await TransferService._validate_location(db, business_id, to_location_id)
        if from_location_id:
            await TransferService._validate_location(db, business_id, from_location_id)
        now = datetime.now(timezone.utc)
        tr_id = str(uuid.uuid4())
        tr = StockTransfer(
            id=tr_id,
            business_id=business_id,
            product_id=None,
            device_id=device_id,
            from_location_id=actual_from or from_location_id or to_location_id,
            to_location_id=to_location_id,
            quantity=1,
            status="completed",
            notes=notes,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        # If device had no location, keep from as to? But constraint says differ; handle None
        if tr.from_location_id == tr.to_location_id:
            # Device with no location: set from to to? Skip constraint by using to_location for both? Better allow null? But constraint requires differ.
            # For null case, set from_location to to_location? We'll override: allow transfer without prior location by setting from as same? Instead adjust model to allow null? But migration says NOT NULL.
            # For phase8 pilot, require device has location; if null, use to_location as from sentinel? Workaround: raise
            raise ValueError("Device has no current location; specify from_location")
        db.add(tr)
        await db.flush()
        await InventoryService.transfer_device(db, business_id, device_id, to_location_id, notes=notes, reference=tr_id, created_by=created_by)
        return tr
