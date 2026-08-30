"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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

  async function handleDelete(id: string) {
    if (!confirm("Delete this product?")) return;
    const res = await fetch(`${API_URL}/api/v1/products/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    load();
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Non-serialized inventory (accessories, etc.)</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>New Product</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Product" : "New Product"}</DialogTitle>
              <DialogDescription>Manage accessory and non-serialized items</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>SKU</Label>
                  <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="unique per business" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Barcode</Label>
                  <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Brand</Label>
                  <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Category</Label>
                  <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                    <SelectTrigger>
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
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Supplier</Label>
                  <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                    <SelectTrigger>
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
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Cost price</Label>
                  <Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Selling price</Label>
                  <Input type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Min stock</Label>
                  <Input type="number" value={form.minimum_stock_level} onChange={(e) => setForm({ ...form, minimum_stock_level: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Unit</Label>
                  <Input value={form.unit_of_measurement} onChange={(e) => setForm({ ...form, unit_of_measurement: e.target.value })} />
                </div>
              </div>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {error && <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-border rounded-md p-3 bg-surface">{error}</p>}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">All Products</CardTitle>
          <div className="pt-2">
            <Input placeholder="Search by name, SKU, barcode..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" aria-label="Search products" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <caption className="sr-only">All products</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Name</TableHead>
                <TableHead scope="col">SKU</TableHead>
                <TableHead scope="col">Price</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="text-right">Actions</TableHead>
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
                  <TableCell className="tabular-nums">{String(p.selling_price)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "active" ? "default" : "secondary"} className="rounded-full">
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(p.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No products yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
