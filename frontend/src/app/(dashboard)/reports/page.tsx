"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type ReportTab = "sales" | "inventory" | "profit" | "products" | "suppliers";

export default function ReportsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<ReportTab>("sales");
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [dateRangePreset, setDateRangePreset] = useState<"today" | "7d" | "30d" | "custom">("30d");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Report states
  const [salesReport, setSalesReport] = useState<any>(null);
  const [inventoryReport, setInventoryReport] = useState<any>(null);
  const [profitReport, setProfitReport] = useState<any>(null);
  const [productPerfReport, setProductPerfReport] = useState<any>(null);
  const [supplierReport, setSupplierReport] = useState<any>(null);

  // Initialize dates
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  }, []);

  const handlePresetChange = (preset: "today" | "7d" | "30d" | "custom") => {
    setDateRangePreset(preset);
    const end = new Date();
    const start = new Date();
    if (preset === "today") {
      // today only
    } else if (preset === "7d") {
      start.setDate(end.getDate() - 7);
    } else if (preset === "30d") {
      start.setDate(end.getDate() - 30);
    }
    if (preset !== "custom") {
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    }
  };

  // Load business id
  useEffect(() => {
    async function loadBusiness() {
      const token = (session?.session as unknown as { token?: string } | undefined)?.token;
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/api/v1/business/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.length) setBusinessId(data[0].id);
        }
      } catch (e) {
        setError(String(e));
      }
    }
    loadBusiness();
  }, [session]);

  // Fetch report when tab, dates or business changes
  useEffect(() => {
    async function fetchActiveReport() {
      const token = (session?.session as unknown as { token?: string } | undefined)?.token;
      if (!token || !businessId) return;

      try {
        setLoading(true);
        setError("");

        const startIso = startDate ? new Date(startDate).toISOString() : "";
        const endIso = endDate ? new Date(`${endDate}T23:59:59.999Z`).toISOString() : "";
        const dateQuery = `start_date=${encodeURIComponent(startIso)}&end_date=${encodeURIComponent(endIso)}`;

        if (activeTab === "sales") {
          const res = await fetch(`${API_URL}/api/v1/reports/sales?business_id=${businessId}&${dateQuery}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) setSalesReport(await res.json());
          else setError(await res.text());
        } else if (activeTab === "inventory") {
          const res = await fetch(`${API_URL}/api/v1/reports/inventory?business_id=${businessId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) setInventoryReport(await res.json());
          else setError(await res.text());
        } else if (activeTab === "profit") {
          const res = await fetch(`${API_URL}/api/v1/reports/profit?business_id=${businessId}&${dateQuery}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) setProfitReport(await res.json());
          else setError(await res.text());
        } else if (activeTab === "products") {
          const res = await fetch(`${API_URL}/api/v1/reports/product-performance?business_id=${businessId}&${dateQuery}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) setProductPerfReport(await res.json());
          else setError(await res.text());
        } else if (activeTab === "suppliers") {
          const res = await fetch(`${API_URL}/api/v1/reports/suppliers?business_id=${businessId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) setSupplierReport(await res.json());
          else setError(await res.text());
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }

    fetchActiveReport();
  }, [activeTab, businessId, startDate, endDate, session]);

  const formatCurrency = (val?: string | number) => {
    if (val === undefined || val === null) return "$0.00";
    const n = typeof val === "number" ? val : parseFloat(val);
    return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Intelligence & Reports</h1>
          <p className="text-sm text-muted-foreground">
            Financial summaries, inventory ledger valuation, product metrics, and supplier analytics
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--status-critical)]/30 bg-[var(--status-critical)]/10 p-4 text-sm text-[var(--status-critical)]">
          {error}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "sales", label: "Sales & Revenue" },
            { key: "inventory", label: "Inventory & Valuation" },
            { key: "profit", label: "Profit & Loss" },
            { key: "products", label: "Product Performance" },
            { key: "suppliers", label: "Supplier Analytics" },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Button
                key={tab.key}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab(tab.key as ReportTab)}
                className={`text-xs font-medium ${active ? "bg-primary text-primary-foreground" : "border-hairline text-muted-foreground"}`}
              >
                {tab.label}
              </Button>
            );
          })}
        </div>

        {/* Date Filter Controls (applicable to date-bound reports) */}
        {activeTab !== "inventory" && activeTab !== "suppliers" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-hairline bg-surface p-1">
              {(["today", "7d", "30d", "custom"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetChange(preset)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    dateRangePreset === preset
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {preset === "today" ? "Today" : preset === "7d" ? "7 Days" : preset === "30d" ? "30 Days" : "Custom"}
                </button>
              ))}
            </div>

            {dateRangePreset === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 w-36 text-xs border-hairline"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 w-36 text-xs border-hairline"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: SALES REPORT */}
      {activeTab === "sales" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Total Sales Revenue</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : formatCurrency(salesReport?.total_revenue)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{salesReport?.total_sales_count || 0} completed transactions</p>
              </CardContent>
            </Card>

            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Average Order Value</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : formatCurrency(salesReport?.average_order_value)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Revenue per customer transaction</p>
              </CardContent>
            </Card>

            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Total Items Sold</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : salesReport?.total_items_sold || 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Units and serialized devices</p>
              </CardContent>
            </Card>

            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Discounts Granted</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums text-muted-foreground">
                  {loading ? "..." : formatCurrency(salesReport?.total_discounts)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">POS price markdowns</p>
              </CardContent>
            </Card>
          </div>

          {/* Payment Method Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["cash", "mobile_money", "card"].map((pmKey) => {
              const pmData = salesReport?.payment_methods?.find((p: any) => p.payment_method === pmKey);
              const label = pmKey === "mobile_money" ? "Mobile Money (MoMo)" : pmKey.toUpperCase();
              return (
                <Card key={pmKey} className="border-hairline">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">{label}</CardDescription>
                    <CardTitle className="text-xl tabular-nums">
                      {formatCurrency(pmData?.total_amount)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">
                      {pmData ? `${pmData.transaction_count} transactions` : "0 transactions"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Daily Sales Breakdown Table */}
          <Card className="border-hairline">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Daily Sales Performance</CardTitle>
              <CardDescription className="text-xs">Aggregated revenue and volume per day</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Items Sold</TableHead>
                    <TableHead className="text-right">Discounts</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">
                        Loading sales report...
                      </TableCell>
                    </TableRow>
                  ) : salesReport?.daily_breakdown?.length ? (
                    salesReport.daily_breakdown.map((row: any) => (
                      <TableRow key={row.date}>
                        <TableCell className="font-medium tabular-nums">{row.date}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.sales_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.items_sold}</TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {formatCurrency(row.discounts)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-foreground">
                          {formatCurrency(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">
                        No sales found for the selected period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: INVENTORY REPORT */}
      {activeTab === "inventory" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Total Inventory Valuation</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : formatCurrency(inventoryReport?.total_valuation)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{inventoryReport?.total_units_in_stock || 0} total units in stock</p>
              </CardContent>
            </Card>

            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Serialized Devices Value</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : formatCurrency(inventoryReport?.serialized_valuation)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Individual IMEI/Serial items in stock</p>
              </CardContent>
            </Card>

            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Non-Serialized Value</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : formatCurrency(inventoryReport?.non_serialized_valuation)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Standard ledger stock inventory</p>
              </CardContent>
            </Card>

            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Low / Out of Stock</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : (inventoryReport?.low_stock_count || 0) + (inventoryReport?.out_of_stock_count || 0)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {inventoryReport?.out_of_stock_count || 0} out of stock · {inventoryReport?.low_stock_count || 0} low
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Category Valuation Breakdown */}
          {inventoryReport?.category_breakdown?.length > 0 && (
            <Card className="border-hairline">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Category Valuation Summary</CardTitle>
                <CardDescription className="text-xs">Asset distribution across product categories</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead className="text-right">Units In Stock</TableHead>
                      <TableHead className="text-right">Valuation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryReport.category_breakdown.map((cat: any) => (
                      <TableRow key={cat.category_id || "uncat"}>
                        <TableCell className="font-medium">{cat.category_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{cat.product_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{cat.units_in_stock}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(cat.total_valuation)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Detailed Inventory Stock Table */}
          <Card className="border-hairline">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Inventory Valuation & Stock Table</CardTitle>
              <CardDescription className="text-xs">Derived real-time stock levels and asset values</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">In Stock</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                    <TableHead className="text-right">Valuation</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                        Calculating inventory valuation...
                      </TableCell>
                    </TableRow>
                  ) : inventoryReport?.items?.length ? (
                    inventoryReport.items.map((item: any) => (
                      <TableRow key={item.product_id}>
                        <TableCell className="font-medium">
                          <div>{item.name}</div>
                          {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {item.category_name || "Uncategorized"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.is_serialized ? (
                            <Badge variant="outline" className="font-normal text-[10px]">Serialized</Badge>
                          ) : (
                            <span className="text-muted-foreground">Standard</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{item.current_stock}</TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {formatCurrency(item.cost_price)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(item.selling_price)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(item.valuation)}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.stock_status === "out_of_stock" ? (
                            <Badge variant="destructive" className="text-[10px]">Out</Badge>
                          ) : item.stock_status === "low_stock" ? (
                            <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">Low</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">In Stock</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                        No inventory records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: PROFIT & LOSS */}
      {activeTab === "profit" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Gross Revenue</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : formatCurrency(profitReport?.total_revenue)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{profitReport?.completed_sales_count || 0} completed orders</p>
              </CardContent>
            </Card>

            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Cost of Goods Sold (COGS)</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums text-muted-foreground">
                  {loading ? "..." : formatCurrency(profitReport?.total_cogs)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Direct inventory cost</p>
              </CardContent>
            </Card>

            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Gross Profit</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums text-foreground">
                  {loading ? "..." : formatCurrency(profitReport?.gross_profit)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Revenue minus COGS</p>
              </CardContent>
            </Card>

            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Gross Margin %</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : `${parseFloat(profitReport?.gross_margin_percentage || 0).toFixed(1)}%`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Profit efficiency ratio</p>
              </CardContent>
            </Card>
          </div>

          {/* P&L Statement Summary Card */}
          <Card className="border-hairline">
            <CardHeader>
              <CardTitle className="text-base font-semibold">P&L Financial Summary</CardTitle>
              <CardDescription className="text-xs">Income and direct cost breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col divide-y divide-hairline text-sm">
                <div className="flex justify-between py-3">
                  <span className="font-medium">Gross Sales Revenue</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(profitReport?.total_revenue)}</span>
                </div>
                <div className="flex justify-between py-3 text-muted-foreground">
                  <span>Less: Total Discounts Allowed</span>
                  <span className="tabular-nums">-{formatCurrency(profitReport?.total_discounts)}</span>
                </div>
                <div className="flex justify-between py-3 text-muted-foreground">
                  <span>Less: Cost of Goods Sold (COGS)</span>
                  <span className="tabular-nums">-{formatCurrency(profitReport?.total_cogs)}</span>
                </div>
                <div className="flex justify-between py-3 font-semibold text-base">
                  <span>Gross Profit</span>
                  <span className="tabular-nums text-foreground">{formatCurrency(profitReport?.gross_profit)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: PRODUCT PERFORMANCE */}
      {activeTab === "products" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Best Sellers */}
            <Card className="border-hairline">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Top Volume Products</CardTitle>
                <CardDescription className="text-xs">Ranked by unit sales volume</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-sm text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : productPerfReport?.best_sellers?.length ? (
                      productPerfReport.best_sellers.map((p: any) => (
                        <TableRow key={p.product_id}>
                          <TableCell className="font-medium">
                            <div>{p.product_name}</div>
                            {p.sku && <div className="text-xs text-muted-foreground">{p.sku}</div>}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{p.units_sold}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(p.total_revenue)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-foreground">
                            {formatCurrency(p.gross_profit)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-sm text-muted-foreground">
                          No product sales recorded in this timeframe.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Most Profitable */}
            <Card className="border-hairline">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Most Profitable Products</CardTitle>
                <CardDescription className="text-xs">Ranked by total gross profit generated</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-sm text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : productPerfReport?.most_profitable?.length ? (
                      productPerfReport.most_profitable.map((p: any) => (
                        <TableRow key={p.product_id}>
                          <TableCell className="font-medium">
                            <div>{p.product_name}</div>
                            {p.sku && <div className="text-xs text-muted-foreground">{p.sku}</div>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{p.units_sold}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-foreground">
                            {formatCurrency(p.gross_profit)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {parseFloat(p.margin_percentage || 0).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-sm text-muted-foreground">
                          No profitable sales recorded.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Slow Moving Products */}
          {productPerfReport?.slow_moving?.length > 0 && (
            <Card className="border-hairline">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Zero-Sales & Slow Moving Products</CardTitle>
                <CardDescription className="text-xs">Products with 0 units sold in the selected period</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Cost Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productPerfReport.slow_moving.slice(0, 10).map((p: any) => (
                      <TableRow key={p.product_id}>
                        <TableCell className="font-medium">
                          {p.product_name}
                          {p.sku && <span className="ml-2 text-xs text-muted-foreground">({p.sku})</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{p.category_name || "General"}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(p.cost_price)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 5: SUPPLIERS */}
      {activeTab === "suppliers" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Total Supplier Spend</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : formatCurrency(supplierReport?.total_spent_all)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Cumulative purchasing order spend</p>
              </CardContent>
            </Card>

            <Card className="border-hairline bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase">Active Suppliers</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {loading ? "..." : supplierReport?.total_suppliers_count || 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Registered vendor contacts</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-hairline">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Supplier Procurement Summary</CardTitle>
              <CardDescription className="text-xs">Purchasing volume and spend per supplier</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Phone / Email</TableHead>
                    <TableHead className="text-right">Purchase Orders</TableHead>
                    <TableHead className="text-right">Total Spent</TableHead>
                    <TableHead className="text-right">Last Purchase Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">
                        Loading supplier report...
                      </TableCell>
                    </TableRow>
                  ) : supplierReport?.suppliers?.length ? (
                    supplierReport.suppliers.map((s: any) => (
                      <TableRow key={s.supplier_id}>
                        <TableCell className="font-medium">{s.supplier_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.phone || s.email || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.total_purchases_count}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(s.total_spent)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {s.last_purchase_date
                            ? new Date(s.last_purchase_date).toLocaleDateString()
                            : "No orders yet"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">
                        No suppliers or purchases found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
