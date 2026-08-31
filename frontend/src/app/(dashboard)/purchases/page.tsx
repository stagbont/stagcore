"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/help/help-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { formatCurrency, formatDate } from "@/lib/format";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type PurchaseItem = { id: string; product_id: string | null; quantity: number; unit_cost: string; serial_number: string | null; imei: string | null; product_name: string | null };
type Purchase = { id: string; invoice_reference: string | null; purchase_date: string; status: string; payment_status: string; supplier_id: string | null; location_id: string | null; notes: string | null; items: PurchaseItem[] };
type Product = { id: string; name: string; sku: string | null };
type Supplier = { id: string; name: string };
type Location = { id: string; name: string };

type DraftState = { mode: "product" | "device"; product_id: string; quantity: string; unit_cost: string; serial_number: string; imei: string; product_name: string };

function PurchaseProductFields({
  draft,
  setDraft,
  products,
  errors,
}: {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  products: Product[];
  errors: { product?: string; quantity?: string };
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Field label="Product" htmlFor="purchase-product" error={errors.product} required>
        <Select value={draft.product_id || "none"} onValueChange={(v) => setDraft((prev) => ({ ...prev, product_id: v === "none" ? "" : v }))}>
          <SelectTrigger id="purchase-product"><SelectValue placeholder="Select product…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select product…</SelectItem>
            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Qty" htmlFor="purchase-qty" error={errors.quantity} hint="Units" required>
        <Input id="purchase-qty" type="number" inputMode="numeric" value={draft.quantity} onChange={(e) => setDraft((prev) => ({ ...prev, quantity: e.target.value }))} min={1} step={1} placeholder="1…" autoComplete="off" aria-invalid={errors.quantity ? true : undefined} />
      </Field>
      <Field label="Unit cost" htmlFor="purchase-cost" hint="Per unit">
        <Input id="purchase-cost" type="number" inputMode="decimal" step="0.01" value={draft.unit_cost} onChange={(e) => setDraft((prev) => ({ ...prev, unit_cost: e.target.value }))} placeholder="0.00…" autoComplete="off" />
      </Field>
    </div>
  );
}

