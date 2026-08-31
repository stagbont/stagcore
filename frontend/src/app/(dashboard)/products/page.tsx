"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { HelpButton } from "@/components/help/help-button";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/page-header";
import { formatCurrency } from "@/lib/format";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type Product = { id: string; name: string; sku: string | null; barcode: string | null; brand: string | null; cost_price: string; selling_price: string; status: string; category_id: string | null; supplier_id: string | null; minimum_stock_level: number; unit_of_measurement: string };
type Category = { id: string; name: string };
type Supplier = { id: string; name: string };

export default function ProductsPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: "", sku: "", barcode: "", brand: "", cost_price: "0.00", selling_price: "0.00", minimum_stock_level: 0, unit_of_measurement: "pcs", status: "active", category_id: "", supplier_id: "" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError("");
    const [prodRes, catRes, supRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/products/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/categories/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/suppliers/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (!prodRes.ok) {
      setError(await prodRes.text());
      return;
    }
    setItems(await prodRes.json());
    if (catRes.ok) setCategories(await catRes.json());
    if (supRes.ok) setSuppliers(await supRes.json());
    else setSuppliers([]);
  }

  useEffect(() => {
    load();
  }, [token]);

  const filtered = items.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(q.toLowerCase())) || (p.barcode && p.barcode.includes(q)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editing ? `${API_URL}/api/v1/products/${editing.id}` : `${API_URL}/api/v1/products/`;
    const method = editing ? "PATCH" : "POST";
    const body: Record<string, unknown> = {
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      brand: form.brand || null,
      cost_price: form.cost_price,
      selling_price: form.selling_price,
      minimum_stock_level: form.minimum_stock_level,
      unit_of_measurement: form.unit_of_measurement,
      status: form.status,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
    };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setOpen(false);
    setEditing(null);
    setForm({ name: "", sku: "", barcode: "", brand: "", cost_price: "0.00", selling_price: "0.00", minimum_stock_level: 0, unit_of_measurement: "pcs", status: "active", category_id: "", supplier_id: "" });
    load();
  }

  async function doDelete(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/products/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      await load();
    } finally {
      setActionBusy(null);
      setConfirmDelete(null);
    }
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ name: p.name, sku: p.sku || "", barcode: p.barcode || "", brand: p.brand || "", cost_price: String(p.cost_price), selling_price: String(p.selling_price), minimum_stock_level: p.minimum_stock_level, unit_of_measurement: p.unit_of_measurement, status: p.status, category_id: p.category_id || "", supplier_id: p.supplier_id || "" });
    setOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: "", sku: "", barcode: "", brand: "", cost_price: "0.00", selling_price: "0.00", minimum_stock_level: 0, unit_of_measurement: "pcs", status: "active", category_id: "", supplier_id: "" });
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Products</PageHeaderTitle>
          <PageHeaderDescription>Non-serialized inventory (accessories, etc.)</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="products" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="min-h-11">New Product</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Product" : "New Product"}</DialogTitle>
                <DialogDescription>Manage accessory and non-serialized items</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Field label="Name" htmlFor="product-name" required hint="Display name">
                  <Input id="product-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Wireless Mouse…" autoComplete="off" />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="SKU" htmlFor="product-sku" hint="Unique per business, optional">
                    <Input id="product-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. SKU-001…" autoComplete="off" className="tabular-nums" />
                  </Field>
                  <Field label="Barcode" htmlFor="product-barcode" hint="Scan or type">
                    <Input id="product-barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="e.g. 012345678901…" autoComplete="off" inputMode="numeric" className="tabular-nums" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Brand" htmlFor="product-brand" hint="Optional">
                    <Input id="product-brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Logitech…" autoComplete="off" />
                  </Field>
                  <Field label="Status" htmlFor="product-status">
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger id="product-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Category" htmlFor="product-category" hint="Optional">
                    <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                      <SelectTrigger id="product-category">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Supplier" htmlFor="product-supplier" hint="Optional">
                    <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                      <SelectTrigger id="product-supplier">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Cost price" htmlFor="product-cost" hint="What you paid">
                    <Input id="product-cost" type="number" inputMode="decimal" step="0.01" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} placeholder="0.00" autoComplete="off" className="tabular-nums" />
                  </Field>
                  <Field label="Selling price" htmlFor="product-selling" hint="Customer price">
                    <Input id="product-selling" type="number" inputMode="decimal" step="0.01" min="0" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} placeholder="0.00" autoComplete="off" className="tabular-nums" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Min stock" htmlFor="product-min-stock" hint="Alert threshold">
                    <Input id="product-min-stock" type="number" inputMode="numeric" min="0" step="1" value={form.minimum_stock_level} onChange={(e) => setForm({ ...form, minimum_stock_level: parseInt(e.target.value) || 0 })} placeholder="0" autoComplete="off" className="tabular-nums" />
                  </Field>
                  <Field label="Unit" htmlFor="product-unit" hint="e.g. pcs, box">
                    <Input id="product-unit" value={form.unit_of_measurement} onChange={(e) => setForm({ ...form, unit_of_measurement: e.target.value })} placeholder="e.g. pcs…" autoComplete="off" />
                  </Field>
                </div>
                <Button type="submit" className="min-h-11">{editing ? "Save" : "Create"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </PageHeaderActions>
      </PageHeader>
      {error && <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-border rounded-md p-3 bg-surface">{error}</p>}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">All Products</CardTitle>
          <div className="pt-2">
            <Input type="search" placeholder="Search by name, SKU, barcode…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-sm" aria-label="Search products" autoComplete="off" spellCheck={false} enterKeyHint="search" inputMode="search" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <Table>
              <caption className="sr-only">All products</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Name</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">SKU</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Price</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Status</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <div>{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.brand || ""}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">{p.sku || "—"}</TableCell>
                    <TableCell className="tabular-nums text-right">{formatCurrency(p.selling_price)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"} className="rounded-full">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => openEdit(p)} className="min-h-9">
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(p.id)} className="min-h-9">
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No products yet" description={q ? "No products match your search." : "Add your first accessory or non-serialized item to start tracking stock."}>
              <Button onClick={openCreate} className="min-h-11">New Product</Button>
            </EmptyState>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete product?"
        description="This will permanently remove the product. Inventory movements remain in the ledger."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDelete) void doDelete(confirmDelete); }}
        loading={actionBusy === confirmDelete}
      />
    </div>
  );
}
