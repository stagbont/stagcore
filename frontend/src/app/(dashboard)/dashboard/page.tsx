"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [business, setBusiness] = useState<{ name: string; slug: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const token = (session?.session as unknown as { token?: string } | undefined)?.token;
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/api/v1/business/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const txt = await res.text();
          setError(txt);
          return;
        }
        const data = await res.json();
        if (data.length) setBusiness(data[0]);
      } catch (e) {
        setError(String(e));
      }
    }
    load();
  }, [session]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {business ? `Business: ${business.name} · ${business.slug}` : "Loading business..."}
        </p>
        {error && <p className="text-sm text-[var(--status-critical)]">{error}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-hairline">
          <CardHeader className="pb-2">
            <CardDescription>Today&apos;s sales</CardDescription>
            <CardTitle className="text-2xl tabular-nums">—</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">No sales yet</p>
          </CardContent>
        </Card>
        <Card className="border-hairline">
          <CardHeader className="pb-2">
            <CardDescription>Gross profit</CardDescription>
            <CardTitle className="text-2xl tabular-nums">—</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">No data</p>
          </CardContent>
        </Card>
        <Card className="border-hairline">
          <CardHeader className="pb-2">
            <CardDescription>Low stock items</CardDescription>
            <CardTitle className="text-2xl tabular-nums">—</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" className="rounded-full">
              All good
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card className="border-hairline">
        <CardHeader>
          <CardTitle className="text-lg">Phase 1 — Foundation</CardTitle>
          <CardDescription>Auth, business, roles, and feature flags are live. Next: products and devices.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc pl-5">
            <li>Signed in as {session?.user?.email}</li>
            <li>Business: {business?.name || "—"}</li>
            <li>Backend: {API_URL} · <a href={`${API_URL}/docs`} target="_blank" className="text-primary underline">Open API docs</a></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
