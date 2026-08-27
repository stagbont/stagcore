"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type SaleItem = { id: string; product_id: string | null; device_id: string | null; quantity: number; selling_price: string; discount: string; warranty_months_override: number | null };
type Sale = { id: string; status: string; payment_method: string; sale_date: string; total_amount: string; customer_id: string | null; location_id: string | null; notes: string | null; items: SaleItem[] };
type Product = { id: string; name: string; sku: string | null; selling_price: string };
type Device = { id: string; product_name: string; serial_number: string; imei: string | null; selling_price: string; status: string };
type Customer = { id: string; name: string; phone: string | null };
type Location = { id: string; name: string };

export default function SalesPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customer_id: "", location_id: "", payment_method: "cash", notes: "" });
  const [quickCustomer, setQuickCustomer] = useState({ name: "", phone: "" });
  const [items, setItems] = useState<{ product_id: string; device_id: string; quantity: string; selling_price: string; discount: string; warranty_override: string; mode: "product" | "device" }[]>([]);
  const [draft, setDraft] = useState({ mode: "product" as "product" | "device", product_id: "", device_id: "", quantity: "1", selling_price: "0.00", discount: "0.00", warranty_override: "" });

  async function load() {
    if (!token) return;
    setError("");
    const [salesRes, prodRes, devRes, custRes, locRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/sales`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/products/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/devices?status=in_stock`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/customers/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/locations/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (!salesRes.ok) {
      setError(await salesRes.text());
      return;
    }
    setSales(await salesRes.json());
    if (prodRes.ok) setProducts(await prodRes.json());
    if (devRes.ok) {
      const all: Device[] = await devRes.json();
      setDevices(all.filter((d) => d.status === "in_stock"));
    } else {
      const r = await fetch(`${API_URL}/api/v1/devices/`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const all: Device[] = await r.json();
        setDevices(all.filter((d) => d.status === "in_stock"));
      } else setDevices([]);
    }
    if (custRes.ok) setCustomers(await custRes.json());
    else setCustomers([]);
    if (locRes.ok) setLocations(await locRes.json());
    else setLocations([]);
  }

  useEffect(() => { load(); }, [token]);

  async function handleQuickAddCustomer() {
    if (!quickCustomer.name) {
      setError("Customer name required");
      return;
    }
    const res = await fetch(`${API_URL}/api/v1/customers/`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: quickCustomer.name, phone: quickCustomer.phone || null }) });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const c = await res.json();
    setCustomers([...customers, c]);
    setForm({ ...form, customer_id: c.id });
    setQuickCustomer({ name: "", phone: "" });
    setError("");
  }

  function addItem() {
    if (draft.mode === "product") {
      if (!draft.product_id || !draft.quantity) {
        setError("Select product and quantity");
        return;
      }
      const qty = parseInt(draft.quantity);
      if (qty <= 0) { setError("Quantity must be >0"); return; }
      setItems([...items, { product_id: draft.product_id, device_id: "", quantity: draft.quantity, selling_price: draft.selling_price || "0.00", discount: draft.discount || "0.00", warranty_override: "", mode: "product" }]);
    } else {
      if (!draft.device_id) {
        setError("Select device");
        return;
      }
      if (items.some((it) => it.device_id === draft.device_id)) {
        setError("Device already in cart");
        return;
      }
      setItems([...items, { product_id: "", device_id: draft.device_id, quantity: "1", selling_price: draft.selling_price || "0.00", discount: draft.discount || "0.00", warranty_override: draft.warranty_override, mode: "device" }]);
    }
    setDraft({ mode: draft.mode, product_id: "", device_id: "", quantity: "1", selling_price: "0.00", discount: "0.00", warranty_override: "" });
    setError("");
  }

  function totalFor(itemsList: typeof items) {
    return itemsList.reduce((sum, it) => {
      const price = parseFloat(it.selling_price || "0");
      const disc = parseFloat(it.discount || "0");
      const qty = parseInt(it.quantity || "1");
      return sum + (price - disc) * qty;
    }, 0);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length) {
      setError("Add at least one item");
      return;
    }
    const body = {
      customer_id: form.customer_id || null,
      location_id: form.location_id || null,
      payment_method: form.payment_method,
      notes: form.notes || null,
      items: items.map((it) =>
        it.mode === "product"
          ? { product_id: it.product_id, quantity: parseInt(it.quantity), selling_price: it.selling_price, discount: it.discount }
          : { device_id: it.device_id, quantity: 1, selling_price: it.selling_price, discount: it.discount, warranty_months_override: it.warranty_override ? parseInt(it.warranty_override) : null }
      ),
    };
    const res = await fetch(`${API_URL}/api/v1/sales`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setOpen(false);
    setForm({ customer_id: "", location_id: "", payment_method: "cash", notes: "" });
    setItems([]);
    load();
  }

  async function handleComplete(id: string) {
    if (!confirm("Complete this sale? Stock will be deducted and devices marked sold.")) return;
    const res = await fetch(`${API_URL}/api/v1/sales/${id}/complete`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    load();
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this sale? Completed sales will restock.")) return;
    const res = await fetch(`${API_URL}/api/v1/sales/${id}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this draft sale?")) return;
    const res = await fetch(`${API_URL}/api/v1/sales/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Sales</h1>
          <p className="text-sm text-muted-foreground">POS — draft → complete (atomic stock / device sale)</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setForm({ customer_id: "", location_id: "", payment_method: "cash", notes: "" }); setItems([]); }}>New Sale</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
            <DialogHeader>
              <DialogTitle>New Sale</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Customer (optional)</Label>
                  <Select value={form.customer_id || "none"} onValueChange={(v) => setForm({ ...form, customer_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input placeholder="Quick add name" value={quickCustomer.name} onChange={(e) => setQuickCustomer({ ...quickCustomer, name: e.target.value })} className="flex-1" />
                    <Input placeholder="Phone" value={quickCustomer.phone} onChange={(e) => setQuickCustomer({ ...quickCustomer, phone: e.target.value })} className="w-32" />
                    <Button type="button" variant="outline" onClick={handleQuickAddCustomer}>Add</Button>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Location (optional)</Label>
                  <Select value={form.location_id || "none"} onValueChange={(v) => setForm({ ...form, location_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Label className="mt-2">Payment</Label>
                  <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="border border-hairline rounded-md p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Items ({items.length}) — Total: <span className="tabular-nums">{totalFor(items).toFixed(2)}</span></Label>
                  <Select value={draft.mode} onValueChange={(v) => {
                    const prod = products[0];
                    setDraft({ ...draft, mode: v as "product" | "device", selling_price: v === "product" && prod ? String(prod.selling_price) : draft.selling_price });
                  }}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">Product</SelectItem>
                      <SelectItem value="device">Device</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.mode === "product" ? (
                  <div className="grid grid-cols-4 gap-2">
                    <Select value={draft.product_id || "none"} onValueChange={(v) => {
                      const p = products.find((x) => x.id === v);
                      setDraft({ ...draft, product_id: v === "none" ? "" : v, selling_price: p ? String(p.selling_price) : draft.selling_price });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select</SelectItem>
                        {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} min="1" placeholder="Qty" />
                    <Input type="number" step="0.01" value={draft.selling_price} onChange={(e) => setDraft({ ...draft, selling_price: e.target.value })} placeholder="Price" />
                    <Input type="number" step="0.01" value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: e.target.value })} placeholder="Discount" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Select value={draft.device_id || "none"} onValueChange={(v) => {
                      const d = devices.find((x) => x.id === v);
                      setDraft({ ...draft, device_id: v === "none" ? "" : v, selling_price: d ? String(d.selling_price) : draft.selling_price });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select in-stock device" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select</SelectItem>
                        {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.product_name} {d.serial_number} {d.imei ? `(${d.imei})` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" step="0.01" value={draft.selling_price} onChange={(e) => setDraft({ ...draft, selling_price: e.target.value })} placeholder="Price" />
                      <Input type="number" step="0.01" value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: e.target.value })} placeholder="Discount" />
                      <Input type="number" value={draft.warranty_override} onChange={(e) => setDraft({ ...draft, warranty_override: e.target.value })} placeholder="Warranty mo" min="0" max="60" />
                    </div>
                  </div>
                )}
                <Button type="button" variant="outline" onClick={addItem}>Add Item</Button>
                {items.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Detail</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it, idx) => (
                        <TableRow key={idx}>
                          <TableCell><Badge variant="secondary" className="rounded-full">{it.mode}</Badge></TableCell>
                          <TableCell className="text-xs">{it.mode === "product" ? products.find((p) => p.id === it.product_id)?.name || it.product_id : devices.find((d) => d.id === it.device_id)?.serial_number || it.device_id}</TableCell>
                          <TableCell className="tabular-nums">{it.quantity}</TableCell>
                          <TableCell className="tabular-nums">{(parseFloat(it.selling_price) - parseFloat(it.discount || "0")).toFixed(2)}</TableCell>
                          <TableCell><Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}>Remove</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <Button type="submit" size="lg" className="min-h-11">Create Draft</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {error && <p className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">{error}</p>}
      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">All Sales</CardTitle>
          <CardDescription>Draft → Complete (stock) / Cancel (restock)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-xs tabular-nums">{new Date(s.sale_date).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant={s.status === "completed" ? "default" : s.status === "cancelled" ? "destructive" : "secondary"} className="rounded-full">{s.status}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className="rounded-full">{s.payment_method}</Badge></TableCell>
                  <TableCell className="text-xs">{s.items.length} item{s.items.length !== 1 ? "s" : ""} {s.items.some((i) => i.device_id) ? "(+devices)" : ""}</TableCell>
                  <TableCell className="tabular-nums">{String(s.total_amount)}</TableCell>
                  <TableCell className="text-right flex gap-1 justify-end flex-wrap">
                    {s.status === "draft" && <Button size="sm" onClick={() => handleComplete(s.id)}>Complete</Button>}
                    {s.status !== "cancelled" && <Button variant="outline" size="sm" onClick={() => handleCancel(s.id)}>Cancel</Button>}
                    <Button variant="outline" size="sm" onClick={() => handleDelete(s.id)} disabled={s.status !== "draft"}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!sales.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No sales yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
