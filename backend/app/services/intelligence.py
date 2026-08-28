import math
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.inventory import InventoryMovement
from app.models.product import Product
from app.models.sale import Sale, SaleItem, SaleStatus
from app.schemas.intelligence import (
    CategoryIntelligenceBreakdown,
    IntelligenceItem,
    IntelligenceOverviewResponse,
    IntelligenceParams,
)

# Advisory statuses — never written, only derived.
STATUS_OUT = "out_of_stock"
STATUS_CRITICAL = "critical"
STATUS_LOW = "low"
STATUS_OK = "ok"
STATUS_STABLE = "stable"


def _velocity_decimal(total_units: int, window_days: int) -> Decimal:
    if window_days <= 0 or total_units == 0:
        return Decimal("0.00")
    raw = Decimal(total_units) / Decimal(window_days)
    return raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _reorder_point(velocity: Decimal, lead_time_days: int, safety_days: int) -> Decimal:
    # velocity * (lead + safety), quantized to 2dp
    rp = velocity * Decimal(lead_time_days + safety_days)
    return rp.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _suggested_qty(velocity: Decimal, lead_time_days: int, coverage_days: int, current_stock: int) -> int:
    # ceil(velocity * (lead + coverage) - current_stock), floor at 0
    need = velocity * Decimal(lead_time_days + coverage_days) - Decimal(current_stock)
    if need <= 0:
        return 0
    # Decimal ceil: quantize then ceil via math.ceil on float is portable; use to_integral_value
    # Use Decimal's quantize + ceil logic without float
    return int(math.ceil(float(need)))


