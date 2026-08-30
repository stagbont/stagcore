"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/help/help-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type Device = { id: string; product_name: string; serial_number: string; imei: string | null; brand: string | null; status: string; cost_price: string; selling_price: string; category_id: string | null; supplier_id: string | null; spec: Record<string, unknown> | null };
type Category = { id: string; name: string };
type Supplier = { id: string; name: string };

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  in_stock: "default",
  sold: "secondary",
  in_repair: "outline",
  returned: "destructive",
};

export default function DevicesPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [items, setItems] = useState<Device[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState({ product_name: "", serial_number: "", imei: "", brand: "", spec: "", cost_price: "0.00", selling_price: "0.00", status: "in_stock", category_id: "", supplier_id: "" });

  async function load() {
    if (!token) return;
    setError("");
    const [devRes, catRes, supRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/devices/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/categories/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/suppliers/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (!devRes.ok) {
      setError(await devRes.text());
      return;
    }
    setItems(await devRes.json());
    if (catRes.ok) setCategories(await catRes.json());
    if (supRes.ok) setSuppliers(await supRes.json());
    else setSuppliers([]);
  }

  useEffect(() => {
    load();
  }, [token]);

  const filtered = items.filter((d) => !q || d.product_name.toLowerCase().includes(q.toLowerCase()) || d.serial_number.toLowerCase().includes(q.toLowerCase()) || (d.imei && d.imei.includes(q)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editing ? `${API_URL}/api/v1/devices/${editing.id}` : `${API_URL}/api/v1/devices/`;
    const method = editing ? "PATCH" : "POST";
    let spec: Record<string, unknown> | null = null;
    if (form.spec.trim()) {
      try {
        spec = JSON.parse(form.spec);
      } catch {
        setError("Spec must be valid JSON");
        return;
      }
    }
    const body: Record<string, unknown> = {
      product_name: form.product_name,
      serial_number: form.serial_number,
      imei: form.imei || null,
      brand: form.brand || null,
      spec,
      cost_price: form.cost_price,
      selling_price: form.selling_price,
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
    setForm({ product_name: "", serial_number: "", imei: "", brand: "", spec: "", cost_price: "0.00", selling_price: "0.00", status: "in_stock", category_id: "", supplier_id: "" });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this device?")) return;
    const res = await fetch(`${API_URL}/api/v1/devices/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    load();
  }

  function openEdit(d: Device) {
    setEditing(d);
    setForm({ product_name: d.product_name, serial_number: d.serial_number, imei: d.imei || "", brand: d.brand || "", spec: d.spec ? JSON.stringify(d.spec, null, 2) : "", cost_price: String(d.cost_price), selling_price: String(d.selling_price), status: d.status, category_id: d.category_id || "", supplier_id: d.supplier_id || "" });
    setOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ product_name: "", serial_number: "", imei: "", brand: "", spec: "", cost_price: "0.00", selling_price: "0.00", status: "in_stock", category_id: "", supplier_id: "" });
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Devices</h1>
          <p className="text-sm text-muted-foreground">Serialized units (IMEI/serial tracked)</p>
        </div>
        <div className="flex items-center gap-2">
        <HelpButton slug="devices" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>New Device</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Device" : "New Device"}</DialogTitle>
              <DialogDescription>Serialized inventory with spec, IMEI and serial</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Product name / Model *</Label>
                <Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Serial number *</Label>
                  <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} required className="tabular-nums" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>IMEI</Label>
                  <Input value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} placeholder="optional" className="tabular-nums" />
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
                      <SelectItem value="in_stock">In stock</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                      <SelectItem value="in_repair">In repair</SelectItem>
                      <SelectItem value="returned">Returned</SelectItem>
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
              <div className="flex flex-col gap-2">
                <Label>Spec (JSON)</Label>
                <Textarea value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder='{"ram":"8GB","storage":"256GB"}' rows={3} />
              </div>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      {error && <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-border rounded-md p-3 bg-surface">{error}</p>}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">All Devices</CardTitle>
          <div className="pt-2">
            <Input placeholder="Search by name, serial, IMEI..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm tabular-nums" aria-label="Search devices" inputMode="search" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <caption className="sr-only">All serialized devices</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Product</TableHead>
                <TableHead scope="col">Serial</TableHead>
                <TableHead scope="col">IMEI</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Price</TableHead>
                <TableHead scope="col" className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.product_name}</TableCell>
                  <TableCell className="tabular-nums">{d.serial_number}</TableCell>
                  <TableCell className="tabular-nums">{d.imei || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[d.status] || "secondary"} className="rounded-full">
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{String(d.selling_price)}</TableCell>
                  <TableCell className="text-right flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => openEdit(d)}>
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(d.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No devices yet
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
