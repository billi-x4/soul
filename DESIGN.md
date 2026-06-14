# Soul — Design System ("Devotion") — SUPERSEDED

> **⚠️ Archived.** This system was replaced by **PULSE** (void/bone/red, dark-only) on
> 2026-06-10 — the canonical design reference is now [apps/web/DESIGN.md](apps/web/DESIGN.md).
> Kept for historical context only; do not design new UI against this document.

> The canonical token + component reference. The implementation lives in
> [apps/web/src/app/globals.css](apps/web/src/app/globals.css). Use semantic tokens
> (`bg-primary`, `text-muted-foreground`, `border-border`) — never raw hex or ad-hoc oklch
> in components. Light + dark are both first-class.

## Color strategy

**Committed.** A deep garnet red (the *soul*, the *wax seal*) carries brand identity. All
neutrals are tinted warm (hue ~40–60, low chroma) so the product reads as paper and lamplight,
never clinical gray. State colors (success/warning/info) sit in distinct hues; `destructive`
is a hotter vermilion, deliberately separated from the garnet brand so "danger" never reads
as "brand."

OKLCH everywhere. Chroma falls as lightness approaches the extremes. No `#000` / `#fff`.

### Brand ramp (garnet)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | `oklch(0.53 0.205 22)` | `oklch(0.63 0.19 23)` | Primary actions, brand, the seal |
| `--primary-foreground` | near-white warm | near-white warm | Text/icon on primary |
| `--accent` | soft blush `oklch(0.94 0.025 25)` | deep blush `oklch(0.30 0.06 22)` | Hover/active surfaces, selected nav |
| `--ring` | brand garnet | brand garnet | Focus ring (always brand) |

`--brand-50 … --brand-900` is a full garnet scale for gradients, glows, and data viz.

### Neutrals (warm-tinted)

`background`, `foreground`, `card`, `popover`, `muted`, `muted-foreground`, `secondary`,
`border`, `input` — all hue ~50, chroma 0.004–0.014. Light = warm vellum; dark = warm ink.

### State

`--success` (green ~155), `--warning` (amber ~75), `--info` (blue ~250), `--destructive`
(vermilion ~28). Each has a `-foreground`. Use `destructive` only for irreversible actions
(revoke, freeze, delete) — and always pair with confirmation + icon, never color alone (a11y).

## Typography

- **Display / brand** — **Spectral** (`--font-display`, serif). Hero, large emotional headings,
  the wordmark. Warm, literary, the "love letter" voice. Brand register only + the occasional
  product hero.
- **UI / body** — **Geist Sans** (`--font-sans`). All product UI, body copy, labels. Precise,
  sovereign. Headings in product register use Geist with weight contrast, not Spectral.
- **Mono** — **Geist Mono** (`--font-mono`). Sui addresses, object IDs, blob IDs, keys, hashes,
  code. Anything cryptographic is mono — it signals "this is real on-chain data."

Fluid scale via `clamp()`, ratio ≥1.25. Tokens: `--text-display`, `--text-hero`, plus Tailwind's
default `text-xs … text-5xl`. Body capped at 65–75ch (`max-w-prose` / `.measure`). Tabular numerals
on data (`font-variant-numeric: tabular-nums` via `.tabular`).

## Spacing, radius, elevation

- **Radius** — `--radius: 0.75rem`. Scale: `sm/md/lg/xl` derived. Soft, intimate, not pill-round.
- **Spacing** — Tailwind 4-pt scale. Vary rhythm; generous section separation, tight intra-group.
  Section vertical rhythm: `--space-section: clamp(4rem, 8vw, 7rem)`.
- **Elevation** — warm-tinted shadows `--shadow-xs … --shadow-lg` (hue 25, never neutral-gray).
  `--shadow-glow` = brand garnet glow for hero/focus moments. Use elevation sparingly; borders
  do most of the separation work.

## Motion

- Eases (CSS vars): `--ease-out-quart` `cubic-bezier(0.25,1,0.5,1)`,
  `--ease-out-expo` `cubic-bezier(0.16,1,0.3,1)`, `--ease-spring` for playful affordances.
- Durations: `--dur-fast 120ms`, `--dur 200ms`, `--dur-slow 420ms`.
- Never animate layout props (width/height/top); animate transform/opacity. Respect
  `prefers-reduced-motion` (utilities and keyframes gate on it).
- Keyframes provided: `fade-up`, `fade-in`, `scale-in`, `shimmer`, `pulse-ring`, `seal-press`.

## Components & states

shadcn/ui (Radix) is the component substrate; the `button` variants are extended with brand
`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, plus a brand `glow` size hook.
Every interactive element must define: default, hover, active, focus-visible (brand ring),
disabled, and (where async) loading. Inputs show error state via `aria-invalid` + destructive ring.

Reusable Soul components (in `components/soul/`): `<SoulMark/>` (placeholder seal logo),
`<NamespaceBadge/>`, `<StatusPill/>`, `<AddressChip/>` (mono, copy-on-click), `<ProvenanceTag/>`,
`<EmptyState/>`, `<SectionHeading/>`, `<DisclosureNote/>` (the honest "managed mode sees plaintext"
banner), `<StatCallout/>`.

## Accessibility (non-negotiable)

- Contrast ≥ 4.5:1 body, ≥ 3:1 large text & UI. Verified for both themes.
- Focus-visible ring on every focusable element (`--ring`, 2px, offset 2px).
- Never color-only signaling — pair with icon/text (esp. status pills, destructive).
- Hit targets ≥ 44px on touch. `prefers-reduced-motion` honored. Semantic landmarks + skip link.
- All icons decorative-by-default (`aria-hidden`) unless they are the only label.

## Imagery

Logo + marketing imagery are **placeholders** (`<SoulMark/>`, `next/image` slots with warm
gradient + grain fallback) swappable without layout change. No colored-block-where-a-photo-belongs:
brand surfaces use the generated aurora/grain canvas as the deliberate hero texture until real
assets land.
