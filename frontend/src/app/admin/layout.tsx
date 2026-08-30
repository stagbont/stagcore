"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";

const RAW_ENV = process.env.NEXT_PUBLIC_APP_ENV;
const ENV_LABEL: string = RAW_ENV || (process.env.NEXT_PUBLIC_API_URL?.includes("localhost") ? "development" : "production");
const ENV_DOT_CLASS = ENV_LABEL === "production" ? "bg-[var(--status-success)]" : "bg-[var(--status-warning)]";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <div className="h-14 border-b border-hairline bg-surface animate-pulse" />
        <div className="flex-1 p-6 max-w-[1280px] w-full mx-auto space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  if (!session?.user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Inverted platform band — uses dark tokens via wrapper class so it stays dark in both themes */}
      <div className="dark">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 sm:px-6">
          <Link href="/admin/businesses" className="flex items-center gap-3 min-w-0">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--action-primary)] text-white shrink-0">
              <Building2 className="size-4" />
            </span>
            <span className="flex flex-col min-w-0 text-left">
              <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)] leading-none">Stagcore — Platform Console</span>
              <span className="hidden sm:inline text-[11px] tracking-wide text-[var(--text-secondary)]">Fleet control · Businesses & Feature Flags</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface-raised)] px-2.5 py-1 text-[11px] font-medium tracking-wide tabular-nums text-[var(--text-secondary)]">
              <span className={`size-1.5 rounded-full ${ENV_DOT_CLASS}`} aria-hidden />
              {ENV_LABEL}
            </span>
            <span className="hidden lg:block h-6 w-px bg-[var(--border-hairline)]" aria-hidden />
            <div className="hidden sm:flex flex-col items-end leading-tight min-w-0">
              <span className="text-xs font-medium truncate max-w-36 text-[var(--text-primary)]">{session.user.name || "—"}</span>
              <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-36">{session.user.email || ""}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await authClient.signOut();
                router.push("/login");
              }}
              className="h-8 border-[var(--border-hairline)] bg-[var(--bg-surface-raised)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-canvas)]"
            >
              Sign out
            </Button>
          </div>
        </header>
      </div>
      <main className="flex-1 w-full max-w-[1280px] mx-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
