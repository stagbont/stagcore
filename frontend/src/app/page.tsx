"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) return;
    if (session?.user) router.replace("/dashboard");
    else router.replace("/login");
  }, [isPending, session, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
        <p className="text-sm text-muted-foreground" aria-live="polite" aria-busy={isPending}>Redirecting…</p>
      </div>
    </div>
  );
}
