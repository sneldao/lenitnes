'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Eye,
  GitCommit,
  Brain,
  Shield,
  Zap,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { api, type ScorecardResponse } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';

// ─────────────────────────────────────────────────────────────
// LENITNES landing — the public surface.
//
// Cyberpunk dashboard aesthetic. Cyan accent, Fraunces display.
// Dark canvas with noise texture. Orchestrated motion.
// ─────────────────────────────────────────────────────────────

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
            The June 2026 halo2 soundness bug was visible in public commits two days before
            disclosure took ZEC down ~50%. Reading that leak — and committing every thesis on-chain
            before the market moves — is the whole operation.
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
          className="reveal reveal-delay-1 in-view mb-24 scroll-mt-24 sm:mb-32 sm:scroll-mt-28"
        >
          <SectionLabel number="01" label="The track record" />
          <h2 className="mb-10 max-w-2xl font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
            The public scorecard says
            <span className="italic"> everything</span>.
          </h2>
          <TrackRecordStrip />
          <p className="mt-6 max-w-prose text-xs leading-relaxed text-slate-500">
            Recomputed live from the same tables the calls are written to — the system cannot
            misremember its own performance.
          </p>
        </section>

        {/* ── How it works — the 6-step loop as a visual flow ── */}
        <section
          id="how-it-works"
          className="reveal reveal-delay-2 in-view mb-24 scroll-mt-24 sm:mb-32 sm:scroll-mt-28"
        >
          <SectionLabel number="02" label="How it works" />
          <h2 className="mb-10 max-w-2xl font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
            One loop.
            <br />
            <span className="italic text-accent">No human input.</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-edge/40 bg-panel/60 p-4">
            {LOOP_STEPS.map((step, i) => (
              <div key={step.title} className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-ink-light/60 px-3 py-2">
                  <step.icon className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-slate-200">{step.title}</span>
                </div>
                {i < LOOP_STEPS.length - 1 && <ArrowRight className="h-4 w-4 text-slate-600" />}
              </div>
            ))}
          </div>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LOOP_STEPS.map((step, i) => (
              <li key={step.title} className="rounded-lg border border-edge/30 bg-ink-light/40 p-3">
                <div className="flex items-center gap-2">
                  <step.icon className="h-4 w-4 text-accent" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-200">{step.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── The case study — the founding myth ── */}
        <section
          id="zec-story"
          className="reveal reveal-delay-3 in-view mb-24 scroll-mt-24 sm:mb-32 sm:scroll-mt-28"
        >
          <SectionLabel number="03" label="The case study" />
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="mb-6 font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
                The 2026-06-02 emergency release
                <br />
                <span className="italic text-accent">the model scored at 95.</span>
              </h2>
              <p className="mb-6 text-sm leading-relaxed text-slate-400">
                Shielded Labs shipped{' '}
                <code className="rounded bg-edge/30 px-1.5 py-0.5 font-mono text-xs text-slate-300">
                  Zebra 4.5.3: emergency soft fork disabling Orchard actions
                </code>{' '}
                — a surprise release with no preceding bug report. Four detectors fired, conviction
                95/100, recommended action SHORT ZEC. Entry ~$600 (2-Jun), trough $309 on the 5-Jun
                disclosure — <span className="text-accent">+48.5% directional return</span> at T+3d.
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
              <div className="space-y-1 font-mono text-xs">
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
                  <span className="font-medium text-slate-200">4 of 9</span>
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
        <section className="reveal reveal-delay-4 in-view mb-24 sm:mb-32">
          <SectionLabel number="04" label="Recent calls" />
          <h2 className="mb-10 max-w-2xl font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
            Every signal,
            <br />
            <span className="italic">with the receipts.</span>
          </h2>
          <RecentCalls />
        </section>

        {/* ── One engine, two audiences — the enterprise direction ── */}
        <section className="reveal reveal-delay-4 in-view mb-24 sm:mb-32">
          <SectionLabel number="05" label="One engine, two audiences" />
          <h2 className="mb-6 max-w-2xl font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
            Your commits are
            <br />
            <span className="italic">telling the market something.</span>
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
            The same nine detectors and versioned rubric that trade in public can scan any
            repository&apos;s history and show what it signaled — before a market, or a competitor,
            noticed. The public track record on this site is the proof the engine works; the
            leak-scan is what it does for you.
          </p>
          <Link
            href="/scan"
            className="mt-6 inline-flex items-center gap-2 font-mono text-sm text-accent hover:underline"
          >
            Run it on any repo
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <p className="mt-4 text-xs text-slate-500">
            Part of the{' '}
            <a href="https://persidian.com" className="link-underline text-accent">
              Persidian
            </a>{' '}
            portfolio — sentinels for every business rhythm: money in, messages out, theses tested,
            data trusted.
          </p>
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

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-panel p-6">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-2 font-display text-3xl font-light ${color ?? 'text-slate-100'}`}>
        {value}
      </div>
    </div>
  );
}

