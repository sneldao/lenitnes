'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BarChart3,
  PieChart,
  ScanSearch,
  Shield,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { api, type ScorecardResponse } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { formatRatio, formatSharpe, formatUsd } from '@/lib/format';
import { StatCard } from '@/components/ui/stat-card';
import { PageError, PageLoader } from '@/components/ui/page-states';

// ── LENITNES Markets — the price-oracle vertical. ──────────────
// Watch consensus-critical software, commit a directional thesis
// before the market prices it in, and grade against what price
// actually did. Season 1 is closed and the full record is public.

const START_LINKS = [
  {
    href: '/scorecard?domain=markets',
    title: 'Scorecard',
    description: 'Hit ratio · P&L · conviction bands',
    icon: <BarChart3 className="h-3.5 w-3.5 text-accent" />,
  },
  {
    href: '/portfolio',
    title: 'Portfolio',
    description: 'Open & closed positions',
    icon: <PieChart className="h-3.5 w-3.5 text-accent" />,
  },
  {
    href: '/calibration',
    title: 'Calibration',
    description: 'Conviction bands & repo tiers',
    icon: <SlidersHorizontal className="h-3.5 w-3.5 text-accent" />,
  },
  {
    href: '/scan?domain=markets',
    title: 'Leak-scan',
    description: 'Run the engine over any public repo',
    icon: <ScanSearch className="h-3.5 w-3.5 text-accent" />,
  },
];

export default function MarketsPortal() {
  const { data, isLoading, isError } = useQuery<ScorecardResponse>({
    queryKey: qk.scorecard(),
    queryFn: () => api.getScorecard(),
    refetchInterval: REFETCH.medium,
  });

  if (isLoading) return <PageLoader label="Loading the markets record…" />;
  if (isError || !data)
    return (
      <PageError message="Failed to load the markets scorecard. The API may be down — try again in a moment." />
    );

  const proof = data.proofCoverage;

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-6 sm:py-10">
      <header className="space-y-4">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent">
          <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5">
            [markets]
          </span>
          price oracle · graded against what the market did
        </div>
        <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight text-slate-100 sm:text-5xl">
          Software change → market risk, committed before it is priced in.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-slate-400">
          LENITNES Markets watches consensus-critical repositories, scores commits with a versioned
          rubric, and commits a directional thesis on-chain{' '}
          <em className="not-italic text-slate-300">before</em> the outcome — then grades itself
          against price at T+1h / T+1d / T+7d, losses included.
        </p>
        <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
          Season 1 closed 15 Aug 2026 · record is final · recomputed live
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/scorecard?domain=markets"
            className="btn inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider"
          >
            Markets scorecard <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/case-study/halo2"
            className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider"
          >
            halo2 founding replay
          </Link>
          <Link
            href="/methodology"
            className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider"
          >
            How it works
          </Link>
        </div>
      </header>

      {/* ── Season 1 — the honest ledger, front and center ── */}
      <section className="card border-warn/25 bg-panel/60">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-warn/15 text-[10px] uppercase tracking-wider text-warn">
            Season 1 · closed
          </span>
          <span className="font-mono text-[10px] text-slate-500">
            live run, Jun–Aug 2026 · record is final
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
          The agent traded live and lost. We publish the whole record — HCS-anchored, immutable,
          losses included. That is the evaluation, not a press release.
        </p>
      </section>

      {/* ── The numbers, scoped to this vertical ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Zap className="h-3 w-3" />}
          label="Trades executed"
          value={data.totalTrades.toString()}
          caveat={`${data.totalSignals} signals scored`}
        />
        <StatCard
          icon={<Activity className="h-3 w-3" />}
          label="Hit ratio · T+1d"
          value={data.outcomesSummary.closed > 0 ? formatRatio(data.hitRatio) : '—'}
          caveat={`${data.outcomesSummary.closed} judged`}
        />
        <StatCard
          icon={
            data.cumulativePnlUsd >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )
          }
          label="Cumulative P&L"
          value={data.outcomesSummary.closed > 0 ? formatUsd(data.cumulativePnlUsd) : '—'}
          caveat={`sharpe ${formatSharpe(data.sharpe)}`}
        />
        <StatCard
          icon={<Shield className="h-3 w-3" />}
          label="HCS-proofed"
          value={proof ? `${proof.pct}%` : '—'}
          caveat="notarized before outcome"
        />
      </section>

      {/* ── Where to go next ── */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {START_LINKS.map((l) => (
          <Link
            key={l.title}
            href={l.href}
            className="card group space-y-2 transition-colors hover:border-accent/40"
          >
            <span className="flex items-center gap-2">
              {l.icon}
              <span className="text-sm font-semibold text-slate-200 group-hover:text-accent">
                {l.title}
              </span>
            </span>
            <p className="text-xs leading-relaxed text-slate-500">{l.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
