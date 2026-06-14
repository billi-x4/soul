import { cn } from "@/lib/utils";

/**
 * Eyebrow — the mono kicker that flags every section: `[ 03 / OWN IT ]`.
 * Machine-voice labels against the human display type below them.
 */
export function Eyebrow({
  index,
  children,
  tone = "bone",
  className,
}: {
  index?: string;
  children: React.ReactNode;
  tone?: "bone" | "pulse" | "smoke";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "eyebrow inline-flex items-center gap-2",
        tone === "pulse" && "text-pulse-soft",
        tone === "bone" && "text-foreground",
        tone === "smoke" && "text-muted-foreground",
        className
      )}
    >
      <span aria-hidden className="opacity-50">
        [
      </span>
      {index ? (
        <>
          <span className={tone === "pulse" ? "" : "text-pulse-soft"}>{index}</span>
          <span aria-hidden className="opacity-50">
            /
          </span>
        </>
      ) : null}
      {children}
      <span aria-hidden className="opacity-50">
        ]
      </span>
    </span>
  );
}
