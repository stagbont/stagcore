"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  X,
  Building2,
  ShieldCheck,
  Wrench,
  MapPin,
  ScanLine,
  Truck,
  Users,
  BarChart3,
  Layers,
  ShoppingBag,
  Cpu,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type AdminBusiness = {
  id: string;
  name: string;
  slug: string;
  created_at: string | null;
  updated_at: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_user_id: string | null;
  features_total: number;
  features_enabled: number;
};

type Feature = { id: string; business_id: string; feature_key: string; enabled: boolean };

const FEATURE_LABELS: Record<string, string> = {
  warranty: "Warranty",
  repairs: "Repairs",
  multi_location: "Multi-location",
  barcode_scanning: "Barcode scanning",
  suppliers: "Suppliers",
  customers: "Customers",
  advanced_reports: "Advanced reports",
};

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  warranty: "Device warranty tracking and claims",
  repairs: "Repair tickets including walk-in devices",
  multi_location: "Locations and stock transfers between locations",
  barcode_scanning: "Camera-based barcode / IMEI scanning",
  suppliers: "Supplier contacts and purchasing analytics",
  customers: "Customer directory and history",
  advanced_reports: "Velocity, stockout forecast & reorder advisory",
};

const FEATURE_IMPACT: Record<string, string> = {
  warranty: "Hides Warranty nav · blocks /warranty/*",
  repairs: "Hides Repairs nav · blocks /repairs/*",
  multi_location: "Hides Locations & Transfers · blocks /locations/*, /transfers/*",
  barcode_scanning: "Hides scanner entry · blocks /scan/*",
  suppliers: "Hides Suppliers nav · blocks /suppliers/*",
  customers: "Hides Customers nav · blocks /customers/*",
  advanced_reports: "Hides Intelligence · blocks /intelligence/*",
};

const FEATURE_ICON: Record<string, React.ElementType> = {
  warranty: ShieldCheck,
  repairs: Wrench,
  multi_location: MapPin,
  barcode_scanning: ScanLine,
  suppliers: Truck,
  customers: Users,
  advanced_reports: BarChart3,
};

const FEATURE_GROUPS: { key: string; label: string; icon: React.ElementType; keys: string[] }[] = [
  { key: "commerce", label: "Commerce", icon: ShoppingBag, keys: ["customers", "suppliers"] },
  { key: "operations", label: "Operations", icon: Cpu, keys: ["warranty", "repairs", "multi_location", "barcode_scanning"] },
  { key: "intelligence", label: "Intelligence", icon: Layers, keys: ["advanced_reports"] },
];

