import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device, DeviceStatus
from app.models.purchase import Purchase, PurchaseItem
from app.models.return_ import PurchaseReturn, PurchaseReturnItem, SaleReturn, SaleReturnItem
from app.models.sale import Sale, SaleItem, SaleStatus
from app.services.inventory import InventoryService


class SaleReturnService:
    @staticmethod
    async def create_sale_return(db: AsyncSession, business_id: str, sale_id: str, payload, created_by: str | None) -> SaleReturn:
        # Validate sale
        r = await db.execute(select(Sale).where(Sale.id == sale_id, Sale.business_id == business_id))
        sale = r.scalars().first()
        if not sale:
            raise ValueError("Sale not found for this business")
        if sale.status != SaleStatus.COMPLETED.value:
            raise ValueError("Only completed sales can be returned")
        # Validate location if provided
        if payload.location_id:
            from app.models.location import Location

            lr = await db.execute(select(Location).where(Location.id == payload.location_id, Location.business_id == business_id))
            if not lr.scalars().first():
                raise ValueError("Invalid location_id for this business")
        location_id = payload.location_id or sale.location_id

        # Validate items
        if not payload.items:
            raise ValueError("At least one item required")
        # Map sale_item_id -> SaleItem
        sale_item_map: dict[str, SaleItem] = {}
        for it in payload.items:
            ir = await db.execute(select(SaleItem).where(SaleItem.id == it.sale_item_id, SaleItem.sale_id == sale_id))
            si = ir.scalars().first()
            if not si:
                raise ValueError(f"Sale item {it.sale_item_id} not found for this sale")
            # Check already returned qty
            # Sum previous returns for this sale_item
            pr = await db.execute(
                select(SaleReturnItem).join(SaleReturn, SaleReturnItem.sale_return_id == SaleReturn.id).where(SaleReturn.sale_id == sale_id, SaleReturnItem.sale_item_id == it.sale_item_id)
            )
            already = sum(ri.quantity for ri in pr.scalars().all())
            available = si.quantity - already
            if it.quantity > available:
                raise ValueError(f"Return quantity {it.quantity} exceeds available {available} for item {it.sale_item_id}")
            if si.device_id and it.quantity != 1:
                raise ValueError("Device return quantity must be 1")
            sale_item_map[it.sale_item_id] = si

        # Compute refund total if not provided per item
        total_refund = Decimal("0.00")
        for it in payload.items:
            si = sale_item_map[it.sale_item_id]
            if it.refund_amount is not None:
                total_refund += it.refund_amount
            else:
                total_refund += (si.selling_price - si.discount) * it.quantity

        # Create header
        now = datetime.now(timezone.utc)
        sr_id = str(uuid.uuid4())
        sr = SaleReturn(
            id=sr_id,
            business_id=business_id,
            sale_id=sale_id,
            location_id=location_id,
            reason=payload.reason,
            refund_method=payload.refund_method,
            refund_amount=total_refund,
            restock=payload.restock,
            notes=payload.notes,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        db.add(sr)
        await db.flush()

        for it in payload.items:
            si = sale_item_map[it.sale_item_id]
            refund_amt = it.refund_amount if it.refund_amount is not None else (si.selling_price - si.discount) * it.quantity
            sri = SaleReturnItem(
                id=str(uuid.uuid4()),
                sale_return_id=sr_id,
                sale_item_id=si.id,
                product_id=si.product_id,
                device_id=si.device_id,
                quantity=it.quantity,
                refund_amount=refund_amt,
                created_at=now,
            )
            db.add(sri)
            # Ledger restock if requested
            if payload.restock:
                if si.product_id:
                    await InventoryService.return_stock(
                        db, business_id, si.product_id, it.quantity, kind="customer", location_id=location_id, reference=sr_id, notes=f"Sale return {sr_id} reason {payload.reason}", created_by=created_by
                    )
                elif si.device_id:
                    # Device return always restock (+1) unless restock False
                    r2 = await db.execute(select(Device).where(Device.id == si.device_id, Device.business_id == business_id))
                    dev = r2.scalars().first()
                    if dev:
                        # If restock True, set to returned (quarantine) or in_stock? Per decision always restock -> in_stock
                        target = DeviceStatus.RETURNED.value if payload.restock else dev.status
                        # But spec says always restock -> in_stock? We use RETURNED as per movement mapping (+1). However pilot wants in_stock? Use RETURNED status then later can be set to in_stock manually.
                        # For simplicity, use RETURNED when restock=True, keep original when False. For always restock we go to in_stock? Let's honor restock flag: if True -> RETURNED (as ledger +1)
                        # But earlier we fixed returned qty to +1, so it's restock.
                        if payload.restock:
                            # Always restock -> set to returned then considered stock? We'll set to RETURNED
                            target = DeviceStatus.RETURNED.value
                            await InventoryService.record_device_movement(db, business_id, si.device_id, target, location_id=location_id, reference=sr_id, notes=f"Sale return {sr_id}", created_by=created_by)
                        # else do not move
                else:
                    pass
            # else no restock, just refund record
        # Update sale status if fully returned? Check if all quantities returned
        # Recompute remaining
        remaining = 0
        r_all = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale_id))
        for si in r_all.scalars().all():
            pr = await db.execute(select(SaleReturnItem).join(SaleReturn, SaleReturnItem.sale_return_id == SaleReturn.id).where(SaleReturn.sale_id == sale_id, SaleReturnItem.sale_item_id == si.id))
            already = sum(ri.quantity for ri in pr.scalars().all())
            remaining += si.quantity - already
        # If fully returned, keep sale completed? Could mark notes; not changing status to preserve history
        await db.flush()
        return sr


