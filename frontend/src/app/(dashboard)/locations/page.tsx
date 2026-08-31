"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
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
type Location = { id: string; name: string; slug: string | null; address: string | null; is_active: boolean };

export default function LocationsPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [items, setItems] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", address: "", is_active: true });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError("");
    const res = await fetch(`${API_URL}/api/v1/locations/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setItems(await res.json());
  }

  useEffect(() => {
    load();
  }, [token]);

  const filtered = items.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editing ? `${API_URL}/api/v1/locations/${editing.id}` : `${API_URL}/api/v1/locations/`;
    const method = editing ? "PATCH" : "POST";
    const body = { name: form.name, slug: form.slug || null, address: form.address || null, is_active: form.is_active };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setOpen(false);
    setEditing(null);
    setForm({ name: "", slug: "", address: "", is_active: true });
    load();
  }

  async function doDelete(id: string) {
    setActionBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/locations/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
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

  function openEdit(l: Location) {
    setEditing(l);
    setForm({ name: l.name, slug: l.slug || "", address: l.address || "", is_active: l.is_active });
    setOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: "", slug: "", address: "", is_active: true });
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Locations</PageHeaderTitle>
          <PageHeaderDescription>Manage stock locations (warehouses, branches)</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="transfers-locations" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="min-h-11">New Location</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Location" : "New Location"}</DialogTitle>
                <DialogDescription>Warehouses and branches for stock tracking</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Field label="Name" htmlFor="location-name" required hint="Display name">
                  <Input id="location-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Main Warehouse…" autoComplete="off" />
                </Field>
                <Field label="Slug" htmlFor="location-slug" hint="URL-safe, auto-generated if empty">
                  <Input id="location-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="e.g. main-warehouse…" autoComplete="off" />
                </Field>
                <Field label="Address" htmlFor="location-address" hint="Optional">
                  <Input id="location-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. KN 5 Ave, Kigali…" autoComplete="street-address" />
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
          <CardTitle className="text-base">All Locations</CardTitle>
          <div className="pt-2">
            <Input type="search" placeholder="Search locations…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-sm" aria-label="Search locations" autoComplete="off" spellCheck={false} enterKeyHint="search" inputMode="search" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <Table>
              <caption className="sr-only">All locations</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Name</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Slug</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Address</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Status</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell className="tabular-nums">{l.slug || "—"}</TableCell>
                    <TableCell>{l.address || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={l.is_active ? "default" : "secondary"} className="rounded-full">
                        {l.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => openEdit(l)} className="min-h-9">
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(l.id)} className="min-h-9">
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No locations yet" description={q ? "No locations match your search." : "Create your first warehouse or branch to enable multi-location stock."}>
              <Button onClick={openCreate} className="min-h-11">New Location</Button>
            </EmptyState>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete location?"
        description="This will permanently remove the location. Transfer history remains but future stock moves to this location will be blocked."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDelete) void doDelete(confirmDelete); }}
        loading={actionBusy === confirmDelete}
      />
    </div>
  );
}
