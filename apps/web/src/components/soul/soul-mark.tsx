import { cn } from "@/lib/utils";

/**
 * SoulMark — the red heart, and the second soul inside it.
 * A solid pulse-red heart holding a smaller bone-white heart: your soul,
 * carried within you. Same box and aria contract as every previous mark.
 */
export function SoulMark({
  className,
  title = "Soul",
  animate = false,
}: {
  className?: string;
  title?: string;
  animate?: boolean;
}) {
  return (
    <svg
      aria-label={title}
      className={cn("size-7", className)}
      fill="none"
      role="img"
      style={animate ? { animation: "scale-in 0.5s var(--ease-spring) both" } : undefined}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {/* the heart */}
      <path
        d="M24 41.8c-1.1 0-2.2-.4-3.1-1.2C14.3 34.8 6.5 28.2 6.5 19.6 6.5 14 10.9 9.5 16.3 9.5c3.1 0 5.9 1.6 7.7 4.2 1.8-2.6 4.6-4.2 7.7-4.2 5.4 0 9.8 4.5 9.8 10.1 0 8.6-7.8 15.2-14.4 21-0.9 0.8-2 1.2-3.1 1.2Z"
        fill="var(--pulse)"
      />
      {/* the second soul — the same heart, carried within */}
      <path
        d="M24 41.8c-1.1 0-2.2-.4-3.1-1.2C14.3 34.8 6.5 28.2 6.5 19.6 6.5 14 10.9 9.5 16.3 9.5c3.1 0 5.9 1.6 7.7 4.2 1.8-2.6 4.6-4.2 7.7-4.2 5.4 0 9.8 4.5 9.8 10.1 0 8.6-7.8 15.2-14.4 21-0.9 0.8-2 1.2-3.1 1.2Z"
        fill="oklch(0.985 0.002 90)"
        transform="translate(13.2 13.2) scale(0.45)"
      />
    </svg>
  );
}

/** Lockup: mark + wordmark, for headers and footers. The period is the pulse. */
export function SoulWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <SoulMark className="size-6" />
      <span className="font-display font-semibold text-lg tracking-tight">
        Soul<span className="text-pulse">.</span>
      </span>
    </span>
  );
}
