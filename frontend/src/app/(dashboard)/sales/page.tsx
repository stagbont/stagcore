"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useBusiness } from "@/components/providers/business-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarcodeScanner } from "@/components/scanner/barcode-scanner";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { HelpButton } from "@/components/help/help-button";
import { API_URL } from "@/lib/fetch-with-auth";
import { formatCurrency, formatDate } from "@/lib/format";

type SaleItem = { id: string; product_id: string | null; device_id: string | null; quantity: number; selling_price: string; discount: string; warranty_months_override: number | null };
type Sale = { id: string; status: string; payment_method: string; sale_date: string; total_amount: string; customer_id: string | null; location_id: string | null; notes: string | null; items: SaleItem[] };
type Product = { id: string; name: string; sku: string | null; selling_price: string };
type Device = { id: string; product_name: string; serial_number: string; imei: string | null; selling_price: string; status: string };
type Customer = { id: string; name: string; phone: string | null };
type Location = { id: string; name: string };

const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: "Cash", card: "Card", mobile_money: "Mobile Money" };

type DraftState = { mode: "product" | "device"; product_id: string; device_id: string; quantity: string; selling_price: string; discount: string; warranty_override: string };

// Explicit variant components — no boolean-prop switch (vercel: explicit-variants)
function ProductDraftFields({
  draft,
  setDraft,
  products,
}: {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  products: Product[];
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
      <Field label="Product" htmlFor="sale-product">
        <Select
          value={draft.product_id || "none"}
          onValueChange={(v) => {
            const p = products.find((x) => x.id === v);
            setDraft((prev) => ({ ...prev, product_id: v === "none" ? "" : v, selling_price: p ? String(p.selling_price) : prev.selling_price }));
          }}
        >
          <SelectTrigger id="sale-product"><SelectValue placeholder="Select product" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select product</SelectItem>
            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Qty" htmlFor="sale-qty" hint="Units">
        <Input id="sale-qty" type="number" inputMode="numeric" value={draft.quantity} onChange={(e) => setDraft((prev) => ({ ...prev, quantity: e.target.value }))} min="1" placeholder="1" name="quantity" autoComplete="off" />
      </Field>
      <Field label="Price" htmlFor="sale-price">
        <Input id="sale-price" type="number" inputMode="decimal" step="0.01" value={draft.selling_price} onChange={(e) => setDraft((prev) => ({ ...prev, selling_price: e.target.value }))} placeholder="0.00" name="selling_price" autoComplete="off" />
      </Field>
      <Field label="Discount" htmlFor="sale-discount" hint="Per-unit markdown">
        <Input id="sale-discount" type="number" inputMode="decimal" step="0.01" value={draft.discount} onChange={(e) => setDraft((prev) => ({ ...prev, discount: e.target.value }))} placeholder="0.00" name="discount" autoComplete="off" />
      </Field>
    </div>
  );
}

