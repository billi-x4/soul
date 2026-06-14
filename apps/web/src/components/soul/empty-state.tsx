import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * EmptyState — a warm, generous zero-data state. Not a sad gray box: it explains what will
 * live here and offers the next action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-border border-dashed bg-muted/30 px-6 py-14 text-center",
        className
      )}
    >
      {Icon ? (
        <div className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
          <Icon aria-hidden className="size-5" />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-medium text-base">{title}</p>
        {description ? (
          <p className="measure mx-auto text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
