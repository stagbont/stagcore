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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarcodeScanner } from "@/components/scanner/barcode-scanner";

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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<"product" | "device">("product");
  const [hasBarcodeFeature, setHasBarcodeFeature] = useState(false);
  const [returnOpen, setReturnOpen] = useState<string | null>(null);
  const [returnForm, setReturnForm] = useState<{ items: { sale_item_id: string; quantity: string; refund: string; checked: boolean }[]; reason: string; refund_method: string; restock: boolean; notes: string }>({ items: [], reason: "other", refund_method: "cash", restock: true, notes: "" });

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

  useEffect(() => {
    load();
    // check barcode flag
    async function checkFlag() {
      if (!token) return;
      try {
        const bizRes = await fetch(`${API_URL}/api/v1/business/`, { headers: { Authorization: `Bearer ${token}` } });
        if (!bizRes.ok) return;
        const businesses = await bizRes.json();
        if (!businesses.length) return;
        const featRes = await fetch(`${API_URL}/api/v1/business/${businesses[0].id}/features`, { headers: { Authorization: `Bearer ${token}` } });
        if (!featRes.ok) return;
        const data = await featRes.json();
        const m: Record<string, boolean> = {};
        for (const f of data.features as { feature_key: string; enabled: boolean }[]) m[f.feature_key] = f.enabled;
        setHasBarcodeFeature(!!m.barcode_scanning);
      } catch {}
    }
    checkFlag();
  }, [token]);

  async function handleScan(code: string) {
    const clean = code.trim();
    if (!clean) return;
    if (scannerMode === "product") {
      const r = await fetch(`${API_URL}/api/v1/scan/by-barcode/${encodeURIComponent(clean)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { setError(await r.text()); return; }
      const p = await r.json();
      setDraft({ ...draft, mode: "product", product_id: p.id, selling_price: String(p.selling_price), quantity: "1" });
      setError("");
    } else {
      // try IMEI then serial
      let dr = await fetch(`${API_URL}/api/v1/scan/by-imei/${encodeURIComponent(clean)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!dr.ok) dr = await fetch(`${API_URL}/api/v1/scan/by-serial/${encodeURIComponent(clean)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!dr.ok) { setError(await dr.text()); return; }
      const d = await dr.json();
      if (d.status !== "in_stock") { setError(`Device ${clean} status ${d.status} not sellable`); return; }
      setDraft({ ...draft, mode: "device", device_id: d.id, selling_price: String(d.selling_price) });
      setError("");
    }
  }

  async function openReturn(sale: Sale) {
    setReturnOpen(sale.id);
    setReturnForm({
      items: sale.items.map((it) => ({ sale_item_id: it.id, quantity: String(it.quantity), refund: String((parseFloat(it.selling_price) - parseFloat(it.discount)).toFixed(2)), checked: false })),
      reason: "other", refund_method: "cash", restock: true, notes: ""
    });
  }

  async function submitReturn() {
    if (!returnOpen) return;
    const sale = sales.find((s) => s.id === returnOpen);
    if (!sale) return;
    const chosen = returnForm.items.filter((i) => i.checked);
    if (!chosen.length) { setError("Select at least one item to return"); return; }
    const body = {
      items: chosen.map((i) => ({ sale_item_id: i.sale_item_id, quantity: parseInt(i.quantity) || 1, refund_amount: i.refund || null })),
      reason: returnForm.reason,
      refund_method: returnForm.refund_method,
      restock: returnForm.restock,
      notes: returnForm.notes || null,
      location_id: sale.location_id,
    };
    const r = await fetch(`${API_URL}/api/v1/returns/sales/${returnOpen}/return`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!r.ok) { setError(await r.text()); return; }
    setReturnOpen(null);
    load();
  }

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sales</h1>
          <p className="text-sm text-muted-foreground">POS — draft → complete (atomic stock / device sale) — tablet 44×44 ready</p>
        </div>
        <div data-tour="new-sale-btn" className="flex items-center gap-2">
          <HelpButton slug="sales-pos" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setForm({ customer_id: "", location_id: "", payment_method: "cash", notes: "" }); setItems([]); }}>New Sale</Button>
            </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-[min(calc(100%-1rem),56rem)]">
            <DialogHeader>
              <DialogTitle>New Sale</DialogTitle>
              <DialogDescription>Draft a sale then Complete to deduct stock atomically</DialogDescription>
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

              <div data-tour="sale-items" className="border border-hairline rounded-md p-4 flex flex-col gap-3">
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
                <div className="flex gap-2 mb-2">
                  <Button type="button" variant="outline" size="sm" className="min-h-11 flex-1" onClick={() => { setScannerMode(draft.mode); setScannerOpen(true); }} disabled={!hasBarcodeFeature} title={hasBarcodeFeature ? "Scan barcode/IMEI" : "Barcode scanning disabled"}>
                    Scan {draft.mode === "product" ? "Barcode" : "IMEI/Serial"}
                  </Button>
                  <span className="text-xs text-muted-foreground self-center">{hasBarcodeFeature ? "camera" : "flag off"}</span>
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
      </div>
      {error && <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-border rounded-md p-3 bg-surface">{error}</p>}
      <Card data-tour="sales-table" className="border-border">
        <CardHeader>
          <CardTitle className="text-base">All Sales</CardTitle>
          <CardDescription>Draft → Complete (stock) / Cancel (restock)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <caption className="sr-only">All sales with status and actions</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Date</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Payment</TableHead>
                <TableHead scope="col">Items</TableHead>
                <TableHead scope="col">Total</TableHead>
                <TableHead scope="col" className="text-right">Actions</TableHead>
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
                    {s.status === "completed" && <Button variant="outline" size="sm" onClick={() => openReturn(s)}>Return</Button>}
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
          </div>
        </CardContent>
      </Card>

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onDetected={handleScan} />

      <Dialog open={!!returnOpen} onOpenChange={(v) => !v && setReturnOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-[min(calc(100%-1rem),56rem)]">
          <DialogHeader><DialogTitle>Return Items</DialogTitle><DialogDescription>Select items to return and refund</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-4">
            {returnForm.items.map((it, idx) => {
              const si = sales.find((s) => s.id === returnOpen)?.items.find((x) => x.id === it.sale_item_id);
              return (
                <div key={it.sale_item_id} className="flex items-center gap-2 border border-hairline rounded-md p-3">
                  <input type="checkbox" checked={it.checked} onChange={(e) => setReturnForm({ ...returnForm, items: returnForm.items.map((x, i) => i === idx ? { ...x, checked: e.target.checked } : x) })} />
                  <span className="text-sm flex-1 tabular-nums">{si?.product_id ? `Product ${si.product_id.slice(0, 8)}` : `Device ${si?.device_id?.slice(0, 8)}`} — qty {si?.quantity}</span>
                  <Input type="number" className="w-20" value={it.quantity} onChange={(e) => setReturnForm({ ...returnForm, items: returnForm.items.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x) })} min="1" />
                  <Input type="number" step="0.01" className="w-24" value={it.refund} onChange={(e) => setReturnForm({ ...returnForm, items: returnForm.items.map((x, i) => i === idx ? { ...x, refund: e.target.value } : x) })} placeholder="Refund" />
                </div>
              );
            })}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Reason</Label>
                <Select value={returnForm.reason} onValueChange={(v) => setReturnForm({ ...returnForm, reason: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="wrong_item">Wrong item</SelectItem>
                    <SelectItem value="warranty">Warranty</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Refund method</Label>
                <Select value={returnForm.refund_method} onValueChange={(v) => setReturnForm({ ...returnForm, refund_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={returnForm.restock} onChange={(e) => setReturnForm({ ...returnForm, restock: e.target.checked })} />
              <Label>Restock (return to inventory)</Label>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Notes</Label>
              <Input value={returnForm.notes} onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })} />
            </div>
            <Button onClick={submitReturn} className="min-h-11">Submit Return</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