function TrackRecordStrip() {
  const { data, isLoading } = useQuery<ScorecardResponse>({
    queryKey: qk.scorecard(),
    queryFn: () => api.getScorecard(),
    refetchInterval: REFETCH.medium,
  });

  const grid =
    'grid gap-px overflow-hidden rounded-lg border border-edge/40 bg-edge/30 sm:grid-cols-5';

  if (isLoading || !data) {
    return (
      <div className={grid}>
        {['Signals', 'Trades', 'Hit ratio', 'Sharpe', 'P&L'].map((label) => (
          <StatCell key={label} label={label} value="—" color="text-slate-600" />
        ))}
      </div>
    );
  }

  const pnlPositive = data.cumulativePnlUsd >= 0;
  const stats = [
    { label: 'Signals', value: data.totalSignals.toString() },
    { label: 'Trades', value: data.totalTrades.toString() },
    { label: 'Hit ratio', value: `${(data.hitRatio * 100).toFixed(0)}%` },
    { label: 'Sharpe', value: data.sharpe.toFixed(2) },
    {
      label: 'P&L (paper)',
      value: pnlPositive
        ? `+$${data.cumulativePnlUsd.toFixed(2)}`
        : `-$${Math.abs(data.cumulativePnlUsd).toFixed(2)}`,
      color: pnlPositive ? 'text-signal' : 'text-danger',
    },
  ];

  return (
    <div className={grid}>
      {stats.map((s) => (
        <StatCell key={s.label} label={s.label} value={s.value} color={s.color} />
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
            className="animate-signal-enter grid grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-edge/30 py-4 first:border-t-0"
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
                className="block truncate font-display text-base text-slate-100 transition-colors hover:text-accent"
              >
                {call.thesis ?? 'No thesis recorded'}
              </Link>
            </div>
            <div className="shrink-0 text-right">
              {call.conviction != null && (
                <div className="font-display text-xl font-light text-slate-100">
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

const LOOP_STEPS: { title: string; icon: LucideIcon; body: string }[] = [
  {
    title: 'Watchlist',
    icon: Eye,
    body: 'Curated consensus- and security-critical repos — Zcash (halo2, Zebra), Bitcoin, Ethereum, Solana (Agave), Arbitrum, Sui. News is corroboration, never the primary signal.',
  },
  {
    title: 'Detect',
    icon: GitCommit,
    body: 'Nine typed detectors decide what counts as a signal — emergency patches, security-critical changes, consensus edits — with a score and confidence per batch.',
  },
  {
    title: 'Score',
    icon: Brain,
    body: 'A frontier-model agent evaluates the signal against a versioned rubric — conviction 0–100, thesis, action.',
  },
  {
    title: 'Gate',
    icon: Shield,
    body: 'Conviction ≥ 70 trades; sub-threshold scores persist as reasoning archive only.',
  },
  {
    title: 'Commit + Proof',
    icon: Zap,
    body: 'Open a tracked position — long or short, explicitly labeled paper — notarize the thesis on Hedera HCS, broadcast to Telegram.',
  },
  {
    title: 'Track outcome',
    icon: TrendingUp,
    body: 'Mainnet price snapshotted at T+1h, T+1d, T+7d and attributed back to the originating signal.',
  },
];
