"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useBusiness } from "@/components/providers/business-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpButton } from "@/components/help/help-button";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_URL } from "@/lib/fetch-with-auth";
import { formatCurrency, formatVelocityDay, formatStockoutShort } from "@/lib/format";

type ReportTab = "sales" | "inventory" | "profit" | "products" | "suppliers" | "intelligence";

interface Category { id: string; name: string; }
interface Location { id: string; name: string; }

const ALLOWED_TABS: ReportTab[] = ["sales", "inventory", "profit", "products", "suppliers", "intelligence"];

function parseTab(raw: string | null): ReportTab | null {
  if (!raw) return null;
  return (ALLOWED_TABS as string[]).includes(raw) ? (raw as ReportTab) : null;
}

function computePresetDates(preset: "today" | "7d" | "30d" | "custom", fromParam: string | null, toParam: string | null) {
  const end = new Date();
  const endStr = toParam || end.toISOString().split("T")[0];
  if (preset === "custom" && fromParam && toParam) {
    return { start: fromParam, end: endStr };
  }
  const start = fromParam ? new Date(fromParam) : new Date();
  // if fromParam exists but preset isn't custom, we still recompute based on preset for consistency
  if (!fromParam) {
    const s = new Date(end);
    if (preset === "today") {
      // same day
    } else if (preset === "7d") {
      s.setDate(end.getDate() - 7);
    } else if (preset === "30d") {
      s.setDate(end.getDate() - 30);
    } else {
      s.setDate(end.getDate() - 30);
    }
    return { start: s.toISOString().split("T")[0], end: endStr };
  }
  // fromParam present but preset changed to non-custom: recompute
  if (preset !== "custom") {
    const s = new Date(end);
    if (preset === "today") {
      // keep end
    } else if (preset === "7d") s.setDate(end.getDate() - 7);
    else if (preset === "30d") s.setDate(end.getDate() - 30);
    return { start: s.toISOString().split("T")[0], end: endStr };
  }
  return { start: fromParam, end: endStr };
}

