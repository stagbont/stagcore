"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, authClient } from "@/lib/auth-client";
import { useBusiness } from "@/components/providers/business-provider";
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
  HelpCircle,
} from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { state: bizState, meta } = useBusiness();
  const features = bizState.features;
  const loadingFeatures = bizState.loading;
  const isAdminEmail = meta.isAdminEmail;

  const operations = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];
  const catalog = [
    { href: "/categories", label: "Categories", icon: Tag },
    { href: "/products", label: "Products", icon: Package },
    { href: "/devices", label: "Devices", icon: Smartphone },
    { href: "/inventory", label: "Inventory", icon: Boxes },
    ...(features.multi_location ? [{ href: "/locations", label: "Locations", icon: MapPin }] : []),
    ...(features.multi_location ? [{ href: "/transfers", label: "Transfers", icon: ArrowLeftRight }] : []),
  ];
  const commerce = [
    { href: "/purchases", label: "Purchases", icon: ShoppingCart },
    { href: "/sales", label: "Sales", icon: Receipt },
    ...(features.customers ? [{ href: "/customers", label: "Customers", icon: Users }] : []),
    ...(features.suppliers ? [{ href: "/suppliers", label: "Suppliers", icon: Truck }] : []),
  ];
  const care = [
    ...(features.warranty ? [{ href: "/warranty", label: "Warranty", icon: ShieldCheck }] : []),
    ...(features.repairs ? [{ href: "/repairs", label: "Repairs", icon: Wrench }] : []),
  ];
  const system = [
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/help", label: "Help", icon: HelpCircle },
  ];

  const allNav = [...operations, ...catalog, ...commerce, ...care, ...system];

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
            <Boxes className="size-4" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Stagcore</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {loadingFeatures ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {Array.from({ length: allNav.length || 9 }).map((_, i) => (
                  <SidebarMenuSkeleton key={i} showIcon />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            <SidebarNavGroup label="Operations" items={operations} pathname={pathname} />
            <SidebarNavGroup label="Catalog" items={catalog} pathname={pathname} />
            <SidebarNavGroup label="Commerce" items={commerce} pathname={pathname} />
            {care.length ? <SidebarNavGroup label="Care" items={care} pathname={pathname} /> : null}
            <SidebarNavGroup label="System" items={system} pathname={pathname} />
          </>
        )}
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

function SidebarNavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: { href: string; label: string; icon: React.ElementType }[];
  pathname: string | null;
}) {
  if (!items.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <Link href={item.href} aria-current={active ? "page" : undefined}>
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
