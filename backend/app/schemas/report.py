from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


# 1. Sales Report
class DailySalesBreakdown(BaseModel):
    date: date
    sales_count: int
    revenue: Decimal
    discounts: Decimal
    items_sold: int


class PaymentMethodSummary(BaseModel):
    payment_method: str
    transaction_count: int
    total_amount: Decimal


class SalesReportResponse(BaseModel):
    start_date: datetime
    end_date: datetime
    total_sales_count: int
    total_revenue: Decimal
    total_discounts: Decimal
    total_items_sold: int
    average_order_value: Decimal
    payment_methods: list[PaymentMethodSummary]
    daily_breakdown: list[DailySalesBreakdown]


# 2. Inventory & Valuation Report
class CategoryValuation(BaseModel):
    category_id: str | None
    category_name: str
    product_count: int
    units_in_stock: int
    total_valuation: Decimal


class InventoryReportItem(BaseModel):
    product_id: str
    name: str
    sku: str | None = None
    category_name: str | None = None
    is_serialized: bool
    current_stock: int
    minimum_stock_level: int
    cost_price: Decimal
    selling_price: Decimal
    valuation: Decimal
    stock_status: str  # 'in_stock', 'low_stock', 'out_of_stock'


class InventoryReportResponse(BaseModel):
    total_valuation: Decimal
    non_serialized_valuation: Decimal
    serialized_valuation: Decimal
    total_products_count: int
    total_units_in_stock: int
    low_stock_count: int
    out_of_stock_count: int
    category_breakdown: list[CategoryValuation]
    items: list[InventoryReportItem]


# 3. Profit & Loss Report
class ProfitReportResponse(BaseModel):
    start_date: datetime
    end_date: datetime
    total_revenue: Decimal
    total_cogs: Decimal
    gross_profit: Decimal
    gross_margin_percentage: Decimal
    total_discounts: Decimal
    completed_sales_count: int


# 4. Product Performance Report
class ProductPerformanceItem(BaseModel):
    product_id: str
    product_name: str
    sku: str | None = None
    category_name: str | None = None
    units_sold: int
    total_revenue: Decimal
    estimated_cogs: Decimal
    gross_profit: Decimal
    margin_percentage: Decimal


class ProductPerformanceReportResponse(BaseModel):
    start_date: datetime
    end_date: datetime
    best_sellers: list[ProductPerformanceItem]
    most_profitable: list[ProductPerformanceItem]
    slow_moving: list[ProductPerformanceItem]


# 5. Supplier Report
class SupplierReportItem(BaseModel):
    supplier_id: str
    supplier_name: str
    phone: str | None = None
    email: str | None = None
    total_purchases_count: int
    total_spent: Decimal
    last_purchase_date: datetime | None = None


class SupplierReportResponse(BaseModel):
    total_suppliers_count: int
    total_spent_all: Decimal
    suppliers: list[SupplierReportItem]
