"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

export default function DashboardPage() {
  const { data: session } = useSession();
  const [business, setBusiness] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [intelligenceMap, setIntelligenceMap] = useState<Record<string, IntelligenceItem>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      const token = (session?.session as unknown as { token?: string } | undefined)?.token;
      if (!token) return;
      try {
        setLoading(true);
        setError("");

        // 1. Fetch Business
        const bizRes = await fetch(`${API_URL}/api/v1/business/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!bizRes.ok) {
          setError(await bizRes.text());
          return;
        }
        const businesses = await bizRes.json();
        if (!businesses.length) {
          setError("No business found");
          return;
        }
        const biz = businesses[0];
        setBusiness(biz);

        // 2. Fetch Dashboard Summary
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
        }
        if (actRes.ok) {
          const actData = await actRes.json();
          setActivities(actData);
        }

        // Best-effort intelligence enrichment for urgency badges (gated by flag — ignore 403)
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
    }
    loadData();
  }, [session]);

  const formatCurrency = (val?: string | number) => {
    if (val === undefined || val === null) return "$0.00";
    const n = typeof val === "number" ? val : parseFloat(val);
    return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
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

  const stockoutLabel = (item: IntelligenceItem | undefined, _fallback: LowStockItem) => {
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

  const urgencyBadgeClass = (status?: string) => {
    if (status === "out_of_stock") return "bg-[var(--status-critical)]/10 text-[var(--status-critical)] border-[var(--status-critical)]/20";
    if (status === "critical") return "bg-[var(--status-critical)]/10 text-[var(--status-critical)] border-[var(--status-critical)]/20";
    if (status === "low") return "text-amber-600 border-amber-500/30";
    if (status === "stable") return "bg-muted text-muted-foreground";
    return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {business ? `${business.name} (${business.slug}) · Real-Time Operations Overview` : "Loading workspace..."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/sales">
            <Button size="sm" className="bg-primary text-primary-foreground font-medium">
              + New POS Sale
            </Button>
          </Link>
          <Link href="/purchases">
            <Button size="sm" variant="outline" className="border-hairline">
              Receive Inventory
            </Button>
          </Link>
          <Link href="/reports">
            <Button size="sm" variant="outline" className="border-hairline">
              Detailed Reports
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--status-critical)]/30 bg-[var(--status-critical)]/10 p-4 text-sm text-[var(--status-critical)]">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-hairline bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Today&apos;s Sales Revenue
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {loading ? "..." : formatCurrency(summary?.today_sales_total)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {summary ? `${summary.today_sales_count} completed orders today` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-hairline bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Today&apos;s Gross Profit
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-foreground">
              {loading ? "..." : formatCurrency(summary?.today_gross_profit)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">Derived post COGS deduction</p>
          </CardContent>
        </Card>

        <Card className="border-hairline bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Total Inventory Valuation
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {loading ? "..." : formatCurrency(summary?.total_inventory_value)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {summary ? `${summary.total_products_count} active items & devices` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-hairline bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Low Stock Attention
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {loading ? "..." : (summary?.low_stock_count ?? 0) + (summary?.out_of_stock_count ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {summary && summary.low_stock_count + summary.out_of_stock_count > 0 ? (
              <Badge variant="destructive" className="text-xs rounded-full font-normal">
                {summary.out_of_stock_count} Out of stock · {summary.low_stock_count} Low
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs rounded-full font-normal">
                Inventory Healthy
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Grid: Low Stock Alert & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Items (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card className="border-hairline">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Stock Reorder & Alert List</CardTitle>
                <CardDescription className="text-xs">
                  Urgency-sorted by velocity forecast (30d) when available — otherwise by threshold
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/reports">
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                    Intelligence →
                  </Button>
                </Link>
                <Link href="/inventory">
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                    View Full Stock →
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Velocity</TableHead>
                    <TableHead className="text-center">Urgency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                        Loading inventory ledger...
                      </TableCell>
                    </TableRow>
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
                        const so = stockoutLabel(intel, item);
                        const vel = intel ? formatVelocity(intel.daily_velocity) : "—";
                        const status = intel?.stock_status || (item.current_stock <= 0 ? "out_of_stock" : "low");
                        return (
                          <TableRow key={item.product_id}>
                            <TableCell className="font-medium">
                              <div>{item.product_name}</div>
                              {item.sku && <div className="text-xs text-muted-foreground tabular-nums">{item.sku}</div>}
                              {so && <div className="text-[11px] text-muted-foreground tabular-nums">{so}{intel && intel.suggested_order_qty > 0 ? ` · suggest ${intel.suggested_order_qty}` : ""}</div>}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {item.category_name || "General"}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {item.current_stock}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {item.minimum_stock_level}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {vel}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${urgencyBadgeClass(status)}`}>
                                {status === "out_of_stock" ? "Out" : status === "critical" ? "Critical" : status === "low" ? "Low" : status === "stable" ? "Stable" : "OK"}
                              </Badge>
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
          <Card className="border-hairline">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Today&apos;s Top Performing Products</CardTitle>
              <CardDescription className="text-xs">Highest unit volume sold today</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-sm text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : summary?.top_selling_products?.length ? (
                    summary.top_selling_products.map((p) => (
                      <TableRow key={p.product_id}>
                        <TableCell className="font-medium">
                          {p.product_name}
                          {p.sku && <span className="ml-2 text-xs text-muted-foreground">({p.sku})</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{p.units_sold}</TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {formatCurrency(p.total_revenue)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">
                        No sales recorded yet today.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Live Activity Timeline (1 col) */}
        <div className="flex flex-col gap-4">
          <Card className="border-hairline flex-1 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Operational Activity Feed</CardTitle>
              <CardDescription className="text-xs">Chronological timeline of transactions & movements</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading activity stream...</p>
              ) : activities.length ? (
                <div className="flex flex-col gap-4">
                  {activities.map((act) => {
                    const isSale = act.activity_type === "sale";
                    const isPur = act.activity_type === "purchase";
                    return (
                      <div key={act.id} className="flex items-start gap-3 text-sm pb-3 border-b border-hairline last:border-b-0">
                        <div
                          className={`mt-0.5 size-2 rounded-full shrink-0 ${
                            isSale ? "bg-emerald-500" : isPur ? "bg-blue-500" : "bg-muted-foreground"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-xs truncate">{act.title}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                              {formatDate(act.timestamp)}
                            </span>
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
