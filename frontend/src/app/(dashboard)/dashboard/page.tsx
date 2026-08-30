"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface TopProduct {
  product_id: string;
  product_name: string;
  sku?: string;
  units_sold: number;
  total_revenue: string | number;
}

interface LowStockItem {
  product_id: string;
  product_name: string;
  sku?: string;
  category_name?: string;
  current_stock: number;
  minimum_stock_level: number;
}

interface IntelligenceItem {
  product_id: string;
  name: string;
  sku?: string | null;
  current_stock: number;
  daily_velocity: string | number;
  days_until_stockout: number | null;
  estimated_stockout_date: string | null;
  stock_status: string;
  suggested_order_qty: number;
}

interface DashboardSummary {
  today_sales_total: string | number;
  today_sales_count: number;
  today_gross_profit: string | number;
  total_inventory_value: string | number;
  total_products_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
  top_selling_products: TopProduct[];
  low_stock_items: LowStockItem[];
}

interface ActivityItem {
  id: string;
  activity_type: "sale" | "purchase" | "movement" | string;
  title: string;
  description: string;
  amount?: string | number;
  quantity?: number;
  timestamp: string;
}

function KpiSkeleton() {
  return (
    <Card className="border-border bg-surface">
      <CardHeader className="pb-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-28 mt-2" />
      </CardHeader>
      <CardContent className="pt-0">
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [business, setBusiness] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [intelligenceMap, setIntelligenceMap] = useState<Record<string, IntelligenceItem>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    const token = (session?.session as unknown as { token?: string } | undefined)?.token;
    if (!token) return;
    try {
      setLoading(true);
      setError("");

      const bizRes = await fetch(`${API_URL}/api/v1/business/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!bizRes.ok) {
        setError(await bizRes.text());
        return;
      }
      const businesses = await bizRes.json();
      if (!businesses.length) {
        setError("No business found — create one via registration.");
        return;
      }
      const biz = businesses[0];
      setBusiness(biz);

      const [sumRes, actRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/dashboard/summary?business_id=${biz.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/v1/dashboard/activity?business_id=${biz.id}&limit=10`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      } else {
        setError(await sumRes.text());
      }
      if (actRes.ok) {
        const actData = await actRes.json();
        setActivities(actData);
      }

      try {
        const intelRes = await fetch(
          `${API_URL}/api/v1/intelligence/overview?business_id=${biz.id}&window_days=30&sort_by=urgency&limit=100`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (intelRes.ok) {
          const intel = await intelRes.json();
          const map: Record<string, IntelligenceItem> = {};
          for (const item of intel.items as IntelligenceItem[]) map[item.product_id] = item;
          setIntelligenceMap(map);
        }
      } catch {
        // ignore — dashboard still renders without intelligence
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (val?: string | number) => {
    if (val === undefined || val === null) return "$0.00";
    const n = typeof val === "number" ? val : parseFloat(val);
    return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    } catch {
      return iso;
    }
  };

  const formatVelocity = (v?: string | number) => {
    if (v === undefined || v === null) return "—";
    const n = typeof v === "number" ? v : parseFloat(v);
    if (isNaN(n) || n === 0) return "stable";
    return `${n.toFixed(2)}/d`;
  };

  const stockoutLabel = (item: IntelligenceItem | undefined) => {
    if (!item) return null;
    if (item.stock_status === "stable") return "Stable · no recent sales";
    if (item.days_until_stockout === null || item.days_until_stockout === undefined) return null;
    if (item.days_until_stockout === 0) return "Stockout today";
    if (item.days_until_stockout === 1) return "1 day left";
    if (item.estimated_stockout_date) {
      try {
        return `${item.days_until_stockout}d · ${new Date(item.estimated_stockout_date).toLocaleDateString()}`;
      } catch {
        return `${item.days_until_stockout}d`;
      }
    }
    return `${item.days_until_stockout}d`;
  };

  const urgencyVariant = (status?: string): "critical" | "warning" | "success" | "secondary" | "outline" => {
    if (status === "out_of_stock" || status === "critical") return "critical";
    if (status === "low") return "warning";
    if (status === "stable") return "secondary";
    if (status === "ok") return "success";
    return "outline";
  };

  const urgencyLabel = (status?: string) => {
    if (status === "out_of_stock") return "Out";
    if (status === "critical") return "Critical";
    if (status === "low") return "Low";
    if (status === "stable") return "Stable";
    if (status === "ok") return "OK";
    return status || "—";
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {business ? `${business.name} (${business.slug}) · Real-Time Operations Overview` : "Loading workspace..."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/sales">
            <Button className="min-h-11 font-medium">+ New POS Sale</Button>
          </Link>
          <Link href="/purchases">
            <Button variant="outline" className="min-h-11">Receive Inventory</Button>
          </Link>
          <Link href="/reports">
            <Button variant="outline" className="min-h-11">Detailed Reports</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" aria-live="polite" className="flex flex-col gap-2 rounded-lg border border-critical/30 bg-critical/10 p-4 text-sm text-critical sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadData} className="shrink-0 border-critical/30">Retry</Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <Card className="border-border bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Today&apos;s Sales Revenue</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">{formatCurrency(summary?.today_sales_total)}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">{summary ? `${summary.today_sales_count} completed orders today` : "—"}</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Today&apos;s Gross Profit</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">{formatCurrency(summary?.today_gross_profit)}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">Derived post COGS deduction</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Total Inventory Valuation</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">{formatCurrency(summary?.total_inventory_value)}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">{summary ? `${summary.total_products_count} active items & devices` : "—"}</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-surface">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wider font-medium">Low Stock Attention</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">{(summary?.low_stock_count ?? 0) + (summary?.out_of_stock_count ?? 0)}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {summary && summary.low_stock_count + summary.out_of_stock_count > 0 ? (
                  <Badge variant="critical" className="text-xs font-normal">
                    {summary.out_of_stock_count} Out of stock · {summary.low_stock_count} Low
                  </Badge>
                ) : (
                  <Badge variant="success" className="text-xs font-normal">Inventory Healthy</Badge>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Grid: Low Stock Alert & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Items (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold">Stock Reorder & Alert List</CardTitle>
                <CardDescription className="text-xs">Urgency-sorted by velocity forecast (30d) when available — otherwise by threshold</CardDescription>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Link href="/reports">
                  <Button variant="ghost" size="sm" className="text-xs">Intelligence →</Button>
                </Link>
                <Link href="/inventory">
                  <Button variant="ghost" size="sm" className="text-xs">Full Stock →</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <caption className="sr-only">Low stock items sorted by urgency</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Product</TableHead>
                    <TableHead scope="col">Category</TableHead>
                    <TableHead scope="col" className="text-right">Current</TableHead>
                    <TableHead scope="col" className="text-right">Min</TableHead>
                    <TableHead scope="col" className="text-right">Velocity</TableHead>
                    <TableHead scope="col" className="text-center">Urgency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16 mx-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : summary?.low_stock_items?.length ? (
                    (() => {
                      const enriched = summary.low_stock_items.map((item) => ({
                        raw: item,
                        intel: intelligenceMap[item.product_id],
                      }));
                      const rank = (s?: string) => {
                        const order: Record<string, number> = { out_of_stock: 0, critical: 1, low: 2, ok: 3, stable: 4 };
                        return order[s || ""] ?? 5;
                      };
                      enriched.sort((a, b) => {
                        const ra = a.intel ? rank(a.intel.stock_status) : 2;
                        const rb = b.intel ? rank(b.intel.stock_status) : 2;
                        if (ra !== rb) return ra - rb;
                        const da = a.intel?.days_until_stockout;
                        const db = b.intel?.days_until_stockout;
                        if (da === null || da === undefined) return 1;
                        if (db === null || db === undefined) return -1;
                        return da - db;
                      });
                      return enriched.map(({ raw: item, intel }) => {
                        const so = stockoutLabel(intel);
                        const vel = intel ? formatVelocity(intel.daily_velocity) : "—";
                        const status = intel?.stock_status || (item.current_stock <= 0 ? "out_of_stock" : "low");
                        return (
                          <TableRow key={item.product_id}>
                            <TableCell className="font-medium">
                              <div>{item.product_name}</div>
                              {item.sku && <div className="text-xs text-muted-foreground tabular-nums">{item.sku}</div>}
                              {so && <div className="text-[11px] text-muted-foreground tabular-nums">{so}{intel && intel.suggested_order_qty > 0 ? ` · suggest ${intel.suggested_order_qty}` : ""}</div>}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{item.category_name || "General"}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{item.current_stock}</TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">{item.minimum_stock_level}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">{vel}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={urgencyVariant(status)} className="text-[10px] uppercase tracking-wider">{urgencyLabel(status)}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                        All products are above minimum inventory levels.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Top Selling Products */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Today&apos;s Top Performing Products</CardTitle>
              <CardDescription className="text-xs">Highest unit volume sold today</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <caption className="sr-only">Top selling products today</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Product</TableHead>
                    <TableHead scope="col" className="text-right">Units Sold</TableHead>
                    <TableHead scope="col" className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : summary?.top_selling_products?.length ? (
                    summary.top_selling_products.map((p) => (
                      <TableRow key={p.product_id}>
                        <TableCell className="font-medium">
                          {p.product_name}
                          {p.sku && <span className="ml-2 text-xs text-muted-foreground">({p.sku})</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{p.units_sold}</TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">{formatCurrency(p.total_revenue)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">No sales recorded yet today.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Live Activity Timeline (1 col) */}
        <div className="flex flex-col gap-4">
          <Card className="border-border flex-1 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Operational Activity Feed</CardTitle>
              <CardDescription className="text-xs">Chronological timeline of transactions & movements</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="size-2 rounded-full mt-1 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-2 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activities.length ? (
                <div className="flex flex-col gap-4">
                  {activities.map((act) => {
                    const isSale = act.activity_type === "sale";
                    const isPur = act.activity_type === "purchase";
                    return (
                      <div key={act.id} className="flex items-start gap-3 text-sm pb-3 border-b border-border last:border-b-0">
                        <span
                          aria-hidden
                          className={`mt-1 size-2 rounded-full shrink-0 ${isSale ? "bg-[var(--status-success)]" : isPur ? "bg-[var(--action-primary)]" : "bg-muted-foreground"}`}
                        />
                        <span className="sr-only">{isSale ? "Sale" : isPur ? "Purchase" : "Movement"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-xs truncate">{act.title}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{formatDate(act.timestamp)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{act.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">No recent activity detected.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
