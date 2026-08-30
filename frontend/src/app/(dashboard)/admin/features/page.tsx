"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FeaturesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/businesses");
  }, [router]);
  return <p className="text-sm text-muted-foreground">Redirecting to Admin → Businesses…</p>;
}
