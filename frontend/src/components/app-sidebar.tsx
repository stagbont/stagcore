"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Feature = { feature_key: string; enabled: boolean };

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadFeatures() {
      if (!session?.session?.token || !session?.user) return;
      // Need business_id — fetch businesses
      try {
        const token = (session.session as unknown as { token: string }).token || "";
        if (!token) return;
        const bizRes = await fetch(`${API_URL}/api/v1/business/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!bizRes.ok) return;
        const businesses = await bizRes.json();
        if (!businesses.length) return;
        const bizId = businesses[0].id;
        const featRes = await fetch(`${API_URL}/api/v1/business/${bizId}/features`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!featRes.ok) return;
        const data = await featRes.json();
        const map: Record<string, boolean> = {};
        for (const f of data.features as Feature[]) map[f.feature_key] = f.enabled;
        setFeatures(map);
      } catch {
        // ignore
      }
    }
    loadFeatures();
  }, [session]);

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/categories", label: "Categories" },
    { href: "/products", label: "Products" },
    { href: "/devices", label: "Devices" },
    { href: "/inventory", label: "Inventory" },
    ...(features.multi_location ? [{ href: "/locations", label: "Locations" }] : []),
    ...(features.multi_location ? [{ href: "/transfers", label: "Transfers" }] : []),
    { href: "/purchases", label: "Purchases" },
    { href: "/sales", label: "Sales" },
    ...(features.customers ? [{ href: "/customers", label: "Customers" }] : []),
    ...(features.suppliers ? [{ href: "/suppliers", label: "Suppliers" }] : []),
    ...(features.warranty ? [{ href: "/warranty", label: "Warranty" }] : []),
    ...(features.repairs ? [{ href: "/repairs", label: "Repairs" }] : []),
    { href: "/reports", label: "Reports" },
  ];

  // Show admin link only if user email is platform admin (we check via API or just always show link — backend will 403)
  const isAdminEmail = (session?.user?.email || "").toLowerCase() === "admin@stagcore.local";

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-hairline bg-surface p-4">
      <Link href="/dashboard" className="mb-6 text-lg font-semibold tracking-tight">
        Stagcore
      </Link>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-background text-foreground font-medium border border-hairline" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {isAdminEmail && (
        <>
          <Separator className="my-4" />
          <Link
            href="/admin/features"
            className={`rounded-md px-3 py-2 text-sm ${pathname?.startsWith("/admin") ? "bg-background font-medium border border-hairline" : "text-muted-foreground hover:bg-background"}`}
          >
            Admin · Features
          </Link>
        </>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Separator />
        <div className="px-3 py-2">
          <p className="text-sm font-medium truncate">{session?.user?.name || "—"}</p>
          <p className="text-xs text-muted-foreground truncate">{session?.user?.email || ""}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await authClient.signOut();
            router.push("/login");
          }}
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}
