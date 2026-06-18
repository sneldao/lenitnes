'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowUpRight,
  GitCommit,
  Sparkles,
  TrendingUp,
  Activity,
  Shield,
  Zap,
  Target,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { api, type ScorecardResponse } from '@/lib/api';

// ─────────────────────────────────────────────────────────────
// LENITNES landing — the public surface.
//
// Music-publication + record-store aesthetic. Cream/ink/rust.
// Fraunces (display) + JetBrains Mono (technical). No card-heavy
// layouts. Atmospheric noise. Orchestrated motion.
// Day 12: full rewrite, was a 1180-line SaaS dashboard.
// ─────────────────────────────────────────────────────────────

const REVEAL_CLASS = 'reveal in-view';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-cream text-ink bg-noise">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
        {/* ── Hero — the founding myth as the lede ── */}
        <header className="mb-24 sm:mb-32">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-rust">
            An autonomous AI intelligence operation · 2026
          </p>
          <h1 className="font-display text-5xl font-medium leading-[1.05] tracking-tight text-ink sm:text-7xl lg:text-8xl">
            The agent
            <br />
            <em className="not-italic text-rust">would have caught</em>
            <br />
            <span className="text-ink">halo2.</span>
          </h1>
          <p className="mt-8 max-w-2xl font-mono text-sm leading-relaxed text-ink/70">
            In April 2022, a critical soundness fix landed in the ZCash halo2 proving system — the
            cryptographic primitive that backs ZEC's shielded transactions. The commit was public
            for four days before the market noticed. ZEC then dropped 50%. The signals were public
            the whole time.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/case-study/halo2"
              className="group inline-flex items-center gap-2 rounded-sm bg-ink px-6 py-3 font-mono text-xs uppercase tracking-wider text-cream transition-colors hover:bg-rust"
            >
              Read the replay
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/scorecard"
              className="inline-flex items-center gap-2 rounded-sm border border-ink/30 bg-cream px-6 py-3 font-mono text-xs uppercase tracking-wider text-ink transition-colors hover:border-ink hover:bg-ink/5"
            >
              Live scorecard
            </Link>
          </div>
        </header>

        {/* ── Track record — live numbers from the scorecard ── */}
        <section
          id="demo"
          className={`mb-24 scroll-mt-24 sm:mb-32 sm:scroll-mt-28 ${REVEAL_CLASS}`}
        >
          <SectionLabel number="01" label="The track record" />
          <h2 className="mb-10 max-w-2xl font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
            The public scorecard says
            <span className="italic"> everything</span>.
          </h2>
          <TrackRecordStrip />
          <p className="mt-6 max-w-prose font-mono text-xs leading-relaxed text-ink/50">
            Every signal the agent has scored. Every trade the treasury has recorded. Every price
            outcome at T+1h, T+1d, and T+7d. The system cannot misremember its own performance — the
            receipts are on-chain, the scorecard is computed from the same tables, and the cache is
            invalidated on every new signal.
          </p>
        </section>

        {/* ── How it works — the 6-step loop ── */}
        <section
          id="how-it-works"
          className={`mb-24 scroll-mt-24 sm:mb-32 sm:scroll-mt-28 ${REVEAL_CLASS}`}
        >
          <SectionLabel number="02" label="How it works" />
          <h2 className="mb-12 max-w-2xl font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
            One loop.
            <br />
            <span className="italic text-rust">No human input.</span>
          </h2>
          <ol className="space-y-8">
            {LOOP_STEPS.map((step, i) => (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr] gap-6 border-t border-ink/15 pt-8 first:border-t-0 first:pt-0"
              >
                <div className="font-mono text-3xl font-light text-rust sm:text-4xl">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div>
                  <h3 className="mb-2 font-display text-xl font-medium text-ink">{step.title}</h3>
                  <p className="font-mono text-sm leading-relaxed text-ink/70">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── The case study — the founding myth ── */}
        <section
          id="zec-story"
          className={`mb-24 scroll-mt-24 sm:mb-32 sm:scroll-mt-28 ${REVEAL_CLASS}`}
        >
          <SectionLabel number="03" label="The case study" />
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="mb-6 font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
                The 2022-04-15 commit
                <br />
                <span className="italic text-rust">the model scored at 92.</span>
              </h2>
              <p className="mb-4 font-mono text-sm leading-relaxed text-ink/70">
                The fix landed as{' '}
                <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-xs text-ink">
                  halo2_gadgets: Anchor variable-base scalar-mul incomplete-addition base
                </code>{' '}
                — technical, understated, easy to scroll past.
              </p>
              <p className="mb-6 font-mono text-sm leading-relaxed text-ink/70">
                We replayed the agent against the commit. The detector pipeline fired three signals
                (security_critical_patch, consensus_relevant, emergency_patch). The agent's
                conviction was 92/100, recommended action long ZEC, paper trade recorded with a
                deterministic tx hash.
              </p>
              <p className="mb-8 font-mono text-sm leading-relaxed text-ink/70">
                T+1d: ZEC went up 2.15%. The trade was a hit.
              </p>
              <Link
                href="/case-study/halo2"
                className="inline-flex items-center gap-2 font-mono text-sm text-rust hover:underline"
              >
                Read the full replay
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="rounded-sm border border-ink/15 bg-ink/[0.02] p-6">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50">
                Agent verdict
              </p>
              <div className="mb-4 flex items-baseline gap-3">
                <div className="font-display text-6xl font-medium text-rust">92</div>
                <div className="font-mono text-sm text-ink/60">/100</div>
              </div>
              <div className="mb-4 space-y-1 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-ink/60">Action</span>
                  <span className="font-medium text-ink">LONG ZEC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/60">Confidence</span>
                  <span className="font-medium text-ink">HIGH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/60">Detectors fired</span>
                  <span className="font-medium text-ink">3 of 8</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/60">T+1d outcome</span>
                  <span className="font-medium text-rust">+2.15% ↑</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/60">Hit?</span>
                  <span className="font-medium text-rust">YES</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Recent signals — live from the API ── */}
        <section className={`mb-24 sm:mb-32 ${REVEAL_CLASS}`}>
          <SectionLabel number="04" label="Recent calls" />
          <h2 className="mb-10 max-w-2xl font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
            Every signal,
            <br />
            <span className="italic">with the receipts.</span>
          </h2>
          <RecentCalls />
        </section>

        {/* ── Footer — open source, MIT, fork it ── */}
        <footer className="border-t border-ink/15 pt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-xs text-ink/60">
              LENITNES · MIT · zero-headcount · since 2026
            </p>
            <div className="flex items-center gap-4 font-mono text-xs">
              <a
                href="https://github.com/sneldao/lenitnes"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-ink/70 transition-colors hover:text-rust"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Source
              </a>
              <Link href="/scorecard" className="text-ink/70 transition-colors hover:text-rust">
                Scorecard
              </Link>
              <Link
                href="/case-study/halo2"
                className="text-ink/70 transition-colors hover:text-rust"
              >
                Halo2
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────

