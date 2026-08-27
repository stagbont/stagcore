import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.device import Device, DeviceStatus
from app.models.inventory import InventoryMovement, MovementType
from app.models.location import Location
from app.models.product import Product
from app.models.sale import PaymentMethod, Sale, SaleItem, SaleStatus
from app.services.inventory import InventoryService


class SalesService:
    @staticmethod
    async def _validate_customer(db: AsyncSession, business_id: str, customer_id: str | None):
        if not customer_id:
            return
        r = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.business_id == business_id))
        if not r.scalars().first():
            raise ValueError("Invalid customer_id for this business")

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
    async def _validate_device(db: AsyncSession, business_id: str, device_id: str) -> Device:
        r = await db.execute(select(Device).where(Device.id == device_id, Device.business_id == business_id))
        dev = r.scalars().first()
        if not dev:
            raise ValueError("Invalid device_id for this business")
        if dev.status != DeviceStatus.IN_STOCK.value:
            raise ValueError(f"Device not available: status {dev.status}")
        return dev

    @staticmethod
    async def create_sale(db: AsyncSession, business_id: str, payload, created_by: str | None) -> Sale:
        await SalesService._validate_customer(db, business_id, payload.customer_id)
        await SalesService._validate_location(db, business_id, payload.location_id)

        # Validate items upfront
        device_ids_seen: set[str] = set()
        for it in payload.items:
            is_product = it.product_id is not None
            is_device = it.device_id is not None
            if is_product and is_device:
                raise ValueError("Sale item cannot have both product_id and device_id")
            if not is_product and not is_device:
                raise ValueError("Sale item must have product_id or device_id")
            if is_product:
                await SalesService._validate_product(db, business_id, it.product_id)
                if it.quantity <= 0:
                    raise ValueError("Quantity must be > 0")
                if it.discount is not None and it.discount < Decimal("0"):
                    raise ValueError("Discount cannot be negative")
                if it.warranty_months_override is not None:
                    raise ValueError("warranty_months_override only for device items")
            else:
                if it.quantity != 1:
                    raise ValueError("Device item quantity must be 1")
                if it.device_id in device_ids_seen:
                    raise ValueError("Duplicate device_id within sale")
                device_ids_seen.add(it.device_id)
                await SalesService._validate_device(db, business_id, it.device_id)
                if it.warranty_months_override is not None and (it.warranty_months_override < 0 or it.warranty_months_override > 60):
                    raise ValueError("warranty_months_override must be 0-60")

        # Compute total
        total = Decimal("0.00")
        for it in payload.items:
            price = it.selling_price or Decimal("0.00")
            disc = it.discount or Decimal("0.00")
            total += (price - disc) * it.quantity

        sale = Sale(
            id=str(uuid.uuid4()),
            business_id=business_id,
            customer_id=payload.customer_id,
            location_id=payload.location_id,
            payment_method=payload.payment_method,
            status=SaleStatus.DRAFT.value,
            sale_date=payload.sale_date or datetime.now(timezone.utc),
            total_amount=total,
            notes=payload.notes,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(sale)
        await db.flush()

        for it in payload.items:
            si = SaleItem(
                id=str(uuid.uuid4()),
                sale_id=sale.id,
                product_id=it.product_id,
                device_id=it.device_id,
                quantity=it.quantity,
                selling_price=it.selling_price or Decimal("0.00"),
                discount=it.discount or Decimal("0.00"),
                warranty_months_override=it.warranty_months_override,
                created_at=datetime.now(timezone.utc),
            )
            db.add(si)
        await db.flush()
        return sale

    @staticmethod
    async def complete_sale(db: AsyncSession, business_id: str, sale_id: str, actor_id: str | None) -> Sale:
        r = await db.execute(select(Sale).where(Sale.id == sale_id, Sale.business_id == business_id))
        sale = r.scalars().first()
        if not sale:
            raise ValueError("Sale not found for this business")
        if sale.status != SaleStatus.DRAFT.value:
            raise ValueError(f"Sale cannot be completed in status {sale.status}")

        r = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))
        items = r.scalars().all()

        for it in items:
            if it.product_id is not None:
                # Check stock and create movement
                await InventoryService.sell_stock(
                    db,
                    business_id,
                    it.product_id,
                    it.quantity,
                    location_id=sale.location_id,
                    reference=sale.id,
                    notes=f"Sale {sale.id}",
                    created_by=actor_id,
                )
            else:
                # Device sale: set sold + ledger
                await InventoryService.record_device_movement(
                    db,
                    business_id,
                    it.device_id,
                    DeviceStatus.SOLD.value,
                    location_id=sale.location_id,
                    reference=sale.id,
                    notes=f"Sale {sale.id}",
                    created_by=actor_id,
                )

        sale.status = SaleStatus.COMPLETED.value
        sale.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return sale

    @staticmethod
    async def cancel_sale(db: AsyncSession, business_id: str, sale_id: str, actor_id: str | None) -> Sale:
        r = await db.execute(select(Sale).where(Sale.id == sale_id, Sale.business_id == business_id))
        sale = r.scalars().first()
        if not sale:
            raise ValueError("Sale not found for this business")
        if sale.status == SaleStatus.CANCELLED.value:
            raise ValueError(f"Sale cannot be cancelled in status {sale.status}")
        if sale.status == SaleStatus.DRAFT.value:
            sale.status = SaleStatus.CANCELLED.value
            sale.updated_at = datetime.now(timezone.utc)
            await db.flush()
            return sale
        # COMPLETED -> inverse ledger
        if sale.status == SaleStatus.COMPLETED.value:
            r = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))
            items = r.scalars().all()
            for it in items:
                if it.product_id is not None:
                    # Inverse: customer return (+qty)
                    # Use return_stock with customer kind would be similar, but directly do adjustment
                    # We want to add back stock
                    await InventoryService.return_stock(
                        db,
                        business_id,
                        it.product_id,
                        it.quantity,
                        kind="customer",
                        location_id=sale.location_id,
                        reference=sale.id,
                        notes=f"Cancel sale {sale.id}",
                        created_by=actor_id,
                    )
                else:
                    # Device back to in_stock
                    # Use record_device_movement to IN_STOCK
                    await InventoryService.record_device_movement(
                        db,
                        business_id,
                        it.device_id,
                        DeviceStatus.IN_STOCK.value,
                        location_id=sale.location_id,
                        reference=sale.id,
                        notes=f"Cancel sale {sale.id}",
                        created_by=actor_id,
                    )
            sale.status = SaleStatus.CANCELLED.value
            sale.updated_at = datetime.now(timezone.utc)
            await db.flush()
            return sale
        raise ValueError(f"Sale cannot be cancelled in status {sale.status}")
