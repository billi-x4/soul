"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * PulseLine — a hairline EKG trace that draws itself when scrolled into view.
 * The section divider of the system: flatline → beat → flatline.
 * aria-hidden; purely atmospheric.
 */
export function PulseLine({
  className,
  tone = "pulse",
}: {
  className?: string;
  tone?: "pulse" | "bone";
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setDrawn(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <svg
      aria-hidden
      className={cn("h-10 w-full", className)}
      fill="none"
      preserveAspectRatio="none"
      ref={ref}
      viewBox="0 0 1200 40"
    >
      <path
        d="M0 20h420l10-9 14 18 10-14 8 5h96l9 -13 13 26 10-18 7 5h603"
        stroke={tone === "pulse" ? "var(--pulse)" : "oklch(1 0 0 / 0.25)"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        style={{
          strokeDasharray: 1450,
          strokeDashoffset: drawn ? 0 : 1450,
          transition: "stroke-dashoffset 1.8s var(--ease-out-quart)",
          opacity: tone === "pulse" ? 0.8 : 1,
        }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** A live indicator dot that beats like a heart. */
export function PulseDot({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn("relative inline-flex items-center gap-2", className)}>
      <span className="relative inline-flex size-2">
        <span className="motion-safe:animate-heartbeat absolute inline-flex size-full rounded-full bg-pulse" />
        <span className="relative inline-flex size-2 rounded-full bg-pulse" />
      </span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
