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
  UserCog,
} from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { state: bizState, meta } = useBusiness();
  const features = bizState.features;
  const loadingFeatures = bizState.loading;
  const isAdminEmail = meta.isAdminEmail;
  const role = bizState.role ?? meta.currentRole ?? null;
  const isOwner = role === "OWNER";
  const isManager = role === "MANAGER";
  const isCashier = role === "CASHIER";
  const isClerk = role === "INVENTORY_CLERK";
  const isOwnerManager = isOwner || isManager;

  // Role-based nav: OWNER/MANAGER see all, CASHIER strict (Sales+Inventory view+Team read-only), CLERK inventory+catalog+purchase
  const operations = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];

  const catalogByRole = (() => {
    if (!role || isOwnerManager) {
      return [
        { href: "/categories", label: "Categories", icon: Tag },
        { href: "/products", label: "Products", icon: Package },
        { href: "/devices", label: "Devices", icon: Smartphone },
        { href: "/inventory", label: "Inventory", icon: Boxes },
        ...(features.multi_location ? [{ href: "/locations", label: "Locations", icon: MapPin }] : []),
        ...(features.multi_location ? [{ href: "/transfers", label: "Transfers", icon: ArrowLeftRight }] : []),
      ];
    }
    if (isCashier) {
      return [{ href: "/inventory", label: "Inventory", icon: Boxes }];
    }
    if (isClerk) {
      return [
        { href: "/categories", label: "Categories", icon: Tag },
        { href: "/products", label: "Products", icon: Package },
        { href: "/devices", label: "Devices", icon: Smartphone },
        { href: "/inventory", label: "Inventory", icon: Boxes },
        ...(features.multi_location ? [{ href: "/locations", label: "Locations", icon: MapPin }] : []),
        ...(features.multi_location ? [{ href: "/transfers", label: "Transfers", icon: ArrowLeftRight }] : []),
      ];
    }
    return [];
  })();
  const catalog = catalogByRole;

  const commerceByRole = (() => {
    if (!role || isOwnerManager) {
      return [
        { href: "/purchases", label: "Purchases", icon: ShoppingCart },
        { href: "/sales", label: "Sales", icon: Receipt },
        ...(features.customers ? [{ href: "/customers", label: "Customers", icon: Users }] : []),
        ...(features.suppliers ? [{ href: "/suppliers", label: "Suppliers", icon: Truck }] : []),
      ];
    }
    if (isCashier) {
      return [{ href: "/sales", label: "Sales", icon: Receipt }];
    }
    if (isClerk) {
      return [
        { href: "/purchases", label: "Purchases", icon: ShoppingCart },
        ...(features.suppliers ? [{ href: "/suppliers", label: "Suppliers", icon: Truck }] : []),
      ];
    }
    return [];
  })();
  const commerce = commerceByRole;

  const careByRole = (() => {
    if (!role || isOwnerManager) {
      return [
        ...(features.warranty ? [{ href: "/warranty", label: "Warranty", icon: ShieldCheck }] : []),
        ...(features.repairs ? [{ href: "/repairs", label: "Repairs", icon: Wrench }] : []),
      ];
    }
    return [];
  })();
  const care = careByRole;

  const systemByRole = (() => {
    const base: { href: string; label: string; icon: typeof HelpCircle }[] = [
      { href: "/team", label: "Team", icon: UserCog },
      { href: "/help", label: "Help", icon: HelpCircle },
    ];
    if (!role || isOwnerManager) {
      base.splice(1, 0, { href: "/reports", label: "Reports", icon: BarChart3 });
    }
    return base;
  })();
  const system = systemByRole;

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
            {role ? <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{role.replace("_", " ")}</p> : null}
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
