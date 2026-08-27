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
                  Products reaching or below configured minimum thresholds
                </CardDescription>
              </div>
              <Link href="/inventory">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                  View Full Stock →
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Min Level</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">
                        Loading inventory ledger...
                      </TableCell>
                    </TableRow>
                  ) : summary?.low_stock_items?.length ? (
                    summary.low_stock_items.map((item) => (
                      <TableRow key={item.product_id}>
                        <TableCell className="font-medium">
                          <div>{item.product_name}</div>
                          {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
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
                        <TableCell className="text-center">
                          {item.current_stock <= 0 ? (
                            <Badge variant="destructive" className="text-[10px] uppercase tracking-wider">
                              Out of Stock
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 uppercase tracking-wider">
                              Low Stock
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
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
