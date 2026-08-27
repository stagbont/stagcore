"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type Product = { id: string; name: string; sku: string | null; minimum_stock_level: number };
type StockInfo = { product_id: string; current_stock: number };
type Movement = { id: string; product_id: string | null; type: string; quantity: number; created_at: string; reference: string | null; notes: string | null };
type LowStock = { product_id: string; name: string; sku: string | null; current_stock: number; minimum_stock_level: number };

export default function InventoryPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState("");
  const [action, setAction] = useState<{ product_id: string; type: "receive" | "sell" | "adjust_in" | "adjust_out"; quantity: string; notes: string; location_id: string }>({
    product_id: "",
    type: "receive",
    quantity: "1",
    notes: "",
    location_id: "",
  });

  async function load() {
    if (!token) return;
    setError("");
    const [prodRes, lowRes, movRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/products/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/inventory/low-stock`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/inventory/movements?limit=20`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (!prodRes.ok) {
      setError(await prodRes.text());
      return;
    }
    const prods = await prodRes.json();
    setProducts(prods);
    if (lowRes.ok) setLowStock(await lowRes.json());
    if (movRes.ok) setMovements(await movRes.json());
    // Fetch stock for each product
    const stockEntries = await Promise.all(
      prods.map(async (p: Product) => {
        const r = await fetch(`${API_URL}/api/v1/inventory/stock/${p.id}`, { headers: { Authorization: `Bearer ${token}` } });
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
  }, [token]);

  async function handleAction(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const qty = parseInt(action.quantity);
    if (!action.product_id || !qty || qty <= 0) {
      setError("Select product and enter quantity > 0");
      return;
    }
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
      setError(await res.text());
      return;
    }
    setAction({ ...action, quantity: "1", notes: "" });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Inventory</h1>
        <p className="text-sm text-muted-foreground">Stock is derived from movements — never edited directly</p>
      </div>
      {error && <p className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-hairline lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Stock Levels</CardTitle>
            <CardDescription>Current stock = sum of movements per product</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Min</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const stock = stockMap[p.id] ?? 0;
                  const isLow = stock <= p.minimum_stock_level;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="tabular-nums">{p.sku || "—"}</TableCell>
                      <TableCell className="tabular-nums font-medium">{stock}</TableCell>
                      <TableCell className="tabular-nums">{p.minimum_stock_level}</TableCell>
                      <TableCell>
                        <Badge variant={isLow ? "destructive" : "default"} className="rounded-full">
                          {isLow ? "Low" : "OK"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!products.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No products yet — create one in Products
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-hairline">
          <CardHeader>
            <CardTitle className="text-base">Adjust Stock</CardTitle>
            <CardDescription>All changes create a ledger row</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Product</Label>
                <Select value={action.product_id} onValueChange={(v) => setAction({ ...action, product_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku || "no SKU"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Action</Label>
                <Select value={action.type} onValueChange={(v) => setAction({ ...action, type: v as typeof action.type })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receive">Receive (Purchase)</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="adjust_in">Adjust In</SelectItem>
                    <SelectItem value="adjust_out">Adjust Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Quantity</Label>
                <Input type="number" value={action.quantity} onChange={(e) => setAction({ ...action, quantity: e.target.value })} min="1" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Notes (optional)</Label>
                <Input value={action.notes} onChange={(e) => setAction({ ...action, notes: e.target.value })} placeholder="reference or note" />
              </div>
              <Button type="submit">Apply</Button>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Min</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStock.map((item) => (
                    <TableRow key={item.product_id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="tabular-nums">{item.current_stock}</TableCell>
                      <TableCell className="tabular-nums">{item.minimum_stock_level}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">All good — no low stock</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-hairline">
          <CardHeader>
            <CardTitle className="text-base">Recent Movements</CardTitle>
            <CardDescription>Last 20 ledger entries</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge variant="secondary" className="rounded-full">
                        {m.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</TableCell>
                    <TableCell className="text-xs">{m.reference || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{new Date(m.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {!movements.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No movements yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