export default function ReportsPage() {
  const { data: session } = useSession();
  const { state: bizState } = useBusiness();
  const businessId = bizState.business?.id ?? null;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab = parseTab(searchParams.get("tab")) ?? "sales";
  const initialPresetRaw = searchParams.get("preset");
  const initialPreset = (initialPresetRaw === "today" || initialPresetRaw === "7d" || initialPresetRaw === "30d" || initialPresetRaw === "custom") ? initialPresetRaw : "30d";
  const initialFrom = searchParams.get("from");
  const initialTo = searchParams.get("to");
  const initialDates = (() => {
    if (initialFrom && initialTo) return { start: initialFrom, end: initialTo };
    const end = new Date();
    const start = new Date();
    if (initialPreset === "today") {
      // start = end
    } else if (initialPreset === "7d") start.setDate(end.getDate() - 7);
    else if (initialPreset === "30d") start.setDate(end.getDate() - 30);
    else start.setDate(end.getDate() - 30);
    return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
  })();

  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);
  const [dateRangePreset, setDateRangePreset] = useState<"today" | "7d" | "30d" | "custom">(initialPreset as "today" | "7d" | "30d" | "custom");
  const [startDate, setStartDate] = useState<string>(initialDates.start);
  const [endDate, setEndDate] = useState<string>(initialDates.end);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Report states
  const [salesReport, setSalesReport] = useState<any>(null);
  const [inventoryReport, setInventoryReport] = useState<any>(null);
  const [profitReport, setProfitReport] = useState<any>(null);
  const [productPerfReport, setProductPerfReport] = useState<any>(null);
  const [supplierReport, setSupplierReport] = useState<any>(null);

  // Intelligence state
  const [intelligence, setIntelligence] = useState<any>(null);
  const [intelWindow, setIntelWindow] = useState<number>(30);
  const [intelLead, setIntelLead] = useState<string>("7");
  const [intelSafety, setIntelSafety] = useState<string>("3");
  const [intelCoverage, setIntelCoverage] = useState<string>("30");
  const [intelLocation, setIntelLocation] = useState<string>("all");
  const [intelCategory, setIntelCategory] = useState<string>("all");
  const [intelSearch, setIntelSearch] = useState<string>("");
  const [intelSort, setIntelSort] = useState<string>("urgency");
  const [intelError, setIntelError] = useState<string>("");
  const [intelFlagBlocked, setIntelFlagBlocked] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const buildUrl = useCallback((nextTab: ReportTab, nextPreset: typeof dateRangePreset, nextFrom: string, nextTo: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    // only persist preset/from/to for date-bound tabs
    if (nextTab === "sales" || nextTab === "profit" || nextTab === "products") {
      params.set("preset", nextPreset);
      if (nextFrom) params.set("from", nextFrom);
      if (nextTo) params.set("to", nextTo);
    } else {
      params.delete("preset");
      params.delete("from");
      params.delete("to");
    }
    return `${pathname}?${params.toString()}`;
  }, [searchParams, pathname]);

  const pushUrl = useCallback((nextTab: ReportTab, nextPreset: typeof dateRangePreset, nextFrom: string, nextTo: string) => {
    const url = buildUrl(nextTab, nextPreset, nextFrom, nextTo);
    const current = `${pathname}?${searchParams.toString()}`;
    if (url !== current) router.push(url, { scroll: false });
  }, [buildUrl, pathname, router, searchParams]);

  // Keep URL in sync after first render — ensures deep linking reflection
  useEffect(() => {
    pushUrl(activeTab, dateRangePreset, startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back/forward: sync state when URL changes externally
  useEffect(() => {
    const urlTab = parseTab(searchParams.get("tab"));
    if (urlTab && urlTab !== activeTab) setActiveTab(urlTab);
    const urlPreset = searchParams.get("preset");
    if (urlPreset && (urlPreset === "today" || urlPreset === "7d" || urlPreset === "30d" || urlPreset === "custom") && urlPreset !== dateRangePreset) {
      setDateRangePreset(urlPreset);
    }
    const urlFrom = searchParams.get("from");
    const urlTo = searchParams.get("to");
    if (urlFrom !== null && urlFrom !== startDate) setStartDate(urlFrom);
    if (urlTo !== null && urlTo !== endDate) setEndDate(urlTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (tab: ReportTab) => {
    setActiveTab(tab);
    pushUrl(tab, dateRangePreset, startDate, endDate);
  };

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
      const s = start.toISOString().split("T")[0];
      const e = end.toISOString().split("T")[0];
      setStartDate(s);
      setEndDate(e);
      pushUrl(activeTab, preset, s, e);
    } else {
      pushUrl(activeTab, preset, startDate, endDate);
    }
  };

  const handleStartDateChange = (v: string) => {
    setStartDate(v);
    setDateRangePreset("custom");
    pushUrl(activeTab, "custom", v, endDate);
  };

  const handleEndDateChange = (v: string) => {
    setEndDate(v);
    setDateRangePreset("custom");
    pushUrl(activeTab, "custom", startDate, v);
  };

  // Load locations + categories once businessId known (for intelligence filters)
  useEffect(() => {
    async function loadMeta() {
      const token = (session?.session as unknown as { token?: string } | undefined)?.token;
      if (!token || !businessId) return;
      try {
        const [locRes, catRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/locations/`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/v1/categories/`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (locRes.ok) setLocations(await locRes.json());
        if (catRes.ok) setCategories(await catRes.json());
      } catch {}
    }
    loadMeta();
  }, [businessId, session]);

  // Fetch report when tab, dates or business changes
  useEffect(() => {
    async function fetchActiveReport() {
      const token = (session?.session as unknown as { token?: string } | undefined)?.token;
      if (!token || !businessId) return;

      // Intelligence is fetched via separate effect to react to its own controls
      if (activeTab === "intelligence") return;

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

  // Intelligence fetch effect
  useEffect(() => {
    async function fetchIntelligence() {
      const token = (session?.session as unknown as { token?: string } | undefined)?.token;
      if (!token || !businessId || activeTab !== "intelligence") return;
      try {
        setLoading(true);
        setIntelError("");
        setIntelFlagBlocked(false);
        const params = new URLSearchParams({
          business_id: businessId,
          window_days: String(intelWindow),
          lead_time_days: String(parseInt(intelLead) || 7),
          safety_days: String(parseInt(intelSafety) || 0),
          coverage_days: String(parseInt(intelCoverage) || 30),
          sort_by: intelSort,
          limit: "100",
          offset: "0",
        });
        if (intelLocation !== "all") params.set("location_id", intelLocation);
        if (intelCategory !== "all") params.set("category_id", intelCategory);
        if (intelSearch.trim()) params.set("search", intelSearch.trim());
        const res = await fetch(`${API_URL}/api/v1/intelligence/overview?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setIntelligence(await res.json());
        } else {
          const txt = await res.text();
          if (res.status === 403 && txt.toLowerCase().includes("advanced_reports")) {
            setIntelFlagBlocked(true);
            setIntelError("");
          } else {
            setIntelError(txt);
          }
        }
      } catch (e) {
        setIntelError(String(e));
      } finally {
        setLoading(false);
      }
    }
    fetchIntelligence();
  }, [activeTab, businessId, intelWindow, intelLead, intelSafety, intelCoverage, intelLocation, intelCategory, intelSearch, intelSort, session]);

  const statusBadge = (status: string) => {
    if (status === "out_of_stock") return <Badge variant="critical" className="text-[10px] uppercase tracking-wider">Out</Badge>;
    if (status === "critical") return <Badge variant="critical" className="text-[10px] uppercase tracking-wider">Critical</Badge>;
    if (status === "low") return <Badge variant="warning" className="text-[10px] uppercase tracking-wider">Low</Badge>;
    if (status === "stable") return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">Stable</Badge>;
    return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">OK</Badge>;
  };

  const isDateBoundTab = activeTab === "sales" || activeTab === "profit" || activeTab === "products";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle className="text-pretty tracking-tight">Business Intelligence &amp; Reports</PageHeaderTitle>
          <PageHeaderDescription>
            Financial summaries, inventory ledger valuation, product metrics, and supplier analytics
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="dashboard-reports" />
        </PageHeaderActions>
      </PageHeader>

      {error && (
        <div role="alert" aria-live="polite" className="rounded-lg border border-[var(--status-critical)]/30 bg-[var(--status-critical)]/10 p-4 text-sm text-[var(--status-critical)]">
          {error}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Report sections">
          {[
            { key: "sales", label: "Sales & Revenue" },
            { key: "inventory", label: "Inventory & Valuation" },
            { key: "profit", label: "Profit & Loss" },
            { key: "products", label: "Product Performance" },
            { key: "suppliers", label: "Supplier Analytics" },
            { key: "intelligence", label: "Intelligence" },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Button
                key={tab.key}
                role="tab"
                aria-selected={active}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => handleTabChange(tab.key as ReportTab)}
                className={`text-xs font-medium ${active ? "bg-primary text-primary-foreground" : "border-hairline text-muted-foreground"}`}
              >
                {tab.label}
              </Button>
            );
          })}
        </div>

        {/* Date Filter Controls (applicable to date-bound reports) */}
        {isDateBoundTab && (
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Date range" className="flex items-center gap-1 rounded-md border border-hairline bg-surface p-1">
              {(["today", "7d", "30d", "custom"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={dateRangePreset === preset}
                  onClick={() => handlePresetChange(preset)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action-primary)] focus-visible:ring-offset-2 ${
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
                <div className="flex flex-col gap-1">
                  <Label htmlFor="reports-start-date" className="text-xs font-medium">From</Label>
                  <Input
                    id="reports-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="h-8 w-36 text-xs border-hairline"
                  />
                </div>
                <span className="text-xs text-muted-foreground pt-5">to</span>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="reports-end-date" className="text-xs font-medium">To</Label>
                  <Input
                    id="reports-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="h-8 w-36 text-xs border-hairline"
                  />
                </div>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Total Sales Revenue</CardDescription>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Average Order Value</CardDescription>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Total Items Sold</CardDescription>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Discounts Granted</CardDescription>
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
                    <CardDescription className="text-xs tracking-wider font-medium">{label}</CardDescription>
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
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <caption className="sr-only">Daily sales performance aggregated per day</caption>
                <TableHeader className="sticky top-0 bg-surface z-10">
                  <TableRow>
                    <TableHead scope="col">Date</TableHead>
                    <TableHead scope="col" className="text-right">Orders</TableHead>
                    <TableHead scope="col" className="text-right">Items Sold</TableHead>
                    <TableHead scope="col" className="text-right">Discounts</TableHead>
                    <TableHead scope="col" className="text-right">Total Revenue</TableHead>
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
                      <TableCell colSpan={5} className="p-0 border-0">
                        <div className="p-4">
                          <EmptyState title="No sales for the selected period." description="Try adjusting the date range or complete a POS sale.">
                            <Link href="/sales">
                              <Button variant="outline" size="sm" className="border-hairline">Go to Sales</Button>
                            </Link>
                          </EmptyState>
                        </div>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Total Inventory Valuation</CardDescription>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Serialized Devices Value</CardDescription>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Non-Serialized Value</CardDescription>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Low / Out of Stock</CardDescription>
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
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <caption className="sr-only">Category valuation summary</caption>
                  <TableHeader className="sticky top-0 bg-surface z-10">
                    <TableRow>
                      <TableHead scope="col">Category</TableHead>
                      <TableHead scope="col" className="text-right">Products</TableHead>
                      <TableHead scope="col" className="text-right">Units In Stock</TableHead>
                      <TableHead scope="col" className="text-right">Valuation</TableHead>
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
              <CardTitle className="text-base font-semibold">Inventory Valuation &amp; Stock Table</CardTitle>
              <CardDescription className="text-xs">Derived real-time stock levels and asset values</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <caption className="sr-only">Inventory valuation and stock levels</caption>
                <TableHeader className="sticky top-0 bg-surface z-10">
                  <TableRow>
                    <TableHead scope="col">Item</TableHead>
                    <TableHead scope="col">Category</TableHead>
                    <TableHead scope="col">Type</TableHead>
                    <TableHead scope="col" className="text-right">In Stock</TableHead>
                    <TableHead scope="col" className="text-right">Unit Cost</TableHead>
                    <TableHead scope="col" className="text-right">Selling Price</TableHead>
                    <TableHead scope="col" className="text-right">Valuation</TableHead>
                    <TableHead scope="col" className="text-center">Status</TableHead>
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
                          {item.sku && <div className="text-xs text-muted-foreground tabular-nums">{item.sku}</div>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {item.category_name || "Uncategorized"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.is_serialized ? (
                            <Badge variant="outline" className="font-normal text-[10px] uppercase tracking-wider">Serialized</Badge>
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
                            <Badge variant="critical" className="text-[10px] uppercase tracking-wider">Out</Badge>
                          ) : item.stock_status === "low_stock" ? (
                            <Badge variant="warning" className="text-[10px] uppercase tracking-wider">Low</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">In Stock</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="p-0 border-0">
                        <div className="p-4">
                          <EmptyState title="No inventory records found." description="Add products and receive stock to populate valuation.">
                            <Link href="/products">
                              <Button variant="outline" size="sm" className="border-hairline">Go to Products</Button>
                            </Link>
                          </EmptyState>
                        </div>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Gross Revenue</CardDescription>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Cost of Goods Sold (COGS)</CardDescription>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Gross Profit</CardDescription>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Gross Margin %</CardDescription>
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
              <CardTitle className="text-base font-semibold">P&amp;L Financial Summary</CardTitle>
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
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <caption className="sr-only">Top volume products ranked by units sold</caption>
                  <TableHeader className="sticky top-0 bg-surface z-10">
                    <TableRow>
                      <TableHead scope="col">Product</TableHead>
                      <TableHead scope="col" className="text-right">Units</TableHead>
                      <TableHead scope="col" className="text-right">Revenue</TableHead>
                      <TableHead scope="col" className="text-right">Profit</TableHead>
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
                            {p.sku && <div className="text-xs text-muted-foreground tabular-nums">{p.sku}</div>}
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
                        <TableCell colSpan={4} className="p-0 border-0">
                          <div className="p-4">
                            <EmptyState title="No product sales in this timeframe." description="Adjust dates or make a sale to see performance.">
                              <Link href="/sales">
                                <Button variant="outline" size="sm" className="border-hairline">Go to Sales</Button>
                              </Link>
                            </EmptyState>
                          </div>
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
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <caption className="sr-only">Most profitable products ranked by gross profit</caption>
                  <TableHeader className="sticky top-0 bg-surface z-10">
                    <TableRow>
                      <TableHead scope="col">Product</TableHead>
                      <TableHead scope="col" className="text-right">Units</TableHead>
                      <TableHead scope="col" className="text-right">Profit</TableHead>
                      <TableHead scope="col" className="text-right">Margin %</TableHead>
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
                            {p.sku && <div className="text-xs text-muted-foreground tabular-nums">{p.sku}</div>}
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
                        <TableCell colSpan={4} className="p-0 border-0">
                          <div className="p-4">
                            <EmptyState title="No profitable sales recorded." description="Margins will appear once sales with cost data exist." />
                          </div>
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
                <CardTitle className="text-base font-semibold">Zero-Sales &amp; Slow Moving Products</CardTitle>
                <CardDescription className="text-xs">Products with 0 units sold in the selected period</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <caption className="sr-only">Zero sales and slow moving products</caption>
                  <TableHeader className="sticky top-0 bg-surface z-10">
                    <TableRow>
                      <TableHead scope="col">Product</TableHead>
                      <TableHead scope="col">Category</TableHead>
                      <TableHead scope="col" className="text-right">Cost Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productPerfReport.slow_moving.slice(0, 10).map((p: any) => (
                      <TableRow key={p.product_id}>
                        <TableCell className="font-medium">
                          {p.product_name}
                          {p.sku && <span className="ml-2 text-xs text-muted-foreground tabular-nums">({p.sku})</span>}
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Total Supplier Spend</CardDescription>
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
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Active Suppliers</CardDescription>
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
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <caption className="sr-only">Supplier procurement summary</caption>
                <TableHeader className="sticky top-0 bg-surface z-10">
                  <TableRow>
                    <TableHead scope="col">Supplier Name</TableHead>
                    <TableHead scope="col">Phone / Email</TableHead>
                    <TableHead scope="col" className="text-right">Purchase Orders</TableHead>
                    <TableHead scope="col" className="text-right">Total Spent</TableHead>
                    <TableHead scope="col" className="text-right">Last Purchase Date</TableHead>
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
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
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
                      <TableCell colSpan={5} className="p-0 border-0">
                        <div className="p-4">
                          <EmptyState title="No suppliers or purchases found." description="Create suppliers and receive purchase orders to see analytics.">
                            <Link href="/suppliers">
                              <Button variant="outline" size="sm" className="border-hairline">Go to Suppliers</Button>
                            </Link>
                          </EmptyState>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 6: INTELLIGENCE */}
      {activeTab === "intelligence" && (
        <div className="flex flex-col gap-6">
          {intelFlagBlocked ? (
            <Card className="border-hairline bg-surface">
              <CardHeader>
                <CardTitle className="text-base">Intelligence is disabled</CardTitle>
                <CardDescription className="text-xs">
                  This business does not have Advanced Reports enabled. Ask your platform admin to enable <span className="font-medium text-foreground">advanced_reports</span> in Admin → Features to view velocity, stockout forecasts, and reorder suggestions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/admin/features">
                  <Button variant="outline" size="sm" className="border-hairline">Go to Admin Features</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Controls */}
              <Card className="border-hairline">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Intelligence Controls</CardTitle>
                  <CardDescription className="text-xs">
                    Velocity = units sold ÷ window · Reorder point = velocity × (lead + safety) · Suggested = ceil(velocity × (lead + coverage) − current stock)
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {/* Window / Lead / Safety / Coverage — responsive flex-col <640, flex-row sm */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium">Window</Label>
                      <div className="flex items-center gap-1 rounded-md border border-hairline bg-surface p-1 w-fit">
                        {[7, 14, 30, 60, 90].map((d) => (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={intelWindow === d}
                            onClick={() => setIntelWindow(d)}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors min-h-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action-primary)] ${intelWindow === d ? "bg-background text-foreground shadow-sm border border-hairline" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            {d}d
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="intel-lead" className="text-xs font-medium">Lead (days)</Label>
                        <Input id="intel-lead" type="number" inputMode="numeric" min="1" max="90" value={intelLead} onChange={(e) => setIntelLead(e.target.value)} className="h-8 w-20 text-xs border-hairline tabular-nums" aria-describedby="intel-lead-hint" />
                        <span id="intel-lead-hint" className="text-[11px] text-muted-foreground">Supplier lead</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="intel-safety" className="text-xs font-medium">Safety (days)</Label>
                        <Input id="intel-safety" type="number" inputMode="numeric" min="0" max="90" value={intelSafety} onChange={(e) => setIntelSafety(e.target.value)} className="h-8 w-20 text-xs border-hairline tabular-nums" aria-describedby="intel-safety-hint" />
                        <span id="intel-safety-hint" className="text-[11px] text-muted-foreground">Buffer</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="intel-coverage" className="text-xs font-medium">Coverage (days)</Label>
                        <Input id="intel-coverage" type="number" inputMode="numeric" min="1" max="365" value={intelCoverage} onChange={(e) => setIntelCoverage(e.target.value)} className="h-8 w-24 text-xs border-hairline tabular-nums" aria-describedby="intel-coverage-hint" />
                        <span id="intel-coverage-hint" className="text-[11px] text-muted-foreground">Reorder horizon</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="intel-location" className="text-xs font-medium">Location</Label>
                      <Select value={intelLocation} onValueChange={setIntelLocation}>
                        <SelectTrigger id="intel-location" className="w-44 h-8 text-xs"><SelectValue placeholder="Location" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All locations</SelectItem>
                          {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="intel-category" className="text-xs font-medium">Category</Label>
                      <Select value={intelCategory} onValueChange={setIntelCategory}>
                        <SelectTrigger id="intel-category" className="w-44 h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All categories</SelectItem>
                          {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="intel-sort" className="text-xs font-medium">Sort</Label>
                      <Select value={intelSort} onValueChange={setIntelSort}>
                        <SelectTrigger id="intel-sort" className="w-40 h-8 text-xs"><SelectValue placeholder="Sort" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="urgency">Urgency</SelectItem>
                          <SelectItem value="stockout_days">Stockout soonest</SelectItem>
                          <SelectItem value="velocity_desc">Velocity high→low</SelectItem>
                          <SelectItem value="stock_asc">Stock low→high</SelectItem>
                          <SelectItem value="stock_desc">Stock high→low</SelectItem>
                          <SelectItem value="name">Name A→Z</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-40 max-w-64">
                      <Label htmlFor="intel-search" className="text-xs font-medium">Search</Label>
                      <Input id="intel-search" placeholder="Search products…" value={intelSearch} onChange={(e) => setIntelSearch(e.target.value)} className="h-8 text-xs border-hairline" type="search" autoComplete="off" />
                    </div>
                  </div>
                  {intelError && (
                    <p role="alert" className="text-xs text-[var(--status-critical)] border border-hairline rounded-md p-2 bg-[var(--status-critical)]/5">{intelError}</p>
                  )}
                </CardContent>
              </Card>

              {/* KPI cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-hairline bg-surface">
                  <CardHeader className="pb-2"><CardDescription className="text-xs uppercase tracking-wider font-medium">Products Tracked</CardDescription><CardTitle className="text-2xl font-bold tabular-nums">{loading ? "..." : intelligence?.total_items ?? 0}</CardTitle></CardHeader>
                  <CardContent><p className="text-xs text-muted-foreground">{intelligence ? `${intelligence.params.window_days}d window · ${intelligence.params.lead_time_days}d lead + ${intelligence.params.safety_days}d safety` : "—"}</p></CardContent>
                </Card>
                <Card className="border-hairline bg-surface">
                  <CardHeader className="pb-2"><CardDescription className="text-xs uppercase tracking-wider font-medium">Critical</CardDescription><CardTitle className="text-2xl font-bold tabular-nums text-[var(--status-critical)]">{loading ? "..." : intelligence?.critical_count ?? 0}</CardTitle></CardHeader>
                  <CardContent><p className="text-xs text-muted-foreground">≤ 50% of reorder point</p></CardContent>
                </Card>
                <Card className="border-hairline bg-surface">
                  <CardHeader className="pb-2"><CardDescription className="text-xs uppercase tracking-wider font-medium">Low Stock</CardDescription><CardTitle className="text-2xl font-bold tabular-nums text-[var(--status-warning)]">{loading ? "..." : intelligence?.low_count ?? 0}</CardTitle></CardHeader>
                  <CardContent><p className="text-xs text-muted-foreground">≤ reorder point</p></CardContent>
                </Card>
                <Card className="border-hairline bg-surface">
                  <CardHeader className="pb-2"><CardDescription className="text-xs uppercase tracking-wider font-medium">Out of Stock</CardDescription><CardTitle className="text-2xl font-bold tabular-nums">{loading ? "..." : intelligence?.out_of_stock_count ?? 0}</CardTitle></CardHeader>
                  <CardContent><p className="text-xs text-muted-foreground">{intelligence?.stable_count ?? 0} stable (no recent sales)</p></CardContent>
                </Card>
              </div>

              {/* Intelligence Table */}
              <Card className="border-hairline">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Velocity &amp; Reorder Advisory</CardTitle>
                  <CardDescription className="text-xs">Read-only — reorder suggestion is advisory, never writes stock directly. Click Reorder to pre-fill a purchase.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <caption className="sr-only">Velocity and reorder advisory</caption>
                      <TableHeader className="sticky top-0 bg-surface z-10">
                        <TableRow>
                          <TableHead scope="col">Product</TableHead>
                          <TableHead scope="col">Category</TableHead>
                          <TableHead scope="col" className="text-right">Current</TableHead>
                          <TableHead scope="col" className="text-right">Min</TableHead>
                          <TableHead scope="col" className="text-right">Velocity</TableHead>
                          <TableHead scope="col" className="text-right">Days Until Stockout</TableHead>
                          <TableHead scope="col" className="text-right">Reorder Point</TableHead>
                          <TableHead scope="col" className="text-right">Suggested Qty</TableHead>
                          <TableHead scope="col" className="text-center">Status</TableHead>
                          <TableHead scope="col" className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow><TableCell colSpan={10} className="text-center py-6 text-sm text-muted-foreground">Computing velocity &amp; stockout…</TableCell></TableRow>
                        ) : intelligence?.items?.length ? (
                          intelligence.items.map((item: any) => (
                            <TableRow key={item.product_id}>
                              <TableCell className="font-medium min-w-40">
                                <div>{item.name}</div>
                                {item.sku && <div className="text-xs text-muted-foreground tabular-nums">{item.sku}</div>}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">{item.category_name || "Uncategorized"}</TableCell>
                              <TableCell className="text-right font-medium tabular-nums">{item.current_stock}</TableCell>
                              <TableCell className="text-right text-muted-foreground tabular-nums">{item.minimum_stock_level}</TableCell>
                              <TableCell className="text-right tabular-nums text-xs">{formatVelocityDay(item.daily_velocity)}</TableCell>
                              <TableCell className="text-right tabular-nums text-xs">{formatStockoutShort(item.days_until_stockout, item.estimated_stockout_date)}</TableCell>
                              <TableCell className="text-right tabular-nums">{parseFloat(item.reorder_point).toFixed(2)}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{item.suggested_order_qty}</TableCell>
                              <TableCell className="text-center">{statusBadge(item.stock_status)}</TableCell>
                              <TableCell className="text-right">
                                {item.suggested_order_qty > 0 ? (
                                  <Link href={`/purchases?product_id=${item.product_id}&qty=${item.suggested_order_qty}`}>
                                    <Button variant="outline" size="sm" className="h-7 text-xs border-hairline min-h-7">Reorder</Button>
                                  </Link>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow><TableCell colSpan={10} className="p-0 border-0"><div className="p-4"><EmptyState title="No products match the current filters." description="Adjust window, location, category, or search." /></div></TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Category breakdown */}
              {intelligence?.category_breakdown?.length > 0 && (
                <Card className="border-hairline">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Category Intelligence Breakdown</CardTitle>
                    <CardDescription className="text-xs">Units and valuation per category for the filtered set</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <caption className="sr-only">Category intelligence breakdown</caption>
                      <TableHeader className="sticky top-0 bg-surface z-10"><TableRow><TableHead scope="col">Category</TableHead><TableHead scope="col" className="text-right">Products</TableHead><TableHead scope="col" className="text-right">Units In Stock</TableHead><TableHead scope="col" className="text-right">Valuation</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {intelligence.category_breakdown.map((cat: any) => (
                          <TableRow key={cat.category_id || "uncat"}>
                            <TableCell className="font-medium">{cat.category_name}</TableCell>
                            <TableCell className="text-right tabular-nums">{cat.product_count}</TableCell>
                            <TableCell className="text-right tabular-nums">{cat.units_in_stock}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{formatCurrency(cat.total_valuation)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
