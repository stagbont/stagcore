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
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { formatDate } from "@/lib/format";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Warranty = { id: string; device_id: string | null; sale_id: string | null; customer_id: string | null; warranty_months: number; start_date: string; expires_at: string; status: string; is_expired: boolean; days_remaining: number; is_valid: boolean };
type Claim = { id: string; warranty_id: string; device_id: string | null; customer_id: string | null; status: string; diagnosis: string | null; resolution: string | null; resolution_notes: string | null; created_at: string; is_expired: boolean; days_remaining: number | null };
type Device = { id: string; product_name: string; serial_number: string; imei: string | null; status: string };
type Customer = { id: string; name: string };

export default function WarrantyPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ warranty_id: "", device_id: "", customer_id: "", diagnosis: "" });
  const [claimTab, setClaimTab] = useState<"warranties" | "claims">("warranties");

  async function load() {
    if (!token) return;
    setError("");
    setFieldError(undefined);
    const [wRes, cRes, dRes, cuRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/warranties`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/warranty-claims`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/devices/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/v1/customers/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (!wRes.ok) { setError(await wRes.text()); return; }
    setWarranties(await wRes.json());
    if (cRes.ok) setClaims(await cRes.json()); else setClaims([]);
    if (dRes.ok) setDevices(await dRes.json());
    if (cuRes.ok) setCustomers(await cuRes.json());
  }

  useEffect(() => { load(); }, [token]);

  async function handleCreateClaim(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(undefined);
    if (!form.warranty_id && !form.device_id) {
      setFieldError("Select a warranty or a device");
      setError("Select a warranty or a device");
      return;
    }
    const body: Record<string, unknown> = {};
    if (form.warranty_id) body.warranty_id = form.warranty_id;
    if (form.device_id) body.device_id = form.device_id;
    if (form.customer_id) body.customer_id = form.customer_id;
    if (form.diagnosis.trim()) body.diagnosis = form.diagnosis.trim();
    const res = await fetch(`${API_URL}/api/v1/warranty-claims`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      const msg = await res.text();
      setError(msg);
      setFieldError(msg);
      return;
    }
    setOpen(false);
    setForm({ warranty_id: "", device_id: "", customer_id: "", diagnosis: "" });
    setFieldError(undefined);
    load();
  }

  async function updateClaim(id: string, field: string, value: string) {
    const payload: Record<string, string> = {};
    payload[field] = value;
    const res = await fetch(`${API_URL}/api/v1/warranty-claims/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (!res.ok) { setError(await res.text()); return; }
    load();
  }

  const filteredW = warranties.filter((w) => {
    if (statusFilter !== "all" && w.status !== statusFilter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (w.device_id || "").toLowerCase().includes(s) || w.id.toLowerCase().includes(s) || w.status.includes(s);
  });

  const filteredC = claims.filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return c.id.toLowerCase().includes(s) || (c.diagnosis || "").toLowerCase().includes(s) || c.status.includes(s);
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Warranty</PageHeaderTitle>
          <PageHeaderDescription>Auto-created on device sale · claim flow with validity check</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <HelpButton slug="warranty" />
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setFieldError(undefined); }}>
            <DialogTrigger asChild><Button className="min-h-11">New Claim</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Warranty Claim</DialogTitle>
                <DialogDescription>Link to a warranty or a device — at least one is required</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateClaim} className="flex flex-col gap-4" noValidate>
                <Field label="Warranty" htmlFor="claim-warranty" error={fieldError && !form.warranty_id && !form.device_id ? fieldError : undefined} hint="Optional if device selected">
                  <Select value={form.warranty_id || "none"} onValueChange={(v) => setForm({ ...form, warranty_id: v === "none" ? "" : v })}>
                    <SelectTrigger id="claim-warranty"><SelectValue placeholder="Select warranty…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None — use device…</SelectItem>
                      {warranties.map((w) => <SelectItem key={w.id} value={w.id}>{w.id.slice(0, 8)} · {w.warranty_months}mo · expires {formatDate(w.expires_at)} {w.is_expired ? "(expired)" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Device" htmlFor="claim-device" error={fieldError && !form.warranty_id && !form.device_id ? fieldError : undefined} hint="Optional if warranty selected">
                  <Select value={form.device_id || "none"} onValueChange={(v) => setForm({ ...form, device_id: v === "none" ? "" : v })}>
                    <SelectTrigger id="claim-device"><SelectValue placeholder="Select device…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None — use warranty…</SelectItem>
                      {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.product_name} · {d.serial_number} {d.imei ? `(${d.imei})` : ""} · {d.status}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Customer" htmlFor="claim-customer" hint="Optional">
                  <Select value={form.customer_id || "none"} onValueChange={(v) => setForm({ ...form, customer_id: v === "none" ? "" : v })}>
                    <SelectTrigger id="claim-customer"><SelectValue placeholder="None…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Diagnosis" htmlFor="claim-diagnosis" hint="Describe the issue">
                  <Textarea id="claim-diagnosis" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="Describe issue…" autoComplete="off" />
                </Field>
                <Button type="submit" className="min-h-11">Create Claim</Button>
              </form>
            </DialogContent>
          </Dialog>
        </PageHeaderActions>
      </PageHeader>

      {error ? <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-destructive/20 bg-destructive/10 rounded-md p-3">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Search" htmlFor="warranty-search" className="flex-1 max-w-sm">
          <Input id="warranty-search" placeholder="Search warranties/claims…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search warranties and claims" autoComplete="off" />
        </Field>
        <Field label="Status" htmlFor="warranty-status" className="w-40">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="warranty-status" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex gap-2 sm:ml-auto sm:items-end" role="tablist" aria-label="Warranty sections">
          <Button
            variant={claimTab === "warranties" ? "default" : "outline"}
            onClick={() => setClaimTab("warranties")}
            className="min-h-11"
            role="tab"
            aria-selected={claimTab === "warranties"}
            aria-pressed={claimTab === "warranties"}
          >
            Warranties ({warranties.length})
          </Button>
          <Button
            variant={claimTab === "claims" ? "default" : "outline"}
            onClick={() => setClaimTab("claims")}
            className="min-h-11"
            role="tab"
            aria-selected={claimTab === "claims"}
            aria-pressed={claimTab === "claims"}
          >
            Claims ({claims.length})
          </Button>
        </div>
      </div>

      {claimTab === "warranties" ? (
        <Card className="border-hairline">
          <CardHeader>
            <CardTitle className="text-base">Warranties</CardTitle>
            <CardDescription>Expires = sale_date + warranty_months (calendar-accurate)</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredW.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Warranties with expiry and validity</caption>
                  <TableHeader className="sticky top-0 bg-surface z-10">
                    <TableRow>
                      <TableHead scope="col">Device</TableHead>
                      <TableHead scope="col" className="text-right">Months</TableHead>
                      <TableHead scope="col">Start</TableHead>
                      <TableHead scope="col">Expires</TableHead>
                      <TableHead scope="col" className="text-right">Remaining</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Valid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredW.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell className="text-xs tabular-nums max-w-[160px] truncate">{w.device_id ? w.device_id.slice(0, 8) : "—"} {devices.find((d) => d.id === w.device_id)?.serial_number || ""}</TableCell>
                        <TableCell className="tabular-nums text-right font-medium">{w.warranty_months}</TableCell>
                        <TableCell className="text-xs tabular-nums">{formatDate(w.start_date)}</TableCell>
                        <TableCell className="text-xs tabular-nums">{formatDate(w.expires_at)}</TableCell>
                        <TableCell className="tabular-nums text-right">
                          <span className={w.days_remaining !== null && w.days_remaining < 30 && w.days_remaining >= 0 ? "text-[var(--status-warning)] font-medium" : w.is_expired ? "text-[var(--status-critical)]" : ""}>
                            {w.days_remaining} d
                          </span>
                        </TableCell>
                        <TableCell><Badge variant={w.status === "active" ? "default" : w.status === "void" ? "destructive" : "secondary"} className="rounded-full">{w.status}</Badge></TableCell>
                        <TableCell>{w.is_valid ? <Badge variant="default" className="rounded-full">valid</Badge> : <Badge variant="destructive" className="rounded-full">{w.is_expired ? "expired" : "void"}</Badge>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState title="No warranties yet" description="Complete a serialized device sale to auto-create a warranty." />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-hairline">
          <CardHeader>
            <CardTitle className="text-base">Claims</CardTitle>
            <CardDescription>Create → diagnosis → resolution (repair/replace/reject/refund) → close</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredC.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Warranty claims with status and resolution</caption>
                  <TableHeader className="sticky top-0 bg-surface z-10">
                    <TableRow>
                      <TableHead scope="col">Warranty</TableHead>
                      <TableHead scope="col">Device</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Diagnosis</TableHead>
                      <TableHead scope="col">Resolution</TableHead>
                      <TableHead scope="col">Expired?</TableHead>
                      <TableHead scope="col" className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredC.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs tabular-nums">{c.warranty_id.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs tabular-nums">{c.device_id ? c.device_id.slice(0, 8) : "—"}</TableCell>
                        <TableCell><Badge variant={c.status === "open" ? "secondary" : c.status === "closed" || c.status === "rejected" ? "destructive" : "default"} className="rounded-full">{c.status}</Badge></TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">{c.diagnosis || "—"}</TableCell>
                        <TableCell className="text-xs">{c.resolution ? <Badge variant="outline" className="rounded-full">{c.resolution}</Badge> : "—"}</TableCell>
                        <TableCell>{c.is_expired ? <Badge variant="destructive" className="rounded-full">expired</Badge> : <Badge variant="secondary" className="rounded-full">valid</Badge>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end flex-wrap">
                            <Select value={c.status} onValueChange={(v) => updateClaim(c.id, "status", v)}>
                              <SelectTrigger className="h-9 min-h-9 w-28" aria-label={`Update status for claim ${c.id.slice(0, 8)}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">open</SelectItem>
                                <SelectItem value="diagnosis">diagnosis</SelectItem>
                                <SelectItem value="awaiting_approval">awaiting_approval</SelectItem>
                                <SelectItem value="approved">approved</SelectItem>
                                <SelectItem value="rejected">rejected</SelectItem>
                                <SelectItem value="resolved">resolved</SelectItem>
                                <SelectItem value="closed">closed</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={c.resolution || "none"} onValueChange={(v) => updateClaim(c.id, "resolution", v === "none" ? "" : v)}>
                              <SelectTrigger className="h-9 min-h-9 w-28" aria-label={`Update resolution for claim ${c.id.slice(0, 8)}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">no res</SelectItem>
                                <SelectItem value="repair">repair</SelectItem>
                                <SelectItem value="replace">replace</SelectItem>
                                <SelectItem value="reject">reject</SelectItem>
                                <SelectItem value="refund">refund</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState title="No claims yet" description="Create a warranty claim from a warranty or device when an issue is reported.">
                <Button onClick={() => setOpen(true)} className="min-h-11">New Claim</Button>
              </EmptyState>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
