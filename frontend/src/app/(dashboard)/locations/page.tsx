"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

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

  async function handleDelete(id: string) {
    if (!confirm("Delete this location?")) return;
    const res = await fetch(`${API_URL}/api/v1/locations/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    load();
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Locations</h1>
          <p className="text-sm text-muted-foreground">Manage stock locations (warehouses, branches)</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>New Location</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Location" : "New Location"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Slug (optional)</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {error && <p className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">{error}</p>}
      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">All Locations</CardTitle>
          <div className="pt-2">
            <Input placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                  <TableCell className="text-right flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => openEdit(l)}>
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(l.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No locations yet
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
