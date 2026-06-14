"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * HeartField — the hero visual: hundreds of glossy mini hearts packed into
 * one big, face-on heart (the exact silhouette of the Soul logo) that beats.
 * Hearts near the cursor pop — they scale up and scatter away, then ease
 * back home. No rotation: the silhouette stays a proper heart at all times.
 *
 * Depth is layered, not rotated: each mini heart lives on a z-layer that
 * drives its size/alpha and draw order, so the cluster still reads as a
 * plump 3D mass. Pauses offscreen; renders one static frame under
 * prefers-reduced-motion.
 */

interface HeartParticle {
  /* position normalized to the 48×48 logo-path box */
  x: number;
  y: number;
  /* depth layer 0 (back) → 1 (front) */
  z: number;
  scale: number;
  tint: number;
  angle: number;
  phase: number;
  /* eased hover offsets */
  ox: number;
  oy: number;
  os: number;
}

/* mini-heart palette: mostly pulse reds, a few bone/ash glints for depth */
const TINTS = [
  { color: "#ef3340", weight: 0.42 },
  { color: "#ff7480", weight: 0.22 },
  { color: "#a8232e", weight: 0.2 },
  { color: "#fbfbfa", weight: 0.09 },
  { color: "#9d9da1", weight: 0.07 },
] as const;

/* gilded variant — gold glints instead of bone/ash (marketplace surfaces) */
const TINTS_GILDED = [
  { color: "#ef3340", weight: 0.4 },
  { color: "#ff7480", weight: 0.2 },
  { color: "#a8232e", weight: 0.2 },
  { color: "#e0b25c", weight: 0.13 },
  { color: "#fbfbfa", weight: 0.07 },
] as const;

type Tints = typeof TINTS | typeof TINTS_GILDED;

/* the SoulMark heart — both the big silhouette and every mini sprite */
const HEART_PATH =
  "M24 41.8c-1.1 0-2.2-.4-3.1-1.2C14.3 34.8 6.5 28.2 6.5 19.6 6.5 14 10.9 9.5 16.3 9.5c3.1 0 5.9 1.6 7.7 4.2 1.8-2.6 4.6-4.2 7.7-4.2 5.4 0 9.8 4.5 9.8 10.1 0 8.6-7.8 15.2-14.4 21-0.9 0.8-2 1.2-3.1 1.2Z";

/* the path's bounding box: x 6.5–41.5, y 9.5–41.8 → visual center */
const HEART_CX = 24;
const HEART_CY = 25.65;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Double-tap systole/diastole envelope, period 2.6s. */
function heartbeat(t: number): number {
  const p = (t % 2600) / 2600;
  const tap = (c: number, w: number) => {
    const d = (p - c) / w;
    return Math.exp(-d * d * 4);
  };
  return tap(0.08, 0.05) + 0.62 * tap(0.24, 0.06);
}

/**
 * Rejection-sample positions INSIDE the logo heart path itself, so the big
 * shape is exactly the brand heart — not an approximation.
 */
function makeHearts(count: number, seed: number, tints: Tints): HeartParticle[] {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const g = probe.getContext("2d");
  if (!g) {
    return [];
  }
  const path = new Path2D(HEART_PATH);
  const rnd = mulberry32(seed);
  const out: HeartParticle[] = [];
  let guard = count * 40;
  while (out.length < count && guard-- > 0) {
    const x = 6.5 + rnd() * 35;
    const y = 9.5 + rnd() * 32.3;
    if (!g.isPointInPath(path, x, y)) {
      continue;
    }
    const tintRoll = rnd();
    let acc = 0;
    let tint = 0;
    for (let i = 0; i < tints.length; i++) {
      acc += tints[i]?.weight ?? 0;
      if (tintRoll <= acc) {
        tint = i;
        break;
      }
    }
    out.push({
      x,
      y,
      z: rnd(),
      scale: 0.22 + rnd() * 0.32,
      tint,
      angle: (rnd() * 2 - 1) * 0.45,
      phase: rnd() * Math.PI * 2,
      ox: 0,
      oy: 0,
      os: 1,
    });
  }
  // back-to-front once — no rotation means the order never changes
  out.sort((a, b) => a.z - b.z);
  return out;
}

