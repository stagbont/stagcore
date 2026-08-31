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

type Category = { id: string; name: string; slug: string; default_warranty_months: number; created_at: string };

export default function CategoriesPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [items, setItems] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", default_warranty_months: 12 });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError("");
    const res = await fetch(`${API_URL}/api/v1/categories/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const data = await res.json();
    setItems(data);
  }

  useEffect(() => {
    load();
  }, [token]);

  const filtered = items.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.slug.toLowerCase().includes(q.toLowerCase()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editing ? `${API_URL}/api/v1/categories/${editing.id}` : `${API_URL}/api/v1/categories/`;
    const method = editing ? "PATCH" : "POST";
    const body = editing ? { name: form.name, slug: form.slug || undefined, default_warranty_months: form.default_warranty_months } : { name: form.name, slug: form.slug || undefined, default_warranty_months: form.default_warranty_months };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setOpen(false);
    setEditing(null);
    setForm({ name: "", slug: "", default_warranty_months: 12 });
    load();
  }

  async function doDelete(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/categories/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
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

  function openEdit(c: Category) {
    setEditing(c);
    setForm({ name: c.name, slug: c.slug, default_warranty_months: c.default_warranty_months });
    setOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: "", slug: "", default_warranty_months: 12 });
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Categories</PageHeaderTitle>
          <PageHeaderDescription>Group products and set default warranty</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="categories-warranty" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="min-h-11">New Category</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
                <DialogDescription>Group products and set warranty defaults</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Field label="Name" htmlFor="category-name" required hint="Display name">
                  <Input id="category-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Phones…" autoComplete="off" />
                </Field>
                <Field label="Slug" htmlFor="category-slug" hint="URL-safe, auto-generated if empty">
                  <Input id="category-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="e.g. phones…" autoComplete="off" />
                </Field>
                <Field label="Default warranty (months)" htmlFor="category-warranty" hint="Used when selling devices in this category">
                  <Input id="category-warranty" type="number" inputMode="numeric" min="0" max="60" step="1" value={form.default_warranty_months} onChange={(e) => setForm({ ...form, default_warranty_months: parseInt(e.target.value) || 0 })} placeholder="12" autoComplete="off" className="tabular-nums" />
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
          <CardTitle className="text-base">All Categories</CardTitle>
          <div className="pt-2">
            <Input type="search" placeholder="Search categories…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-sm" aria-label="Search categories" autoComplete="off" spellCheck={false} enterKeyHint="search" inputMode="search" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <Table>
              <caption className="sr-only">All categories</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Name</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Slug</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Warranty</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="tabular-nums">{c.slug}</TableCell>
                    <TableCell className="tabular-nums text-right">{c.default_warranty_months} mo</TableCell>
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
            <EmptyState title="No categories yet" description={q ? "No categories match your search." : "Create categories to group products and set default warranty periods."}>
              <Button onClick={openCreate} className="min-h-11">New Category</Button>
            </EmptyState>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete category?"
        description="This will permanently remove the category. Products linked to it will keep their data but lose the grouping."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDelete) void doDelete(confirmDelete); }}
        loading={actionBusy === confirmDelete}
      />
    </div>
  );
}
