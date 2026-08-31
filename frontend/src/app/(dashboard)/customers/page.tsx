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
type Customer = { id: string; name: string; phone: string | null; email: string | null };

export default function CustomersPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [items, setItems] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError("");
    const res = await fetch(`${API_URL}/api/v1/customers/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setItems(await res.json());
  }

  useEffect(() => {
    load();
  }, [token]);

  const filtered = items.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editing ? `${API_URL}/api/v1/customers/${editing.id}` : `${API_URL}/api/v1/customers/`;
    const method = editing ? "PATCH" : "POST";
    const body = { name: form.name, phone: form.phone || null, email: form.email || null };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setOpen(false);
    setEditing(null);
    setForm({ name: "", phone: "", email: "" });
    load();
  }

  async function doDelete(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/customers/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
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

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone || "", email: c.email || "" });
    setOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: "", phone: "", email: "" });
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Customers</PageHeaderTitle>
          <PageHeaderDescription>Manage customers</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="suppliers-customers" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="min-h-11">New Customer</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Customer" : "New Customer"}</DialogTitle>
                <DialogDescription>Contact details for sales and warranty</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Field label="Name" htmlFor="customer-name" required hint="Full name">
                  <Input id="customer-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Jane Doe…" autoComplete="name" />
                </Field>
                <Field label="Phone" htmlFor="customer-phone" hint="Optional, e.g. +2507…">
                  <Input id="customer-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +250788000000…" autoComplete="tel" className="tabular-nums" />
                </Field>
                <Field label="Email" htmlFor="customer-email" hint="Optional">
                  <Input id="customer-email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. jane@example.com…" autoComplete="email" />
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
          <CardTitle className="text-base">All Customers</CardTitle>
          <div className="pt-2">
            <Input type="search" placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-sm" aria-label="Search customers" autoComplete="off" spellCheck={false} enterKeyHint="search" inputMode="search" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <Table>
              <caption className="sr-only">All customers</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Name</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Phone</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Email</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="tabular-nums">{c.phone || "—"}</TableCell>
                    <TableCell>{c.email || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => openEdit(c)} className="min-h-9">
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(c.id)} className="min-h-9">
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No customers yet" description={q ? "No customers match your search." : "Add customers to link sales, warranty and repairs."}>
              <Button onClick={openCreate} className="min-h-11">New Customer</Button>
            </EmptyState>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete customer?"
        description="This will permanently remove the customer. Past sales linked to this customer will remain."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDelete) void doDelete(confirmDelete); }}
        loading={actionBusy === confirmDelete}
      />
    </div>
  );
}
