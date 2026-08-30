"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSearchParams } from "next/navigation";
import { tutorials, personaOptions } from "@/content/help/tutorials";
import { HelpCircle, Search, Clock3, Users, ShieldCheck, Tag, Package, Smartphone, Boxes, Truck, UsersRound, ShoppingCart, Receipt, ScanLine, ArrowLeftRight, ClipboardList, Wrench, BarChart3, Building2, LayoutDashboard } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const iconMap: Record<string, React.ElementType> = {
  "quick-start": LayoutDashboard,
  "business-team": UsersRound,
  "categories-warranty": Tag,
  "products": Package,
  "devices": Smartphone,
  "inventory-ledger": Boxes,
  "suppliers-customers": Truck,
  "purchases": ShoppingCart,
  "sales-pos": Receipt,
  "scanning-search": ScanLine,
  "returns-cancellations": ClipboardList,
  "transfers-locations": ArrowLeftRight,
  "warranty": ShieldCheck,
  "repairs": Wrench,
  "dashboard-reports": BarChart3,
  "platform-admin": Building2,
};

export default function HelpIndexPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading help center…</div>}>
      <HelpIndexInner />
    </Suspense>
  );
}

function HelpIndexInner() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") || "";
  const [q, setQ] = useState(initialQ);
  const [persona, setPersona] = useState<(typeof personaOptions)[number]>("All");
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => { setQ(searchParams.get("q") || ""); }, [searchParams]);

  useEffect(() => {
    const email = (session?.user?.email || "").toLowerCase();
    setIsAdmin(email === "admin@stagcore.local");
  }, [session]);

  useEffect(() => {
    async function loadFeatures() {
      const token = (session?.session as unknown as { token?: string } | undefined)?.token;
      if (!token || !session?.user) return;
      try {
        const bizRes = await fetch(`${API_URL}/api/v1/business/`, { headers: { Authorization: `Bearer ${token}` } });
        if (!bizRes.ok) return;
        const businesses = await bizRes.json();
        if (!businesses.length) return;
        const featRes = await fetch(`${API_URL}/api/v1/business/${businesses[0].id}/features`, { headers: { Authorization: `Bearer ${token}` } });
        if (!featRes.ok) return;
        const data = await featRes.json();
        const map: Record<string, boolean> = {};
        for (const f of data.features as { feature_key: string; enabled: boolean }[]) map[f.feature_key] = f.enabled;
        setFeatures(map);
      } catch {}
    }
    loadFeatures();
  }, [session]);

  const filtered = useMemo(() => {
    let list = [...tutorials].sort((a, b) => a.order - b.order);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(s) || t.description.toLowerCase().includes(s) || t.shortTitle.toLowerCase().includes(s) || t.slug.toLowerCase().includes(s));
    }
    if (persona !== "All") {
      list = list.filter((t) => t.persona.includes(persona as any));
    }
    return list;
  }, [q, persona]);

  const countLabel = filtered.length === tutorials.length ? `${tutorials.length} tutorials` : `${filtered.length} of ${tutorials.length}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HelpCircle className="size-6 text-primary" /> Help Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Searchable, tenant-aware tutorials — flag-gated modules hide when disabled.</p>
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">{countLabel} · Click any card to open the guide.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tutorials…" aria-label="Search tutorials" className="h-9 pl-8 w-56 sm:w-64 bg-background" />
          </div>
          <Select value={persona} onValueChange={(v) => setPersona(v as any)}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {personaOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t) => {
          const Icon = iconMap[t.slug] || HelpCircle;
          const isFlagOff = !!t.flag && !(t.slug === "suppliers-customers" ? (features.suppliers || features.customers) : features[t.flag]);
          const showFlagBadge = !!t.flag && isFlagOff;
          return (
            <Link key={t.slug} href={`/help/${t.slug}`} className="group">
              <Card className={`h-full border-border bg-surface transition-colors group-hover:border-primary/30 group-hover:bg-surface-raised ${showFlagBadge && !isAdmin ? "hidden" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
                      <Icon className="size-4" />
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground flex items-center gap-1 shrink-0"><Clock3 className="size-3" /> {t.estimatedMinutes} min</span>
                  </div>
                  <CardTitle className="text-base leading-tight mt-2">{t.title}</CardTitle>
                  <CardDescription className="text-xs line-clamp-2">{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 flex flex-wrap gap-1.5">
                  {t.persona.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[11px] font-normal rounded-full"><Users className="size-3 mr-1" />{p}</Badge>
                  ))}
                  {t.flag && <Badge variant={isFlagOff ? "destructive" : "outline"} className="text-[10px] rounded-full">{isFlagOff ? "Flag off" : t.flag}</Badge>}
                  {showFlagBadge && isAdmin && <Badge variant="outline" className="text-[10px] rounded-full border-amber-500/30 text-amber-600">Disabled for this business</Badge>}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      {!filtered.length && <p className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg bg-surface">No tutorials match your search or persona filter.</p>}
      <Card className="border-border bg-surface">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">How to use this help center</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground leading-relaxed">
          Each tutorial follows <span className="font-medium text-foreground">Goal → Steps → Expected result → Troubleshooting → Next</span>. Steps reference exact button labels and placeholders so you can follow along in the app. If a module is disabled for your business, its tutorial is hidden — your Platform Admin enables it in <span className="font-mono text-foreground">Admin → Features</span>.
        </CardContent>
      </Card>
    </div>
  );
}
