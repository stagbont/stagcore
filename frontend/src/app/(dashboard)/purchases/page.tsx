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
type PurchaseItem = { id: string; product_id: string | null; quantity: number; unit_cost: string; serial_number: string | null; imei: string | null; product_name: string | null };
type Purchase = { id: string; invoice_reference: string | null; purchase_date: string; status: string; payment_status: string; supplier_id: string | null; location_id: string | null; notes: string | null; items: PurchaseItem[] };
type Product = { id: string; name: string; sku: string | null };
type Supplier = { id: string; name: string };
type Location = { id: string; name: string };

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
  const [draft, setDraft] = useState({ mode: "product" as "product" | "device", product_id: "", quantity: "1", unit_cost: "0.00", serial_number: "", imei: "", product_name: "" });

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
    if (draft.mode === "product") {
      if (!draft.product_id || !draft.quantity) {
        setError("Select product and quantity");
        return;
      }
      setItems([...items, { product_id: draft.product_id, quantity: draft.quantity, unit_cost: draft.unit_cost || "0.00", serial_number: "", imei: "", product_name: "", mode: "product" }]);
    } else {
      if (!draft.product_name || !draft.serial_number) {
        setError("Device requires product name and serial");
        return;
      }
      setItems([...items, { product_id: "", quantity: "1", unit_cost: draft.unit_cost || "0.00", serial_number: draft.serial_number, imei: draft.imei, product_name: draft.product_name, mode: "device" }]);
    }
    setDraft({ mode: draft.mode, product_id: "", quantity: "1", unit_cost: "0.00", serial_number: "", imei: "", product_name: "" });
    setError("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length) {
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
    load();
  }

  async function handleReceive(id: string) {
    if (!confirm("Receive this purchase? This will increase stock and create devices.")) return;
    const res = await fetch(`${API_URL}/api/v1/purchases/${id}/receive`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    load();
  }

  async function handleCancel(id: string) {
    const res = await fetch(`${API_URL}/api/v1/purchases/${id}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this draft purchase?")) return;
    const res = await fetch(`${API_URL}/api/v1/purchases/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
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
          <h1 className="text-xl font-semibold">Purchases</h1>
          <p className="text-sm text-muted-foreground">Goods receiving — increases stock via ledger</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setForm({ supplier_id: "", location_id: "", invoice_reference: "", payment_status: "pending", notes: "" }); setItems([]); }}>New Purchase</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
            <DialogHeader>
              <DialogTitle>New Purchase</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Supplier (optional)</Label>
                  <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Invoice ref</Label>
                  <Input value={form.invoice_reference} onChange={(e) => setForm({ ...form, invoice_reference: e.target.value })} placeholder="INV-001" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Payment status</Label>
                  <Select value={form.payment_status} onValueChange={(v) => setForm({ ...form, payment_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
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
                  <Label className="font-medium">Items ({items.length})</Label>
                  <Select value={draft.mode} onValueChange={(v) => setDraft({ ...draft, mode: v as "product" | "device" })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">Product</SelectItem>
                      <SelectItem value="device">Device</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.mode === "product" ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={draft.product_id || "none"} onValueChange={(v) => setDraft({ ...draft, product_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select</SelectItem>
                        {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} min="1" placeholder="Qty" />
                    <Input type="number" step="0.01" value={draft.unit_cost} onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value })} placeholder="Cost" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={draft.product_name} onChange={(e) => setDraft({ ...draft, product_name: e.target.value })} placeholder="Product name (e.g. iPhone 14)" />
                      <Input value={draft.serial_number} onChange={(e) => setDraft({ ...draft, serial_number: e.target.value })} placeholder="Serial *" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={draft.imei} onChange={(e) => setDraft({ ...draft, imei: e.target.value })} placeholder="IMEI (optional)" />
                      <Input type="number" step="0.01" value={draft.unit_cost} onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value })} placeholder="Cost" />
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
                        <TableHead>Cost</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it, idx) => (
                        <TableRow key={idx}>
                          <TableCell><Badge variant="secondary" className="rounded-full">{it.mode}</Badge></TableCell>
                          <TableCell className="text-xs">{it.mode === "product" ? products.find((p) => p.id === it.product_id)?.name || it.product_id : `${it.product_name} ${it.serial_number}`}</TableCell>
                          <TableCell className="tabular-nums">{it.quantity}</TableCell>
                          <TableCell className="tabular-nums">{it.unit_cost}</TableCell>
                          <TableCell><Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}>Remove</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <Button type="submit">Create Draft</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {error && <p className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">{error}</p>}
      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">All Purchases</CardTitle>
          <CardDescription>Draft → Receive (stock) / Cancel</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium tabular-nums">{p.invoice_reference || p.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "received" ? "default" : p.status === "cancelled" ? "destructive" : "secondary"} className="rounded-full">{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{p.items.length} item{p.items.length !== 1 ? "s" : ""} {p.items.some((i) => i.serial_number) ? "(+devices)" : ""}</TableCell>
                  <TableCell className="text-xs tabular-nums">{new Date(p.purchase_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right flex gap-1 justify-end flex-wrap">
                    {p.status === "draft" && <Button size="sm" onClick={() => handleReceive(p.id)}>Receive</Button>}
                    {p.status === "draft" && <Button variant="outline" size="sm" onClick={() => handleCancel(p.id)}>Cancel</Button>}
                    <Button variant="outline" size="sm" onClick={() => handleDelete(p.id)} disabled={p.status !== "draft"}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!purchases.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No purchases yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
