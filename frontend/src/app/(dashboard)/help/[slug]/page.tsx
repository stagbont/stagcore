"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getTutorial, getPrevNext } from "@/content/help/tutorials";
import { ArrowLeft, ArrowRight, Clock3, Users, ExternalLink, AlertTriangle, Lightbulb, CheckCircle2, Play } from "lucide-react";
import { useTour, type TourId } from "@/components/help/tour/driver-tour";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function FlagCallout({ flag, enabled }: { flag: string; enabled: boolean | null }) {
  if (enabled === true) return null;
  if (enabled === null) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed">
        <span className="font-medium text-amber-700 dark:text-amber-400">Requires enablement</span> — this section needs the <span className="font-mono font-medium text-foreground">{flag}</span> feature. Ask your Platform Admin to enable it in Admin → Features.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[var(--status-critical)]/20 bg-[var(--status-critical)]/10 p-3 text-xs leading-relaxed">
      <span className="font-medium text-[var(--status-critical)]">Feature disabled</span> — <span className="font-mono font-medium text-foreground">{flag}</span> is off for this business. The nav item is hidden and the API returns 403. Your admin can enable it in <Link href="/admin/features" className="underline text-primary">Admin → Features</Link> without redeploying.
    </div>
  );
}

export default function HelpDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const tut = getTutorial(slug);
  const { prev, next } = getPrevNext(slug);
  const { data: session } = useSession();
  const [flagEnabled, setFlagEnabled] = useState<boolean | null>(null);
  const tourSlugs: Record<string, TourId> = { "quick-start": "quick-start", "inventory-ledger": "inventory-ledger", "sales-pos": "sales-pos" };
  const tourId = tourSlugs[slug] || null;
  const { start: startTour } = useTour((tourId || "quick-start") as TourId);

  useEffect(() => {
    async function check() {
      if (!tut?.flag || !session) { setFlagEnabled(null); return; }
      const token = (session?.session as unknown as { token?: string } | undefined)?.token;
      if (!token) { setFlagEnabled(null); return; }
      try {
        const bizRes = await fetch(`${API_URL}/api/v1/business/`, { headers: { Authorization: `Bearer ${token}` } });
        if (!bizRes.ok) { setFlagEnabled(null); return; }
        const businesses = await bizRes.json();
        if (!businesses.length) { setFlagEnabled(null); return; }
        const featRes = await fetch(`${API_URL}/api/v1/business/${businesses[0].id}/features`, { headers: { Authorization: `Bearer ${token}` } });
        if (!featRes.ok) { setFlagEnabled(null); return; }
        const data = await featRes.json();
        const map: Record<string, boolean> = {};
        for (const f of data.features as { feature_key: string; enabled: boolean }[]) map[f.feature_key] = f.enabled;
        // suppliers-customers is dual flag
        if (tut.slug === "suppliers-customers") setFlagEnabled(!!map.suppliers || !!map.customers);
        else setFlagEnabled(tut.flag ? !!map[tut.flag] : null);
      } catch { setFlagEnabled(null); }
    }
    check();
  }, [tut, session, slug]);

  if (!tut) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="border-border bg-surface">
          <CardHeader><CardTitle className="text-base">Tutorial not found</CardTitle><CardDescription>Unknown slug: {slug}</CardDescription></CardHeader>
          <CardContent><Link href="/help"><Button variant="outline">Back to Help Center</Button></Link></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <Link href="/help" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Back to Help Center
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="outline" className="text-[11px] rounded-full tabular-nums">Tutorial {tut.order + 1} of 16</Badge>
          <Badge variant="secondary" className="text-[11px] rounded-full flex items-center gap-1"><Clock3 className="size-3" />{tut.estimatedMinutes} min</Badge>
          {tut.flag && <Badge variant={flagEnabled === false ? "destructive" : flagEnabled === true ? "default" : "outline"} className="text-[10px] rounded-full font-mono">{tut.flag}{flagEnabled === false ? " · off" : ""}</Badge>}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{tut.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{tut.description}</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tut.persona.map((p) => <Badge key={p} variant="secondary" className="text-[11px] font-normal rounded-full"><Users className="size-3 mr-1" />{p}</Badge>)}
        </div>
        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          <span className="text-muted-foreground">Route:</span> <Link href={tut.route} className="font-mono text-primary hover:underline inline-flex items-center gap-1">{tut.route} <ExternalLink className="size-3" /></Link>
          {!!tut.prerequisites.length && <><Separator orientation="vertical" className="h-4" /><span className="text-muted-foreground">Prerequisites: {tut.prerequisites.join(", ")}</span></>}
        </div>
        {tourId && (
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={startTour} className="gap-1.5 h-8 text-xs"><Play className="size-3.5" /> Take a tour</Button>
            <span className="ml-2 text-[11px] text-muted-foreground">Highlights the real UI — use on the tutorial’s route</span>
          </div>
        )}
      </div>

      <Separator />

      {tut.flag && <FlagCallout flag={tut.flag} enabled={flagEnabled} />}

      <article className="flex flex-col gap-6">
        {tut.sections.map((sec, i) => (
          <Card key={i} className="border-border bg-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{sec.heading}</CardTitle>
              {sec.body && <CardDescription className="text-sm leading-relaxed text-foreground/80">{sec.body}</CardDescription>}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {sec.callout && (
                <div className={`rounded-lg border p-3 text-xs leading-relaxed ${sec.callout.variant === "warning" ? "border-amber-500/30 bg-amber-500/10" : sec.callout.variant === "critical" ? "border-[var(--status-critical)]/20 bg-[var(--status-critical)]/10" : sec.callout.variant === "success" ? "border-[var(--status-success)]/20 bg-[var(--status-success)]/10" : "border-border bg-background"}`}>
                  <Lightbulb className="size-3 inline mr-1" />{sec.callout.text}
                </div>
              )}
              {sec.flagNote && <FlagCallout flag={sec.flagNote} enabled={flagEnabled} />}
              {sec.steps && (
                <ol className="flex flex-col gap-3 list-none p-0">
                  {sec.steps.map((st, idx) => (
                    <li key={idx} className="flex gap-3 rounded-lg border border-border bg-background p-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold tabular-nums">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{st.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1">{st.detail}</p>
                        {st.uiAnchor && <p className="text-[11px] font-mono text-primary mt-1.5 bg-surface rounded px-1.5 py-0.5 inline-block">{st.uiAnchor}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        ))}

        {!!tut.troubleshooting.length && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" /> Troubleshooting</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {tut.troubleshooting.map((t, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface p-3">
                  <p className="text-sm font-medium">{t.q}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">{t.a}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="border-border bg-surface">
          <CardContent className="pt-6 flex flex-col gap-3">
            <p className="text-sm flex items-center gap-2"><CheckCircle2 className="size-4 text-[var(--status-success)]" /> Expected: you can visit <Link href={tut.route} className="text-primary underline font-mono">{tut.route}</Link> and complete the steps end to end.</p>
            <div className="flex items-center justify-between gap-2 pt-2">
              {prev ? <Link href={`/help/${prev.slug}`}><Button variant="outline" size="sm"><ArrowLeft className="size-4" /> {prev.shortTitle}</Button></Link> : <span />}
              {next ? <Link href={`/help/${next.slug}`}><Button size="sm">{next.shortTitle} <ArrowRight className="size-4" /></Button></Link> : <Link href="/help"><Button size="sm">Back to Help Center</Button></Link>}
            </div>
          </CardContent>
        </Card>
      </article>
    </div>
  );
}
