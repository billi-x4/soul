# Soul — Product & Brand Context

> Source of brand truth for every design and build agent. Read before touching UI.

## Product purpose

Soul lets a person build a **second soul** — a portable, user-owned, verifiable memory
made from their own data — then own it on the Sui blockchain and use it in any AI tool,
granting and revoking each app's access on-chain. *Your Soul. Your Data. Your Life.*

**The problem:** every AI tool either forgets you by morning or quietly owns everything
you tell it. Your context restarts from zero with each new tool, lives in someone else's
database, and "revoke access" is a settings toggle you can't verify.

**The four rights** (the landing page's spine): **Create it. Own it. Use it. Sell it.**
A user signs in with Google (no seed phrase, no gas), imports their own data (pasted
text, documents, their own X/LinkedIn/GitHub data), and Soul turns it into encrypted
facts stored on Walrus, organized into namespaces. The user owns it through their Sui
account, grants scoped delegate keys to AI clients over MCP, can sell or gift scoped
slices on the marketplace (priced in SUI, always revocable), and can revoke any grant
for real — an on-chain transaction, not a promise.

## Register

**Hybrid.** The marketing surface (`/`) is **brand** register — design IS the product;
it must make a stranger feel the romance of owning your own soul. The app surfaces
(overview, builder, inspector, permissions, connect, marketplace, portability, analytics)
are **product** register — design
SERVES the work; clarity, density, and trust win over spectacle. The shared design system
below carries both.

## Users

- **The sovereign individual.** Technical-adjacent but not a crypto native. Cares about
  privacy, ownership, and not being the product. Has felt the loss of pouring themselves
  into an AI tool that forgets them, or owns them. Wants permanence and control.
- **The AI power user.** Lives in Claude Desktop / Cursor. Wants their context to follow
  them between tools without copy-paste, and wants a kill switch.

## Brand voice — three physical words

**Vital. Sovereign. Honest.**

> The current design system is **PULSE** (void / bone / lifeblood) — see
> `apps/web/DESIGN.md`, which supersedes the earlier "Devotion" garnet-on-vellum system
> (archived in the root `DESIGN.md`).

The physical objects: a pure-black void. A constellation of memory particles clustering
into a living form. A red pulse — the EKG line, the vital signal that proves the soul is
alive. A bone-white ledger receipt for on-chain proof moments. Not Valentine kitsch, not
neon crypto.

## Tone of copy

Declarative, short lines, exact. We speak about memory and ownership like they matter,
because they do. Plain nouns, real verbs. No hype, no "revolutionary," no em dashes.
"Create it. Own it. Use it. Sell it." A little warmth is allowed ("your soul, your keys")
but it is earned by precision elsewhere. Security claims are honest: we say plainly that
managed mode sees plaintext, that Sui objects are public, that privacy comes only from
encryption — and that Private (zero-plaintext) mode trades semantic recall and AI access for
"we cannot read it, ever": browser-side encryption, no passphrase reset, no exceptions.

## Anti-references (do NOT look like these)

- **Valentine kitsch:** pink gradients, heart confetti, cursive scripts, candy hearts.
- **Neon crypto:** black background, electric cyan/magenta on black, glassmorphism, "web3" glow.
- **Generic SaaS:** Inter + indigo, hero-metric template, identical icon-card grids, centered
  stack of icon→title→subtitle.
- **Editorial-magazine reflex:** display-serif italic + tiny tracked uppercase labels above
  every heading + ruled three-column broadsheet. We use a serif, but not as magazine cosplay.

## Strategic principles

1. **Red is the soul, not decoration.** The pulse red is the ONLY chromatic authority: CTAs,
   live indicators, the EKG line, particle highlights. If everything is red, nothing is alive.
2. **The void is the brand.** Dark-only, pure-black canvas; depth comes from negative space,
   type weight, and particle density — not stacked surfaces or glassmorphism. One bone-white
   "ledger" inversion per page is permitted for on-chain proof moments.
3. **Trust is visible.** Provenance, on-chain object links, "managed mode sees plaintext"
   disclosures, and the revoke kill-switch are first-class UI, not fine print.
4. **Honest about beta.** Where the Sui Stack is beta or a path is mocked, the UI says so.

## Logo & imagery

The brand mark is **emergent, never a literal logo**: hearts/constellations rendered from
memory particles (`apps/web/src/components/pulse/`, `<SoulMark />`). Keep the mark and image
slots swappable without layout change. Display type is Archivo; Spectral italic is reserved
for at most one "soul" word per page.