function PurchaseDeviceFields({
  draft,
  setDraft,
  errors,
}: {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  errors: { product_name?: string; serial?: string };
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Product name" htmlFor="purchase-device-name" error={errors.product_name} required>
          <Input id="purchase-device-name" value={draft.product_name} onChange={(e) => setDraft((prev) => ({ ...prev, product_name: e.target.value }))} placeholder="e.g. iPhone 14…" autoComplete="off" aria-invalid={errors.product_name ? true : undefined} />
        </Field>
        <Field label="Serial" htmlFor="purchase-serial" error={errors.serial} required>
          <Input id="purchase-serial" value={draft.serial_number} onChange={(e) => setDraft((prev) => ({ ...prev, serial_number: e.target.value }))} placeholder="Serial…" autoComplete="off" aria-invalid={errors.serial ? true : undefined} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="IMEI" htmlFor="purchase-imei" hint="Optional">
          <Input id="purchase-imei" value={draft.imei} onChange={(e) => setDraft((prev) => ({ ...prev, imei: e.target.value }))} placeholder="IMEI…" inputMode="numeric" autoComplete="off" />
        </Field>
        <Field label="Unit cost" htmlFor="purchase-device-cost" hint="Per device">
          <Input id="purchase-device-cost" type="number" inputMode="decimal" step="0.01" value={draft.unit_cost} onChange={(e) => setDraft((prev) => ({ ...prev, unit_cost: e.target.value }))} placeholder="0.00…" autoComplete="off" />
        </Field>
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ supplier_id: "", location_id: "", invoice_reference: "", payment_status: "pending", notes: "" });
  const [items, setItems] = useState<{ product_id: string; quantity: string; unit_cost: string; serial_number: string; imei: string; product_name: string; mode: "product" | "device" }[]>([]);
  const [draft, setDraft] = useState<DraftState>({ mode: "product", product_id: "", quantity: "1", unit_cost: "0.00", serial_number: "", imei: "", product_name: "" });
  const [draftErrors, setDraftErrors] = useState<{ product?: string; quantity?: string; product_name?: string; serial?: string }>({});
  const [itemsError, setItemsError] = useState<string | undefined>(undefined);
  const [confirmReceive, setConfirmReceive] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError("");
    const [purRes, prodRes, supRes, locRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/purchases`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/products/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/suppliers/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/locations/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (!purRes.ok) {
      setError(await purRes.text());
      return;
    }
    setPurchases(await purRes.json());
    if (prodRes.ok) setProducts(await prodRes.json());
    if (supRes.ok) setSuppliers(await supRes.json());
    else setSuppliers([]);
    if (locRes.ok) setLocations(await locRes.json());
    else setLocations([]);
  }

  useEffect(() => {
    load();
  }, [token]);

  function addItem() {
    setDraftErrors({});
    setItemsError(undefined);
    setError("");
    if (draft.mode === "product") {
      const errs: { product?: string; quantity?: string } = {};
      if (!draft.product_id) errs.product = "Select a product";
      const qty = parseInt(draft.quantity);
      if (!draft.quantity || Number.isNaN(qty) || qty <= 0) errs.quantity = "Enter quantity > 0";
      if (Object.keys(errs).length) {
        setDraftErrors(errs);
        setError(errs.product || errs.quantity || "Fix the highlighted fields");
        return;
      }
      setItems([...items, { product_id: draft.product_id, quantity: draft.quantity, unit_cost: draft.unit_cost || "0.00", serial_number: "", imei: "", product_name: "", mode: "product" }]);
    } else {
      const errs: { product_name?: string; serial?: string } = {};
      if (!draft.product_name.trim()) errs.product_name = "Product name required";
      if (!draft.serial_number.trim()) errs.serial = "Serial required";
      if (Object.keys(errs).length) {
        setDraftErrors(errs);
        setError(errs.product_name || errs.serial || "Fix the highlighted fields");
        return;
      }
      setItems([...items, { product_id: "", quantity: "1", unit_cost: draft.unit_cost || "0.00", serial_number: draft.serial_number.trim(), imei: draft.imei.trim() || "", product_name: draft.product_name.trim(), mode: "device" }]);
    }
    setDraft((prev) => ({ mode: prev.mode, product_id: "", quantity: "1", unit_cost: "0.00", serial_number: "", imei: "", product_name: "" }));
    setError("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setItemsError(undefined);
    if (!items.length) {
      setItemsError("Add at least one item");
      setError("Add at least one item");
      return;
    }
    const body = {
      supplier_id: form.supplier_id || null,
      location_id: form.location_id || null,
      invoice_reference: form.invoice_reference || null,
      payment_status: form.payment_status,
      notes: form.notes || null,
      items: items.map((it) =>
        it.mode === "product"
          ? { product_id: it.product_id, quantity: parseInt(it.quantity), unit_cost: it.unit_cost }
          : { quantity: 1, unit_cost: it.unit_cost, serial_number: it.serial_number, imei: it.imei || null, product_name: it.product_name }
      ),
    };
    const res = await fetch(`${API_URL}/api/v1/purchases`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setOpen(false);
    setForm({ supplier_id: "", location_id: "", invoice_reference: "", payment_status: "pending", notes: "" });
    setItems([]);
    setDraftErrors({});
    setItemsError(undefined);
    load();
  }

  async function doReceive(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/purchases/${id}/receive`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError(await res.text()); return; }
      await load();
    } finally {
      setActionBusy(null);
      setConfirmReceive(null);
    }
  }

  async function doCancel(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/purchases/${id}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
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
      const res = await fetch(`${API_URL}/api/v1/purchases/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
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
          <PageHeaderTitle>Purchases</PageHeaderTitle>
          <PageHeaderDescription>Goods receiving — increases stock via ledger</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="purchases" />
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setDraftErrors({}); setItemsError(undefined); } }}>
            <DialogTrigger asChild>
              <Button onClick={() => { setForm({ supplier_id: "", location_id: "", invoice_reference: "", payment_status: "pending", notes: "" }); setItems([]); setDraftErrors({}); setItemsError(undefined); setError(""); }} className="min-h-11">New Purchase</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Purchase</DialogTitle>
                <DialogDescription>Draft a purchase — Receive will increase stock and create devices via the ledger</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="flex flex-col gap-4" noValidate>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Supplier" htmlFor="purchase-supplier" hint="Optional">
                    <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                      <SelectTrigger id="purchase-supplier"><SelectValue placeholder="None…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Location" htmlFor="purchase-location" hint="Optional">
                    <Select value={form.location_id || "none"} onValueChange={(v) => setForm({ ...form, location_id: v === "none" ? "" : v })}>
                      <SelectTrigger id="purchase-location"><SelectValue placeholder="None…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Invoice ref" htmlFor="purchase-invoice" hint="Optional">
                    <Input id="purchase-invoice" value={form.invoice_reference} onChange={(e) => setForm({ ...form, invoice_reference: e.target.value })} placeholder="INV-001…" autoComplete="off" />
                  </Field>
                  <Field label="Payment status" htmlFor="purchase-payment">
                    <Select value={form.payment_status} onValueChange={(v) => setForm({ ...form, payment_status: v })}>
                      <SelectTrigger id="purchase-payment"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Notes" htmlFor="purchase-notes" hint="Optional">
                  <Input id="purchase-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes…" autoComplete="off" />
                </Field>

                <div className="rounded-md border border-hairline p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">Items ({items.length})</span>
                    <Field label="Item type" htmlFor="purchase-draft-mode" className="w-36">
                      <Select value={draft.mode} onValueChange={(v) => { setDraftErrors({}); setDraft({ ...draft, mode: v as "product" | "device" }); }}>
                        <SelectTrigger id="purchase-draft-mode" aria-label="Item type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product">Product</SelectItem>
                          <SelectItem value="device">Device</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  {draft.mode === "product" ? (
                    <PurchaseProductFields draft={draft} setDraft={setDraft} products={products} errors={{ product: draftErrors.product, quantity: draftErrors.quantity }} />
                  ) : (
                    <PurchaseDeviceFields draft={draft} setDraft={setDraft} errors={{ product_name: draftErrors.product_name, serial: draftErrors.serial }} />
                  )}
                  <Button type="button" variant="outline" onClick={addItem} className="min-h-11">Add Item</Button>
                  {itemsError ? <p role="alert" className="text-xs text-[var(--status-critical)]">{itemsError}</p> : null}
                  {items.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <caption className="sr-only">Purchase cart items</caption>
                        <TableHeader>
                          <TableRow>
                            <TableHead scope="col">Type</TableHead>
                            <TableHead scope="col">Detail</TableHead>
                            <TableHead scope="col" className="text-right">Qty</TableHead>
                            <TableHead scope="col" className="text-right">Cost</TableHead>
                            <TableHead scope="col"><span className="sr-only">Remove</span></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((it, idx) => (
                            <TableRow key={idx}>
                              <TableCell><Badge variant="secondary" className="rounded-full">{it.mode}</Badge></TableCell>
                              <TableCell className="text-xs max-w-[200px] truncate">{it.mode === "product" ? products.find((p) => p.id === it.product_id)?.name || it.product_id.slice(0, 8) : `${it.product_name} · ${it.serial_number}`}</TableCell>
                              <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(it.unit_cost)}</TableCell>
                              <TableCell className="text-right"><Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="min-h-9">Remove</Button></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border bg-surface px-4 py-6 text-center">
                      <p className="text-sm text-muted-foreground">No items yet — add a product or device.</p>
                    </div>
                  )}
                </div>

                <Button type="submit" className="min-h-11">Create Draft</Button>
              </form>
            </DialogContent>
          </Dialog>
        </PageHeaderActions>
      </PageHeader>

      {error ? <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-destructive/20 bg-destructive/10 rounded-md p-3">{error}</p> : null}

      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">All Purchases</CardTitle>
          <CardDescription>Draft → Receive (stock) / Cancel</CardDescription>
        </CardHeader>
        <CardContent>
          {purchases.length ? (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">All purchases with status and actions</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Invoice</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col">Items</TableHead>
                    <TableHead scope="col">Date</TableHead>
                    <TableHead scope="col" className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium tabular-nums text-xs">{p.invoice_reference || p.id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "received" ? "default" : p.status === "cancelled" ? "destructive" : "secondary"} className="rounded-full">{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{p.items.length} item{p.items.length !== 1 ? "s" : ""} {p.items.some((i) => i.serial_number) ? "(+devices)" : ""}</TableCell>
                      <TableCell className="text-xs tabular-nums">{formatDate(p.purchase_date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {p.status === "draft" ? <Button size="sm" onClick={() => setConfirmReceive(p.id)} className="min-h-9" aria-busy={actionBusy === p.id} disabled={actionBusy === p.id}>Receive</Button> : null}
                          {p.status === "draft" ? <Button variant="outline" size="sm" onClick={() => setConfirmCancel(p.id)} className="min-h-9" aria-busy={actionBusy === p.id} disabled={actionBusy === p.id}>Cancel</Button> : null}
                          <Button variant="outline" size="sm" onClick={() => setConfirmDelete(p.id)} disabled={p.status !== "draft" || actionBusy === p.id} className="min-h-9 disabled:opacity-50">Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState title="No purchases yet" description="Create a draft purchase with products or serialized devices, then Receive to update stock.">
              <Button onClick={() => setOpen(true)} className="min-h-11">New Purchase</Button>
            </EmptyState>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmReceive}
        onOpenChange={(v) => !v && setConfirmReceive(null)}
        title="Receive purchase?"
        description="Stock will be increased and devices created. This writes ledger entries and cannot be undone without a reversal."
        confirmLabel="Receive"
        onConfirm={() => { if (confirmReceive) void doReceive(confirmReceive); }}
        loading={actionBusy === confirmReceive}
      />
      <ConfirmDialog
        open={!!confirmCancel}
        onOpenChange={(v) => !v && setConfirmCancel(null)}
        title="Cancel purchase?"
        description="This draft purchase will be cancelled and cannot be received."
        confirmLabel="Cancel purchase"
        variant="destructive"
        onConfirm={() => { if (confirmCancel) void doCancel(confirmCancel); }}
        loading={actionBusy === confirmCancel}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete draft purchase?"
        description="Only draft purchases can be deleted. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDelete) void doDelete(confirmDelete); }}
        loading={actionBusy === confirmDelete}
      />
    </div>
  );
}
