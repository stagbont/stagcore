import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Field with aria-describedby, helperText, error near control per WIG Forms
// Replaces placeholder-only + error-at-top anti-patterns.

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  // Clone single child to inject aria-describedby + aria-invalid if it supports those props
  const enhanced = React.useMemo(() => {
    if (!React.isValidElement(children)) return children;
    const child = children as React.ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
    return React.cloneElement(child, {
      id: child.props.id ?? htmlFor,
      "aria-describedby": [child.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? true : child.props["aria-invalid"],
    });
  }, [children, htmlFor, describedBy, error]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden className="text-[var(--status-critical)]"> *</span> : null}
        {required ? <span className="sr-only"> required</span> : null}
      </Label>
      {enhanced}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-[var(--status-critical)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: React.ComponentProps<"div"> & { title?: string; description?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {title ? <h3 className="text-sm font-medium">{title}</h3> : null}
      {description ? <p className="text-sm text-muted-foreground -mt-2">{description}</p> : null}
      {children}
    </div>
  );
}
