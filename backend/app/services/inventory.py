import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device, DeviceStatus
from app.models.inventory import InventoryMovement, MovementType
from app.models.location import Location
from app.models.product import Product


class InventoryService:
    """Immutable ledger service — all stock changes go through here, atomically."""

    @staticmethod
    async def _validate_product(db: AsyncSession, business_id: str, product_id: str) -> Product:
        result = await db.execute(select(Product).where(Product.id == product_id, Product.business_id == business_id))
        prod = result.scalars().first()
        if not prod:
            raise ValueError("Product not found for this business")
        return prod

    @staticmethod
    async def _validate_location(db: AsyncSession, business_id: str, location_id: str | None):
        if not location_id:
            return
        result = await db.execute(select(Location).where(Location.id == location_id, Location.business_id == business_id))
        if not result.scalars().first():
            raise ValueError("Invalid location_id for this business")

    @staticmethod
    async def get_current_stock(db: AsyncSession, business_id: str, product_id: str, location_id: str | None = None) -> int:
        query = select(func.coalesce(func.sum(InventoryMovement.quantity), 0)).where(
            InventoryMovement.business_id == business_id, InventoryMovement.product_id == product_id
        )
        if location_id:
            query = query.where(InventoryMovement.location_id == location_id)
        result = await db.execute(query)
        return int(result.scalar() or 0)

    @staticmethod
    async def get_movement_history(db: AsyncSession, business_id: str, product_id: str | None = None, location_id: str | None = None, limit: int = 100, offset: int = 0):
        query = select(InventoryMovement).where(InventoryMovement.business_id == business_id).order_by(InventoryMovement.created_at.desc())
        if product_id:
            query = query.where(InventoryMovement.product_id == product_id)
        if location_id:
            query = query.where(InventoryMovement.location_id == location_id)
        query = query.limit(limit).offset(offset)
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def receive_stock(
        db: AsyncSession,
        business_id: str,
        product_id: str,
        quantity: int,
        unit_cost: Decimal | None = None,
        location_id: str | None = None,
        reference: str | None = None,
        notes: str | None = None,
        created_by: str | None = None,
    ) -> InventoryMovement:
        if quantity <= 0:
            raise ValueError("Quantity must be > 0")
        await InventoryService._validate_product(db, business_id, product_id)
        await InventoryService._validate_location(db, business_id, location_id)
        mv = InventoryMovement(
            id=str(uuid.uuid4()),
            business_id=business_id,
            product_id=product_id,
            location_id=location_id,
            type=MovementType.PURCHASE.value,
            quantity=quantity,
            unit_cost=unit_cost,
            reference=reference,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            notes=notes,
        )
        db.add(mv)
        await db.flush()
        return mv

    @staticmethod
    async def sell_stock(
        db: AsyncSession,
        business_id: str,
        product_id: str,
        quantity: int,
        location_id: str | None = None,
        reference: str | None = None,
        notes: str | None = None,
        created_by: str | None = None,
    ) -> InventoryMovement:
        if quantity <= 0:
            raise ValueError("Quantity must be > 0")
        await InventoryService._validate_product(db, business_id, product_id)
        await InventoryService._validate_location(db, business_id, location_id)
        current = await InventoryService.get_current_stock(db, business_id, product_id, location_id)
        if current < quantity:
            raise ValueError(f"Insufficient stock: have {current}, need {quantity}")
        mv = InventoryMovement(
            id=str(uuid.uuid4()),
            business_id=business_id,
            product_id=product_id,
            location_id=location_id,
            type=MovementType.SALE.value,
            quantity=-quantity,
            reference=reference,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            notes=notes,
        )
        db.add(mv)
        await db.flush()
        return mv

    @staticmethod
    async def adjust_stock(
        db: AsyncSession,
        business_id: str,
        product_id: str,
        quantity: int,
        direction: str,
        location_id: str | None = None,
        reference: str | None = None,
        notes: str | None = None,
        created_by: str | None = None,
    ) -> InventoryMovement:
        if quantity <= 0:
            raise ValueError("Quantity must be > 0")
        if direction not in ("in", "out"):
            raise ValueError("Direction must be 'in' or 'out'")
        await InventoryService._validate_product(db, business_id, product_id)
        await InventoryService._validate_location(db, business_id, location_id)
        if direction == "out":
            current = await InventoryService.get_current_stock(db, business_id, product_id, location_id)
            if current < quantity:
                raise ValueError(f"Insufficient stock for adjustment: have {current}, need {quantity}")
            qty = -quantity
            typ = MovementType.ADJUSTMENT_OUT.value
        else:
            qty = quantity
            typ = MovementType.ADJUSTMENT_IN.value
        mv = InventoryMovement(
            id=str(uuid.uuid4()),
            business_id=business_id,
            product_id=product_id,
            location_id=location_id,
            type=typ,
            quantity=qty,
            reference=reference,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            notes=notes,
        )
        db.add(mv)
        await db.flush()
        return mv

    @staticmethod
    async def return_stock(
        db: AsyncSession,
        business_id: str,
        product_id: str,
        quantity: int,
        kind: str,
        location_id: str | None = None,
        reference: str | None = None,
        notes: str | None = None,
        created_by: str | None = None,
    ) -> InventoryMovement:
        if quantity <= 0:
            raise ValueError("Quantity must be > 0")
        if kind not in ("customer", "supplier"):
            raise ValueError("Kind must be 'customer' or 'supplier'")
        await InventoryService._validate_product(db, business_id, product_id)
        await InventoryService._validate_location(db, business_id, location_id)
        if kind == "supplier":
            current = await InventoryService.get_current_stock(db, business_id, product_id, location_id)
            if current < quantity:
                raise ValueError(f"Insufficient stock for supplier return: have {current}, need {quantity}")
            qty = -quantity
            typ = MovementType.SUPPLIER_RETURN.value
        else:
            qty = quantity
            typ = MovementType.CUSTOMER_RETURN.value
        mv = InventoryMovement(
            id=str(uuid.uuid4()),
            business_id=business_id,
            product_id=product_id,
            location_id=location_id,
            type=typ,
            quantity=qty,
            reference=reference,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            notes=notes,
        )
        db.add(mv)
        await db.flush()
        return mv

    @staticmethod
    async def record_device_movement(
        db: AsyncSession,
        business_id: str,
        device_id: str,
        to_status: str,
        location_id: str | None = None,
        reference: str | None = None,
        notes: str | None = None,
        created_by: str | None = None,
    ) -> InventoryMovement:
        # Validate device belongs to business
        result = await db.execute(select(Device).where(Device.id == device_id, Device.business_id == business_id))
        dev = result.scalars().first()
        if not dev:
            raise ValueError("Device not found for this business")
        if to_status not in [s.value for s in DeviceStatus]:
            raise ValueError(f"Invalid status: {to_status}")
        # Determine movement type based on status transition
        # For reporting, we create a ledger entry even for serialized items
        # Quantity is 1 or -1 depending on in_stock vs sold
        # We use ADJUSTMENT_IN/OUT or SALE/PURCHASE for semantics
        # Simple mapping: in_stock -> PURCHASE/ADJUSTMENT_IN, sold -> SALE
        type_map = {
            DeviceStatus.IN_STOCK.value: MovementType.PURCHASE.value,
            DeviceStatus.SOLD.value: MovementType.SALE.value,
            DeviceStatus.IN_REPAIR.value: MovementType.ADJUSTMENT_OUT.value,
            DeviceStatus.RETURNED.value: MovementType.CUSTOMER_RETURN.value,
        }
        mv_type = type_map.get(to_status, MovementType.ADJUSTMENT_OUT.value)
        # RETURNED devices restock on return (+1), sold/in_repair are outflows (-1)
        if to_status == DeviceStatus.RETURNED.value:
            qty = 1
        else:
            qty = 1 if to_status == DeviceStatus.IN_STOCK.value else -1
        # Special handling for device: we store device_id and product_id is None (or could be linked to product if devices were tied to product)
        mv = InventoryMovement(
            id=str(uuid.uuid4()),
            business_id=business_id,
            device_id=device_id,
            location_id=location_id or dev.location_id,
            type=mv_type,
            quantity=qty,
            reference=reference,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            notes=notes or f"Device {dev.serial_number} -> {to_status}",
        )
        db.add(mv)
        dev.status = to_status
        if location_id:
            dev.location_id = location_id
        dev.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return mv

    @staticmethod
    async def transfer_stock(
        db: AsyncSession,
        business_id: str,
        product_id: str,
        quantity: int,
        from_location_id: str,
        to_location_id: str,
        notes: str | None = None,
        reference: str | None = None,
        created_by: str | None = None,
    ) -> tuple[InventoryMovement, InventoryMovement]:
        if quantity <= 0:
            raise ValueError("Quantity must be > 0")
        if from_location_id == to_location_id:
            raise ValueError("from_location and to_location must differ")
        await InventoryService._validate_product(db, business_id, product_id)
        await InventoryService._validate_location(db, business_id, from_location_id)
        await InventoryService._validate_location(db, business_id, to_location_id)
        current = await InventoryService.get_current_stock(db, business_id, product_id, from_location_id)
        if current < quantity:
            raise ValueError(f"Insufficient stock at source: have {current}, need {quantity}")
        # Atomic pair
        out_mv = InventoryMovement(
            id=str(uuid.uuid4()),
            business_id=business_id,
            product_id=product_id,
            location_id=from_location_id,
            type=MovementType.TRANSFER_OUT.value,
            quantity=-quantity,
            reference=reference,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            notes=notes or f"Transfer {quantity} from {from_location_id} to {to_location_id}",
        )
        in_mv = InventoryMovement(
            id=str(uuid.uuid4()),
            business_id=business_id,
            product_id=product_id,
            location_id=to_location_id,
            type=MovementType.TRANSFER_IN.value,
            quantity=quantity,
            reference=reference,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            notes=notes or f"Transfer {quantity} from {from_location_id} to {to_location_id}",
        )
        db.add(out_mv)
        db.add(in_mv)
        await db.flush()
        return out_mv, in_mv

    @staticmethod
    async def transfer_device(
        db: AsyncSession,
        business_id: str,
        device_id: str,
        to_location_id: str,
        notes: str | None = None,
        reference: str | None = None,
        created_by: str | None = None,
    ) -> tuple[InventoryMovement, InventoryMovement]:
        result = await db.execute(select(Device).where(Device.id == device_id, Device.business_id == business_id))
        dev = result.scalars().first()
        if not dev:
            raise ValueError("Device not found for this business")
        await InventoryService._validate_location(db, business_id, to_location_id)
        from_loc = dev.location_id
        if from_loc == to_location_id:
            raise ValueError("Device already at target location")
        # Allow any status per grilled decision
        out_mv = InventoryMovement(
            id=str(uuid.uuid4()),
            business_id=business_id,
            device_id=device_id,
            location_id=from_loc,
            type=MovementType.TRANSFER_OUT.value,
            quantity=-1,
            reference=reference,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            notes=notes or f"Device {dev.serial_number} transfer {from_loc} -> {to_location_id}",
        )
        in_mv = InventoryMovement(
            id=str(uuid.uuid4()),
            business_id=business_id,
            device_id=device_id,
            location_id=to_location_id,
            type=MovementType.TRANSFER_IN.value,
            quantity=1,
            reference=reference,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            notes=notes or f"Device {dev.serial_number} transfer {from_loc} -> {to_location_id}",
        )
        db.add(out_mv)
        db.add(in_mv)
        dev.location_id = to_location_id
        dev.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return out_mv, in_mv

    @staticmethod
    async def get_low_stock_products(db: AsyncSession, business_id: str):
        # Returns products where current_stock <= minimum_stock_level
        # We need to aggregate movements per product
        # Use a subquery: sum per product
        from sqlalchemy import func

        # Get all active products for business
        result = await db.execute(select(Product).where(Product.business_id == business_id, Product.status == "active"))
        products = result.scalars().all()
        low = []
        for prod in products:
            stock = await InventoryService.get_current_stock(db, business_id, prod.id)
            if stock <= prod.minimum_stock_level:
                low.append({"product": prod, "current_stock": stock})
        return low