class PurchaseReturnService:
    @staticmethod
    async def create_purchase_return(db: AsyncSession, business_id: str, purchase_id: str, payload, created_by: str | None) -> PurchaseReturn:
        r = await db.execute(select(Purchase).where(Purchase.id == purchase_id, Purchase.business_id == business_id))
        pur = r.scalars().first()
        if not pur:
            raise ValueError("Purchase not found for this business")
        if pur.status not in ("received", "draft"):
            raise ValueError("Purchase cannot be returned in status " + pur.status)
        if payload.location_id:
            from app.models.location import Location

            lr = await db.execute(select(Location).where(Location.id == payload.location_id, Location.business_id == business_id))
            if not lr.scalars().first():
                raise ValueError("Invalid location_id for this business")
        location_id = payload.location_id or pur.location_id

        now = datetime.now(timezone.utc)
        pr_id = str(uuid.uuid4())
        pr = PurchaseReturn(
            id=pr_id,
            business_id=business_id,
            purchase_id=purchase_id,
            location_id=location_id,
            reason=payload.reason,
            notes=payload.notes,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        db.add(pr)
        await db.flush()

        for it in payload.items:
            ir = await db.execute(select(PurchaseItem).where(PurchaseItem.id == it.purchase_item_id, PurchaseItem.purchase_id == purchase_id))
            pi = ir.scalars().first()
            if not pi:
                raise ValueError(f"Purchase item {it.purchase_item_id} not found")
            # Check already returned
            pr2 = await db.execute(select(PurchaseReturnItem).join(PurchaseReturn, PurchaseReturnItem.purchase_return_id == PurchaseReturn.id).where(PurchaseReturn.purchase_id == purchase_id, PurchaseReturnItem.purchase_item_id == it.purchase_item_id))
            already = sum(ri.quantity for ri in pr2.scalars().all())
            available = pi.quantity - already
            if it.quantity > available:
                raise ValueError(f"Return quantity exceeds available {available}")
            pri = PurchaseReturnItem(
                id=str(uuid.uuid4()),
                purchase_return_id=pr_id,
                purchase_item_id=pi.id,
                product_id=pi.product_id,
                device_id=None,  # purchase device stored via serial, not device_id
                quantity=it.quantity,
                created_at=now,
            )
            db.add(pri)
            # Ledger: supplier return (-qty) if product
            if pi.product_id:
                await InventoryService.return_stock(db, business_id, pi.product_id, it.quantity, kind="supplier", location_id=location_id, reference=pr_id, notes=f"Purchase return {pr_id}", created_by=created_by)
            # For device serial, we could mark device as returned? But purchase device is not yet tied to Device table unless received. If already received, find device by serial
            if pi.serial_number:
                # Find device with that serial
                dr = await db.execute(select(Device).where(Device.business_id == business_id, Device.serial_number == pi.serial_number))
                dev = dr.scalars().first()
                if dev and dev.status == DeviceStatus.IN_STOCK.value:
                    await InventoryService.record_device_movement(db, business_id, dev.id, DeviceStatus.RETURNED.value, location_id=location_id, reference=pr_id, notes=f"Purchase return {pr_id}", created_by=created_by)
        await db.flush()
        return pr