/** Pre-render one glossy sprite per tint (heart fill + soft highlight). */
function makeSprites(tints: Tints): HTMLCanvasElement[] {
  const path = new Path2D(HEART_PATH);
  return tints.map((tintDef) => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    if (!g) {
      return c;
    }
    g.scale(64 / 48, 64 / 48);
    g.fillStyle = tintDef.color;
    g.fill(path);
    // top-left sheen → the "3D bead" read
    const sheen = g.createRadialGradient(17, 16, 1, 17, 16, 15);
    sheen.addColorStop(0, "rgba(255,255,255,0.5)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    g.save();
    g.clip(path);
    g.fillStyle = sheen;
    g.fillRect(0, 0, 48, 48);
    // lower-right shade for volume
    const shade = g.createRadialGradient(31, 34, 2, 31, 34, 20);
    shade.addColorStop(0, "rgba(0,0,0,0.28)");
    shade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = shade;
    g.fillRect(0, 0, 48, 48);
    g.restore();
    return c;
  });
}

export function HeartField({
  className,
  density = 1,
  seed = 17,
  gilded = false,
}: {
  className?: string;
  density?: number;
  seed?: number;
  /** swap the bone/ash glints for gold — marketplace surfaces only */
  gilded?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let running = false;
    let width = 0;
    let height = 0;
    let hearts: HeartParticle[] = [];
    let sprites: HTMLCanvasElement[] = [];
    let last = performance.now();
    const start = last;
    const mouse = { x: -1e4, y: -1e4 };

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // dense: the heart should read as packed, not sparse
      const base = Math.min(950, Math.max(360, (width * height) / 1150));
      const tints = gilded ? TINTS_GILDED : TINTS;
      hearts = makeHearts(Math.round(base * density), seed, tints);
      if (sprites.length === 0) {
        sprites = makeSprites(tints);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const t = now - start;
      ctx.clearRect(0, 0, width, height);

      const beat = heartbeat(t);
      // S = the big heart's edge length in px (the 48-box scaled to fit)
      const S = Math.min(width * 1.04, height * 0.98) * (1 + beat * 0.035);
      const unit = S / 48;
      const cx = width / 2;
      const cy = height / 2;
      const popRadius = Math.max(64, S * 0.2);

      for (const p of hearts) {
        const px = cx + (p.x - HEART_CX) * unit;
        const py =
          cy + (p.y - HEART_CY) * unit + Math.sin(t * 0.0011 + p.phase) * (1.6 + p.z * 1.6);

        // hover: pop + scatter, eased back home
        let tox = 0;
        let toy = 0;
        let tos = 1;
        const dx = px - mouse.x;
        const dy = py - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < popRadius && dist > 0.001) {
          const f = 1 - dist / popRadius;
          const push = f * f * 52;
          tox = (dx / dist) * push;
          toy = (dy / dist) * push - f * 12;
          tos = 1 + f * 1.1;
        }
        const ease = 1 - 0.84 ** (dt / 16.7);
        p.ox += (tox - p.ox) * ease;
        p.oy += (toy - p.oy) * ease;
        p.os += (tos - p.os) * ease;

        const sprite = sprites[p.tint];
        if (!sprite) {
          continue;
        }
        const size = p.scale * (0.55 + p.z * 0.45) * p.os * (1 + beat * 0.05) * unit * 7.2;
        ctx.globalAlpha = 0.42 + p.z * 0.58;
        ctx.save();
        ctx.translate(px + p.ox, py + p.oy);
        ctx.rotate(p.angle * (0.5 + (p.os - 1) * 0.6));
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      if (running) {
        raf = requestAnimationFrame(frame);
      }
    };

    const renderStatic = () => {
      running = false;
      last = performance.now();
      frame(last + 900);
    };

    rebuild();
    if (reduced) {
      renderStatic();
    }

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -1e4;
      mouse.y = -1e4;
    };
    if (!reduced) {
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (reduced) {
          return;
        }
        if (entry?.isIntersecting && !running) {
          running = true;
          last = performance.now();
          raf = requestAnimationFrame(frame);
        } else if (!entry?.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.02 }
    );
    io.observe(canvas);

    const ro = new ResizeObserver(() => {
      rebuild();
      if (reduced) {
        renderStatic();
      }
    });
    ro.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      io.disconnect();
      ro.disconnect();
    };
  }, [density, seed, gilded]);

  return <canvas aria-hidden className={cn("size-full touch-none", className)} ref={canvasRef} />;
}
