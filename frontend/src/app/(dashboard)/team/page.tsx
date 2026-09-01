"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useBusiness } from "@/components/providers/business-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { HelpButton } from "@/components/help/help-button";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/page-header";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Member = {
  id: string;
  business_id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
};

const ROLES = ["OWNER", "MANAGER", "CASHIER", "INVENTORY_CLERK"] as const;

function roleBadgeVariant(role: string): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" {
  switch (role) {
    case "OWNER":
      return "destructive";
    case "MANAGER":
      return "default";
    case "CASHIER":
      return "success";
    case "INVENTORY_CLERK":
      return "warning";
    default:
      return "secondary";
  }
}

export default function TeamPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const currentUserId = (session?.user as unknown as { id?: string } | undefined)?.id || "";
  const currentUserEmail = (session?.user as unknown as { email?: string } | undefined)?.email || "";
  const { state: bizState } = useBusiness();
  const businessId = bizState.business?.id || null;

  const [items, setItems] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "CASHIER" });
  const [editRole, setEditRole] = useState("CASHIER");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const currentMember = items.find((m) => m.user_id === currentUserId) || items.find((m) => m.email.toLowerCase() === currentUserEmail.toLowerCase()) || null;
  const isOwner = currentMember?.role === "OWNER";
  const canManage = isOwner;

  async function load() {
    if (!token || !businessId) return;
    setError("");
    const res = await fetch(`${API_URL}/api/v1/business/${businessId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    load();
  }, [token, businessId]);

  const filtered = items.filter((m) => {
    if (!q) return true;
    const qq = q.toLowerCase();
    return m.name?.toLowerCase().includes(qq) || m.email.toLowerCase().includes(qq) || m.role.toLowerCase().includes(qq);
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setActionBusy("create");
    try {
      const res = await fetch(`${API_URL}/api/v1/business/${businessId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password, role: form.role }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "CASHIER" });
      await load();
    } finally {
      setActionBusy(null);
    }
  }

  async function handleRoleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId || !editing) return;
    setActionBusy(editing.user_id);
    try {
      const res = await fetch(`${API_URL}/api/v1/business/${businessId}/members/${editing.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: editRole }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      setEditOpen(false);
      setEditing(null);
      await load();
    } finally {
      setActionBusy(null);
    }
  }

  async function doDelete(userId: string) {
    if (!businessId) return;
    setActionBusy(userId);
    try {
      const res = await fetch(`${API_URL}/api/v1/business/${businessId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
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

  function openEditRole(m: Member) {
    setEditing(m);
    setEditRole(m.role);
    setEditOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: "", email: "", password: "", role: "CASHIER" });
    setOpen(true);
  }

  if (bizState.loading) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Loading workspace…</div>;
  }
  if (!businessId) {
    return <p role="alert" className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">No business found. Create a business first.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Team</PageHeaderTitle>
          <PageHeaderDescription>Manage users and roles for this business — only Owners can add or change members</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="business-team" />
          {canManage ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreate} className="min-h-11">Add Member</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Team Member</DialogTitle>
                  <DialogDescription>Create a new user and assign a role. They can sign in immediately with the password you set (GH₵ currency applies to all prices).</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="flex flex-col gap-4">
                  <Field label="Name" htmlFor="member-name" required hint="Full name for login display">
                    <Input id="member-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Ama Cashier…" autoComplete="off" />
                  </Field>
                  <Field label="Email" htmlFor="member-email" required hint="Must be unique — new login email">
                    <Input id="member-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="e.g. ama@shop.local…" autoComplete="off" />
                  </Field>
                  <Field label="Password" htmlFor="member-password" required hint="Min 8 characters — share securely">
                    <Input id="member-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required placeholder="••••••••" autoComplete="new-password" />
                  </Field>
                  <Field label="Role" htmlFor="member-role" required hint="OWNER manages users; CASHIER sells only">
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                      <SelectTrigger id="member-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OWNER">Owner</SelectItem>
                        <SelectItem value="MANAGER">Manager</SelectItem>
                        <SelectItem value="CASHIER">Cashier</SelectItem>
                        <SelectItem value="INVENTORY_CLERK">Inventory Clerk</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button type="submit" className="min-h-11" disabled={actionBusy === "create"}>
                    {actionBusy === "create" ? "Creating…" : "Create Member"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </PageHeaderActions>
      </PageHeader>

      {!canManage && currentMember && (
        <p role="note" className="text-sm text-muted-foreground border border-hairline rounded-md p-3 bg-surface" aria-live="polite">
          You are signed in as <span className="font-medium text-foreground">{currentMember.role}</span>. Only Owners can add, edit, or remove team members. Your access is read-only here.
        </p>
      )}

      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">
          {error}
        </p>
      )}

      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">All Members</CardTitle>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <Input
              type="search"
              placeholder="Search members…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full max-w-sm"
              aria-label="Search members"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              inputMode="search"
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtered.length} of {items.length} members{currentMember ? ` · You: ${currentMember.role}` : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <Table>
              <caption className="sr-only">All team members</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Name</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Email</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Role</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10">Joined</TableHead>
                  <TableHead scope="col" className="sticky top-0 bg-surface z-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => {
                  const isSelf = m.user_id === currentUserId || m.email.toLowerCase() === currentUserEmail.toLowerCase();
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.name || "—"} {isSelf ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(m.role)} className="rounded-full">
                          {m.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">{new Date(m.created_at).toLocaleDateString("en-GH")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {canManage ? (
                            <>
                              <Button variant="outline" size="sm" onClick={() => openEditRole(m)} className="min-h-9">
                                Edit Role
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(m.user_id)} className="min-h-9" disabled={actionBusy === m.user_id}>
                                Remove
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Read-only</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={q ? "No members match your search" : "No members yet"}
              description={q ? "Try a different name, email, or role." : canManage ? "Add your first team member to get started. GH₵ pricing will apply to their POS view." : "No members to display."}
            >
              {canManage && !q ? (
                <Button onClick={openCreate} className="min-h-11">
                  Add Member
                </Button>
              ) : null}
            </EmptyState>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update role for {editing?.name || editing?.email}. {editing?.user_id === currentUserId ? "You cannot demote yourself if you are the last Owner." : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRoleUpdate} className="flex flex-col gap-4">
            <Field label="Role" htmlFor="edit-role" required>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="CASHIER">Cashier</SelectItem>
                  <SelectItem value="INVENTORY_CLERK">Inventory Clerk</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit" className="min-h-11" disabled={actionBusy === editing?.user_id}>
              {actionBusy === editing?.user_id ? "Saving…" : "Save Role"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Remove member?"
        description="This will remove the user from this business. They will lose access immediately. Their login remains but without business access."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) void doDelete(confirmDelete);
        }}
        loading={confirmDelete ? actionBusy === confirmDelete : false}
      />
    </div>
  );
}
