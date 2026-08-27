from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class TopSellingProduct(BaseModel):
    product_id: str
    product_name: str
    sku: str | None = None
    units_sold: int
    total_revenue: Decimal


class LowStockAlertItem(BaseModel):
    product_id: str
    product_name: str
    sku: str | None = None
    category_name: str | None = None
    current_stock: int
    minimum_stock_level: int


class DashboardSummaryResponse(BaseModel):
    today_sales_total: Decimal
    today_sales_count: int
    today_gross_profit: Decimal
    total_inventory_value: Decimal
    total_products_count: int
    low_stock_count: int
    out_of_stock_count: int
    open_warranty_claims_count: int = 0
    active_repairs_count: int = 0
    top_selling_products: list[TopSellingProduct] = []
    low_stock_items: list[LowStockAlertItem] = []


class DashboardActivityItem(BaseModel):
    id: str
    activity_type: str  # 'sale', 'purchase', 'movement'
    title: str
    description: str
    amount: Decimal | None = None
    quantity: int | None = None
    timestamp: datetime
