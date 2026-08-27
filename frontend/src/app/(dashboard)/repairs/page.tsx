"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Repair = { id: string; device_id: string | null; device_description: string | null; customer_id: string | null; problem_description: string; technician_name: string | null; status: string; estimated_cost: string | null; actual_cost: string | null; location_id: string | null; created_at: string };
type Device = { id: string; product_name: string; serial_number: string; imei: string | null; status: string };
type Customer = { id: string; name: string };
type Location = { id: string; name: string };

const STATUS_ORDER = ["received", "diagnosis", "awaiting_parts", "repairing", "ready_for_pickup", "collected", "cancelled"];

export default function RepairsPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "walkin">("existing");
  const [form, setForm] = useState({ customer_id: "", device_id: "", device_description: "", problem_description: "", technician_name: "", estimated_cost: "", location_id: "" });

  async function load() {
    if (!token) return;
    setError("");
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
    if (!form.problem_description) { setError("Problem description required"); return; }
    if (mode === "existing" && !form.device_id) { setError("Select device for existing repair"); return; }
    if (mode === "walkin" && !form.device_description) { setError("Device description required for walk-in"); return; }
    const body: Record<string, unknown> = {
      problem_description: form.problem_description,
      technician_name: form.technician_name || null,
      estimated_cost: form.estimated_cost ? form.estimated_cost : null,
      customer_id: form.customer_id || null,
      location_id: form.location_id || null,
    };
    if (mode === "existing") {
      body.device_id = form.device_id;
      if (form.device_description) body.device_description = form.device_description;
    } else {
      body.device_description = form.device_description;
    }
    const res = await fetch(`${API_URL}/api/v1/repairs`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) { setError(await res.text()); return; }
    setOpen(false);
    setForm({ customer_id: "", device_id: "", device_description: "", problem_description: "", technician_name: "", estimated_cost: "", location_id: "" });
    load();
  }

  async function handleTransition(id: string, to: string) {
    const res = await fetch(`${API_URL}/api/v1/repairs/${id}/transition`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ to_status: to }) });
    if (!res.ok) { setError(await res.text()); return; }
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this repair? Only received/cancelled can be deleted.")) return;
    const res = await fetch(`${API_URL}/api/v1/repairs/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setError(await res.text()); return; }
    load();
  }

  const filtered = repairs.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (r.device_description || "").toLowerCase().includes(s) || r.problem_description.toLowerCase().includes(s) || (r.technician_name || "").toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
  });

  function nextStatus(current: string): string | null {
    const idx = STATUS_ORDER.indexOf(current);
    if (idx === -1 || idx >= STATUS_ORDER.indexOf("collected")) return null;
    if (current === "collected" || current === "cancelled") return null;
    // Strict linear: next is idx+1, but cancelled is always alternative
    return STATUS_ORDER[idx + 1];
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Repairs</h1>
          <p className="text-sm text-muted-foreground">Walk-in (device_description) or sold-device repairs — strict FSM</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>New Repair</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
            <DialogHeader><DialogTitle>New Repair</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Button type="button" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>Existing device</Button>
                <Button type="button" variant={mode === "walkin" ? "default" : "outline"} onClick={() => setMode("walkin")}>Walk-in</Button>
              </div>
              {mode === "existing" ? (
                <div className="flex flex-col gap-2">
                  <Label>Device *</Label>
                  <Select value={form.device_id || "none"} onValueChange={(v) => setForm({ ...form, device_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select</SelectItem>
                      {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.product_name} · {d.serial_number} {d.imei ? `(${d.imei})` : ""} · {d.status}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Label>Device description (optional context)</Label>
                  <Input value={form.device_description} onChange={(e) => setForm({ ...form, device_description: e.target.value })} placeholder="e.g., cracked screen notes" />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Label>Device description *</Label>
                  <Input value={form.device_description} onChange={(e) => setForm({ ...form, device_description: e.target.value })} placeholder="Model / IMEI as given by customer" />
                  <p className="text-xs text-muted-foreground">Walk-in: device not sold by this shop — description required</p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label>Problem description *</Label>
                <Textarea value={form.problem_description} onChange={(e) => setForm({ ...form, problem_description: e.target.value })} placeholder="What's wrong?" />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                  <Label>Technician (free text)</Label>
                  <Input value={form.technician_name} onChange={(e) => setForm({ ...form, technician_name: e.target.value })} placeholder="e.g., John" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Estimated cost</Label>
                  <Input type="number" step="0.01" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} placeholder="0.00" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Location (optional)</Label>
                  <Select value={form.location_id || "none"} onValueChange={(v) => setForm({ ...form, location_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit">Create Repair</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-3 bg-surface">{error}</p>}

      <div className="flex gap-2">
        <Input placeholder="Search repairs..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">All Repairs</CardTitle>
          <CardDescription>Strict: received → diagnosis → awaiting_parts → repairing → ready_for_pickup → collected (cancel anytime)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Est. / Actual</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    <TableCell className="tabular-nums text-xs">{r.estimated_cost || "—"} / {r.actual_cost || "—"}</TableCell>
                    <TableCell className="text-xs tabular-nums">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right flex gap-1 justify-end flex-wrap">
                      {ns && <Button size="sm" onClick={() => handleTransition(r.id, ns)}>→ {ns}</Button>}
                      {r.status !== "cancelled" && r.status !== "collected" && <Button variant="outline" size="sm" onClick={() => handleTransition(r.id, "cancelled")}>Cancel</Button>}
                      <Button variant="outline" size="sm" onClick={() => handleDelete(r.id)} disabled={r.status !== "received" && r.status !== "cancelled"}>Delete</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filtered.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No repairs yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
