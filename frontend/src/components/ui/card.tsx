import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Notion accent tones — solid color fills replace the hairline border.
 * Scoped to dashboard summary/feature blocks (accent-scope decision);
 * data tables, forms, and POS chrome stay on the default white card.
 * All tones except midnight use charcoal text for contrast on the hue.
 */
type CardTone = "default" | "marigold" | "coral" | "sky" | "midnight" | "tint";

const cardToneClasses: Record<Exclude<CardTone, "default">, string> = {
  marigold: "border-transparent bg-marigold text-charcoal",
  coral: "border-transparent bg-coral text-charcoal",
  sky: "border-transparent bg-sky-wash text-charcoal",
  midnight: "border-transparent bg-midnight-ink text-white",
  tint: "border-transparent bg-sky-tint text-charcoal",
};

function Card({
  className,
  size = "default",
  tone = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm"; tone?: CardTone }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-tone={tone}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl border border-border bg-card py-(--card-spacing) text-sm text-card-foreground [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        tone !== "default" && cardToneClasses[tone],
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
