import type { Namespace } from "@soul/shared";
import { cn } from "@/lib/utils";
import { NAMESPACE_META } from "./namespace-meta";

/**
 * NamespaceBadge — a small, tinted, icon+label chip for one memory domain.
 * Color is a warm, brand-cohesive accent; never color-only (always carries its label + icon).
 */
export function NamespaceBadge({
  namespace,
  className,
  withIcon = true,
}: {
  namespace: Namespace;
  className?: string;
  withIcon?: boolean;
}) {
  const meta = NAMESPACE_META[namespace];
  const Icon = meta.Icon;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium text-xs",
        className
      )}
      style={{
        color: meta.colorVar,
        borderColor: `color-mix(in oklch, ${meta.colorVar} 35%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${meta.colorVar} 12%, transparent)`,
      }}
    >
      {withIcon && <Icon aria-hidden className="size-3" />}
      {meta.label}
    </span>
  );
}
