import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * StatCallout — an understated label/value pair for counts and on-chain facts. Deliberately
 * not the SaaS hero-metric template: small label, tabular value, optional hint inline.
 */
export function StatCallout({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className="tabular font-semibold text-2xl tracking-tight">{value}</dd>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}