function DeviceDraftFields({
  draft,
  setDraft,
  devices,
}: {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  devices: Device[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="In-stock device" htmlFor="sale-device" hint="IMEI / serial must be in_stock">
        <Select
          value={draft.device_id || "none"}
          onValueChange={(v) => {
            const d = devices.find((x) => x.id === v);
            setDraft((prev) => ({ ...prev, device_id: v === "none" ? "" : v, selling_price: d ? String(d.selling_price) : prev.selling_price }));
          }}
        >
          <SelectTrigger id="sale-device"><SelectValue placeholder="Select in-stock device" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select device</SelectItem>
            {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.product_name} · {d.serial_number} {d.imei ? `(${d.imei})` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Price" htmlFor="sale-device-price">
          <Input id="sale-device-price" type="number" inputMode="decimal" step="0.01" value={draft.selling_price} onChange={(e) => setDraft((prev) => ({ ...prev, selling_price: e.target.value }))} placeholder="0.00" name="selling_price" autoComplete="off" />
        </Field>
        <Field label="Discount" htmlFor="sale-device-discount">
          <Input id="sale-device-discount" type="number" inputMode="decimal" step="0.01" value={draft.discount} onChange={(e) => setDraft((prev) => ({ ...prev, discount: e.target.value }))} placeholder="0.00" name="discount" autoComplete="off" />
        </Field>
        <Field label="Warranty" htmlFor="sale-warranty" hint="Months, overrides category default">
          <Input id="sale-warranty" type="number" inputMode="numeric" value={draft.warranty_override} onChange={(e) => setDraft((prev) => ({ ...prev, warranty_override: e.target.value }))} placeholder="Warranty mo" min="0" max="60" name="warranty_override" autoComplete="off" />
        </Field>
      </div>
    </div>
  );
}

export default function SalesPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const { state: bizState } = useBusiness();
  const barcodeEnabled = Boolean(bizState.features.barcode_scanning);
  const scanningDisabled = !bizState.loading && !barcodeEnabled;

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
  const [draft, setDraft] = useState<DraftState>({ mode: "product", product_id: "", device_id: "", quantity: "1", selling_price: "0.00", discount: "0.00", warranty_override: "" });
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<"product" | "device">("product");
  const [returnOpen, setReturnOpen] = useState<string | null>(null);
  const [returnForm, setReturnForm] = useState<{ items: { sale_item_id: string; quantity: string; refund: string; checked: boolean }[]; reason: string; refund_method: string; restock: boolean; notes: string }>({ items: [], reason: "other", refund_method: "cash", restock: true, notes: "" });
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

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
  }, [token]);

  async function handleScan(code: string) {
    const clean = code.trim();
    if (!clean) return;
    if (scannerMode === "product") {
      const r = await fetch(`${API_URL}/api/v1/scan/by-barcode/${encodeURIComponent(clean)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { setError(await r.text()); return; }
      const p = await r.json();
      setDraft((prev) => ({ ...prev, mode: "product", product_id: p.id, selling_price: String(p.selling_price), quantity: "1" }));
      setError("");
    } else {
      let dr = await fetch(`${API_URL}/api/v1/scan/by-imei/${encodeURIComponent(clean)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!dr.ok) dr = await fetch(`${API_URL}/api/v1/scan/by-serial/${encodeURIComponent(clean)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!dr.ok) { setError(await dr.text()); return; }
      const d = await dr.json();
      if (d.status !== "in_stock") { setError(`Device ${clean} status ${d.status} not sellable`); return; }
      setDraft((prev) => ({ ...prev, mode: "device", device_id: d.id, selling_price: String(d.selling_price) }));
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
    if (!quickCustomer.name.trim()) {
      setError("Customer name required");
      return;
    }
    const res = await fetch(`${API_URL}/api/v1/customers/`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: quickCustomer.name.trim(), phone: quickCustomer.phone.trim() || null }) });
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
      if (qty <= 0) { setError("Quantity must be > 0"); return; }
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
    setDraft((prev) => ({ mode: prev.mode, product_id: "", device_id: "", quantity: "1", selling_price: "0.00", discount: "0.00", warranty_override: "" }));
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

  async function doComplete(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/sales/${id}/complete`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError(await res.text()); return; }
      await load();
    } finally {
      setActionBusy(null);
      setConfirmComplete(null);
    }
  }

  async function doCancel(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/sales/${id}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError(await res.text()); return; }
      await load();
    } finally {
      setActionBusy(null);
      setConfirmCancel(null);
    }
  }

  async function doDelete(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/sales/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError(await res.text()); return; }
      await load();
    } finally {
      setActionBusy(null);
      setConfirmDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Sales</PageHeaderTitle>
          <PageHeaderDescription>Point of sale — draft a sale, complete it, or handle returns</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions data-tour="new-sale-btn">
          <HelpButton slug="sales-pos" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setForm({ customer_id: "", location_id: "", payment_method: "cash", notes: "" }); setItems([]); setError(""); }} className="min-h-11">New Sale</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto max-w-[min(calc(100%-1rem),56rem)]">
              <DialogHeader>
                <DialogTitle>New Sale</DialogTitle>
                <DialogDescription>Draft a sale — Complete will deduct stock and mark devices sold atomically</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <Field label="Customer" htmlFor="sale-customer" hint="Optional — quick-add below">
                      <Select value={form.customer_id || "none"} onValueChange={(v) => setForm({ ...form, customer_id: v === "none" ? "" : v })}>
                        <SelectTrigger id="sale-customer"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="flex gap-2">
                      <Field label="Quick add name" htmlFor="quick-name" className="flex-1">
                        <Input id="quick-name" placeholder="Name…" value={quickCustomer.name} onChange={(e) => setQuickCustomer({ ...quickCustomer, name: e.target.value })} name="quick_name" autoComplete="name" className="flex-1" />
                      </Field>
                      <Field label="Phone" htmlFor="quick-phone" className="w-32">
                        <Input id="quick-phone" placeholder="Phone…" type="tel" inputMode="tel" value={quickCustomer.phone} onChange={(e) => setQuickCustomer({ ...quickCustomer, phone: e.target.value })} className="w-32" name="quick_phone" autoComplete="tel" />
                      </Field>
                      <Button type="button" variant="outline" onClick={handleQuickAddCustomer} className="self-end min-h-11">Add</Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Field label="Location" htmlFor="sale-location" hint="Optional">
                      <Select value={form.location_id || "none"} onValueChange={(v) => setForm({ ...form, location_id: v === "none" ? "" : v })}>
                        <SelectTrigger id="sale-location"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Payment method" htmlFor="sale-payment" required>
                      <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                        <SelectTrigger id="sale-payment"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="mobile_money">Mobile Money</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>
                <Field label="Notes" htmlFor="sale-notes" hint="Optional reference">
                  <Input id="sale-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes…" name="notes" autoComplete="off" />
                </Field>

                <div data-tour="sale-items" className="rounded-md border border-hairline p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">Items ({items.length}) · Total: <span className="tabular-nums">{formatCurrency(totalFor(items))}</span></span>
                    <Select value={draft.mode} onValueChange={(v) => {
                      const prod = products[0];
                      setDraft((prev) => ({ ...prev, mode: v as "product" | "device", selling_price: v === "product" && prod ? String(prod.selling_price) : prev.selling_price }));
                    }}>
                      <SelectTrigger className="w-32" aria-label="Item type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product">Product</SelectItem>
                        <SelectItem value="device">Device</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 w-full justify-center"
                      onClick={() => { setScannerMode(draft.mode); setScannerOpen(true); }}
                      disabled={scanningDisabled}
                      aria-describedby={scanningDisabled ? "scan-disabled-hint" : undefined}
                    >
                      Scan {draft.mode === "product" ? "Barcode" : "IMEI / Serial"}
                    </Button>
                    {scanningDisabled ? (
                      <p id="scan-disabled-hint" className="text-xs text-muted-foreground rounded-md border border-dashed border-border bg-surface px-3 py-2">
                        Barcode scanning is disabled for this business. Ask your platform admin to enable <span className="font-medium text-foreground">barcode_scanning</span> in Admin → Features.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Camera uses HTTPS. Serialized devices must be in_stock.</p>
                    )}
                  </div>

                  {draft.mode === "product" ? (
                    <ProductDraftFields draft={draft} setDraft={setDraft} products={products} />
                  ) : (
                    <DeviceDraftFields draft={draft} setDraft={setDraft} devices={devices} />
                  )}
                  <Button type="button" variant="outline" onClick={addItem} className="min-h-11">Add Item</Button>

                  {items.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <caption className="sr-only">Cart items</caption>
                        <TableHeader>
                          <TableRow>
                            <TableHead scope="col">Type</TableHead>
                            <TableHead scope="col">Detail</TableHead>
                            <TableHead scope="col" className="text-right">Qty</TableHead>
                            <TableHead scope="col" className="text-right">Price</TableHead>
                            <TableHead scope="col"><span className="sr-only">Remove</span></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((it, idx) => (
                            <TableRow key={idx}>
                              <TableCell><Badge variant="secondary" className="rounded-full">{it.mode}</Badge></TableCell>
                              <TableCell className="text-xs max-w-[220px] truncate">{it.mode === "product" ? products.find((p) => p.id === it.product_id)?.name || it.product_id.slice(0, 8) : devices.find((d) => d.id === it.device_id)?.serial_number || it.device_id.slice(0, 8)}</TableCell>
                              <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(parseFloat(it.selling_price) - parseFloat(it.discount || "0"))}</TableCell>
                              <TableCell className="text-right"><Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="min-h-9">Remove</Button></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2 border border-dashed border-border rounded-md bg-surface">No items yet — add a product or pick an in-stock device.</p>
                  )}
                </div>

                <Button type="submit" size="lg" className="min-h-11">Create Draft</Button>
              </form>
            </DialogContent>
          </Dialog>
        </PageHeaderActions>
      </PageHeader>

      {error ? <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-destructive/20 bg-destructive/10 rounded-md p-3">{error}</p> : null}

      <Card data-tour="sales-table" className="border-border">
        <CardHeader>
          <CardTitle className="text-base">All Sales</CardTitle>
          <CardDescription>Draft → Complete (stock) · Cancel restocks completed sales · Returns on completed</CardDescription>
        </CardHeader>
        <CardContent>
          {sales.length ? (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">All sales with status and actions</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Date</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col">Payment</TableHead>
                    <TableHead scope="col">Items</TableHead>
                    <TableHead scope="col" className="text-right">Total</TableHead>
                    <TableHead scope="col" className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs tabular-nums">{formatDate(s.sale_date)}</TableCell>
                      <TableCell><Badge variant={s.status === "completed" ? "default" : s.status === "cancelled" ? "destructive" : "secondary"} className="rounded-full">{s.status}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="rounded-full">{PAYMENT_METHOD_LABELS[s.payment_method] ?? s.payment_method}</Badge></TableCell>
                      <TableCell className="text-xs">{s.items.length} item{s.items.length !== 1 ? "s" : ""} {s.items.some((i) => i.device_id) ? "(+devices)" : ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(s.total_amount)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {s.status === "draft" ? <Button size="sm" onClick={() => setConfirmComplete(s.id)} className="min-h-11">Complete</Button> : null}
                          {s.status === "completed" ? <Button variant="outline" size="sm" onClick={() => openReturn(s)} className="min-h-11">Return</Button> : null}
                          {s.status !== "cancelled" ? <Button variant="outline" size="sm" onClick={() => setConfirmCancel(s.id)} className="min-h-11">Cancel</Button> : null}
                          <Button variant="outline" size="sm" onClick={() => setConfirmDelete(s.id)} disabled={s.status !== "draft"} className="min-h-11 disabled:opacity-50">Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState title="No sales yet" description="Draft your first sale — add products or serialized devices, then Complete to deduct stock atomically.">
              <Button onClick={() => setOpen(true)} className="min-h-11">New Sale</Button>
            </EmptyState>
          )}
        </CardContent>
      </Card>

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onDetected={handleScan} />

      <ConfirmDialog
        open={!!confirmComplete}
        onOpenChange={(v) => !v && setConfirmComplete(null)}
        title="Complete sale?"
        description="Stock will be deducted and serialized devices marked sold. This is atomic and cannot be undone without a Cancel or Return."
        confirmLabel="Complete sale"
        onConfirm={() => {
          if (confirmComplete) void doComplete(confirmComplete);
        }}
        loading={actionBusy === confirmComplete}
      />
      <ConfirmDialog
        open={!!confirmCancel}
        onOpenChange={(v) => !v && setConfirmCancel(null)}
        title="Cancel sale?"
        description="Completed sales will restock inventory and revert device status. Drafts will be voided."
        confirmLabel="Cancel sale"
        variant="destructive"
        onConfirm={() => {
          if (confirmCancel) void doCancel(confirmCancel);
        }}
        loading={actionBusy === confirmCancel}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete draft sale?"
        description="Only draft sales can be deleted. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) void doDelete(confirmDelete);
        }}
        loading={actionBusy === confirmDelete}
      />

      <Dialog open={!!returnOpen} onOpenChange={(v) => !v && setReturnOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-[min(calc(100%-1rem),56rem)]">
          <DialogHeader><DialogTitle>Return Items</DialogTitle><DialogDescription>Select items to return, adjust refund, and choose whether to restock</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-4">
            {returnForm.items.map((it, idx) => {
              const si = sales.find((s) => s.id === returnOpen)?.items.find((x) => x.id === it.sale_item_id);
              const checkboxId = `return-${it.sale_item_id}`;
              return (
                <div key={it.sale_item_id} className="flex flex-col gap-2 sm:flex-row sm:items-center border border-hairline rounded-md p-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input id={checkboxId} type="checkbox" checked={it.checked} onChange={(e) => setReturnForm({ ...returnForm, items: returnForm.items.map((x, i) => i === idx ? { ...x, checked: e.target.checked } : x) })} className="size-4 rounded border-input" />
                    <Label htmlFor={checkboxId} className="text-sm flex-1 min-w-0 cursor-pointer tabular-nums font-normal">
                      {si?.product_id ? `Product ${si.product_id.slice(0, 8)}` : `Device ${si?.device_id?.slice(0, 8)}`} · qty {si?.quantity}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2 sm:ml-auto">
                    <Field label="Qty" htmlFor={`return-qty-${idx}`} className="w-20">
                      <Input id={`return-qty-${idx}`} type="number" inputMode="numeric" value={it.quantity} onChange={(e) => setReturnForm({ ...returnForm, items: returnForm.items.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x) })} min="1" name={`return_qty_${idx}`} autoComplete="off" />
                    </Field>
                    <Field label="Refund" htmlFor={`return-refund-${idx}`} className="w-28">
                      <Input id={`return-refund-${idx}`} type="number" inputMode="decimal" step="0.01" value={it.refund} onChange={(e) => setReturnForm({ ...returnForm, items: returnForm.items.map((x, i) => i === idx ? { ...x, refund: e.target.value } : x) })} placeholder="Refund" name={`return_refund_${idx}`} autoComplete="off" />
                    </Field>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Reason" htmlFor="return-reason">
                <Select value={returnForm.reason} onValueChange={(v) => setReturnForm({ ...returnForm, reason: v })}>
                  <SelectTrigger id="return-reason"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="wrong_item">Wrong item</SelectItem>
                    <SelectItem value="warranty">Warranty</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Refund method" htmlFor="return-method">
                <Select value={returnForm.refund_method} onValueChange={(v) => setReturnForm({ ...returnForm, refund_method: v })}>
                  <SelectTrigger id="return-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <input id="return-restock" type="checkbox" checked={returnForm.restock} onChange={(e) => setReturnForm({ ...returnForm, restock: e.target.checked })} className="size-4 rounded border-input" />
              <Label htmlFor="return-restock" className="cursor-pointer font-normal">Restock — return units to inventory</Label>
            </div>
            <Field label="Notes" htmlFor="return-notes" hint="Optional">
              <Input id="return-notes" value={returnForm.notes} onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })} placeholder="Notes…" name="return_notes" autoComplete="off" />
            </Field>
            <Button onClick={submitReturn} className="min-h-11">Submit Return</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
