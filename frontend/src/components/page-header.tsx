import * as React from "react";
import { cn } from "@/lib/utils";

function PageHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header"
      className={cn("flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", className)}
      {...props}
    />
  );
}

function PageHeaderContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="page-header-content" className={cn("flex flex-col gap-1 min-w-0", className)} {...props} />;
}

function PageHeaderTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-header-title"
      className={cn("text-xl font-semibold tracking-tight text-pretty", className)}
      {...props}
    />
  );
}

function PageHeaderDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p data-slot="page-header-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

function PageHeaderActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-actions"
      className={cn("flex flex-wrap items-center gap-2 shrink-0", className)}
      {...props}
    />
  );
}

export { PageHeader, PageHeaderContent, PageHeaderTitle, PageHeaderDescription, PageHeaderActions };
