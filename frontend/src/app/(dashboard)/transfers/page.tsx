"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/help/help-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Location = { id: string; name: string };
type Product = { id: string; name: string; sku: string | null };
type Device = { id: string; product_name: string; serial_number: string; imei: string | null; status: string; location_id: string | null };
type Transfer = { id: string; product_id: string | null; device_id: string | null; from_location_id: string; to_location_id: string; quantity: number; status: string; created_at: string; notes: string | null };

export default function TransfersPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"product" | "device">("product");
  const [form, setForm] = useState({ product_id: "", device_id: "", from_location_id: "", to_location_id: "", quantity: "1", notes: "" });
  const [preview, setPreview] = useState<number | null>(null);

  async function load() {
    if (!token) return;
    setError("");
    const [locRes, prodRes, devRes, trRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/locations/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/products/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/devices/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/transfers`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (locRes.ok) setLocations(await locRes.json());
    if (prodRes.ok) setProducts(await prodRes.json());
    if (devRes.ok) setDevices(await devRes.json());
    if (trRes.ok) setTransfers(await trRes.json());
    else if (!trRes.ok) {
      const t = await trRes.text();
      if (t.includes("multi_location")) setError("Multi-location feature is disabled for this business. Enable it in Admin Features.");
      else if (trRes.status !== 403) setError(t);
    }
  }

  useEffect(() => { load(); }, [token]);

  async function fetchPreview() {
    if (mode === "product" && form.product_id && form.from_location_id) {
      const r = await fetch(`${API_URL}/api/v1/inventory/stock/${form.product_id}?location_id=${form.from_location_id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        setPreview(d.current_stock);
      } else setPreview(null);
    } else setPreview(null);
  }

  useEffect(() => { fetchPreview(); }, [form.product_id, form.from_location_id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.from_location_id || !form.to_location_id) { setError("Select from and to locations"); return; }
    if (form.from_location_id === form.to_location_id) { setError("From and to must differ"); return; }
    const body: Record<string, unknown> = {
      from_location_id: form.from_location_id,
      to_location_id: form.to_location_id,
      quantity: parseInt(form.quantity) || 1,
      notes: form.notes || null,
    };
    if (mode === "product") {
      if (!form.product_id) { setError("Select product"); return; }
      body.product_id = form.product_id;
    } else {
      if (!form.device_id) { setError("Select device"); return; }
      body.device_id = form.device_id;
      body.quantity = 1;
    }
    const r = await fetch(`${API_URL}/api/v1/transfers`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!r.ok) { setError(await r.text()); return; }
    setForm({ product_id: "", device_id: "", from_location_id: "", to_location_id: "", quantity: "1", notes: "" });
    setPreview(null);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Transfers</h1>
          <p className="text-sm text-muted-foreground">Move stock between locations — atomic TRANSFER_OUT + TRANSFER_IN</p>
        </div>
        <HelpButton slug="transfers-locations" />
      </div>
      {error && <p className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">{error}</p>}
      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">New Transfer</CardTitle>
          <CardDescription>Select source, destination, and item. Stock checked at source before moving.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Button type="button" variant={mode === "product" ? "default" : "outline"} onClick={() => setMode("product")}>Product</Button>
              <Button type="button" variant={mode === "device" ? "default" : "outline"} onClick={() => setMode("device")}>Device</Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>From location *</Label>
                <Select value={form.from_location_id || "none"} onValueChange={(v) => setForm({ ...form, from_location_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>To location *</Label>
                <Select value={form.to_location_id || "none"} onValueChange={(v) => setForm({ ...form, to_location_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {mode === "product" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Product *</Label>
                  <Select value={form.product_id || "none"} onValueChange={(v) => setForm({ ...form, product_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select</SelectItem>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {preview !== null && <span className="text-xs text-muted-foreground tabular-nums">Source stock: {preview}</span>}
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Quantity</Label>
                  <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} min="1" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label>Device * (any status, will move location)</Label>
                <Select value={form.device_id || "none"} onValueChange={(v) => setForm({ ...form, device_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Device" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.product_name} · {d.serial_number} {d.imei ? `(${d.imei})` : ""} · {d.status} @ {locations.find((l) => l.id === d.location_id)?.name || "no loc"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label>Notes (optional)</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Transfer reason" />
            </div>
            <Button type="submit" className="min-h-11">Transfer</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">Recent Transfers</CardTitle>
          <CardDescription>Header + ledger pair (reference = transfer id)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs tabular-nums">{new Date(t.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs tabular-nums max-w-[180px] truncate">{t.product_id ? `Prod ${t.product_id.slice(0, 8)}` : `Dev ${t.device_id?.slice(0, 8)}`}</TableCell>
                  <TableCell className="text-xs">{locations.find((l) => l.id === t.from_location_id)?.name || t.from_location_id.slice(0, 6)} → {locations.find((l) => l.id === t.to_location_id)?.name || t.to_location_id.slice(0, 6)}</TableCell>
                  <TableCell className="tabular-nums">{t.quantity}</TableCell>
                  <TableCell><Badge variant="secondary" className="rounded-full">{t.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!transfers.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No transfers yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