function SectionLabel({ number, label }: { number: string; label: string }) {
  return (
    <div className="mb-6 flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
      <span className="text-rust">{number}</span>
      <span className="h-px w-8 bg-ink/20" />
      <span>{label}</span>
    </div>
  );
}

function TrackRecordStrip() {
  const { data, isLoading } = useQuery<ScorecardResponse>({
    queryKey: ['scorecard', 'overall', 'landing'],
    queryFn: () => api.getScorecard(),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-px overflow-hidden rounded-sm border border-ink/15 bg-ink/15 sm:grid-cols-5">
        {['Signals', 'Trades', 'Hit ratio', 'Sharpe', 'P&L'].map((label) => (
          <div key={label} className="bg-cream p-6">
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
              {label}
            </div>
            <div className="mt-2 font-display text-3xl font-light text-ink/30">—</div>
          </div>
        ))}
      </div>
    );
  }

  const pnlPositive = data.cumulativePnlUsd >= 0;
  const stats = [
    { label: 'Signals', value: data.totalSignals.toString() },
    { label: 'Trades', value: data.totalTrades.toString() },
    {
      label: 'Hit ratio',
      value: `${(data.hitRatio * 100).toFixed(0)}%`,
    },
    {
      label: 'Sharpe',
      value: data.sharpe.toFixed(2),
    },
    {
      label: 'P&L (paper)',
      value: pnlPositive
        ? `+$${data.cumulativePnlUsd.toFixed(2)}`
        : `-$${Math.abs(data.cumulativePnlUsd).toFixed(2)}`,
      color: pnlPositive ? 'text-signal' : 'text-danger',
    },
  ];

  return (
    <div className="grid gap-px overflow-hidden rounded-sm border border-ink/15 bg-ink/15 sm:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="bg-cream p-6">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
            {s.label}
          </div>
          <div className={`mt-2 font-display text-3xl font-light ${s.color ?? 'text-ink'}`}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentCalls() {
  const { data, isLoading } = useQuery({
    queryKey: ['scorecard', 'recent', 'landing'],
    queryFn: () => api.getScorecardRecent(5),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="font-mono text-sm text-ink/40">Loading recent calls…</div>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="font-mono text-sm text-ink/40">
        No signals yet — the agent is monitoring the watchlist.
      </div>
    );
  }

  return (
    <ol className="space-y-0">
      {data.map((call, i) => {
        const isHit = call.outcomes.t1d != null && call.outcomes.t1d > 0;
        return (
          <li
            key={call.signalId}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-ink/10 py-5 first:border-t-0"
          >
            <div className="font-mono text-xs text-ink/40">{String(i + 1).padStart(2, '0')}</div>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink/50">
                <span>{new Date(call.detectedAt).toISOString().slice(0, 10)}</span>
                <span>·</span>
                <span className="truncate">{call.detectorTypes.join(', ') || 'no detector'}</span>
                {call.tradeTxHash && (
                  <>
                    <span>·</span>
                    <span className="text-rust">traded</span>
                  </>
                )}
              </div>
              <Link
                href={`/signals/${call.signalId}`}
                className="block truncate font-display text-lg text-ink transition-colors hover:text-rust"
              >
                {call.thesis ?? 'No thesis recorded'}
              </Link>
            </div>
            <div className="shrink-0 text-right">
              {call.conviction != null && (
                <div className="font-display text-2xl font-light text-ink">{call.conviction}</div>
              )}
              {call.outcomes.t1d != null && (
                <div
                  className={`font-mono text-[10px] uppercase tracking-wider ${
                    isHit ? 'text-signal' : 'text-danger'
                  }`}
                >
                  T+1d {isHit ? '+' : ''}
                  {call.outcomes.t1d.toFixed(2)}%
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Copy ────────────────────────────────────────────────────

const LOOP_STEPS = [
  {
    title: 'Watchlist',
    body: 'A curated set of consensus-critical and security-critical repositories. Admin-managed, not user-facing. Five entries on day one — ZCash, Bitcoin, Ethereum, Solana, Arbitrum.',
  },
  {
    title: 'Detect',
    body: 'TinyFish + scraper pulls each new commit. Eight typed detectors classify the change (emergency_patch, security_critical, consensus_relevant, governance_shift, and four more).',
  },
  {
    title: 'Score',
    body: 'A frontier-model agent evaluates the commit against a versioned rubric. Outputs a conviction score (0–100), a 280-character thesis, a recommended action, and a confidence band.',
  },
  {
    title: 'Gate',
    body: 'Conviction ≥ 70. Sub-threshold scores still persist — the reasoning archive — but produce no trade, no Telegram post, no on-chain commitment.',
  },
  {
    title: 'Commit',
    body: 'Trade from the treasury wallet on testnet, notarize the signal on Hedera HCS + Arbitrum SignalRegistry, broadcast the thesis to the public Telegram channel. All three in the same block.',
  },
  {
    title: 'Track outcome',
    body: 'At T+1h, T+1d, and T+7d, the mainnet price for the named asset is snapshotted from CoinGecko. Attributed back to the originating signal. Drives the public scorecard.',
  },
] as const;
