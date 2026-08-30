"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/help/help-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

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
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ warranty_id: "", device_id: "", customer_id: "", diagnosis: "" });
  const [claimTab, setClaimTab] = useState<"warranties" | "claims">("warranties");

  async function load() {
    if (!token) return;
    setError("");
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
    if (!form.warranty_id && !form.device_id) { setError("Select warranty or device"); return; }
    const body: Record<string, unknown> = {};
    if (form.warranty_id) body.warranty_id = form.warranty_id;
    if (form.device_id) body.device_id = form.device_id;
    if (form.customer_id) body.customer_id = form.customer_id;
    if (form.diagnosis) body.diagnosis = form.diagnosis;
    const res = await fetch(`${API_URL}/api/v1/warranty-claims`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) { setError(await res.text()); return; }
    setOpen(false);
    setForm({ warranty_id: "", device_id: "", customer_id: "", diagnosis: "" });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Warranty</h1>
          <p className="text-sm text-muted-foreground">Auto-created on device sale · claim flow with validity check</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpButton slug="warranty" />
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>New Claim</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Warranty Claim</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateClaim} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Warranty (optional if device selected)</Label>
                <Select value={form.warranty_id || "none"} onValueChange={(v) => setForm({ ...form, warranty_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select warranty" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None — use device</SelectItem>
                    {warranties.map((w) => <SelectItem key={w.id} value={w.id}>{w.id.slice(0, 8)} · {w.warranty_months}mo · expires {new Date(w.expires_at).toLocaleDateString()} {w.is_expired ? "(expired)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Device (optional if warranty selected)</Label>
                <Select value={form.device_id || "none"} onValueChange={(v) => setForm({ ...form, device_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None — use warranty</SelectItem>
                    {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.product_name} · {d.serial_number} {d.imei ? `(${d.imei})` : ""} · {d.status}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Customer (optional)</Label>
                <Select value={form.customer_id || "none"} onValueChange={(v) => setForm({ ...form, customer_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Diagnosis / Problem</Label>
                <Textarea value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="Describe issue" />
              </div>
              <Button type="submit">Create Claim</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">{error}</p>}

      <div className="flex gap-2">
        <Input placeholder="Search warranties/claims..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2 ml-auto">
          <Button variant={claimTab === "warranties" ? "default" : "outline"} onClick={() => setClaimTab("warranties")}>Warranties ({warranties.length})</Button>
          <Button variant={claimTab === "claims" ? "default" : "outline"} onClick={() => setClaimTab("claims")}>Claims ({claims.length})</Button>
        </div>
      </div>

      {claimTab === "warranties" ? (
        <Card className="border-hairline">
          <CardHeader>
            <CardTitle className="text-base">Warranties</CardTitle>
            <CardDescription>Expires = sale_date + warranty_months (calendar-accurate)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Months</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredW.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs tabular-nums max-w-[160px] truncate">{w.device_id ? w.device_id.slice(0, 8) : "—"} {devices.find((d) => d.id === w.device_id)?.serial_number || ""}</TableCell>
                    <TableCell className="tabular-nums">{w.warranty_months}</TableCell>
                    <TableCell className="text-xs tabular-nums">{new Date(w.start_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs tabular-nums">{new Date(w.expires_at).toLocaleDateString()}</TableCell>
                    <TableCell className="tabular-nums">
                      <span className={w.days_remaining !== null && w.days_remaining < 30 && w.days_remaining >= 0 ? "text-[var(--status-warning)] font-medium" : w.is_expired ? "text-[var(--status-critical)]" : ""}>
                        {w.days_remaining} d
                      </span>
                    </TableCell>
                    <TableCell><Badge variant={w.status === "active" ? "default" : w.status === "void" ? "destructive" : "secondary"} className="rounded-full">{w.status}</Badge></TableCell>
                    <TableCell>{w.is_valid ? <Badge variant="default" className="rounded-full">valid</Badge> : <Badge variant="destructive" className="rounded-full">{w.is_expired ? "expired" : "void"}</Badge>}</TableCell>
                  </TableRow>
                ))}
                {!filteredW.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No warranties yet — complete a device sale</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-hairline">
          <CardHeader>
            <CardTitle className="text-base">Claims</CardTitle>
            <CardDescription>Create → diagnosis → resolution (repair/replace/reject/refund) → close</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Warranty</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead>Resolution</TableHead>
                  <TableHead>Expired?</TableHead>
                  <TableHead>Actions</TableHead>
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
                    <TableCell className="flex gap-1 flex-wrap">
                      <Select value={c.status} onValueChange={(v) => updateClaim(c.id, "status", v)}>
                        <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
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
                        <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">no res</SelectItem>
                          <SelectItem value="repair">repair</SelectItem>
                          <SelectItem value="replace">replace</SelectItem>
                          <SelectItem value="reject">reject</SelectItem>
                          <SelectItem value="refund">refund</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredC.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No claims yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