function DensityBar({ enabled, total }: { enabled: number; total: number }) {
  const n = total || 7;
  return (
    <div className="flex gap-0.5" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-3 rounded-full transition-colors ${i < enabled ? "bg-[var(--status-success)]" : "bg-[var(--border-hairline)]"}`}
        />
      ))}
    </div>
  );
}

export default function AdminBusinessesPage() {
  const { data: session } = useSession();
  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [featLoading, setFeatLoading] = useState(false);
  const [error, setError] = useState("");
  const [featError, setFeatError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    async function load() {
      if (!token) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_URL}/api/v1/admin/businesses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const txt = await res.text();
          setError(txt || `Failed to load businesses: ${res.status}`);
          return;
        }
        const data: AdminBusiness[] = await res.json();
        setBusinesses(data);
        if (data.length && !selectedId) setSelectedId(data[0].id);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
    // only on token change — selectedId intentionally excluded to avoid reselection loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    async function loadFeatures() {
      if (!token || !selectedId) return;
      setFeatLoading(true);
      setFeatError("");
      try {
        const res = await fetch(`${API_URL}/api/v1/business/${selectedId}/features`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const txt = await res.text();
          setFeatError(txt);
          setFeatures([]);
          return;
        }
        const data = await res.json();
        setFeatures(data.features ?? data);
      } catch (e) {
        setFeatError(String(e));
      } finally {
        setFeatLoading(false);
      }
    }
    loadFeatures();
  }, [token, selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return businesses;
    return businesses.filter(
      (b) => b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q) || (b.owner_email || "").toLowerCase().includes(q)
    );
  }, [businesses, search]);

  // KPI derivations — week window stable per mount (avoids impure Date.now() in render)
  const [weekAgoMs] = useState(() => Date.now() - 7 * 24 * 60 * 60 * 1000);
  const kpis = useMemo(() => {
    const total = businesses.length;
    const enabledSum = businesses.reduce((a, b) => a + (b.features_enabled || 0), 0);
    const avg = total ? enabledSum / total : 0;
    const new7d = businesses.filter((b) => (b.created_at ? new Date(b.created_at).getTime() >= weekAgoMs : false)).length;
    return { total, enabledSum, avg, new7d };
  }, [businesses, weekAgoMs]);

  async function toggle(key: string, enabled: boolean) {
    if (!selectedId || !token) return;
    const snapFeatures = [...features];
    const snapBusinesses = [...businesses];
    // optimistic
    const optimisticFeatures = features.map((f) => (f.feature_key === key ? { ...f, enabled } : f));
    const optimisticEnabledCount = optimisticFeatures.filter((f) => f.enabled).length;
    setFeatures(optimisticFeatures);
    setBusinesses((prev) =>
      prev.map((b) => (b.id === selectedId ? { ...b, features_enabled: optimisticEnabledCount, features_total: optimisticFeatures.length } : b))
    );
    setSavingKey(key);
    setFeatError("");
    try {
      const res = await fetch(`${API_URL}/api/v1/business/${selectedId}/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ feature_key: key, enabled }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Toggle failed: ${res.status}`);
      }
      const updated: Feature = await res.json();
      // reconcile from server truth — recount
      setFeatures((prev) => {
        const next = prev.map((f) => (f.feature_key === updated.feature_key ? updated : f));
        // ensure business count reflects server state
        const count = next.filter((f) => f.enabled).length;
        setBusinesses((bPrev) => bPrev.map((b) => (b.id === selectedId ? { ...b, features_enabled: count, features_total: next.length } : b)));
        return next;
      });
      setToast({ msg: `${FEATURE_LABELS[key] || key} ${enabled ? "enabled" : "disabled"}`, tone: "success" });
    } catch (e) {
      // revert
      setFeatures(snapFeatures);
      setBusinesses(snapBusinesses);
      const msg = e instanceof Error ? e.message : String(e);
      setFeatError(msg);
      setToast({ msg: `Failed: ${msg.slice(0, 120)}`, tone: "error" });
    } finally {
      setSavingKey(null);
    }
  }

  const selected = businesses.find((b) => b.id === selectedId) || null;

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-[520px] max-w-full" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border border-hairline bg-surface overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 border-r last:border-r-0 border-hairline space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          <Skeleton className="h-[420px] rounded-xl" />
          <Skeleton className="h-[420px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Businesses</h1>
          <p className="text-sm text-muted-foreground">Platform admin — fleet control & feature flags</p>
        </div>
        <div
          role="alert"
          className="rounded-xl border border-[var(--status-critical)]/30 bg-[var(--status-critical)]/10 p-4 text-sm text-[var(--status-critical)]"
        >
          <p className="font-medium">Platform admin only</p>
          <p className="mt-1 text-xs opacity-80 break-all font-mono">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Sign in as an email listed in <span className="font-mono">PLATFORM_ADMIN_EMAILS</span> (default{" "}
            <span className="font-mono">admin@stagcore.local</span>).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page intro */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Businesses</h1>
          <span className="hidden sm:inline-flex items-center rounded-full bg-surface border border-hairline px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
            {businesses.length} tenants
          </span>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Fleet ledger. Select a tenant to control which modules are visible and enforced server-side. Disabled modules are hidden from tenant navigation
          and their APIs reject requests.
        </p>
        <p className="text-xs text-muted-foreground">
          Core — Products, Devices, Inventory, Purchases, Sales, Dashboard — is always on.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border border-hairline bg-surface overflow-hidden">
        {[
          { label: "Tenants", value: String(kpis.total), sub: `${filtered.length} shown` },
          { label: "Modules enabled", value: String(kpis.enabledSum), sub: `of ${kpis.total * 7} slots` },
          { label: "Avg / tenant", value: kpis.avg.toFixed(1), sub: "enabled modules" },
          { label: "New · 7 days", value: String(kpis.new7d), sub: kpis.new7d ? "recent signups" : "no new tenants" },
        ].map((k) => (
          <div key={k.label} className="p-4 border-r last:border-r-0 border-hairline even:border-r-0 lg:even:border-r lg:last:border-r-0">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums font-mono">{k.value}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Toast */}
      <div aria-live="polite" aria-atomic="true" className="min-h-0">
        {toast && (
          <div
            role="status"
            className={`rounded-lg border px-3 py-2 text-sm ${toast.tone === "success" ? "border-[var(--status-success)]/20 bg-[var(--status-success)]/10 text-[var(--status-success)]" : "border-[var(--status-critical)]/30 bg-[var(--status-critical)]/10 text-[var(--status-critical)]"}`}
          >
            {toast.msg}
          </div>
        )}
      </div>

      {/* Master / Switchboard */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* Tenant index */}
        <Card className="border-hairline rounded-xl bg-surface overflow-hidden">
          <CardHeader className="pb-3 gap-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">Tenants</CardTitle>
              <Badge variant="secondary" className="rounded-full text-[11px] tabular-nums">
                {filtered.length}/{businesses.length}
              </Badge>
            </div>
            <CardDescription className="text-xs">Search by name, slug, or owner email</CardDescription>
            <form role="search" aria-label="Search tenants" onSubmit={(e) => e.preventDefault()} className="relative pt-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search businesses…"
                aria-label="Search businesses by name, slug or owner email"
                className="h-9 pl-8 pr-8 text-sm bg-background border-hairline"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 size-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </form>
            <p className="text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
              {filtered.length} {filtered.length === 1 ? "result" : "results"}
              {search ? ` for “${search}”` : ""}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-background border border-hairline">
                  <Building2 className="size-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium">{businesses.length === 0 ? "No tenants yet" : "No businesses match"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {businesses.length === 0 ? "Create the first business via Register, then return here." : `No results for “${search}”. Try a different name, slug, or owner.`}
                </p>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="mt-3 text-xs font-medium text-[var(--action-primary)] hover:underline"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-hairline border-t border-hairline">
                {filtered.map((b) => {
                  const active = b.id === selectedId;
                  const total = b.features_total || 7;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedId(b.id)}
                      aria-pressed={active}
                      aria-current={active ? "true" : undefined}
                      className={`group w-full text-left px-4 py-3.5 flex flex-col gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background relative min-h-[72px] ${active ? "bg-[var(--bg-surface-raised)]" : "hover:bg-muted/40 bg-surface"}`}
                    >
                      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-[var(--action-primary)]" aria-hidden />}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate pr-1">{b.name}</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums font-mono truncate">
                            {b.slug} · {b.id.slice(0, 8)}
                          </p>
                        </div>
                        <Badge
                          variant={b.features_enabled > 0 ? "success" : "secondary"}
                          className="shrink-0 rounded-full text-[11px] tabular-nums"
                        >
                          {b.features_enabled}/{total} on
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground truncate min-w-0">
                          {b.owner_name || "—"} {b.owner_email ? `· ${b.owner_email}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <DensityBar enabled={b.features_enabled} total={total} />
                        <span className="text-[11px] tabular-nums font-mono text-muted-foreground">
                          {b.created_at ? new Date(b.created_at).toLocaleDateString() : "—"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Switchboard */}
        <div className="flex flex-col gap-4 min-w-0">
          {!selected ? (
            <Card className="border-hairline rounded-xl bg-surface">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">Select a tenant on the left to manage modules.</CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-hairline rounded-xl overflow-hidden">
                <CardHeader className="pb-3 gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{selected.name}</CardTitle>
                      <CardDescription className="tabular-nums font-mono text-xs truncate">
                        {selected.slug} · {selected.id}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-hairline text-xs max-w-[180px] truncate">
                      {selected.owner_email || "no owner email"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant={selected.features_enabled > 0 ? "success" : "secondary"} className="rounded-full text-xs tabular-nums">
                      {selected.features_enabled}/{selected.features_total || features.length || 7} modules on
                    </Badge>
                    <span className="text-xs text-muted-foreground">Core always on — not toggled here.</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-6 pt-0">
                  {featError && (
                    <p role="alert" className="text-sm text-[var(--status-critical)] bg-[var(--bg-surface)] border border-[var(--status-critical)]/30 rounded-lg p-3 break-all">
                      {featError}
                    </p>
                  )}
                  {featLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between border border-hairline rounded-lg px-4 py-3 bg-background">
                          <div className="space-y-2 min-w-0 flex-1 pr-4">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-48" />
                          </div>
                          <Skeleton className="h-6 w-16 rounded-full" />
                        </div>
                      ))}
                    </div>
                  ) : features.length === 0 && !featError ? (
                    <p className="text-sm text-muted-foreground">No features returned for this tenant.</p>
                  ) : (
                    FEATURE_GROUPS.map((group) => {
                      const GroupIcon = group.icon;
                      const groupFeatures = group.keys.map((k) => features.find((f) => f.feature_key === k)).filter(Boolean) as Feature[];
                      if (!groupFeatures.length) return null;
                      return (
                        <div key={group.key} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 items-center justify-center rounded-md bg-surface border border-hairline">
                              <GroupIcon className="size-3.5 text-muted-foreground" />
                            </span>
                            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{group.label}</h3>
                            <Separator className="flex-1 ml-2" />
                          </div>
                          <div className="space-y-3">
                            {groupFeatures.map((f) => {
                              const Icon = FEATURE_ICON[f.feature_key] || Building2;
                              const saving = savingKey === f.feature_key;
                              return (
                                <div
                                  key={f.feature_key}
                                  className="flex items-start justify-between gap-3 border border-hairline rounded-lg px-3 sm:px-4 py-3 bg-background focus-within:ring-2 focus-within:ring-[var(--action-primary)] focus-within:ring-offset-1"
                                >
                                  <span className="hidden sm:flex size-8 items-center justify-center rounded-md bg-surface border border-hairline shrink-0 mt-0.5">
                                    <Icon className="size-4 text-muted-foreground" />
                                  </span>
                                  <div className="flex flex-col min-w-0 flex-1 pr-2">
                                    <Label htmlFor={`${selected.id}-${f.feature_key}`} className="text-sm font-medium cursor-pointer">
                                      {FEATURE_LABELS[f.feature_key] || f.feature_key}
                                    </Label>
                                    <span className="text-xs text-muted-foreground leading-snug">
                                      {FEATURE_DESCRIPTIONS[f.feature_key] || f.feature_key}
                                    </span>
                                    <span className="mt-1 text-[11px] font-mono tabular-nums text-muted-foreground">{f.feature_key}</span>
                                    <span className="mt-1 text-[11px] text-muted-foreground">{FEATURE_IMPACT[f.feature_key] || ""}</span>
                                  </div>
                                  <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-h-11">
                                    <Badge
                                      variant={f.enabled ? "success" : "secondary"}
                                      className="rounded-full text-[11px] hidden sm:inline-flex"
                                    >
                                      {f.enabled ? "Enabled" : "Disabled"}
                                    </Badge>
                                    <Switch
                                      id={`${selected.id}-${f.feature_key}`}
                                      checked={f.enabled}
                                      disabled={savingKey !== null && savingKey !== f.feature_key ? false : saving}
                                      aria-label={`${FEATURE_LABELS[f.feature_key] || f.feature_key} — ${f.enabled ? "enabled" : "disabled"}`}
                                      onCheckedChange={(checked) => toggle(f.feature_key, checked)}
                                      className="data-[state=checked]:bg-[var(--status-success)]"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
              <p className="text-[11px] text-muted-foreground px-1">
                Toggling a module hides it from the tenant’s sidebar and blocks its <span className="font-mono">/api/v1/*</span> routes. Records are kept.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
