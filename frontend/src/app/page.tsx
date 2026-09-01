"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { BusinessProvider, useBusiness } from "@/components/providers/business-provider";

export default function Home() {
  return (
    <BusinessProvider>
      <HomeInner />
    </BusinessProvider>
  );
}

function HomeInner() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { state: bizState } = useBusiness();

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      router.replace("/login");
      return;
    }
    if (bizState.loading) return;
    const role = bizState.role ?? null;
    if (role === "CASHIER") router.replace("/sales");
    else if (role === "INVENTORY_CLERK") router.replace("/inventory");
    else router.replace("/dashboard");
  }, [isPending, session, bizState.loading, bizState.role, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground" aria-live="polite" aria-busy="true">Redirecting…</p>
      </div>
    </div>
  );
}
