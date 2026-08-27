"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export default function FeaturesPage() {
  const { data: session } = useSession();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const token = (session?.session as unknown as { token?: string } | undefined)?.token || "";

  useEffect(() => {
    async function load() {
      if (!token) return;
      try {
        const bizRes = await fetch(`${API_URL}/api/v1/business/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!bizRes.ok) {
          setError(`Failed to load businesses: ${bizRes.status}`);
          return;
        }
        const businesses = await bizRes.json();
        if (!businesses.length) {
          setError("No business found for this user");
          return;
        }
        const bid = businesses[0].id;
        setBusinessId(bid);
        const featRes = await fetch(`${API_URL}/api/v1/business/${bid}/features`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!featRes.ok) {
          const txt = await featRes.text();
          setError(txt);
          return;
        }
        const data = await featRes.json();
        setFeatures(data.features);
      } catch (e) {
        setError(String(e));
      }
    }
    load();
  }, [token]);

  async function toggle(key: string, enabled: boolean) {
    if (!businessId || !token) return;
    setSaving(key);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/v1/business/${businessId}/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ feature_key: key, enabled }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setError(txt);
        return;
      }
      const updated = await res.json();
      setFeatures((prev) => prev.map((f) => (f.feature_key === key ? updated : f)));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  }

  if (!businessId && !error) {
    return <p className="text-sm text-muted-foreground">Loading features...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Feature flags</h1>
        <p className="text-sm text-muted-foreground">Toggle modules per business. Only Platform Admin can change these. Disabled modules are hidden from navigation and their APIs reject requests.</p>
        {businessId && <p className="mt-1 text-xs text-muted-foreground">Business ID: <span className="tabular-nums">{businessId}</span></p>}
      </div>
      {error && <p className="text-sm text-[var(--status-critical)] bg-[var(--bg-surface)] border border-hairline rounded-md p-3">{error}</p>}
      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-base">Modules</CardTitle>
          <CardDescription>Core (Products, Devices, Inventory, Purchases, Sales, Dashboard) is always on and not listed here.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {features.map((f) => (
            <div key={f.feature_key} className="flex items-center justify-between border border-hairline rounded-md px-4 py-3 bg-background">
              <div className="flex flex-col">
                <Label htmlFor={f.feature_key} className="text-sm font-medium">
                  {FEATURE_LABELS[f.feature_key] || f.feature_key}
                </Label>
                <span className="text-xs text-muted-foreground tabular-nums">{f.feature_key}</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={f.enabled ? "default" : "secondary"} className="rounded-full">
                  {f.enabled ? "Enabled" : "Disabled"}
                </Badge>
                <Switch
                  id={f.feature_key}
                  checked={f.enabled}
                  disabled={!!saving}
                  onCheckedChange={(checked) => toggle(f.feature_key, checked)}
                />
              </div>
            </div>
          ))}
          {!features.length && !error && <p className="text-sm text-muted-foreground">No features returned.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
