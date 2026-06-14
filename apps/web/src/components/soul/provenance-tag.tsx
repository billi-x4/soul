import { Clock, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProvenanceTag — shows where a memory came from and (optionally) when. Provenance is
 * first-class trust UI in Soul, not metadata fine print.
 */
export function ProvenanceTag({
  source,
  at,
  className,
}: {
  source: string;
  at?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-muted-foreground text-xs", className)}>
      <span className="inline-flex items-center gap-1">
        <Quote aria-hidden className="size-3" />
        <span className="font-mono">{source}</span>
      </span>
      {at ? (
        <span className="inline-flex items-center gap-1">
          <Clock aria-hidden className="size-3" />
          <time dateTime={at}>{new Date(at).toLocaleDateString()}</time>
        </span>
      ) : null}
    </span>
  );
}
