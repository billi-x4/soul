import {
  ArrowRight,
  AtSign,
  Database,
  Fingerprint,
  KeyRound,
  Layers,
  Lock,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { HeroCta } from "@/components/layout/hero-cta";
import { Eyebrow } from "@/components/pulse/eyebrow";
import { HeartField } from "@/components/pulse/heart-field";
import { PulseDot, PulseLine } from "@/components/pulse/pulse-line";
import { SoulMark } from "@/components/soul/soul-mark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ data */

const MCP_CLIENTS = ["CLAUDE DESKTOP", "CURSOR", "WINDSURF", "VS CODE", "ZED", "ANY MCP CLIENT"];

const RIGHTS = [
  {
    index: "01",
    title: "Create it.",
    body: "Import what's yours — pasted notes, documents, your own X, LinkedIn, and GitHub data. Soul distills it into encrypted facts across three namespaces.",
  },
  {
    index: "02",
    title: "Own it.",
    body: "Your memory lives in Walrus blobs and a Sui account object that answers to your keys — not in our database. Lose us, keep everything.",
  },
  {
    index: "03",
    title: "Use it.",
    body: "Any MCP-aware AI can recall your soul through a scoped delegate key. Claude knows you. Cursor knows you. The next tool knows you on day one.",
  },
  {
    index: "04",
    title: "Sell it.",
    body: "List scoped slices of your soul on the marketplace, or send it to someone outright — priced by you, settled in SUI, revocable like every other grant.",
  },
];

const STEPS = [
  {
    index: "01",
    title: "Sign in with Google",
    body: "Enoki zkLogin derives a Sui account from your Google sign-in. No seed phrase, no wallet setup, no gas — sponsorship covers it.",
    detail: "zklogin → 0x7f3a…e8f3",
  },
  {
    index: "02",
    title: "Import your data",
    body: "Paste text, upload documents, or drop your own social exports — X, LinkedIn, GitHub. Everything is encrypted with Seal before it reaches Walrus.",
    detail: "bio · docs · social",
  },
  {
    index: "03",
    title: "Connect any AI",
    body: "Mint a delegate key scoped to exactly the namespaces an app should see. Paste the config once. Revoking the key on-chain kills access for real.",
    detail: "memwal_recall → granted",
  },
];

const FEATURES = [
  {
    icon: Lock,
    title: "Encrypted, your way",
    body: "Sui objects and Walrus blobs are public by design — encryption is the only privacy. Private mode seals content in your browser before upload: zero plaintext ever leaves the tab.",
  },
  {
    icon: Database,
    title: "Walrus storage",
    body: "The bytes of your soul live on decentralized storage, indexed by MemWal. Our Postgres is just a disposable cache.",
  },
  {
    icon: KeyRound,
    title: "On-chain permissions",
    body: "Each connected app is a delegate key on your account — up to 20, each one grant, audit, and revoke as a real transaction.",
  },
  {
    icon: RefreshCw,
    title: "Restore proof",
    body: "One click rebuilds your entire index from Walrus. Portability you can run, not a promise in a blog post.",
  },
  {
    icon: Layers,
    title: "Scoped namespaces",
    body: "bio, docs, social. Every grant names exactly what an app may see — nothing leaks across the line.",
  },
  {
    icon: AtSign,
    title: "Your handle",
    body: "Claim username.soul once and it follows your account everywhere — a name AI tools greet you by.",
  },
];

const MCP_TOOLS = [
  "memwal_remember",
  "memwal_recall",
  "memwal_analyze",
  "memwal_restore",
  "memwal_login",
  "memwal_logout",
];

const LEDGER_ROWS = [
  {
    item: "Memory",
    holding: "Walrus blobs, Seal-encrypted",
    proof: "blob id",
  },
  {
    item: "Ownership",
    holding: "memwal::account object on Sui",
    proof: "object id",
  },
  {
    item: "Access",
    holding: "Delegate keys — max 20, revocable",
    proof: "on-chain tx",
  },
  {
    item: "Index",
    holding: "Reconstructable from chain + Walrus",
    proof: "restore()",
  },
  {
    item: "Identity",
    holding: "username.soul on your Sui address",
    proof: "zkLogin",
  },
];

/* ------------------------------------------------------------------ page */

export default function LandingPage() {
  return (
    <>
      {/* ---------------- 01 · Hero ---------------- */}
      <section className="relative overflow-hidden bg-black">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grain opacity-[0.03]" />
        <div className="relative mx-auto grid min-h-[78svh] max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.96fr_1.04fr] lg:gap-0">
          <div className="stagger relative z-10 max-w-xl space-y-8">
            <div className="animate-fade-up" style={{ "--i": 0 } as React.CSSProperties}>
              <Eyebrow index="01" tone="smoke">
                Your second soul
              </Eyebrow>
            </div>
            <h1
              className="type-etched animate-fade-up text-hero"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              A second <span className="font-soul text-pulse-soft">soul,</span>
              <br />
              for every AI.
            </h1>
            <p
              className="measure animate-fade-up text-balance text-lg text-muted-foreground leading-relaxed"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              Create a portable memory from your own data — encrypted with Seal, stored on Walrus,
              own and sell on Sui. Plug it into any AI tool over MCP. Grant access in one click.
              Revoke it on-chain, for real.
            </p>
            <div className="animate-fade-up" style={{ "--i": 3 } as React.CSSProperties}>
              <HeroCta />
            </div>
          </div>

          {/* the beating soul — a heart of mini hearts; hover to make them pop */}
          <div className="relative h-[46svh] lg:h-[74svh]">
            <HeartField className="absolute inset-0" seed={17} />
          </div>
        </div>

        {/* ecosystem marquee */}
        <div className="relative border-white/8 border-y">
          <div
            aria-label="Compatible AI clients"
            className="group flex overflow-hidden"
            role="group"
            tabIndex={0}
          >
            <div className="flex w-max animate-marquee gap-0 py-3.5 group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]">
              {[0, 1].map((dup) => (
                <div aria-hidden={dup === 1} className="flex shrink-0 items-center" key={dup}>
                  <span className="px-6 font-mono text-[0.7rem] text-pulse-soft uppercase tracking-[0.2em]">
                    Works with
                  </span>
                  {MCP_CLIENTS.map((c) => (
                    <span
                      className="flex items-center gap-6 px-6 font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.2em]"
                      key={c}
                    >
                      <span aria-hidden className="text-white/20">
                        ✦
                      </span>
                      {c}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- 02 · Manifesto ---------------- */}
      <section className="mx-auto max-w-3xl px-4 py-[var(--space-section)] text-center sm:px-6">
        <PulseLine className="mb-12 opacity-50" />
        <p className="type-etched text-[clamp(1.6rem,1rem+2.4vw,2.6rem)] leading-snug">
          You pour yourself into AI tools that forget you by morning — or quietly own everything you
          tell them.{" "}
          <span className="text-muted-foreground">
            Soul is the opposite: context that lives with you, follows you between tools, and
            answers only to your keys.
          </span>
        </p>
      </section>

      {/* ---------------- 03 · The four rights ---------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-[var(--space-section)] sm:px-6" id="product">
        <div className="mb-12 space-y-4">
          <Eyebrow index="02" tone="pulse">
            The four rights
          </Eyebrow>
          <h2 className="type-etched text-display">
            Create it. Own it.
            <br />
            Use it. <span className="text-pulse-soft">Sell it.</span>
          </h2>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {RIGHTS.map((right) => (
            <article
              className="group relative flex flex-col gap-4 bg-background p-7 transition-colors duration-200 hover:bg-[oklch(0.155_0.008_285)]"
              key={right.index}
            >
              <span className="font-mono text-muted-foreground text-xs transition-colors group-hover:text-pulse-soft">
                {right.index}
              </span>
              <h3 className="type-etched text-3xl">{right.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{right.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- 04 · How it works ---------------- */}
      <section className="border-white/8 border-y bg-black" id="how">
        <div className="mx-auto max-w-6xl px-4 py-[var(--space-section)] sm:px-6">
          <div className="mb-14 max-w-2xl space-y-4">
            <Eyebrow index="03" tone="pulse">
              How it works
            </Eyebrow>
            <h2 className="type-etched text-display">
              Three moves.
              <br />
              No custodian.
            </h2>
          </div>
          <ol className="relative space-y-0">
            {STEPS.map((step, i) => (
              <li
                className="relative grid gap-4 border-white/8 border-t py-10 sm:grid-cols-[5rem_1fr_auto] sm:gap-8 lg:grid-cols-[8rem_1fr_18rem]"
                key={step.index}
              >
                <span className="type-etched text-5xl text-white/40 transition-colors sm:text-6xl">
                  {step.index}
                </span>
                <div className="max-w-xl space-y-2">
                  <h3 className="font-medium text-xl tracking-tight">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
                </div>
                <div className="flex items-center sm:justify-end">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-1.5 font-mono text-muted-foreground text-xs">
                    {i === 2 ? <PulseDot /> : null}
                    {step.detail}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- 05 · Features ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-[var(--space-section)] sm:px-6" id="features">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-4">
            <Eyebrow index="04" tone="pulse">
              The vault
            </Eyebrow>
            <h2 className="type-etched text-display">Built to be left.</h2>
          </div>
          <p className="measure max-w-md text-muted-foreground text-sm leading-relaxed">
            Every layer is designed so you can walk away from us and lose nothing. That constraint
            is the feature.
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <article
                className="group flex flex-col gap-3.5 bg-background p-7 transition-colors duration-200 hover:bg-[oklch(0.155_0.008_285)]"
                key={f.title}
              >
                <Icon
                  aria-hidden
                  className="size-5 text-muted-foreground transition-colors group-hover:text-pulse-soft"
                  strokeWidth={1.5}
                />
                <h3 className="font-medium tracking-tight">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ---------------- 06 · AI ecosystem / MCP ---------------- */}
      <section className="border-white/8 border-y bg-black" id="ecosystem">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-[var(--space-section)] sm:px-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Eyebrow index="05" tone="pulse">
              AI ecosystem
            </Eyebrow>
            <h2 className="type-etched text-display">
              Plug in once.
              <br />
              Known everywhere.
            </h2>
            <p className="measure text-muted-foreground leading-relaxed">
              Soul speaks MCP — the open protocol AI clients already use. Paste one config into
              Claude Desktop or Cursor and your soul is on call: six tools, scoped to the namespaces
              you allow, dead the moment you revoke the key.
            </p>
            <ul className="flex flex-wrap gap-2">
              {MCP_TOOLS.map((tool) => (
                <li
                  className="rounded-full border border-white/10 px-3 py-1 font-mono text-muted-foreground text-xs"
                  key={tool}
                >
                  {tool}
                </li>
              ))}
            </ul>
          </div>

          {/* terminal card */}
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="flex items-center justify-between border-white/8 border-b bg-[oklch(0.16_0.005_285)] px-4 py-2.5">
              <span className="font-mono text-muted-foreground text-xs">
                claude_desktop_config.json
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[0.65rem] text-success uppercase tracking-[0.14em]">
                <PulseDot />
                connected
              </span>
            </div>
            <pre
              aria-label="Example MCP configuration"
              className="overflow-x-auto bg-[oklch(0.115_0.004_285)] p-5 font-mono text-[0.78rem] leading-relaxed"
              tabIndex={0}
            >
              <code>
                <span className="text-muted-foreground">{`{
  "mcpServers": {
    `}</span>
                <span className="text-pulse-soft">{`"soul"`}</span>
                <span className="text-muted-foreground">{`: {
      "url": "https://api.soul.app/api/mcp",
      "headers": {
        "Authorization": "Bearer `}</span>
                <span className="text-foreground">{`<delegate-key>`}</span>
                <span className="text-muted-foreground">{`",
        "x-memwal-account-id": "`}</span>
                <span className="text-foreground">{`0x7f3a…e8f3`}</span>
                <span className="text-muted-foreground">{`"
      },
      "scope": ["bio", "social"]
    }
  }
}`}</span>
              </code>
            </pre>
            <p className="border-white/8 border-t bg-[oklch(0.16_0.005_285)] px-4 py-3 text-muted-foreground text-xs">
              Paste once. Revoke on-chain whenever — the key dies everywhere at once.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- 07 · Marketplace ---------------- */}
      <section
        className="mx-auto max-w-6xl px-4 py-[var(--space-section)] sm:px-6"
        id="marketplace"
      >
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <Eyebrow index="06" tone="pulse">
              Marketplace · live
            </Eyebrow>
            <h2 className="type-etched text-display">
              Your soul has a price.
              <br />
              <span className="text-gold">You set it.</span>
            </h2>
            <p className="measure text-muted-foreground leading-relaxed">
              Souls are the training data AI actually wants — consented, provenanced, alive. List
              scoped slices of yours and name the price in SUI; buyers get a delegate key their AI
              uses to recall you over MCP, the payment settles on Sui, and your revoke button still
              works on every license you've sold. Or skip the market entirely and send your soul to
              someone, free.
            </p>
            <p className="font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.14em]">
              Live on testnet — the card below is an example listing
            </p>
          </div>

          {/* sample listing card — a gilded heart of mini hearts behind it,
              oversized so the lobes and tip stay visible around the card */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="-inset-x-36 -inset-y-28 -z-10 sm:-inset-x-44 sm:-inset-y-32 absolute opacity-60">
              <HeartField density={0.9} gilded seed={23} />
            </div>
            <article className="space-y-5 rounded-2xl border border-white/12 bg-[oklch(0.15_0.006_285)] p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SoulMark className="size-9" />
                  <div>
                    <p className="font-mono text-sm">amelia.soul</p>
                    <p className="text-muted-foreground text-xs">verified on Sui testnet</p>
                  </div>
                </div>
                <span className="rounded-full border border-gold/40 px-2.5 py-0.5 font-mono text-[0.65rem] text-gold uppercase tracking-[0.14em]">
                  Sample
                </span>
              </div>
              <dl className="space-y-2.5 border-white/8 border-y py-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Scope</dt>
                  <dd className="font-mono text-xs">social + docs</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Access</dt>
                  <dd className="font-mono text-xs">read-only · recall</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Term</dt>
                  <dd className="font-mono text-xs">30 days · revocable</dd>
                </div>
              </dl>
              <div className="flex items-center justify-between">
                <p className="tabular font-mono text-2xl text-gold">
                  12 <span className="text-sm">SUI</span>
                </p>
                <Link
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "rounded-full border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
                  )}
                  href="/marketplace"
                >
                  Browse the market
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ---------------- 08 · Ownership — the ledger ---------------- */}
      <section className="ledger" id="ownership">
        <div className="mx-auto max-w-6xl px-4 py-[var(--space-section)] sm:px-6">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div className="space-y-4">
              <span className="eyebrow text-ledger-muted">[ 07 / Security &amp; ownership ]</span>
              <h2 className="type-etched text-display text-ledger-foreground">
                What you own,
                <br />
                in writing.
              </h2>
            </div>
            {/* the stamp */}
            <div
              aria-hidden
              className="rotate-[-6deg] rounded-md border-2 border-pulse-deep px-4 py-2 font-mono text-pulse-deep text-xs uppercase tracking-[0.2em]"
            >
              on-chain · verifiable
            </div>
          </div>

          <div
            aria-label="Ownership ledger table"
            className="overflow-x-auto"
            role="region"
            tabIndex={0}
          >
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                What Soul users own and where each item is recorded
              </caption>
              <thead>
                <tr className="border-ledger-border border-b">
                  <th className="eyebrow py-3 pr-4 font-normal text-ledger-muted" scope="col">
                    Item
                  </th>
                  <th className="eyebrow py-3 pr-4 font-normal text-ledger-muted" scope="col">
                    Held as
                  </th>
                  <th className="eyebrow py-3 text-right font-normal text-ledger-muted" scope="col">
                    Proof
                  </th>
                </tr>
              </thead>
              <tbody>
                {LEDGER_ROWS.map((row) => (
                  <tr className="border-ledger-border border-b last:border-0" key={row.item}>
                    <th className="py-4 pr-4 font-medium text-ledger-foreground" scope="row">
                      {row.item}
                    </th>
                    <td className="py-4 pr-4 text-ledger-muted text-sm">{row.holding}</td>
                    <td className="py-4 text-right font-mono text-pulse-deep text-xs">
                      {row.proof}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-10 max-w-2xl rounded-xl border border-ledger-border p-5">
            <p className="font-medium text-ledger-foreground text-sm">The honest fine print</p>
            <p className="mt-2 text-ledger-muted text-sm leading-relaxed">
              Managed mode — the default, and what powers semantic recall — runs a relayer that
              embeds and encrypts your data server-side, so it sees plaintext during ingestion.
              The product says so on every import screen. For anything you'd rather we never see,
              <span className="font-medium text-ledger-foreground"> Private mode</span> encrypts
              in your browser before upload: zero plaintext leaves the tab, and the trade is that
              those memories aren't semantically searchable and never surface to connected AI.
              We'd rather tell you the trade than impress you.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- 09 · Final CTA — a heart of mini hearts behind it ---------------- */}
      <section className="relative overflow-hidden bg-black">
        <div className="-translate-y-1/2 absolute inset-x-0 top-1/2 h-[46rem] opacity-60">
          <HeartField density={1} seed={5} />
        </div>
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 py-[calc(var(--space-section)*1.2)] text-center sm:px-6">
          <SoulMark className="size-12" />
          <h2 className="type-etched text-display">
            Begin your second <span className="font-soul text-pulse-soft">soul.</span>
          </h2>
          <p className="max-w-md text-balance text-muted-foreground">
            One sign-in to start. Everything after that is yours to keep, move, license, and revoke.
          </p>
          <Link
            className={cn(buttonVariants({ size: "lg" }), "glow-pulse gap-2 rounded-full px-8")}
            href="/sign-in"
          >
            Create your soul
            <ArrowRight aria-hidden className="size-4" />
          </Link>
          <p className="flex items-center gap-2 font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.14em]">
            <Fingerprint aria-hidden className="size-3.5" />
            Your Soul · Your Data · Your Life
          </p>
        </div>
      </section>
    </>
  );
}
