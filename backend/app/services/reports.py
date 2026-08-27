from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.device import Device, DeviceStatus
from app.models.inventory import InventoryMovement, MovementType
from app.models.product import Product
from app.models.purchase import Purchase, PurchaseItem, PurchaseStatus
from app.models.sale import Sale, SaleItem, SaleStatus
from app.models.supplier import Supplier
from app.schemas.dashboard import (
    DashboardActivityItem,
    DashboardSummaryResponse,
    LowStockAlertItem,
    TopSellingProduct,
)
from app.schemas.report import (
    CategoryValuation,
    DailySalesBreakdown,
    InventoryReportItem,
    InventoryReportResponse,
    PaymentMethodSummary,
    ProductPerformanceItem,
    ProductPerformanceReportResponse,
    ProfitReportResponse,
    SalesReportResponse,
    SupplierReportItem,
    SupplierReportResponse,
)


class ReportService:
    @staticmethod
    async def get_dashboard_summary(db: AsyncSession, business_id: str) -> DashboardSummaryResponse:
        now = datetime.now(timezone.utc)
        today_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
        today_end = datetime.combine(now.date(), time.max, tzinfo=timezone.utc)

        # 1. Today's Completed Sales & Revenue
        sales_query = select(Sale).where(
            Sale.business_id == business_id,
            Sale.status == SaleStatus.COMPLETED.value,
            Sale.sale_date >= today_start,
            Sale.sale_date <= today_end,
        )
        sales_res = await db.execute(sales_query)
        today_sales = sales_res.scalars().all()
        today_sales_count = len(today_sales)
        today_sales_total = sum((s.total_amount for s in today_sales), Decimal("0.00"))

        # 2. Today's Gross Profit
        sale_ids = [s.id for s in today_sales]
        today_cogs = Decimal("0.00")
        if sale_ids:
            items_query = (
                select(SaleItem, Product, Device)
                .outerjoin(Product, SaleItem.product_id == Product.id)
                .outerjoin(Device, SaleItem.device_id == Device.id)
                .where(SaleItem.sale_id.in_(sale_ids))
            )
            items_res = await db.execute(items_query)
            for item, prod, dev in items_res.all():
                if dev and dev.cost_price is not None:
                    unit_cost = dev.cost_price
                elif prod and prod.cost_price is not None:
                    unit_cost = prod.cost_price
                else:
                    unit_cost = Decimal("0.00")
                today_cogs += unit_cost * Decimal(item.quantity)

        today_gross_profit = today_sales_total - today_cogs

        # 3. Inventory Stock & Valuation
        prod_query = select(Product, Category.name.label("category_name")).outerjoin(Category, Product.category_id == Category.id).where(Product.business_id == business_id)
        prod_res = await db.execute(prod_query)
        products_with_cat = prod_res.all()

        mv_query = (
            select(
                InventoryMovement.product_id,
                func.coalesce(func.sum(InventoryMovement.quantity), 0).label("stock"),
            )
            .where(InventoryMovement.business_id == business_id, InventoryMovement.product_id.isnot(None))
            .group_by(InventoryMovement.product_id)
        )
        mv_res = await db.execute(mv_query)
        movement_stock_map = {row.product_id: int(row.stock) for row in mv_res.all()}

        # Serialized devices in stock
        dev_val_q = select(
            func.count(Device.id).label("total_devices"),
            func.coalesce(func.sum(Device.cost_price), Decimal("0.00")).label("val"),
        ).where(Device.business_id == business_id, Device.status == DeviceStatus.IN_STOCK.value)
        dev_val_res = await db.execute(dev_val_q)
        dev_val_row = dev_val_res.first()
        serialized_count = int(dev_val_row.total_devices) if dev_val_row else 0
        serialized_val = Decimal(str(dev_val_row.val)) if dev_val_row else Decimal("0.00")

        total_inventory_value = serialized_val
        low_stock_count = 0
        out_of_stock_count = 0
        low_stock_items: list[LowStockAlertItem] = []

        for prod, cat_name in products_with_cat:
            cur_stock = movement_stock_map.get(prod.id, 0)
            cost = prod.cost_price or Decimal("0.00")
            valuation = Decimal(max(0, cur_stock)) * cost
            total_inventory_value += valuation

            min_threshold = prod.minimum_stock_level if prod.minimum_stock_level is not None else 0
            if cur_stock <= 0:
                out_of_stock_count += 1
                low_stock_items.append(
                    LowStockAlertItem(
                        product_id=prod.id,
                        product_name=prod.name,
                        sku=prod.sku,
                        category_name=cat_name,
                        current_stock=cur_stock,
                        minimum_stock_level=min_threshold,
                    )
                )
            elif cur_stock <= min_threshold:
                low_stock_count += 1
                low_stock_items.append(
                    LowStockAlertItem(
                        product_id=prod.id,
                        product_name=prod.name,
                        sku=prod.sku,
                        category_name=cat_name,
                        current_stock=cur_stock,
                        minimum_stock_level=min_threshold,
                    )
                )

        # 4. Top-selling products today
        top_selling: list[TopSellingProduct] = []
        if sale_ids:
            top_query = (
                select(
                    SaleItem.product_id,
                    Product.name.label("product_name"),
                    Product.sku,
                    func.sum(SaleItem.quantity).label("units_sold"),
                    func.sum((SaleItem.selling_price - SaleItem.discount) * SaleItem.quantity).label("revenue"),
                )
                .join(Product, SaleItem.product_id == Product.id)
                .where(SaleItem.sale_id.in_(sale_ids), SaleItem.product_id.isnot(None))
                .group_by(SaleItem.product_id, Product.name, Product.sku)
                .order_by(func.sum(SaleItem.quantity).desc())
                .limit(5)
            )
            top_res = await db.execute(top_query)
            for row in top_res.all():
                top_selling.append(
                    TopSellingProduct(
                        product_id=row.product_id,
                        product_name=row.product_name,
                        sku=row.sku,
                        units_sold=int(row.units_sold),
                        total_revenue=Decimal(str(row.revenue or 0)),
                    )
                )

        return DashboardSummaryResponse(
            today_sales_total=today_sales_total,
            today_sales_count=today_sales_count,
            today_gross_profit=today_gross_profit,
            total_inventory_value=total_inventory_value,
            total_products_count=len(products_with_cat) + serialized_count,
            low_stock_count=low_stock_count,
            out_of_stock_count=out_of_stock_count,
            open_warranty_claims_count=0,
            active_repairs_count=0,
            top_selling_products=top_selling,
            low_stock_items=low_stock_items[:10],
        )

    @staticmethod
    async def get_dashboard_activity(db: AsyncSession, business_id: str, limit: int = 15) -> list[DashboardActivityItem]:
        activities: list[DashboardActivityItem] = []

        # 1. Recent completed sales
        sales_q = (
            select(Sale)
            .where(Sale.business_id == business_id, Sale.status == SaleStatus.COMPLETED.value)
            .order_by(Sale.sale_date.desc())
            .limit(limit)
        )
        sales_res = await db.execute(sales_q)
        for s in sales_res.scalars().all():
            activities.append(
                DashboardActivityItem(
                    id=f"sale_{s.id}",
                    activity_type="sale",
                    title=f"Sale Completed ({s.payment_method.replace('_', ' ').capitalize()})",
                    description=f"Transaction total: ${s.total_amount:.2f}",
                    amount=s.total_amount,
                    timestamp=s.sale_date,
                )
            )

        # 2. Recent purchases received
        purchases_q = (
            select(Purchase, Supplier.name.label("supplier_name"))
            .outerjoin(Supplier, Purchase.supplier_id == Supplier.id)
            .where(Purchase.business_id == business_id)
            .order_by(Purchase.purchase_date.desc())
            .limit(limit)
        )
        purchases_res = await db.execute(purchases_q)
        purchase_rows = purchases_res.all()
        p_ids = [p.id for p, _ in purchase_rows]

        p_items_map: dict[str, Decimal] = {}
        if p_ids:
            pi_q = select(PurchaseItem).where(PurchaseItem.purchase_id.in_(p_ids))
            pi_res = await db.execute(pi_q)
            for pi in pi_res.scalars().all():
                p_items_map[pi.purchase_id] = p_items_map.get(pi.purchase_id, Decimal("0.00")) + (pi.unit_cost * Decimal(pi.quantity))

        for p, s_name in purchase_rows:
            supp_label = f" from {s_name}" if s_name else ""
            tot = p_items_map.get(p.id, Decimal("0.00"))
            activities.append(
                DashboardActivityItem(
                    id=f"purchase_{p.id}",
                    activity_type="purchase",
                    title=f"Purchase {p.status.capitalize()}{supp_label}",
                    description=f"PO total: ${tot:.2f}",
                    amount=tot,
                    timestamp=p.purchase_date,
                )
            )

        # 3. Recent inventory adjustments / manual movements
        manual_types = [
            MovementType.ADJUSTMENT_IN.value,
            MovementType.ADJUSTMENT_OUT.value,
            MovementType.CUSTOMER_RETURN.value,
            MovementType.SUPPLIER_RETURN.value,
            MovementType.DAMAGE.value,
            MovementType.LOSS.value,
            MovementType.TRANSFER_IN.value,
            MovementType.TRANSFER_OUT.value,
        ]
        mv_q = (
            select(InventoryMovement, Product.name.label("product_name"))
            .outerjoin(Product, InventoryMovement.product_id == Product.id)
            .where(
                InventoryMovement.business_id == business_id,
                InventoryMovement.type.in_(manual_types),
            )
            .order_by(InventoryMovement.created_at.desc())
            .limit(limit)
        )
        mv_res = await db.execute(mv_q)
        for mv, p_name in mv_res.all():
            qty_sign = f"+{mv.quantity}" if mv.quantity > 0 else str(mv.quantity)
            p_label = p_name or "Item"
            type_label = mv.type.replace("_", " ").title()
            activities.append(
                DashboardActivityItem(
                    id=f"mv_{mv.id}",
                    activity_type="movement",
                    title=f"Inventory {type_label}: {p_label}",
                    description=f"Quantity adjusted: {qty_sign} units",
                    quantity=mv.quantity,
                    timestamp=mv.created_at,
                )
            )

        activities.sort(key=lambda a: a.timestamp, reverse=True)
        return activities[:limit]

    @staticmethod
    async def get_sales_report(
        db: AsyncSession,
        business_id: str,
        start_date: datetime,
        end_date: datetime,
        location_id: str | None = None,
    ) -> SalesReportResponse:
        sales_q = select(Sale).where(
            Sale.business_id == business_id,
            Sale.status == SaleStatus.COMPLETED.value,
            Sale.sale_date >= start_date,
            Sale.sale_date <= end_date,
        )
        if location_id:
            sales_q = sales_q.where(Sale.location_id == location_id)

        sales_res = await db.execute(sales_q)
        sales = sales_res.scalars().all()
        sale_ids = [s.id for s in sales]

        total_sales_count = len(sales)
        total_revenue = sum((s.total_amount for s in sales), Decimal("0.00"))
        average_order_value = (total_revenue / Decimal(total_sales_count)) if total_sales_count > 0 else Decimal("0.00")

        pay_counts: dict[str, dict[str, Any]] = {}
        for s in sales:
            pm = s.payment_method
            if pm not in pay_counts:
                pay_counts[pm] = {"count": 0, "amount": Decimal("0.00")}
            pay_counts[pm]["count"] += 1
            pay_counts[pm]["amount"] += s.total_amount

        payment_methods = [
            PaymentMethodSummary(
                payment_method=pm,
                transaction_count=data["count"],
                total_amount=data["amount"],
            )
            for pm, data in pay_counts.items()
        ]

        total_discounts = Decimal("0.00")
        total_items_sold = 0
        daily_map: dict[date, dict[str, Any]] = {}

        if sale_ids:
            items_q = select(SaleItem, Sale.sale_date).join(Sale, SaleItem.sale_id == Sale.id).where(SaleItem.sale_id.in_(sale_ids))
            items_res = await db.execute(items_q)
            for item, s_date in items_res.all():
                total_discounts += item.discount * Decimal(item.quantity)
                total_items_sold += item.quantity
                d = s_date.date()
                if d not in daily_map:
                    daily_map[d] = {"count": 0, "revenue": Decimal("0.00"), "discounts": Decimal("0.00"), "items": 0}
                daily_map[d]["items"] += item.quantity
                daily_map[d]["discounts"] += item.discount * Decimal(item.quantity)

        for s in sales:
            d = s.sale_date.date()
            if d not in daily_map:
                daily_map[d] = {"count": 0, "revenue": Decimal("0.00"), "discounts": Decimal("0.00"), "items": 0}
            daily_map[d]["count"] += 1
            daily_map[d]["revenue"] += s.total_amount

        daily_breakdown = [
            DailySalesBreakdown(
                date=d,
                sales_count=info["count"],
                revenue=info["revenue"],
                discounts=info["discounts"],
                items_sold=info["items"],
            )
            for d, info in sorted(daily_map.items())
        ]

        return SalesReportResponse(
            start_date=start_date,
            end_date=end_date,
            total_sales_count=total_sales_count,
            total_revenue=total_revenue,
            total_discounts=total_discounts,
            total_items_sold=total_items_sold,
            average_order_value=average_order_value,
            payment_methods=payment_methods,
            daily_breakdown=daily_breakdown,
        )

    @staticmethod
    async def get_inventory_report(
        db: AsyncSession,
        business_id: str,
        location_id: str | None = None,
        category_id: str | None = None,
    ) -> InventoryReportResponse:
        prod_query = select(Product, Category.name.label("category_name")).outerjoin(Category, Product.category_id == Category.id).where(Product.business_id == business_id)
        if category_id:
            prod_query = prod_query.where(Product.category_id == category_id)

        prod_res = await db.execute(prod_query)
        products = prod_res.all()

        mv_query = (
            select(
                InventoryMovement.product_id,
                func.coalesce(func.sum(InventoryMovement.quantity), 0).label("stock"),
            )
            .where(InventoryMovement.business_id == business_id, InventoryMovement.product_id.isnot(None))
        )
        if location_id:
            mv_query = mv_query.where(InventoryMovement.location_id == location_id)
        mv_query = mv_query.group_by(InventoryMovement.product_id)
        mv_res = await db.execute(mv_query)
        movement_stock_map = {row.product_id: int(row.stock) for row in mv_res.all()}

        dev_query = select(Device, Category.name.label("category_name")).outerjoin(Category, Device.category_id == Category.id).where(
            Device.business_id == business_id, Device.status == DeviceStatus.IN_STOCK.value
        )
        if location_id:
            dev_query = dev_query.where(Device.location_id == location_id)
        if category_id:
            dev_query = dev_query.where(Device.category_id == category_id)
        dev_res = await db.execute(dev_query)
        devices = dev_res.all()

        total_valuation = Decimal("0.00")
        non_serialized_valuation = Decimal("0.00")
        serialized_valuation = Decimal("0.00")
        total_units = 0
        low_stock_count = 0
        out_of_stock_count = 0

        cat_map: dict[str | None, dict[str, Any]] = {}
        report_items: list[InventoryReportItem] = []

        for prod, cat_name in products:
            cost = prod.cost_price or Decimal("0.00")
            price = prod.selling_price or Decimal("0.00")
            cur_stock = movement_stock_map.get(prod.id, 0)
            item_val = Decimal(max(0, cur_stock)) * cost
            non_serialized_valuation += item_val
            total_valuation += item_val
            total_units += max(0, cur_stock)

            min_threshold = prod.minimum_stock_level if prod.minimum_stock_level is not None else 0
            if cur_stock <= 0:
                stock_status = "out_of_stock"
                out_of_stock_count += 1
            elif cur_stock <= min_threshold:
                stock_status = "low_stock"
                low_stock_count += 1
            else:
                stock_status = "in_stock"

            report_items.append(
                InventoryReportItem(
                    product_id=prod.id,
                    name=prod.name,
                    sku=prod.sku,
                    category_name=cat_name,
                    is_serialized=False,
                    current_stock=cur_stock,
                    minimum_stock_level=min_threshold,
                    cost_price=cost,
                    selling_price=price,
                    valuation=item_val,
                    stock_status=stock_status,
                )
            )

            cat_key = prod.category_id
            if cat_key not in cat_map:
                cat_map[cat_key] = {
                    "name": cat_name or "Uncategorized",
                    "product_count": 0,
                    "units": 0,
                    "valuation": Decimal("0.00"),
                }
            cat_map[cat_key]["product_count"] += 1
            cat_map[cat_key]["units"] += max(0, cur_stock)
            cat_map[cat_key]["valuation"] += item_val

        for dev, cat_name in devices:
            dev_cost = dev.cost_price or Decimal("0.00")
            dev_price = dev.selling_price or Decimal("0.00")
            serialized_valuation += dev_cost
            total_valuation += dev_cost
            total_units += 1

            cat_key = dev.category_id
            if cat_key not in cat_map:
                cat_map[cat_key] = {
                    "name": cat_name or "Uncategorized",
                    "product_count": 0,
                    "units": 0,
                    "valuation": Decimal("0.00"),
                }
            cat_map[cat_key]["product_count"] += 1
            cat_map[cat_key]["units"] += 1
            cat_map[cat_key]["valuation"] += dev_cost

            report_items.append(
                InventoryReportItem(
                    product_id=dev.id,
                    name=f"{dev.product_name} (S/N: {dev.serial_number})",
                    sku=dev.imei or dev.serial_number,
                    category_name=cat_name,
                    is_serialized=True,
                    current_stock=1,
                    minimum_stock_level=1,
                    cost_price=dev_cost,
                    selling_price=dev_price,
                    valuation=dev_cost,
                    stock_status="in_stock",
                )
            )

        category_breakdown = [
            CategoryValuation(
                category_id=cid,
                category_name=data["name"],
                product_count=data["product_count"],
                units_in_stock=data["units"],
                total_valuation=data["valuation"],
            )
            for cid, data in cat_map.items()
        ]

        return InventoryReportResponse(
            total_valuation=total_valuation,
            non_serialized_valuation=non_serialized_valuation,
            serialized_valuation=serialized_valuation,
            total_products_count=len(products) + len(devices),
            total_units_in_stock=total_units,
            low_stock_count=low_stock_count,
            out_of_stock_count=out_of_stock_count,
            category_breakdown=category_breakdown,
            items=report_items,
        )

    @staticmethod
    async def get_profit_report(
        db: AsyncSession,
        business_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> ProfitReportResponse:
        sales_q = select(Sale).where(
            Sale.business_id == business_id,
            Sale.status == SaleStatus.COMPLETED.value,
            Sale.sale_date >= start_date,
            Sale.sale_date <= end_date,
        )
        sales_res = await db.execute(sales_q)
        sales = sales_res.scalars().all()
        sale_ids = [s.id for s in sales]

        total_revenue = sum((s.total_amount for s in sales), Decimal("0.00"))
        total_cogs = Decimal("0.00")
        total_discounts = Decimal("0.00")

        if sale_ids:
            items_q = (
                select(SaleItem, Product, Device)
                .outerjoin(Product, SaleItem.product_id == Product.id)
                .outerjoin(Device, SaleItem.device_id == Device.id)
                .where(SaleItem.sale_id.in_(sale_ids))
            )
            items_res = await db.execute(items_q)
            for item, prod, dev in items_res.all():
                if dev and dev.cost_price is not None:
                    unit_cost = dev.cost_price
                elif prod and prod.cost_price is not None:
                    unit_cost = prod.cost_price
                else:
                    unit_cost = Decimal("0.00")
                total_cogs += unit_cost * Decimal(item.quantity)
                total_discounts += item.discount * Decimal(item.quantity)

        gross_profit = total_revenue - total_cogs
        gross_margin_percentage = ((gross_profit / total_revenue) * Decimal("100.00")) if total_revenue > 0 else Decimal("0.00")

        return ProfitReportResponse(
            start_date=start_date,
            end_date=end_date,
            total_revenue=total_revenue,
            total_cogs=total_cogs,
            gross_profit=gross_profit,
            gross_margin_percentage=gross_margin_percentage,
            total_discounts=total_discounts,
            completed_sales_count=len(sales),
        )

    @staticmethod
    async def get_product_performance(
        db: AsyncSession,
        business_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> ProductPerformanceReportResponse:
        prod_query = select(Product, Category.name.label("category_name")).outerjoin(Category, Product.category_id == Category.id).where(Product.business_id == business_id)
        prod_res = await db.execute(prod_query)
        all_products = prod_res.all()

        sales_q = select(Sale.id).where(
            Sale.business_id == business_id,
            Sale.status == SaleStatus.COMPLETED.value,
            Sale.sale_date >= start_date,
            Sale.sale_date <= end_date,
        )
        sales_res = await db.execute(sales_q)
        sale_ids = sales_res.scalars().all()

        perf_map: dict[str, dict[str, Any]] = {}
        for prod, cat_name in all_products:
            perf_map[prod.id] = {
                "name": prod.name,
                "sku": prod.sku,
                "category": cat_name,
                "units": 0,
                "revenue": Decimal("0.00"),
                "cogs": Decimal("0.00"),
                "cost_price": prod.cost_price or Decimal("0.00"),
            }

        if sale_ids:
            items_q = (
                select(SaleItem, Product, Device)
                .outerjoin(Product, SaleItem.product_id == Product.id)
                .outerjoin(Device, SaleItem.device_id == Device.id)
                .where(SaleItem.sale_id.in_(sale_ids))
            )
            items_res = await db.execute(items_q)
            for item, prod, dev in items_res.all():
                p_id = item.product_id
                if not p_id or p_id not in perf_map:
                    continue
                if dev and dev.cost_price is not None:
                    unit_cost = dev.cost_price
                elif prod and prod.cost_price is not None:
                    unit_cost = prod.cost_price
                else:
                    unit_cost = Decimal("0.00")

                item_rev = (item.selling_price - item.discount) * Decimal(item.quantity)
                item_cogs = unit_cost * Decimal(item.quantity)

                perf_map[p_id]["units"] += item.quantity
                perf_map[p_id]["revenue"] += item_rev
                perf_map[p_id]["cogs"] += item_cogs

        items_list: list[ProductPerformanceItem] = []
        for p_id, data in perf_map.items():
            rev = data["revenue"]
            cogs = data["cogs"]
            profit = rev - cogs
            margin = ((profit / rev) * Decimal("100.00")) if rev > 0 else Decimal("0.00")
            items_list.append(
                ProductPerformanceItem(
                    product_id=p_id,
                    product_name=data["name"],
                    sku=data["sku"],
                    category_name=data["category"],
                    units_sold=data["units"],
                    total_revenue=rev,
                    estimated_cogs=cogs,
                    gross_profit=profit,
                    margin_percentage=margin,
                )
            )

        best_sellers = sorted([i for i in items_list if i.units_sold > 0], key=lambda x: x.units_sold, reverse=True)[:10]
        most_profitable = sorted([i for i in items_list if i.gross_profit > 0], key=lambda x: x.gross_profit, reverse=True)[:10]
        slow_moving = sorted([i for i in items_list if i.units_sold == 0], key=lambda x: x.product_name)[:15]

        return ProductPerformanceReportResponse(
            start_date=start_date,
            end_date=end_date,
            best_sellers=best_sellers,
            most_profitable=most_profitable,
            slow_moving=slow_moving,
        )

    @staticmethod
    async def get_supplier_report(db: AsyncSession, business_id: str) -> SupplierReportResponse:
        supp_q = select(Supplier).where(Supplier.business_id == business_id)
        supp_res = await db.execute(supp_q)
        suppliers = supp_res.scalars().all()

        purchases_q = select(Purchase).where(Purchase.business_id == business_id)
        purchases_res = await db.execute(purchases_q)
        purchases = purchases_res.scalars().all()
        p_ids = [p.id for p in purchases]

        p_totals: dict[str, Decimal] = {}
        if p_ids:
            pi_q = select(PurchaseItem).where(PurchaseItem.purchase_id.in_(p_ids))
            pi_res = await db.execute(pi_q)
            for pi in pi_res.scalars().all():
                p_totals[pi.purchase_id] = p_totals.get(pi.purchase_id, Decimal("0.00")) + (pi.unit_cost * Decimal(pi.quantity))

        supp_map: dict[str, dict[str, Any]] = {
            s.id: {
                "supplier": s,
                "count": 0,
                "total": Decimal("0.00"),
                "last_date": None,
            }
            for s in suppliers
        }

        total_spent_all = Decimal("0.00")
        for p in purchases:
            p_cost = p_totals.get(p.id, Decimal("0.00"))
            total_spent_all += p_cost
            if p.supplier_id and p.supplier_id in supp_map:
                supp_map[p.supplier_id]["count"] += 1
                supp_map[p.supplier_id]["total"] += p_cost
                p_date = p.purchase_date
                if not supp_map[p.supplier_id]["last_date"] or p_date > supp_map[p.supplier_id]["last_date"]:
                    supp_map[p.supplier_id]["last_date"] = p_date

        report_items = [
            SupplierReportItem(
                supplier_id=s_id,
                supplier_name=data["supplier"].name,
                phone=data["supplier"].phone,
                email=data["supplier"].email,
                total_purchases_count=data["count"],
                total_spent=data["total"],
                last_purchase_date=data["last_date"],
            )
            for s_id, data in supp_map.items()
        ]

        report_items.sort(key=lambda x: x.total_spent, reverse=True)

        return SupplierReportResponse(
            total_suppliers_count=len(suppliers),
            total_spent_all=total_spent_all,
            suppliers=report_items,
        )
