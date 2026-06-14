import { Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * DisclosureNote — the honest banner. Soul never hides the truth about beta software or the
 * managed relayer seeing plaintext (CLAUDE.md decision #4). Full border + tinted background,
 * never a side-stripe.
 */
export function DisclosureNote({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const Icon = tone === "warning" ? ShieldAlert : Info;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3.5 text-sm",
        tone === "warning"
          ? "border-warning/30 bg-warning/10 text-warning-foreground"
          : "border-info/25 bg-info/10 text-info-foreground",
        className
      )}
      role="note"
    >
      <Icon
        aria-hidden
        className={cn("mt-0.5 size-4 shrink-0", tone === "warning" ? "text-warning" : "text-info")}
      />
      <div className="space-y-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
