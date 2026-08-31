"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/help/help-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/page-header";
import { Field } from "@/components/field";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/format";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type Product = { id: string; name: string; sku: string | null; minimum_stock_level: number };
type StockInfo = { product_id: string; current_stock: number };
type Movement = { id: string; product_id: string | null; type: string; quantity: number; created_at: string; reference: string | null; notes: string | null };
type LowStock = { product_id: string; name: string; sku: string | null; current_stock: number; minimum_stock_level: number };
type Location = { id: string; name: string };

export default function InventoryPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ product?: string; quantity?: string }>({});
  const [action, setAction] = useState<{ product_id: string; type: "receive" | "sell" | "adjust_in" | "adjust_out"; quantity: string; notes: string; location_id: string }>({
    product_id: "",
    type: "receive",
    quantity: "1",
    notes: "",
    location_id: "",
  });
  const [locations, setLocations] = useState<Location[]>([]);
  const [filterLocation, setFilterLocation] = useState<string>("all");

  async function load() {
    if (!token) return;
    setError("");
    setFieldErrors({});
    const locQ = filterLocation !== "all" ? `?location_id=${filterLocation}` : "";
    const movQ = filterLocation !== "all" ? `?limit=20&location_id=${filterLocation}` : "?limit=20";
    const [prodRes, lowRes, movRes, locRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/products/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/inventory/low-stock`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/inventory/movements${movQ}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/locations/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (!prodRes.ok) {
      setError(await prodRes.text());
      return;
    }
    const prods = await prodRes.json();
    setProducts(prods);
    if (lowRes.ok) setLowStock(await lowRes.json());
    if (movRes.ok) setMovements(await movRes.json());
    if (locRes.ok) setLocations(await locRes.json());
    // Fetch stock for each product (per location if filter)
    const stockEntries = await Promise.all(
      prods.map(async (p: Product) => {
        const url = filterLocation !== "all" ? `${API_URL}/api/v1/inventory/stock/${p.id}?location_id=${filterLocation}` : `${API_URL}/api/v1/inventory/stock/${p.id}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
          const data: StockInfo = await r.json();
          return [p.id, data.current_stock] as const;
        }
        return [p.id, 0] as const;
      })
    );
    const map: Record<string, number> = {};
    for (const [id, stock] of stockEntries) map[id] = stock;
    setStockMap(map);
  }

  useEffect(() => {
    load();
  }, [token, filterLocation]);

  async function handleAction(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const errs: { product?: string; quantity?: string } = {};
    const qty = parseInt(action.quantity);
    if (!action.product_id) errs.product = "Select a product";
    if (!action.quantity || Number.isNaN(qty) || qty <= 0) errs.quantity = "Enter quantity > 0";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setError(errs.product || errs.quantity || "Fix the highlighted fields");
      return;
    }
    setFieldErrors({});
    let endpoint = "";
    let body: Record<string, unknown> = {};
    if (action.type === "receive") {
      endpoint = "/api/v1/inventory/receive";
      body = { product_id: action.product_id, quantity: qty, notes: action.notes || null };
    } else if (action.type === "sell") {
      endpoint = "/api/v1/inventory/sell";
      body = { product_id: action.product_id, quantity: qty, notes: action.notes || null };
    } else if (action.type === "adjust_in" || action.type === "adjust_out") {
      endpoint = "/api/v1/inventory/adjust";
      body = { product_id: action.product_id, quantity: qty, direction: action.type === "adjust_in" ? "in" : "out", notes: action.notes || null };
    }
    if (action.location_id) body.location_id = action.location_id;
    const res = await fetch(`${API_URL}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      const msg = await res.text();
      setError(msg);
      // surface as field error when relevant
      if (msg.toLowerCase().includes("quantity") || msg.toLowerCase().includes("stock")) setFieldErrors({ quantity: msg });
      return;
    }
    setAction({ ...action, quantity: "1", notes: "" });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Inventory</PageHeaderTitle>
          <PageHeaderDescription>Stock is derived from movements — never edited directly</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="inventory-ledger" />
          <Field label="Location" htmlFor="inventory-location-filter" className="min-w-[160px]">
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger id="inventory-location-filter" aria-label="Filter by location" className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </PageHeaderActions>
      </PageHeader>

      {error ? <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-destructive/20 bg-destructive/10 rounded-md p-3">{error}</p> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card data-tour="stock-levels" className="border-hairline lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Stock Levels</CardTitle>
            <CardDescription>Current stock = sum of movements per product</CardDescription>
          </CardHeader>
          <CardContent>
            {products.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Stock levels by product</caption>
                  <TableHeader className="sticky top-0 bg-surface z-10">
                    <TableRow>
                      <TableHead scope="col">Product</TableHead>
                      <TableHead scope="col">SKU</TableHead>
                      <TableHead scope="col" className="text-right">Stock</TableHead>
                      <TableHead scope="col" className="text-right">Min</TableHead>
                      <TableHead scope="col">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => {
                      const stock = stockMap[p.id] ?? 0;
                      const isLow = stock <= p.minimum_stock_level;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="tabular-nums text-xs">{p.sku || "—"}</TableCell>
                          <TableCell className="tabular-nums font-medium text-right">{stock}</TableCell>
                          <TableCell className="tabular-nums text-right">{p.minimum_stock_level}</TableCell>
                          <TableCell>
                            <Badge variant={isLow ? "warning" : "success"} className="rounded-full">
                              {isLow ? "Low" : "OK"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState title="No products yet" description="Create a product to start tracking stock.">
                <Button asChild className="min-h-11">
                  <Link href="/products">Go to Products</Link>
                </Button>
              </EmptyState>
            )}
          </CardContent>
        </Card>

        <Card data-tour="adjust-stock" className="border-hairline">
          <CardHeader>
            <CardTitle className="text-base">Adjust Stock</CardTitle>
            <CardDescription>All changes create a ledger row</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAction} className="flex flex-col gap-4" noValidate>
              <Field label="Product" htmlFor="inv-product" error={fieldErrors.product} required>
                <Select value={action.product_id || "none"} onValueChange={(v) => setAction({ ...action, product_id: v === "none" ? "" : v })}>
                  <SelectTrigger id="inv-product"><SelectValue placeholder="Select product…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select product…</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku || "no SKU"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Action" htmlFor="inv-action" required>
                <Select value={action.type} onValueChange={(v) => setAction({ ...action, type: v as typeof action.type })}>
                  <SelectTrigger id="inv-action"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receive">Receive (Purchase)</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="adjust_in">Adjust In</SelectItem>
                    <SelectItem value="adjust_out">Adjust Out</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quantity" htmlFor="inv-quantity" error={fieldErrors.quantity} hint="Whole units only" required>
                <Input id="inv-quantity" type="number" inputMode="numeric" value={action.quantity} onChange={(e) => setAction({ ...action, quantity: e.target.value })} min={1} step={1} placeholder="1…" autoComplete="off" aria-invalid={fieldErrors.quantity ? true : undefined} />
              </Field>
              <Field label="Location" htmlFor="inv-location" hint="Optional — defaults to global">
                <Select value={action.location_id || "none"} onValueChange={(v) => setAction({ ...action, location_id: v === "none" ? "" : v })}>
                  <SelectTrigger id="inv-location"><SelectValue placeholder="All / Global…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All locations</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Notes" htmlFor="inv-notes" hint="Optional reference">
                <Input id="inv-notes" value={action.notes} onChange={(e) => setAction({ ...action, notes: e.target.value })} placeholder="Reference or note…" autoComplete="off" />
              </Field>
              <Button type="submit" className="min-h-11">Apply</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-hairline">
          <CardHeader>
            <CardTitle className="text-base">Low Stock Alerts</CardTitle>
            <CardDescription>Products at or below minimum stock level</CardDescription>
          </CardHeader>
          <CardContent>
            {lowStock.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Low stock products</caption>
                  <TableHeader className="sticky top-0 bg-surface z-10">
                    <TableRow>
                      <TableHead scope="col">Product</TableHead>
                      <TableHead scope="col" className="text-right">Stock</TableHead>
                      <TableHead scope="col" className="text-right">Min</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStock.map((item) => (
                      <TableRow key={item.product_id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="tabular-nums text-right font-medium">{item.current_stock}</TableCell>
                        <TableCell className="tabular-nums text-right">{item.minimum_stock_level}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-surface px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">All good — no low stock</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-tour="recent-movements" className="border-hairline">
          <CardHeader>
            <CardTitle className="text-base">Recent Movements</CardTitle>
            <CardDescription>Last 20 ledger entries</CardDescription>
          </CardHeader>
          <CardContent>
            {movements.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Recent inventory movements</caption>
                  <TableHeader className="sticky top-0 bg-surface z-10">
                    <TableRow>
                      <TableHead scope="col">Type</TableHead>
                      <TableHead scope="col" className="text-right">Qty</TableHead>
                      <TableHead scope="col">Reference</TableHead>
                      <TableHead scope="col">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <Badge variant={m.type === "adjust_out" || m.type === "sale" ? "warning" : "secondary"} className="rounded-full">
                            {m.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-right font-medium">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate tabular-nums">{m.reference || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{formatDateTime(m.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-surface px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">No movements yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
