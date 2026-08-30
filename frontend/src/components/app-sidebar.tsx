"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Tag,
  Package,
  Smartphone,
  Boxes,
  MapPin,
  ArrowLeftRight,
  ShoppingCart,
  Receipt,
  Users,
  Truck,
  ShieldCheck,
  Wrench,
  BarChart3,
  Building2,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Feature = { feature_key: string; enabled: boolean };

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loadingFeatures, setLoadingFeatures] = useState(true);

  useEffect(() => {
    async function loadFeatures() {
      if (!session?.session?.token || !session?.user) {
        setLoadingFeatures(false);
        return;
      }
      try {
        const token = (session.session as unknown as { token: string }).token || "";
        if (!token) {
          setLoadingFeatures(false);
          return;
        }
        const bizRes = await fetch(`${API_URL}/api/v1/business/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!bizRes.ok) {
          setLoadingFeatures(false);
          return;
        }
        const businesses = await bizRes.json();
        if (!businesses.length) {
          setLoadingFeatures(false);
          return;
        }
        const bizId = businesses[0].id;
        const featRes = await fetch(`${API_URL}/api/v1/business/${bizId}/features`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!featRes.ok) {
          setLoadingFeatures(false);
          return;
        }
        const data = await featRes.json();
        const map: Record<string, boolean> = {};
        for (const f of data.features as Feature[]) map[f.feature_key] = f.enabled;
        setFeatures(map);
      } catch {
        // ignore
      } finally {
        setLoadingFeatures(false);
      }
    }
    loadFeatures();
  }, [session]);

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/categories", label: "Categories", icon: Tag },
    { href: "/products", label: "Products", icon: Package },
    { href: "/devices", label: "Devices", icon: Smartphone },
    { href: "/inventory", label: "Inventory", icon: Boxes },
    ...(features.multi_location ? [{ href: "/locations", label: "Locations", icon: MapPin }] : []),
    ...(features.multi_location ? [{ href: "/transfers", label: "Transfers", icon: ArrowLeftRight }] : []),
    { href: "/purchases", label: "Purchases", icon: ShoppingCart },
    { href: "/sales", label: "Sales", icon: Receipt },
    ...(features.customers ? [{ href: "/customers", label: "Customers", icon: Users }] : []),
    ...(features.suppliers ? [{ href: "/suppliers", label: "Suppliers", icon: Truck }] : []),
    ...(features.warranty ? [{ href: "/warranty", label: "Warranty", icon: ShieldCheck }] : []),
    ...(features.repairs ? [{ href: "/repairs", label: "Repairs", icon: Wrench }] : []),
    { href: "/reports", label: "Reports", icon: BarChart3 },
  ];

  const isAdminEmail = (session?.user?.email || "").toLowerCase() === "admin@stagcore.local";

  if (isAdminEmail) {
    return (
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader className="border-b border-sidebar-border">
          <Link href="/admin/businesses" className="flex items-center gap-2 px-2 py-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Stagcore</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Platform</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname?.startsWith("/admin")}>
                    <Link href="/admin/businesses" aria-current={pathname?.startsWith("/admin") ? "page" : undefined}>
                      <Building2 />
                      <span>Businesses</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <div className="flex flex-col gap-2 p-2">
            <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-medium truncate">{session?.user?.name || "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{session?.user?.email || ""}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">Platform Admin</p>
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
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Stagcore</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {loadingFeatures ? (
                <>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SidebarMenuSkeleton key={i} showIcon />
                  ))}
                </>
              ) : (
                navItems.map((item) => {
                  const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href} aria-current={active ? "page" : undefined}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex flex-col gap-2 p-2">
          <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium truncate">{session?.user?.name || "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{session?.user?.email || ""}</p>
          </div>
          <Separator className="group-data-[collapsible=icon]:hidden" />
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
      </SidebarFooter>
    </Sidebar>
  );
}
