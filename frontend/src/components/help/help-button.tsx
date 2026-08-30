import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HelpButton({ slug, label = "Help" }: { slug: string; label?: string }) {
  return (
    <Link href={`/help/${slug}`} aria-label={`${label}: ${slug}`}>
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
        <HelpCircle className="size-3.5" />
        <span className="hidden sm:inline">{label}</span>
      </Button>
    </Link>
  );
}
