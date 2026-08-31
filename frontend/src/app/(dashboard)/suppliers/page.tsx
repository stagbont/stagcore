"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { HelpButton } from "@/components/help/help-button";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/page-header";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type Supplier = { id: string; name: string; phone: string | null; email: string | null; address: string | null };

export default function SuppliersPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [items, setItems] = useState<Supplier[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError("");
    const res = await fetch(`${API_URL}/api/v1/suppliers/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setItems(await res.json());
  }

  useEffect(() => {
    load();
  }, [token]);

  const filtered = items.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editing ? `${API_URL}/api/v1/suppliers/${editing.id}` : `${API_URL}/api/v1/suppliers/`;
    const method = editing ? "PATCH" : "POST";
    const body = { name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setOpen(false);
    setEditing(null);
    setForm({ name: "", phone: "", email: "", address: "" });
    load();
  }

  async function doDelete(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/suppliers/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
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

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone || "", email: s.email || "", address: s.address || "" });
    setOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", address: "" });
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Suppliers</PageHeaderTitle>
          <PageHeaderDescription>Manage product suppliers</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="suppliers-customers" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="min-h-11">New Supplier</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Supplier" : "New Supplier"}</DialogTitle>
                <DialogDescription>Contact details for purchasing and receiving</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Field label="Name" htmlFor="supplier-name" required hint="Company or contact name">
                  <Input id="supplier-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. BrightSource Ltd…" autoComplete="organization" />
                </Field>
                <Field label="Phone" htmlFor="supplier-phone" hint="Optional, e.g. +2507…">
                  <Input id="supplier-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +250788000000…" autoComplete="tel" className="tabular-nums" />
                </Field>
                <Field label="Email" htmlFor="supplier-email" hint="Optional">
                  <Input id="supplier-email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. orders@example.com…" autoComplete="email" />
                </Field>
                <Field label="Address" htmlFor="supplier-address" hint="Optional">
                  <Input id="supplier-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. KN 5 Ave, Kigali…" autoComplete="street-address" />
                </Field>
                <Button type="submit" className="min-h-11">{editing ? "Save" : "Create"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </PageHeaderActions>
      </PageHeader>
      {error && <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">{error}</p>}
      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">All Suppliers</CardTitle>
          <div className="pt-2">
            <Input type="search" placeholder="Search suppliers…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-sm" aria-label="Search suppliers" autoComplete="off" spellCheck={false} enterKeyHint="search" inputMode="search" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <Table>
              <caption className="sr-only">All suppliers</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Name</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Phone</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Email</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="tabular-nums">{s.phone || "—"}</TableCell>
                    <TableCell>{s.email || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => openEdit(s)} className="min-h-9">
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(s.id)} className="min-h-9">
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No suppliers yet" description={q ? "No suppliers match your search." : "Add suppliers to link products and purchases."}>
              <Button onClick={openCreate} className="min-h-11">New Supplier</Button>
            </EmptyState>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete supplier?"
        description="This will permanently remove the supplier. Products linked to it will remain."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDelete) void doDelete(confirmDelete); }}
        loading={actionBusy === confirmDelete}
      />
    </div>
  );
}
