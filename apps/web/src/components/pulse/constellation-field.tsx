"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * ConstellationField — the brand visual. Thousands of micro-particles
 * (your facts) clustering into a living form on the void.
 *
 * Forms:
 *  - "orb"   — a slowly rotating 3D sphere of particles that BEATS like a
 *              heart (systole/diastole double-tap). The hero soul.
 *  - "drift" — sparse ambient field for section backdrops.
 *  - "ring"  — a flat halo, for CTA wells.
 *
 * Honest about cost: pauses offscreen, renders one static frame under
 * prefers-reduced-motion, caps particle count by viewport.
 */

type Form = "orb" | "drift" | "ring";

interface Particle {
  /* unit-space position; orb uses 3D, drift/ring use x/y with z as phase */
  x: number;
  y: number;
  z: number;
  size: number;
  shape: 0 | 1 | 2; // circle | diamond | triangle
  color: string;
  alpha: number;
  red: boolean;
  drift: number;
}

const BONE = "248, 248, 247";
const ASH = "168, 168, 172";
const RED = "239, 51, 64";
const GOLD = "224, 178, 92";

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

/** Double-tap heartbeat envelope, period ~2.6s: lub… dub…… rest */
function heartbeat(t: number): number {
  const p = (t % 2600) / 2600;
  const tap = (c: number, w: number) => {
    const d = (p - c) / w;
    return Math.exp(-d * d * 4);
  };
  return tap(0.08, 0.05) + 0.62 * tap(0.24, 0.06);
}

function makeParticles(form: Form, count: number, seed: number, gilded: boolean): Particle[] {
  const rnd = mulberry32(seed);
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rnd();
    const red = roll < 0.11;
    const gold = gilded && !red && roll < 0.135;
    const color = red ? RED : gold ? GOLD : rnd() < 0.62 ? BONE : ASH;

    let x = 0;
    let y = 0;
    let z = 0;
    if (form === "orb") {
      // fibonacci sphere with mild radial jitter → organic, not CGI-perfect
      const k = i + 0.5;
      const phi = Math.acos(1 - (2 * k) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * k;
      const r = 0.82 + rnd() * 0.26;
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.cos(phi);
      z = r * Math.sin(phi) * Math.sin(theta);
    } else if (form === "ring") {
      const a = rnd() * Math.PI * 2;
      const r = 0.78 + rnd() * 0.3;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r * 0.34; // squashed halo
      z = rnd() * Math.PI * 2;
    } else {
      x = rnd() * 2 - 1;
      y = rnd() * 2 - 1;
      z = rnd() * Math.PI * 2;
    }

    out.push({
      x,
      y,
      z,
      size: red ? 1.1 + rnd() * 1.6 : 0.55 + rnd() * 1.5,
      shape: rnd() < 0.62 ? 0 : rnd() < 0.5 ? 1 : 2,
      color,
      alpha: red ? 0.55 + rnd() * 0.45 : 0.16 + rnd() * 0.6,
      red,
      drift: 0.4 + rnd() * 1.2,
    });
  }
  return out;
}

export function ConstellationField({
  form = "drift",
  density = 1,
  className,
  seed = 7,
  gilded = false,
}: {
  form?: Form;
  /** multiplier over the per-form base count */
  density?: number;
  className?: string;
  seed?: number;
  /** allow gold dust — marketplace surfaces only (gold is a marketplace accent) */
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
    let particles: Particle[] = [];
    let rotY = 0;
    let last = performance.now();
    const start = last;

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const area = width * height;
      const base =
        form === "orb"
          ? Math.min(1500, Math.max(420, area / 320))
          : form === "ring"
            ? Math.min(520, Math.max(180, area / 900))
            : Math.min(700, Math.max(140, area / 2400));
      particles = makeParticles(form, Math.round(base * density), seed, gilded);
    };

    const drawShape = (p: Particle, px: number, py: number, s: number) => {
      if (p.shape === 0) {
        ctx.beginPath();
        ctx.arc(px, py, s, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 1) {
        ctx.beginPath();
        ctx.moveTo(px, py - s * 1.4);
        ctx.lineTo(px + s * 1.4, py);
        ctx.lineTo(px, py + s * 1.4);
        ctx.lineTo(px - s * 1.4, py);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(px, py - s * 1.5);
        ctx.lineTo(px + s * 1.3, py + s);
        ctx.lineTo(px - s * 1.3, py + s);
        ctx.closePath();
        ctx.fill();
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const t = now - start;
      ctx.clearRect(0, 0, width, height);

      const beat = form === "orb" ? heartbeat(t) : 0;
      const cx = width / 2;
      const cy = height / 2;

      if (form === "orb") {
        rotY += dt * 0.000_09;
        const R = Math.min(width, height) * 0.42 * (1 + beat * 0.035);
        const sinR = Math.sin(rotY);
        const cosR = Math.cos(rotY);
        for (const p of particles) {
          const rx = p.x * cosR - p.z * sinR;
          const rz = p.x * sinR + p.z * cosR;
          const depth = (rz + 1.4) / 2.4; // 0 back → 1 front
          const px = cx + rx * R;
          const py = cy + p.y * R * 0.96;
          const a = p.alpha * (0.25 + depth * 0.75) + (p.red ? beat * 0.35 : 0);
          ctx.fillStyle = `rgba(${p.color}, ${Math.min(1, a)})`;
          drawShape(p, px, py, p.size * (0.5 + depth * 0.8) * (p.red ? 1 + beat * 0.5 : 1));
        }
      } else if (form === "ring") {
        for (const p of particles) {
          const wob = Math.sin(t * 0.0006 * p.drift + p.z);
          const px = cx + p.x * width * 0.46;
          const py = cy + p.y * height * 0.9 + wob * 4;
          ctx.fillStyle = `rgba(${p.color}, ${p.alpha * (0.55 + 0.45 * wob)})`;
          drawShape(p, px, py, p.size);
        }
      } else {
        for (const p of particles) {
          const px = cx + p.x * width * 0.5 + Math.sin(t * 0.0002 * p.drift + p.z) * 14;
          const py = cy + p.y * height * 0.5 + Math.cos(t * 0.00017 * p.drift + p.z * 1.7) * 10;
          const tw = 0.6 + 0.4 * Math.sin(t * 0.0009 * p.drift + p.z * 3);
          ctx.fillStyle = `rgba(${p.color}, ${p.alpha * tw})`;
          drawShape(p, px, py, p.size);
        }
      }

      if (running) {
        raf = requestAnimationFrame(frame);
      }
    };

    const renderStatic = () => {
      last = performance.now();
      running = false;
      frame(last + 1200); // one composed frame, mid-drift
    };

    rebuild();
    if (reduced) {
      renderStatic();
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
      io.disconnect();
      ro.disconnect();
    };
  }, [form, density, seed, gilded]);

  return (
    <canvas
      aria-hidden
      className={cn("pointer-events-none size-full", className)}
      ref={canvasRef}
    />
  );
}
