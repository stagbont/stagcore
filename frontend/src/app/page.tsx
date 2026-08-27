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

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Redirecting...</div>;
}
