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
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { HelpButton } from "@/components/help/help-button";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/page-header";
import { formatCurrency } from "@/lib/format";

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

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

  async function doDelete(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/devices/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
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
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Devices</PageHeaderTitle>
          <PageHeaderDescription>Serialized units (IMEI/serial tracked)</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="devices" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="min-h-11">New Device</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Device" : "New Device"}</DialogTitle>
                <DialogDescription>Serialized inventory with spec, IMEI and serial</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Field label="Product name / Model" htmlFor="device-model" required hint="Commercial model name">
                  <Input id="device-model" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required placeholder="e.g. iPhone 15 128GB…" autoComplete="off" />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Serial number" htmlFor="device-serial" required hint="Unique per business">
                    <Input id="device-serial" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} required placeholder="e.g. SN-2024-001…" autoComplete="off" className="tabular-nums" />
                  </Field>
                  <Field label="IMEI" htmlFor="device-imei" hint="15 digits, optional">
                    <Input id="device-imei" value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} placeholder="e.g. 356938035643809…" inputMode="numeric" autoComplete="off" className="tabular-nums" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Brand" htmlFor="device-brand" hint="Optional">
                    <Input id="device-brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Apple…" autoComplete="off" />
                  </Field>
                  <Field label="Status" htmlFor="device-status">
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger id="device-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_stock">In stock</SelectItem>
                        <SelectItem value="sold">Sold</SelectItem>
                        <SelectItem value="in_repair">In repair</SelectItem>
                        <SelectItem value="returned">Returned</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Category" htmlFor="device-category" hint="Optional">
                    <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                      <SelectTrigger id="device-category">
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
                  <Field label="Supplier" htmlFor="device-supplier" hint="Optional">
                    <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                      <SelectTrigger id="device-supplier">
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
                  <Field label="Cost price" htmlFor="device-cost" hint="Purchase price">
                    <Input id="device-cost" type="number" inputMode="decimal" step="0.01" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} placeholder="0.00" autoComplete="off" className="tabular-nums" />
                  </Field>
                  <Field label="Selling price" htmlFor="device-selling" hint="Sale price">
                    <Input id="device-selling" type="number" inputMode="decimal" step="0.01" min="0" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} placeholder="0.00" autoComplete="off" className="tabular-nums" />
                  </Field>
                </div>
                <Field label="Spec (JSON)" htmlFor="device-spec" hint='JSON like {"ram":"8GB","storage":"256GB"}'>
                  <Textarea id="device-spec" value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder='{"ram":"8GB","storage":"256GB"…}' rows={3} autoComplete="off" />
                </Field>
                <Button type="submit" className="min-h-11">{editing ? "Save" : "Create"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </PageHeaderActions>
      </PageHeader>
      {error && <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-border rounded-md p-3 bg-surface">{error}</p>}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">All Devices</CardTitle>
          <div className="pt-2">
            <Input type="search" placeholder="Search by name, serial, IMEI…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-sm tabular-nums" aria-label="Search devices" inputMode="search" autoComplete="off" spellCheck={false} enterKeyHint="search" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <Table>
              <caption className="sr-only">All serialized devices</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Product</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Serial</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">IMEI</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Status</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Price</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Actions</TableHead>
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
                    <TableCell className="tabular-nums text-right">{formatCurrency(d.selling_price)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => openEdit(d)} className="min-h-9">
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(d.id)} className="min-h-9">
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No devices yet" description={q ? "No devices match your search." : "Add your first serialized device with IMEI and serial to start tracking."}>
              <Button onClick={openCreate} className="min-h-11">New Device</Button>
            </EmptyState>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete device?"
        description="This will permanently remove the serialized unit. Ledger history for this device will remain."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDelete) void doDelete(confirmDelete); }}
        loading={actionBusy === confirmDelete}
      />
    </div>
  );
}