def _stock_status(current_stock: int, velocity: Decimal, reorder_point: Decimal) -> str:
    if current_stock <= 0:
        return STATUS_OUT
    if velocity == Decimal("0.00"):
        return STATUS_STABLE
    # velocity > 0 from here
    if reorder_point <= Decimal("0"):
        # degenerate params (e.g. velocity tiny, lead+safety 0) — treat any positive stock as ok
        return STATUS_OK
    half = (reorder_point / Decimal("2")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if Decimal(current_stock) <= half:
        return STATUS_CRITICAL
    if Decimal(current_stock) <= reorder_point:
        return STATUS_LOW
    return STATUS_OK


def _urgency_rank(status: str, days_until: int | None) -> tuple[int, float]:
    # Lower rank = more urgent. Used for sorting.
    order = {
        STATUS_OUT: 0,
        STATUS_CRITICAL: 1,
        STATUS_LOW: 2,
        STATUS_OK: 3,
        STATUS_STABLE: 4,
    }
    rank = order.get(status, 5)
    # Within same status, sooner stockout first; stable/null at end
    days_key = float(days_until) if days_until is not None else float("inf")
    return (rank, days_key)


class IntelligenceService:
    @staticmethod
    async def get_overview(
        db: AsyncSession,
        business_id: str,
        window_days: int = 30,
        lead_time_days: int = 7,
        safety_days: int = 3,
        coverage_days: int = 30,
        location_id: str | None = None,
        category_id: str | None = None,
        search: str | None = None,
        sort_by: str = "urgency",
        limit: int = 100,
        offset: int = 0,
    ) -> IntelligenceOverviewResponse:
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(days=window_days)
        window_end = now

        # 1. Load products in scope (business + optional category/search)
        prod_q = (
            select(Product, Category.name.label("category_name"))
            .outerjoin(Category, Product.category_id == Category.id)
            .where(Product.business_id == business_id)
        )
        if category_id is not None:
            prod_q = prod_q.where(Product.category_id == category_id)
        if search:
            # Portable case-insensitive contains (SQLite + Postgres)
            like = f"%{search.lower()}%"
            prod_q = prod_q.where(
                func.lower(Product.name).like(like)
            )
        prod_q = prod_q.order_by(Product.name.asc())
        prod_res = await db.execute(prod_q)
        products_with_cat = prod_res.all()

        if not products_with_cat:
            params = IntelligenceParams(
                window_days=window_days,
                lead_time_days=lead_time_days,
                safety_days=safety_days,
                coverage_days=coverage_days,
            )
            return IntelligenceOverviewResponse(
                params=params,
                generated_at=now,
                window_start=window_start,
                window_end=window_end,
                total_items=0,
                critical_count=0,
                low_count=0,
                out_of_stock_count=0,
                stable_count=0,
                ok_count=0,
                items=[],
                category_breakdown=[],
            )

        product_ids = [p.id for p, _ in products_with_cat]

        # 2. Current stock per product from ledger (optionally per location)
        mv_q = (
            select(
                InventoryMovement.product_id,
                func.coalesce(func.sum(InventoryMovement.quantity), 0).label("stock"),
            )
            .where(
                InventoryMovement.business_id == business_id,
                InventoryMovement.product_id.in_(product_ids),
            )
            .group_by(InventoryMovement.product_id)
        )
        if location_id is not None:
            mv_q = mv_q.where(InventoryMovement.location_id == location_id)
        mv_res = await db.execute(mv_q)
        stock_map: dict[str, int] = {row.product_id: int(row.stock) for row in mv_res.all()}

        # 3. Units sold per product in window from completed sales
        # Join SaleItem -> Sale to filter by business + completed + window + optional location
        # Only product sales (device sales excluded per product-only scope)
        sale_ids_q = select(Sale.id).where(
            Sale.business_id == business_id,
            Sale.status == SaleStatus.COMPLETED.value,
            Sale.sale_date >= window_start,
            Sale.sale_date <= window_end,
        )
        if location_id is not None:
            sale_ids_q = sale_ids_q.where(Sale.location_id == location_id)
        sale_ids_res = await db.execute(sale_ids_q)
        sale_ids = [r[0] for r in sale_ids_res.all()]

        units_map: dict[str, int] = {pid: 0 for pid in product_ids}
        if sale_ids:
            # Group sale items by product_id within those sale_ids
            si_q = (
                select(
                    SaleItem.product_id,
                    func.coalesce(func.sum(SaleItem.quantity), 0).label("units"),
                )
                .where(
                    SaleItem.sale_id.in_(sale_ids),
                    SaleItem.product_id.isnot(None),
                    SaleItem.product_id.in_(product_ids),
                )
                .group_by(SaleItem.product_id)
            )
            si_res = await db.execute(si_q)
            for row in si_res.all():
                units_map[row.product_id] = int(row.units or 0)

        # 4. Build items
        items: list[IntelligenceItem] = []
        cat_agg: dict[str | None, dict] = {}
        critical_count = 0
        low_count = 0
        out_count = 0
        stable_count = 0
        ok_count = 0

        today = now.date()

        for prod, cat_name in products_with_cat:
            cur_stock = stock_map.get(prod.id, 0)
            total_units = units_map.get(prod.id, 0)
            velocity = _velocity_decimal(total_units, window_days)
            rp = _reorder_point(velocity, lead_time_days, safety_days)
            suggested = _suggested_qty(velocity, lead_time_days, coverage_days, cur_stock)
            status = _stock_status(cur_stock, velocity, rp)

            if status == STATUS_CRITICAL:
                critical_count += 1
            elif status == STATUS_LOW:
                low_count += 1
            elif status == STATUS_OUT:
                out_count += 1
            elif status == STATUS_STABLE:
                stable_count += 1
            elif status == STATUS_OK:
                ok_count += 1

            days_until: int | None = None
            stockout_date = None
            if velocity > Decimal("0.00") and cur_stock > 0:
                # floor division on Decimal
                days_until = int((Decimal(cur_stock) / velocity).to_integral_value(rounding=ROUND_HALF_UP))
                # Use floor semantics: if fractional, floor; the above rounds half up so adjust
                # Recompute as floor for spec compliance
                days_until = math.floor(float(Decimal(cur_stock) / velocity))
                stockout_date = today + timedelta(days=days_until)
            elif velocity > Decimal("0.00") and cur_stock <= 0:
                days_until = 0
                stockout_date = today
            else:
                days_until = None
                stockout_date = None

            cost = prod.cost_price if prod.cost_price is not None else Decimal("0.00")
            price = prod.selling_price if prod.selling_price is not None else Decimal("0.00")
            valuation = (cost * Decimal(max(0, cur_stock))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

            item = IntelligenceItem(
                product_id=prod.id,
                name=prod.name,
                sku=prod.sku,
                category_id=prod.category_id,
                category_name=cat_name,
                current_stock=cur_stock,
                minimum_stock_level=prod.minimum_stock_level if prod.minimum_stock_level is not None else 0,
                total_units_sold_in_window=total_units,
                daily_velocity=velocity,
                days_until_stockout=days_until,
                estimated_stockout_date=stockout_date,
                reorder_point=rp,
                suggested_order_qty=suggested,
                stock_status=status,
                valuation=valuation,
                cost_price=cost,
                selling_price=price,
            )
            items.append(item)

            # Category breakdown
            ckey = prod.category_id
            if ckey not in cat_agg:
                cat_agg[ckey] = {
                    "name": cat_name or "Uncategorized",
                    "product_count": 0,
                    "units": 0,
                    "valuation": Decimal("0.00"),
                }
            cat_agg[ckey]["product_count"] += 1
            cat_agg[ckey]["units"] += max(0, cur_stock)
            cat_agg[ckey]["valuation"] += valuation

        # 5. Sort
        if sort_by == "urgency":
            items.sort(key=lambda it: _urgency_rank(it.stock_status, it.days_until_stockout))
        elif sort_by == "stockout_days":
            # Nulls last
            items.sort(key=lambda it: (it.days_until_stockout is None, it.days_until_stockout if it.days_until_stockout is not None else 10**9))
        elif sort_by == "velocity_desc":
            items.sort(key=lambda it: it.daily_velocity, reverse=True)
        elif sort_by == "stock_asc":
            items.sort(key=lambda it: it.current_stock)
        elif sort_by == "stock_desc":
            items.sort(key=lambda it: it.current_stock, reverse=True)
        elif sort_by == "name":
            items.sort(key=lambda it: it.name.lower())

        total_items = len(items)
        paged = items[offset : offset + limit] if limit else items[offset:]

        category_breakdown = [
            CategoryIntelligenceBreakdown(
                category_id=cid,
                category_name=data["name"],
                product_count=data["product_count"],
                units_in_stock=data["units"],
                total_valuation=data["valuation"].quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            )
            for cid, data in cat_agg.items()
        ]
        # Stable sort categories by name
        category_breakdown.sort(key=lambda c: (c.category_name or "").lower())

        params = IntelligenceParams(
            window_days=window_days,
            lead_time_days=lead_time_days,
            safety_days=safety_days,
            coverage_days=coverage_days,
        )

        return IntelligenceOverviewResponse(
            params=params,
            generated_at=now,
            window_start=window_start,
            window_end=window_end,
            total_items=total_items,
            critical_count=critical_count,
            low_count=low_count,
            out_of_stock_count=out_count,
            stable_count=stable_count,
            ok_count=ok_count,
            items=paged,
            category_breakdown=category_breakdown,
        )

    @staticmethod
    async def get_product_intelligence(
        db: AsyncSession,
        business_id: str,
        product_id: str,
        window_days: int = 30,
        lead_time_days: int = 7,
        safety_days: int = 3,
        coverage_days: int = 30,
        location_id: str | None = None,
    ) -> IntelligenceItem:
        # Validate product belongs to business
        prod_res = await db.execute(
            select(Product, Category.name.label("category_name"))
            .outerjoin(Category, Product.category_id == Category.id)
            .where(Product.id == product_id, Product.business_id == business_id)
        )
        row = prod_res.first()
        if not row:
            raise ValueError("Product not found for this business")
        prod, cat_name = row

        overview = await IntelligenceService.get_overview(
            db,
            business_id,
            window_days=window_days,
            lead_time_days=lead_time_days,
            safety_days=safety_days,
            coverage_days=coverage_days,
            location_id=location_id,
            search=None,
            sort_by="name",
            limit=1000,
            offset=0,
        )
        # Find item by product_id from overview (reuses same calculations)
        for it in overview.items:
            if it.product_id == product_id:
                return it
        # Fallback: product exists but filtered out? recompute directly for this single product
        # (get_overview already included it unless large offset, but be defensive)
        # Re-derive for this single id only
        # The simplest fallback is to fetch again with search by id via same path
        raise ValueError("Product intelligence not found")
