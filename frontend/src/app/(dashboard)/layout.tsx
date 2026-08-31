"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ScanLine, X } from "lucide-react";
import { BusinessProvider, useBusiness } from "@/components/providers/business-provider";
import { API_URL } from "@/lib/fetch-with-auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <BusinessProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </BusinessProvider>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { state: bizState } = useBusiness();
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const businessName = bizState.business?.name || bizState.business?.slug || "";

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace("/login");
      return;
    }
    if (!isPending && session?.user) {
      const email = (session.user.email || "").toLowerCase();
      if (email === "admin@stagcore.local") {
        const p = window.location.pathname;
        if (!p.startsWith("/admin")) {
          router.replace("/admin/businesses");
        }
      }
    }
  }, [isPending, session, router]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const code = search.trim();
    if (!code) return;
    // Help shortcut: "?help" or "help " routes to help search
    if (/^\?help\b/i.test(code) || /^help\s/i.test(code) || code.toLowerCase() === "help") {
      const q = code.replace(/^\?help\s*/i, "").replace(/^help\s*/i, "").trim();
      router.push(q ? `/help?q=${encodeURIComponent(q)}` : "/help");
      return;
    }
    const token = (session?.session as unknown as { token?: string } | undefined)?.token;
    if (!token) return;
    setSearching(true);
    try {
      // Try IMEI → serial → barcode, per DESIGN global IMEI lookup (one search action)
      let res = await fetch(`${API_URL}/api/v1/scan/by-imei/${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok)
        res = await fetch(`${API_URL}/api/v1/scan/by-serial/${encodeURIComponent(code)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      if (!res.ok)
        res = await fetch(`${API_URL}/api/v1/scan/by-barcode/${encodeURIComponent(code)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      if (res.ok) {
        router.push("/devices");
      } else {
        // fallback to devices with query highlight via URL param
        router.push(`/devices?q=${encodeURIComponent(code)}`);
      }
    } finally {
      setSearching(false);
    }
  }

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
          <p className="text-sm text-muted-foreground" aria-live="polite">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!session?.user) return null;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-surface/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/60 sm:px-6">
          <SidebarTrigger className="shrink-0" />
          <div className="hidden sm:flex flex-1 items-center gap-2 text-sm">
            <span className="font-medium truncate">{businessName || "Workspace"}</span>
            <span className="text-muted-foreground hidden lg:inline">·</span>
            <span className="text-muted-foreground hidden lg:inline">Welcome back</span>
          </div>
          <form onSubmit={handleSearch} data-tour="global-search" className="flex flex-1 max-w-md items-center gap-2 sm:ml-auto" role="search" aria-label="Global IMEI/serial search">
            <div className="relative flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search IMEI, serial or barcode…"
                aria-label="Search IMEI, serial or barcode"
                className="h-9 pl-8 pr-8 text-sm bg-background"
                type="search"
                enterKeyHint="search"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                aria-busy={searching}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <Button type="submit" size="sm" disabled={searching} aria-label="Search device" aria-busy={searching} className="shrink-0 min-h-9">
              <ScanLine aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">{searching ? "Searching…" : "Search"}</span>
            </Button>
          </form>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
