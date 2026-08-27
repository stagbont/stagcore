import uuid
from datetime import datetime, timezone
from calendar import monthrange

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.device import Device
from app.models.sale import SaleItem
from app.models.warranty import Warranty, WarrantyClaim, WarrantyClaimResolution, WarrantyClaimStatus, WarrantyStatus


def _add_months(dt: datetime, months: int) -> datetime:
    """Calendar-accurate month addition, like dateutil.relativedelta."""
    # Ensure timezone aware
    year = dt.year
    month = dt.month + months
    y2 = year + (month - 1) // 12
    m2 = (month - 1) % 12 + 1
    # Clamp day to last day of target month
    last_day = monthrange(y2, m2)[1]
    d2 = min(dt.day, last_day)
    return dt.replace(year=y2, month=m2, day=d2)


def _validity(w: Warranty) -> tuple[bool, int, bool]:
    now = datetime.now(timezone.utc)
    expires = w.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    is_expired = now > expires
    delta = (expires - now).days
    is_valid = (w.status == WarrantyStatus.ACTIVE.value) and not is_expired
    return is_expired, delta, is_valid


class WarrantyService:
    @staticmethod
    async def create_warranty_for_sale_item(
        db: AsyncSession,
        business_id: str,
        device_id: str,
        sale_id: str,
        sale_item_id: str,
        customer_id: str | None,
        sale_date: datetime,
        warranty_months_override: int | None,
        created_by: str | None,
    ) -> Warranty:
        # Resolve warranty_months: override or category default
        warranty_months: int
        if warranty_months_override is not None:
            warranty_months = warranty_months_override
        else:
            # Look up device -> category default
            r = await db.execute(select(Device).where(Device.id == device_id))
            dev = r.scalars().first()
            if dev and dev.category_id:
                cr = await db.execute(select(Category).where(Category.id == dev.category_id))
                cat = cr.scalars().first()
                if cat:
                    warranty_months = cat.default_warranty_months
                else:
                    warranty_months = 12
            else:
                warranty_months = 12

        if warranty_months < 0 or warranty_months > 60:
            raise ValueError("warranty_months must be 0-60")

        if sale_date.tzinfo is None:
            sale_date = sale_date.replace(tzinfo=timezone.utc)

        expires_at = _add_months(sale_date, warranty_months)

        w = Warranty(
            id=str(uuid.uuid4()),
            business_id=business_id,
            device_id=device_id,
            sale_id=sale_id,
            sale_item_id=sale_item_id,
            customer_id=customer_id,
            warranty_months=warranty_months,
            start_date=sale_date,
            expires_at=expires_at,
            status=WarrantyStatus.ACTIVE.value,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(w)
        await db.flush()
        return w

    @staticmethod
    async def get_validity(db: AsyncSession, business_id: str, warranty_id: str) -> dict:
        r = await db.execute(select(Warranty).where(Warranty.id == warranty_id, Warranty.business_id == business_id))
        w = r.scalars().first()
        if not w:
            raise ValueError("Warranty not found for this business")
        is_expired, days_remaining, is_valid = _validity(w)
        return {"warranty_id": w.id, "is_expired": is_expired, "is_valid": is_valid, "days_remaining": days_remaining, "status": w.status}

    @staticmethod
    async def void_warranties_for_sale(db: AsyncSession, business_id: str, sale_id: str):
        r = await db.execute(select(Warranty).where(Warranty.business_id == business_id, Warranty.sale_id == sale_id))
        for w in r.scalars().all():
            w.status = WarrantyStatus.VOID.value
            w.updated_at = datetime.now(timezone.utc)
        await db.flush()

    @staticmethod
    async def create_claim(
        db: AsyncSession,
        business_id: str,
        warranty_id: str | None,
        device_id: str | None,
        customer_id: str | None,
        diagnosis: str | None,
        created_by: str | None,
    ) -> WarrantyClaim:
        warranty: Warranty | None = None
        if warranty_id:
            r = await db.execute(select(Warranty).where(Warranty.id == warranty_id, Warranty.business_id == business_id))
            warranty = r.scalars().first()
            if not warranty:
                raise ValueError("Warranty not found for this business")
        elif device_id:
            # Find active warranty for device (latest)
            r = await db.execute(
                select(Warranty).where(Warranty.business_id == business_id, Warranty.device_id == device_id).order_by(Warranty.created_at.desc())
            )
            warranty = r.scalars().first()
            if not warranty:
                raise ValueError("No warranty found for this device")
        else:
            raise ValueError("Either warranty_id or device_id is required")

        # Determine device_id for claim
        claim_device_id = device_id or warranty.device_id

        # Validate customer belongs to business if provided
        if customer_id:
            from app.models.customer import Customer

            cr = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.business_id == business_id))
            if not cr.scalars().first():
                raise ValueError("Invalid customer_id for this business")

        # Allow claim even if expired, but record status (is_expired flag computed on read)
        claim = WarrantyClaim(
            id=str(uuid.uuid4()),
            business_id=business_id,
            warranty_id=warranty.id,
            device_id=claim_device_id,
            customer_id=customer_id or warranty.customer_id,
            status=WarrantyClaimStatus.OPEN.value,
            diagnosis=diagnosis,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(claim)
        # Do not auto-change warranty status to CLAIMED unless desired; keep ACTIVE but track claim
        await db.flush()
        return claim

    @staticmethod
    async def update_claim(
        db: AsyncSession,
        business_id: str,
        claim_id: str,
        payload,
    ) -> WarrantyClaim:
        r = await db.execute(select(WarrantyClaim).where(WarrantyClaim.id == claim_id, WarrantyClaim.business_id == business_id))
        claim = r.scalars().first()
        if not claim:
            raise ValueError("Warranty claim not found for this business")

        # Status FSM: allow any forward but validate resolution requires closed?
        # Simple: all transitions allowed except closed/rejected are terminal
        if payload.status is not None:
            if payload.status not in [s.value for s in WarrantyClaimStatus]:
                raise ValueError(f"Invalid status: {payload.status}")
            # Terminal states cannot be reopened
            if claim.status in (WarrantyClaimStatus.CLOSED.value, WarrantyClaimStatus.REJECTED.value) and payload.status != claim.status:
                raise ValueError(f"Cannot transition from {claim.status} to {payload.status}")
            claim.status = payload.status

        if payload.diagnosis is not None:
            claim.diagnosis = payload.diagnosis
        if payload.resolution is not None:
            if payload.resolution not in [s.value for s in WarrantyClaimResolution]:
                raise ValueError(f"Invalid resolution: {payload.resolution}")
            claim.resolution = payload.resolution
        if payload.resolution_notes is not None:
            claim.resolution_notes = payload.resolution_notes

        claim.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return claim
