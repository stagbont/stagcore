import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device, DeviceStatus
from app.models.inventory import InventoryMovement, MovementType
from app.models.location import Location
from app.models.product import Product
from app.models.purchase import Purchase, PurchaseItem, PurchaseStatus
from app.models.supplier import Supplier
from app.services.inventory import InventoryService


class PurchasingService:
    @staticmethod
    async def _validate_supplier(db: AsyncSession, business_id: str, supplier_id: str | None):
        if not supplier_id:
            return
        r = await db.execute(select(Supplier).where(Supplier.id == supplier_id, Supplier.business_id == business_id))
        if not r.scalars().first():
            raise ValueError("Invalid supplier_id for this business")

    @staticmethod
    async def _validate_location(db: AsyncSession, business_id: str, location_id: str | None):
        if not location_id:
            return
        r = await db.execute(select(Location).where(Location.id == location_id, Location.business_id == business_id))
        if not r.scalars().first():
            raise ValueError("Invalid location_id for this business")

    @staticmethod
    async def _validate_product(db: AsyncSession, business_id: str, product_id: str | None):
        if not product_id:
            return
        r = await db.execute(select(Product).where(Product.id == product_id, Product.business_id == business_id))
        if not r.scalars().first():
            raise ValueError("Invalid product_id for this business")

    @staticmethod
    async def create_purchase(
        db: AsyncSession,
        business_id: str,
        payload,
        created_by: str | None,
    ) -> Purchase:
        await PurchasingService._validate_supplier(db, business_id, payload.supplier_id)
        await PurchasingService._validate_location(db, business_id, payload.location_id)

        # Validate items upfront
        for it in payload.items:
            is_product_item = it.product_id is not None
            is_device_item = it.serial_number is not None or it.product_name is not None
            if is_product_item and is_device_item:
                raise ValueError("Purchase item cannot have both product_id and serial_number/product_name")
            if not is_product_item and not is_device_item:
                raise ValueError("Purchase item must have product_id or serial_number/product_name")
            if is_product_item:
                await PurchasingService._validate_product(db, business_id, it.product_id)
                if it.quantity <= 0:
                    raise ValueError("Quantity must be > 0")
            else:
                # Device item: must have product_name+serial, quantity must be 1
                if not it.product_name or not it.serial_number:
                    raise ValueError("Device item requires product_name and serial_number")
                if it.quantity != 1:
                    raise ValueError("Device item quantity must be 1")
                # Check serial unique per business (existing devices)
                r = await db.execute(select(Device).where(Device.business_id == business_id, Device.serial_number == it.serial_number))
                if r.scalars().first():
                    raise ValueError(f"Device serial already exists: {it.serial_number}")
                # Check duplicate serials within same purchase payload
                serials = [x.serial_number for x in payload.items if x.serial_number]
                if len(serials) != len(set(serials)):
                    raise ValueError("Duplicate serial_number within purchase")

        purchase = Purchase(
            id=str(uuid.uuid4()),
            business_id=business_id,
            supplier_id=payload.supplier_id,
            location_id=payload.location_id,
            invoice_reference=payload.invoice_reference,
            purchase_date=payload.purchase_date or datetime.now(timezone.utc),
            status=PurchaseStatus.DRAFT.value,
            payment_status=payload.payment_status,
            notes=payload.notes,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(purchase)
        await db.flush()

        for it in payload.items:
            pi = PurchaseItem(
                id=str(uuid.uuid4()),
                purchase_id=purchase.id,
                product_id=it.product_id,
                quantity=it.quantity,
                unit_cost=it.unit_cost or Decimal("0.00"),
                serial_number=it.serial_number,
                imei=it.imei,
                product_name=it.product_name,
                notes=it.notes,
                created_at=datetime.now(timezone.utc),
            )
            db.add(pi)
        await db.flush()
        return purchase

    @staticmethod
    async def receive_purchase(
        db: AsyncSession,
        business_id: str,
        purchase_id: str,
        actor_id: str | None,
    ) -> Purchase:
        r = await db.execute(select(Purchase).where(Purchase.id == purchase_id, Purchase.business_id == business_id))
        purchase = r.scalars().first()
        if not purchase:
            raise ValueError("Purchase not found for this business")
        if purchase.status != PurchaseStatus.DRAFT.value:
            raise ValueError(f"Purchase cannot be received in status {purchase.status}")

        # Load items
        r = await db.execute(select(PurchaseItem).where(PurchaseItem.purchase_id == purchase.id))
        items = r.scalars().all()

        for it in items:
            if it.product_id is not None:
                # Non-serialized: inventory movement PURCHASE
                await InventoryService.receive_stock(
                    db,
                    business_id,
                    it.product_id,
                    it.quantity,
                    unit_cost=it.unit_cost,
                    location_id=purchase.location_id,
                    reference=purchase.invoice_reference or purchase.id,
                    notes=f"Purchase {purchase.id}",
                    created_by=actor_id,
                )
            else:
                # Serialized: create Device + ledger entry
                # Double-check serial still unique (race)
                dup = await db.execute(select(Device).where(Device.business_id == business_id, Device.serial_number == it.serial_number))
                if dup.scalars().first():
                    raise ValueError(f"Device serial already exists: {it.serial_number}")
                dev = Device(
                    id=str(uuid.uuid4()),
                    business_id=business_id,
                    product_name=it.product_name or "Unknown",
                    serial_number=it.serial_number or str(uuid.uuid4()),
                    imei=it.imei,
                    supplier_id=purchase.supplier_id,
                    cost_price=it.unit_cost or Decimal("0.00"),
                    selling_price=Decimal("0.00"),
                    status=DeviceStatus.IN_STOCK.value,
                    location_id=purchase.location_id,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
                db.add(dev)
                await db.flush()
                # Ledger for reporting consistency: PURCHASE +1
                mv = InventoryMovement(
                    id=str(uuid.uuid4()),
                    business_id=business_id,
                    device_id=dev.id,
                    location_id=purchase.location_id,
                    type=MovementType.PURCHASE.value,
                    quantity=1,
                    unit_cost=it.unit_cost,
                    reference=purchase.invoice_reference or purchase.id,
                    created_by=actor_id,
                    created_at=datetime.now(timezone.utc),
                    notes=f"Purchase {purchase.id} device {dev.serial_number}",
                )
                db.add(mv)
                await db.flush()

        purchase.status = PurchaseStatus.RECEIVED.value
        purchase.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return purchase

    @staticmethod
    async def cancel_purchase(db: AsyncSession, business_id: str, purchase_id: str) -> Purchase:
        r = await db.execute(select(Purchase).where(Purchase.id == purchase_id, Purchase.business_id == business_id))
        purchase = r.scalars().first()
        if not purchase:
            raise ValueError("Purchase not found for this business")
        if purchase.status != PurchaseStatus.DRAFT.value:
            raise ValueError(f"Purchase cannot be cancelled in status {purchase.status}")
        purchase.status = PurchaseStatus.CANCELLED.value
        purchase.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return purchase
