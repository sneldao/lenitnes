'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { api, type ScorecardResponse } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';

// ─────────────────────────────────────────────────────────────
// LENITNES landing — the public surface.
//
// Cyberpunk dashboard aesthetic. Cyan accent, Fraunces display.
// Dark canvas with noise texture. Orchestrated motion.
// Day 12: full rewrite, was a 1180-line SaaS dashboard.
// ─────────────────────────────────────────────────────────────

const REVEAL_CLASS = 'reveal in-view';

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-12 sm:py-20">
        {/* ── Hero — the founding myth as the lede ── */}
        <header className="mb-24 sm:mb-32">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-accent">
            An autonomous AI intelligence operation · 2026
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-slate-100 sm:text-7xl lg:text-8xl">
            The agent
            <br />
            <em className="not-italic text-accent">would have shorted</em>
            <br />
            <span className="text-slate-100">halo2.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-slate-400">
            In June 2026, Shielded Labs disclosed a four-year-old soundness bug in ZCash's halo2
            circuit. The fix shipped via an emergency soft fork on 2-Jun and a hard fork on 3-Jun —
            both public in the Zebra repo. The formal disclosure landed 4-5 Jun. ZEC dropped ~50% in
            48 hours.
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-500">
            We didn't find the bug — Shielded Labs and Anthropic's Opus 4.8 did. The emergency
            response in the public repos was the signal LENITNES is built to catch. Every thesis is
            anchored on Hedera HCS via the Hedera Agent Kit — immutable proof of what the agent saw,
            in its own words, before the market moved.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/case-study/halo2"
              className="btn group inline-flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-wider"
            >
              Read the replay
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/scorecard"
              className="btn-ghost inline-flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-wider"
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
          <h2 className="mb-10 max-w-2xl font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
            The public scorecard says
            <span className="italic"> everything</span>.
          </h2>
          <TrackRecordStrip />
          <p className="mt-6 max-w-prose text-xs leading-relaxed text-slate-500">
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
          <h2 className="mb-12 max-w-2xl font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
            One loop.
            <br />
            <span className="italic text-accent">No human input.</span>
          </h2>
          <ol className="space-y-8">
            {LOOP_STEPS.map((step, i) => (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr] gap-6 border-t border-edge/40 pt-8 first:border-t-0 first:pt-0"
              >
                <div className="font-mono text-3xl font-light text-accent sm:text-4xl">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div>
                  <h3 className="mb-2 font-display text-xl font-semibold text-slate-200">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400">{step.body}</p>
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
              <h2 className="mb-6 font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
                The 2026-06-02 emergency release
                <br />
                <span className="italic text-accent">the model scored at 95.</span>
              </h2>
              <p className="mb-4 text-sm leading-relaxed text-slate-400">
                Shielded Labs shipped{' '}
                <code className="rounded bg-edge/30 px-1.5 py-0.5 font-mono text-xs text-slate-300">
                  Zebra 4.5.3: emergency soft fork at block 3,363,426 disabling Orchard actions
                </code>
                — a surprise release with no preceding bug report.
              </p>
              <p className="mb-6 text-sm leading-relaxed text-slate-400">
                We replayed the agent against the release. Four detectors fired (emergency_patch 98,
                security_critical_patch 95, protocol_upgrade 92, consensus_relevant 90). Conviction
                95/100, recommended action SHORT ZEC, the agent's first-person thesis anchored on
                Hedera HCS via the Hedera Agent Kit.
              </p>
              <p className="mb-8 text-sm leading-relaxed text-slate-400">
                Entry ~$600 (2-Jun). Trough $309 on the 5-Jun disclosure.{' '}
                <span className="text-accent">+48.5% directional return</span> at T+3d. Settled
                ~$425 at T+7d.
              </p>
              <Link
                href="/case-study/halo2"
                className="inline-flex items-center gap-2 font-mono text-sm text-accent hover:underline"
              >
                Read the full replay
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="card">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Agent verdict
              </p>
              <div className="mb-4 flex items-baseline gap-3">
                <div className="font-display text-6xl font-medium text-accent">95</div>
                <div className="font-mono text-sm text-slate-500">/100</div>
              </div>
              <div className="mb-4 space-y-1 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Action</span>
                  <span className="font-medium text-slate-200">SHORT ZEC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Confidence</span>
                  <span className="font-medium text-slate-200">HIGH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Detectors fired</span>
                  <span className="font-medium text-slate-200">4 of 8</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">T+3d outcome</span>
                  <span className="font-medium text-accent">+48.5% ↓</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Hit?</span>
                  <span className="font-medium text-accent">YES</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Recent signals — live from the API ── */}
        <section className={`mb-24 sm:mb-32 ${REVEAL_CLASS}`}>
          <SectionLabel number="04" label="Recent calls" />
          <h2 className="mb-10 max-w-2xl font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
            Every signal,
            <br />
            <span className="italic">with the receipts.</span>
          </h2>
          <RecentCalls />
        </section>
      </div>
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────

function SectionLabel({ number, label }: { number: string; label: string }) {
  return (
    <div className="mb-6 flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">
      <span className="text-accent">{number}</span>
      <span className="h-px w-8 bg-edge" />
      <span>{label}</span>
    </div>
  );
}

function TrackRecordStrip() {
  const { data, isLoading } = useQuery<ScorecardResponse>({
    queryKey: qk.scorecard(),
    queryFn: () => api.getScorecard(),
    refetchInterval: REFETCH.medium,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-px overflow-hidden rounded-lg border border-edge/40 bg-edge/30 sm:grid-cols-5">
        {['Signals', 'Trades', 'Hit ratio', 'Sharpe', 'P&L'].map((label) => (
          <div key={label} className="bg-panel p-6">
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {label}
            </div>
            <div className="mt-2 font-display text-3xl font-light text-slate-600">—</div>
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
    <div className="grid gap-px overflow-hidden rounded-lg border border-edge/40 bg-edge/30 sm:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="bg-panel p-6">
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            {s.label}
          </div>
          <div className={`mt-2 font-display text-3xl font-light ${s.color ?? 'text-slate-100'}`}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentCalls() {
  const { data, isLoading } = useQuery({
    queryKey: qk.scorecardRecent(5),
    queryFn: () => api.getScorecardRecent(5),
    refetchInterval: REFETCH.medium,
  });

  if (isLoading) {
    return <div className="font-mono text-sm text-slate-500">Loading recent calls…</div>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="font-mono text-sm text-slate-500">
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
            className="animate-signal-enter grid grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-edge/30 py-5 first:border-t-0"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="font-mono text-xs text-slate-600">{String(i + 1).padStart(2, '0')}</div>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                <span>{new Date(call.detectedAt).toISOString().slice(0, 10)}</span>
                <span>·</span>
                <span className="truncate">{call.detectorTypes.join(', ') || 'no detector'}</span>
                {call.tradeTxHash && (
                  <>
                    <span>·</span>
                    <span className="text-accent">traded</span>
                  </>
                )}
              </div>
              <Link
                href={`/signals/${call.signalId}`}
                className="block truncate font-display text-lg text-slate-100 transition-colors hover:text-accent"
              >
                {call.thesis ?? 'No thesis recorded'}
              </Link>
            </div>
            <div className="shrink-0 text-right">
              {call.conviction != null && (
                <div className="font-display text-2xl font-light text-slate-100">
                  {call.conviction}
                </div>
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
    title: 'Commit + Proof',
    body: 'Trade from the treasury wallet on BSC testnet, notarize the signal on Hedera HCS (Hashgraph Consensus Service — tamper-evident timestamping with microsecond precision), broadcast the thesis to the public Telegram channel. All three in the same block.',
  },
  {
    title: 'Track outcome',
    body: 'At T+1h, T+1d, and T+7d, the mainnet price for the named asset is snapshotted from CoinGecko. Attributed back to the originating signal. Drives the public scorecard.',
  },
] as const;
