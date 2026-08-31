import * as React from "react";
import { cn } from "@/lib/utils";

// children-over-render-props per vercel-composition-patterns
// Callers pass CTA as children, not renderAction prop.

export function EmptyState({
  className,
  title,
  description,
  children,
  ...props
}: React.ComponentProps<"div"> & { title: string; description?: string }) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center",
        className
      )}
      {...props}
    >
      <h3 className="text-sm font-medium">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {children ? <div className="pt-2">{children}</div> : null}
    </div>
  );
}
