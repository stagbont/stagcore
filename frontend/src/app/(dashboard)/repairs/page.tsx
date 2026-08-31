"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/help/help-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { formatCurrency, formatDate } from "@/lib/format";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Repair = { id: string; device_id: string | null; device_description: string | null; customer_id: string | null; problem_description: string; technician_name: string | null; status: string; estimated_cost: string | null; actual_cost: string | null; location_id: string | null; created_at: string };
type Device = { id: string; product_name: string; serial_number: string; imei: string | null; status: string };
type Customer = { id: string; name: string };
type Location = { id: string; name: string };

const STATUS_ORDER = ["received", "diagnosis", "awaiting_parts", "repairing", "ready_for_pickup", "collected", "cancelled"] as const;
const FLOW_STEPS = ["received", "diagnosis", "awaiting_parts", "repairing", "ready_for_pickup", "collected"] as const;

function RepairStepper({ active }: { active: string }) {
  const normalized = active === "cancelled" ? "" : active;
  return (
    <div aria-label="Repair status flow" className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-1.5 rounded-lg border border-hairline bg-surface p-3">
      <span className="text-xs font-medium text-muted-foreground mr-1">Flow:</span>
      <div className="flex flex-col sm:flex-row gap-1.5 flex-wrap">
        {FLOW_STEPS.map((step, idx) => {
          const isActive = normalized === step;
          const isPast = FLOW_STEPS.indexOf(normalized as typeof FLOW_STEPS[number]) > idx && normalized !== "";
          return (
            <span key={step} className="flex items-center gap-1.5">
              {idx > 0 ? <span aria-hidden className="hidden sm:inline text-muted-foreground text-xs">→</span> : null}
              <span
                aria-current={isActive ? "step" : undefined}
                className={
                  isActive
                    ? "inline-flex items-center rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                    : isPast
                      ? "inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground"
                      : "inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground"
                }
              >
                {step}
              </span>
            </span>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground sm:ml-auto">cancel anytime</span>
    </div>
  );
}

export default function RepairsPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ device?: string; device_description?: string; problem?: string }>({});
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "walkin">("existing");
  const [form, setForm] = useState({ customer_id: "", device_id: "", device_description: "", problem_description: "", technician_name: "", estimated_cost: "", location_id: "" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError("");
    setFieldErrors({});
    const [rRes, dRes, cRes, lRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/repairs`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/devices/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/customers/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/locations/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (!rRes.ok) { setError(await rRes.text()); return; }
    setRepairs(await rRes.json());
    if (dRes.ok) setDevices(await dRes.json());
    if (cRes.ok) setCustomers(await cRes.json());
    else setCustomers([]);
    if (lRes.ok) setLocations(await lRes.json());
    else setLocations([]);
  }

  useEffect(() => { load(); }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const errs: { device?: string; device_description?: string; problem?: string } = {};
    if (!form.problem_description.trim()) errs.problem = "Problem description required";
    if (mode === "existing" && !form.device_id) errs.device = "Select a device";
    if (mode === "walkin" && !form.device_description.trim()) errs.device_description = "Device description required for walk-in";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setError(errs.problem || errs.device || errs.device_description || "Fix the highlighted fields");
      return;
    }
    setFieldErrors({});
    const body: Record<string, unknown> = {
      problem_description: form.problem_description.trim(),
      technician_name: form.technician_name.trim() || null,
      estimated_cost: form.estimated_cost ? form.estimated_cost : null,
      customer_id: form.customer_id || null,
      location_id: form.location_id || null,
    };
    if (mode === "existing") {
      body.device_id = form.device_id;
      if (form.device_description.trim()) body.device_description = form.device_description.trim();
    } else {
      body.device_description = form.device_description.trim();
    }
    const res = await fetch(`${API_URL}/api/v1/repairs`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      const msg = await res.text();
      setError(msg);
      if (msg.toLowerCase().includes("device")) setFieldErrors({ device: msg });
      return;
    }
    setOpen(false);
    setForm({ customer_id: "", device_id: "", device_description: "", problem_description: "", technician_name: "", estimated_cost: "", location_id: "" });
    load();
  }

  async function handleTransition(id: string, to: string) {
    setBusyId(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/repairs/${id}/transition`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ to_status: to }) });
      if (!res.ok) { setError(await res.text()); return; }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/repairs/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError(await res.text()); return; }
      await load();
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  }

  const filtered = repairs.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (r.device_description || "").toLowerCase().includes(s) || r.problem_description.toLowerCase().includes(s) || (r.technician_name || "").toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
  });

  function nextStatus(current: string): string | null {
    const idx = STATUS_ORDER.indexOf(current as typeof STATUS_ORDER[number]);
    if (idx === -1 || idx >= STATUS_ORDER.indexOf("collected")) return null;
    if (current === "collected" || current === "cancelled") return null;
    return STATUS_ORDER[idx + 1];
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Repairs</PageHeaderTitle>
          <PageHeaderDescription>Walk-in (device_description) or sold-device repairs — strict FSM</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="repairs" />
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setFieldErrors({}); }}>
            <DialogTrigger asChild><Button className="min-h-11">New Repair</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Repair</DialogTitle>
                <DialogDescription>Create a repair for an existing device or a walk-in item not sold by this shop</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="flex flex-col gap-4" noValidate>
                <div className="flex gap-2" role="group" aria-label="Repair mode">
                  <Button type="button" variant={mode === "existing" ? "default" : "outline"} onClick={() => { setMode("existing"); setFieldErrors({}); }} className="min-h-11" aria-pressed={mode === "existing"}>Existing device</Button>
                  <Button type="button" variant={mode === "walkin" ? "default" : "outline"} onClick={() => { setMode("walkin"); setFieldErrors({}); }} className="min-h-11" aria-pressed={mode === "walkin"}>Walk-in</Button>
                </div>
                {mode === "existing" ? (
                  <div className="flex flex-col gap-3">
                    <Field label="Device" htmlFor="repair-device" error={fieldErrors.device} hint="Only devices already in the system" required>
                      <Select value={form.device_id || "none"} onValueChange={(v) => setForm({ ...form, device_id: v === "none" ? "" : v })}>
                        <SelectTrigger id="repair-device"><SelectValue placeholder="Select device…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select device…</SelectItem>
                          {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.product_name} · {d.serial_number} {d.imei ? `(${d.imei})` : ""} · {d.status}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Device description" htmlFor="repair-device-desc-existing" hint="Optional context, e.g. cracked screen notes">
                      <Input id="repair-device-desc-existing" value={form.device_description} onChange={(e) => setForm({ ...form, device_description: e.target.value })} placeholder="Optional context…" autoComplete="off" />
                    </Field>
                  </div>
                ) : (
                  <Field label="Device description" htmlFor="repair-device-desc-walkin" error={fieldErrors.device_description} hint="Walk-in: device not sold by this shop — description required" required>
                    <Input id="repair-device-desc-walkin" value={form.device_description} onChange={(e) => setForm({ ...form, device_description: e.target.value })} placeholder="Model / IMEI as given by customer…" autoComplete="off" aria-invalid={fieldErrors.device_description ? true : undefined} />
                  </Field>
                )}
                <Field label="Problem description" htmlFor="repair-problem" error={fieldErrors.problem} required>
                  <Textarea id="repair-problem" value={form.problem_description} onChange={(e) => setForm({ ...form, problem_description: e.target.value })} placeholder="What’s wrong?…" autoComplete="off" aria-invalid={fieldErrors.problem ? true : undefined} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Customer" htmlFor="repair-customer" hint="Optional">
                    <Select value={form.customer_id || "none"} onValueChange={(v) => setForm({ ...form, customer_id: v === "none" ? "" : v })}>
                      <SelectTrigger id="repair-customer"><SelectValue placeholder="None…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Technician" htmlFor="repair-technician" hint="Free text">
                    <Input id="repair-technician" value={form.technician_name} onChange={(e) => setForm({ ...form, technician_name: e.target.value })} placeholder="e.g. John…" autoComplete="off" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Estimated cost" htmlFor="repair-est-cost" hint="Optional">
                    <Input id="repair-est-cost" type="number" inputMode="decimal" step="0.01" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} placeholder="0.00…" autoComplete="off" />
                  </Field>
                  <Field label="Location" htmlFor="repair-location" hint="Optional">
                    <Select value={form.location_id || "none"} onValueChange={(v) => setForm({ ...form, location_id: v === "none" ? "" : v })}>
                      <SelectTrigger id="repair-location"><SelectValue placeholder="None…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Button type="submit" className="min-h-11">Create Repair</Button>
              </form>
            </DialogContent>
          </Dialog>
        </PageHeaderActions>
      </PageHeader>

      {error ? <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-destructive/20 bg-destructive/10 rounded-md p-3">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Search" htmlFor="repairs-search" className="flex-1 max-w-sm">
          <Input id="repairs-search" placeholder="Search repairs…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search repairs" autoComplete="off" />
        </Field>
        <Field label="Status" htmlFor="repairs-status-filter" className="w-44">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="repairs-status-filter" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <RepairStepper active={statusFilter} />

      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">All Repairs</CardTitle>
          <CardDescription>Strict: received → diagnosis → awaiting_parts → repairing → ready_for_pickup → collected (cancel anytime)</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">All repairs with status and actions</caption>
                <TableHeader className="sticky top-0 bg-surface z-10">
                  <TableRow>
                    <TableHead scope="col">Device</TableHead>
                    <TableHead scope="col">Problem</TableHead>
                    <TableHead scope="col">Technician</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col" className="text-right">Est. / Actual</TableHead>
                    <TableHead scope="col">Created</TableHead>
                    <TableHead scope="col" className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const ns = nextStatus(r.status);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs max-w-[180px] truncate tabular-nums">
                          {r.device_id ? `${r.device_id.slice(0, 8)} ${devices.find((d) => d.id === r.device_id)?.serial_number || ""}` : r.device_description || "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{r.problem_description}</TableCell>
                        <TableCell className="text-xs">{r.technician_name || "—"}</TableCell>
                        <TableCell><Badge variant={r.status === "collected" ? "default" : r.status === "cancelled" ? "destructive" : r.status === "received" ? "secondary" : "outline"} className="rounded-full">{r.status}</Badge></TableCell>
                        <TableCell className="tabular-nums text-xs text-right">{r.estimated_cost ? formatCurrency(r.estimated_cost) : "—"} / {r.actual_cost ? formatCurrency(r.actual_cost) : "—"}</TableCell>
                        <TableCell className="text-xs tabular-nums">{formatDate(r.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {ns ? <Button size="sm" onClick={() => handleTransition(r.id, ns)} disabled={busyId === r.id} aria-busy={busyId === r.id} className="min-h-9">→ {ns}</Button> : null}
                            {r.status !== "cancelled" && r.status !== "collected" ? <Button variant="outline" size="sm" onClick={() => handleTransition(r.id, "cancelled")} disabled={busyId === r.id} aria-busy={busyId === r.id} className="min-h-9">Cancel</Button> : null}
                            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(r.id)} disabled={(r.status !== "received" && r.status !== "cancelled") || busyId === r.id} aria-busy={busyId === r.id} className="min-h-9 disabled:opacity-50">Delete</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState title="No repairs yet" description="Create your first repair — walk-in or existing device.">
              <Button onClick={() => setOpen(true)} className="min-h-11">New Repair</Button>
            </EmptyState>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete repair?"
        description="Only repairs in received or cancelled status can be deleted. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDelete) void doDelete(confirmDelete); }}
        loading={busyId === confirmDelete}
      />
    </div>
  );
}
