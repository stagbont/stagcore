"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { HelpButton } from "@/components/help/help-button";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/page-header";

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
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Transfers</PageHeaderTitle>
          <PageHeaderDescription>Move stock between locations — atomic TRANSFER_OUT + TRANSFER_IN</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="transfers-locations" />
        </PageHeaderActions>
      </PageHeader>
      {error && <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">{error}</p>}
      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">New Transfer</CardTitle>
          <CardDescription>Select source, destination, and item. Stock checked at source before moving.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant={mode === "product" ? "default" : "outline"} onClick={() => setMode("product")} className="min-h-9">Product</Button>
              <Button type="button" variant={mode === "device" ? "default" : "outline"} onClick={() => setMode("device")} className="min-h-9">Device</Button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="From location" htmlFor="transfer-from" required>
                <Select value={form.from_location_id || "none"} onValueChange={(v) => setForm({ ...form, from_location_id: v === "none" ? "" : v })}>
                  <SelectTrigger id="transfer-from"><SelectValue placeholder="Source…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select…</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="To location" htmlFor="transfer-to" required>
                <Select value={form.to_location_id || "none"} onValueChange={(v) => setForm({ ...form, to_location_id: v === "none" ? "" : v })}>
                  <SelectTrigger id="transfer-to"><SelectValue placeholder="Destination…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select…</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {mode === "product" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Product" htmlFor="transfer-product" required hint={preview !== null ? `Source stock: ${preview}` : undefined}>
                  <Select value={form.product_id || "none"} onValueChange={(v) => setForm({ ...form, product_id: v === "none" ? "" : v })}>
                    <SelectTrigger id="transfer-product"><SelectValue placeholder="Product…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select…</SelectItem>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Quantity" htmlFor="transfer-qty" hint="Units to move">
                  <Input id="transfer-qty" type="number" inputMode="numeric" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="1" autoComplete="off" className="tabular-nums" />
                </Field>
              </div>
            ) : (
              <Field label="Device" htmlFor="transfer-device" required hint="Any status, will move location">
                <Select value={form.device_id || "none"} onValueChange={(v) => setForm({ ...form, device_id: v === "none" ? "" : v })}>
                  <SelectTrigger id="transfer-device"><SelectValue placeholder="Device…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select…</SelectItem>
                    {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.product_name} · {d.serial_number} {d.imei ? `(${d.imei})` : ""} · {d.status} @ {locations.find((l) => l.id === d.location_id)?.name || "no loc"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label="Notes" htmlFor="transfer-notes" hint="Optional reason">
              <Input id="transfer-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Restock branch…" autoComplete="off" />
            </Field>
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
          {transfers.length ? (
            <Table>
              <caption className="sr-only">Recent stock transfers</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Date</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Item</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">From → To</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Qty</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs tabular-nums">{new Date(t.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs tabular-nums max-w-[180px] truncate">{t.product_id ? `Prod ${t.product_id.slice(0, 8)}` : `Dev ${t.device_id?.slice(0, 8)}`}</TableCell>
                    <TableCell className="text-xs">{locations.find((l) => l.id === t.from_location_id)?.name || t.from_location_id.slice(0, 6)} → {locations.find((l) => l.id === t.to_location_id)?.name || t.to_location_id.slice(0, 6)}</TableCell>
                    <TableCell className="tabular-nums text-right">{t.quantity}</TableCell>
                    <TableCell><Badge variant="secondary" className="rounded-full">{t.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No transfers yet" description="Create your first stock transfer to move inventory between locations." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
