import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "pending";

const TONE: Record<StatusTone, { dot: string; text: string; bg: string; border: string }> = {
  success: {
    dot: "bg-success",
    text: "text-success",
    bg: "bg-success/10",
    border: "border-success/25",
  },
  warning: {
    dot: "bg-warning",
    text: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/30",
  },
  danger: {
    dot: "bg-destructive",
    text: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/25",
  },
  info: { dot: "bg-info", text: "text-info", bg: "bg-info/10", border: "border-info/25" },
  neutral: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
  },
  pending: {
    dot: "bg-warning",
    text: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/30",
  },
};

/**
 * StatusPill — accessible status chip. Color is reinforced by a dot AND a text label,
 * never color alone (WCAG 1.4.1). `pending` animates its dot to read as "in flight".
 */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium text-xs",
        t.bg,
        t.text,
        t.border,
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          t.dot,
          tone === "pending" && "motion-safe:animate-pulse"
        )}
      />
      {children}
    </span>
  );
}
