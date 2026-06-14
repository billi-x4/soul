# SOUL — "PULSE" Design System

> Void, bone, and lifeblood. A soul rendered as a constellation of memory particles;
> red is the vital signal that proves it's alive.

**Theme:** dark-only (the void IS the brand). One inverted bone-white section is permitted
per page as a "ledger/receipt" moment — black type on white, red authority preserved.

Supersedes the previous "Devotion" (garnet-on-vellum) system. Primary reference:
`REFERENCE_DESIGN.md` (Dala particle-cosmos) — translated from violet→red and
modernized, not copied.

---

## 1. Concept

Soul is a second soul: portable memory you own on-chain. The system renders that as:

- **The Void** — pure-black canvas. No elevation, no stacked surfaces. Depth comes from
  negative space, type weight, and particle density.
- **The Constellation** — thousands of 2–6px geometric particles (your facts) clustering
  into living forms. The brand mark is emergent, never a literal logo.
- **The Pulse** — red (`--pulse`) is the ONLY chromatic authority: CTAs, live indicators,
  the EKG line, particle highlights. If everything is red, nothing is alive.
- **The Ledger** — bone-white inversions for on-chain proof moments (receipts,
  signatures, audit). Paper against cosmos.

Voice: declarative, short lines, honest. "Create it. Own it. Use it. Sell it."

## 2. Color tokens

| Token | Value | Role |
|---|---|---|
| `--void` | `oklch(0.13 0.004 285)` ≈ #0a0a0b | Page canvas (true near-black, not gray) |
| `--void-deep` | `oklch(0 0 0)` #000 | Hero/footer wells, canvas behind particles |
| `--bone` | `oklch(0.985 0.002 90)` ≈ #fbfbfa | Primary text, hairlines (at alpha), ledger bg |
| `--ash` | ~#b4b4b6 | Secondary text |
| `--smoke` | ~#86868a | Tertiary text, resting nav |
| `--pulse-300` | `oklch(0.76 0.16 22)` | Soft red text/tints |
| `--pulse-400` | `oklch(0.68 0.21 24)` | Red text on void (AA), icon strokes |
| `--pulse-500` | `oklch(0.62 0.245 26)` ≈ #f3263c | THE pulse: indicators, particles, EKG, rings |
| `--pulse-600` | `oklch(0.55 0.225 27)` ≈ #d31a30 | Filled CTA bg (white text ≥4.5:1) |
| `--pulse-700` | `oklch(0.47 0.19 27)` | CTA hover/pressed |
| `--gold` | `oklch(0.82 0.16 85)` | RARE: marketplace value accents only |

Semantic mapping (shadcn): `--background`=void, `--foreground`=bone, `--primary`=pulse-600,
`--card`=void +1 step (`oklch(0.16 …)`), `--border`=bone @ 10–12% alpha, `--muted-foreground`=smoke.
Success = `oklch(0.78 0.14 160)`, warning = gold-ish, destructive = pulse (red is danger AND
brand — disambiguate destructive actions with copy + confirm dialogs, never color alone).

Rules:
- Exactly ONE filled red element per viewport region. Second CTAs are outlined bone.
- Red text only ≥ `--pulse-400` on void; never red-on-red; never bone text on pulse-300.
- No purple, no blue, no gradient rainbows. Charts: pulse scale + ash + gold.

## 3. Typography

| Voice | Family | Use |
|---|---|---|
| Display | **Archivo** (variable: wght 100–900, wdth 62–125) | Hero/section headlines. Signature: wght 200–250, wdth 105–110, tracking −0.035em, huge (clamp to 9rem). "Etched in light." |
| UI/body | **Geist Sans** (local VF) | Everything functional. 15–18px body, 1.55 line-height. |
| Data | **Geist Mono** (local VF) | Addresses, object IDs, keys, hashes, eyebrows/kickers (`[ 01 / OWN IT ]` uppercase, +0.16em tracking), stats. |
| Soul italic | **Spectral** italic | ONE word per page maximum (e.g. "soul."). The human ghost in the machine. |

Scale (fluid): hero `clamp(3.4rem, 8.5vw, 8.5rem)` lh 0.92 · display `clamp(2.6rem,5vw,4.5rem)`
lh 0.98 · heading 2rem · sub 1.25rem · body 1rem/0.9375rem · caption 0.8125rem ·
eyebrow 0.75rem mono caps. Negative tracking ≥48px only; positive tracking at ≤14px.

## 4. Shape, space, elevation

- Radius: pills (`rounded-full`) for buttons/badges/inputs-chips; `--radius: 1rem` cards.
- Cards = hairline on void: `border border-white/10 bg-card`, NO shadows, no glassmorphism.
- The ONLY glow: `.glow-pulse` (red ring-bloom) on the primary CTA and live dots. Use ≤2/page.
- Section rhythm: `--space-section: clamp(5rem, 10vw, 8.5rem)`; page max-width 1200px;
  generous void — never fill emptiness.
- Hairline dividers: `border-white/8`. Ledger section inverts: black hairlines @ 12%.

## 5. Motion

- Library: CSS-first; `motion` (v12) only for hero orchestration + dashboard count-ups.
- Page load: ONE staggered reveal (60ms steps, fade-up 12px, `--ease-out-expo`).
- The pulse beat: live indicators animate at 1.1s "heartbeat" (scale 1→1.25→1 double-tap).
- Constellation: canvas, ~1800 particles desktop / 700 mobile, drift + cluster, pauses
  offscreen and under `prefers-reduced-motion` (renders static frame).
- Hover: hairline → bone/25 + 1px translate-y. No scale-jumps. 150–220ms.

## 6. Signature components (`components/pulse/`)

- `ConstellationField` — canvas particle system. Forms: `orb` (hero), `drift` (ambient),
  `ring` (CTA). Colors: bone/ash/pulse mix, red ≤ 12% of particles.
- `PulseLine` — animated SVG EKG hairline; section divider + dashboard "vitals" motif.
- `Eyebrow` — mono kicker `[ 0n / LABEL ]`.
- `GlowCta` — the one filled red pill.
- `LedgerSection` — inverted bone section wrapper.
- `StatBlock` — mono tabular number + caption.
- `SoulOrb` — small per-user constellation avatar (seeded by Sui address).

## 7. Accessibility & honesty

- Contrast: bone/void 19:1; smoke ≥ 4.6:1; pulse-400 text ≥ 4.5:1; white on pulse-600 ≥ 4.5:1.
- Focus: 2px pulse ring + 2px void offset on every interactive element.
- Reduced motion: constellation static, no parallax, reveals become opacity-only.
- Canvas visuals are `aria-hidden`; every section readable with images off.
- Honesty rules carry over: managed-relayer plaintext disclosure stays prominent;
  marketplace ships labeled "Preview"; revoke/freeze copy states exactly what happens
  on-chain. Trust is the product.
