'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  ExternalLink,
  AlertCircle,
  BarChart3,
  Activity,
  Target,
  Shield,
} from 'lucide-react';
import { api, type PortfolioResponse, type OpenPosition } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { formatPct, formatUsd, timeAgo, explorerUrl } from '@/lib/format';
import { StatCard } from '@/components/ui/stat-card';
import { SkeletonStatCard, SkeletonList } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

function priceUsd(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1000) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

export default function PortfolioPage() {
  const { data, isLoading, isError } = useQuery<PortfolioResponse>({
    queryKey: qk.portfolio(),
    queryFn: () => api.listPortfolio(),
    refetchInterval: REFETCH.medium,
  });

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-8">
        <Breadcrumbs crumbs={[{ label: 'Portfolio' }]} />
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold text-slate-100">Portfolio</h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <SkeletonList rows={2} />
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-20">
        <Breadcrumbs crumbs={[{ label: 'Portfolio' }]} />
        <div className="card mx-auto mt-6 max-w-md border-danger/30 bg-danger/5 text-center">
          <AlertCircle className="mx-auto mb-3 h-5 w-5 text-danger" />
          <p className="text-sm text-danger">Failed to load portfolio</p>
          <button onClick={() => window.location.reload()} className="btn-danger mt-4 text-xs">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { summary, open: openPositions, closed: closedPositions } = data;
  const unrealizedTone =
    summary.unrealizedPnlUsd > 0
      ? 'positive'
      : summary.unrealizedPnlUsd < 0
        ? 'negative'
        : undefined;
  const realizedTone = summary.realizedPnlUsd >= 0 ? 'positive' : 'negative';

  return (
    <div className="animate-fade-in space-y-8">
      <Breadcrumbs crumbs={[{ label: 'Portfolio' }]} />
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-100">Portfolio</h1>
        <p className="mt-1 text-sm text-slate-400">
          {summary.totalOpenPositions} open · {summary.totalClosedPositions} closed
          {summary.currentValueUsd > 0 && (
            <>
              {' · '}
              <span className="text-slate-300">{formatUsd(summary.currentValueUsd)} exposure</span>
            </>
          )}
        </p>
      </div>

      {/* Summary cards — unrealized + realized side-by-side now that we
          actually capture entry/current prices and can compute both. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Unrealized P&L"
          value={formatUsd(summary.unrealizedPnlUsd)}
          tone={unrealizedTone}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Realized P&L"
          value={formatUsd(summary.realizedPnlUsd)}
          tone={realizedTone}
        />
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Win Rate"
          value={summary.winRate !== null ? `${summary.winRate.toFixed(0)}%` : '—'}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Avg Hold"
          value={
            summary.avgHoldTimeHours !== null ? `${Math.round(summary.avgHoldTimeHours)}h` : '—'
          }
        />
      </div>

      {/* Open positions */}
      <h2 className="section-title">Open Positions</h2>
      {openPositions.length === 0 ? (
        <div className="mb-8 rounded-xl border border-dashed border-edge/60 p-8 text-center">
          <p className="text-sm text-slate-500">
            No open positions — the agent hasn&apos;t triggered a trade yet.
          </p>
          <Link
            href="/scorecard"
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            View the scorecard →
          </Link>
        </div>
      ) : (
        <div className="mb-8 space-y-3">
          {openPositions.map((p, i) => (
            <OpenPositionCard key={p.id} position={p} index={i} />
          ))}
        </div>
      )}

      {/* Closed positions */}
      <h2 className="section-title">Trade History</h2>
      {closedPositions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge/60 p-8 text-center">
          <p className="text-sm text-slate-500">
            No closed trades yet — outcomes will appear here after the agent executes and closes
            positions.
          </p>
          <Link
            href="/case-study/halo2"
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            See a full example trade →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {closedPositions.map((p, i) => (
            <div
              key={p.id}
              className={`animate-signal-enter flex items-center justify-between rounded-xl border p-4 ${
                p.pnlUsd >= 0
                  ? 'border-signal/30 bg-signal/[0.03]'
                  : 'border-danger/30 bg-danger/[0.03]'
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    p.pnlUsd >= 0 ? 'bg-signal/10' : 'bg-danger/10'
                  }`}
                >
                  {p.pnlUsd >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-signal" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-danger" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">{p.asset}</p>
                  <p className="text-xs text-slate-500">
                    {priceUsd(p.entryPriceUsd)} → {priceUsd(p.exitPriceUsd)}
                    {' · '}
                    {timeAgo(p.closedAt)}
                    {p.convictionAtOpen ? ` · conviction ${p.convictionAtOpen}` : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${p.pnlUsd >= 0 ? 'text-signal' : 'text-danger'}`}>
                  {formatPct(p.pnlPct)}
                </p>
                <p className={`text-xs ${p.pnlUsd >= 0 ? 'text-signal/70' : 'text-danger/70'}`}>
                  {formatUsd(p.pnlUsd)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Open position card — surfaces entry price, current price, unrealized
// PnL, and TP/SL levels. Border color tracks PnL sign so the book reads
// at a glance. Falls back to muted styling when price data isn't yet
// available (e.g., during the lazy entry-price backfill).
function OpenPositionCard({ position: p, index }: { position: OpenPosition; index: number }) {
  const pnlPct = p.unrealizedPnlPct;
  const pnlUsd = p.unrealizedPnlUsd;
  const hasPnl = pnlPct != null && pnlUsd != null;
  const isUp = hasPnl && pnlPct > 0;
  const isDown = hasPnl && pnlPct < 0;

  const borderTone = isUp
    ? 'border-signal/30 bg-signal/[0.03]'
    : isDown
      ? 'border-danger/30 bg-danger/[0.03]'
      : 'border-edge/60';
  const pnlColor = isUp ? 'text-signal' : isDown ? 'text-danger' : 'text-slate-400';

  return (
    <div
      className={`animate-signal-enter rounded-xl border p-4 ${borderTone}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              isUp ? 'bg-signal/10' : isDown ? 'bg-danger/10' : 'bg-accent/10'
            }`}
          >
            {isDown ? (
              <TrendingDown className="h-4 w-4 text-danger" />
            ) : (
              <TrendingUp className={`h-4 w-4 ${isUp ? 'text-signal' : 'text-accent'}`} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-200">
              {p.asset} · {p.direction.toUpperCase()}
            </p>
            <p className="text-xs text-slate-500">
              {timeAgo(p.openedAt)}
              {p.convictionAtOpen ? ` · conviction ${p.convictionAtOpen}` : ''}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-base font-bold tabular-nums ${pnlColor}`}>
            {hasPnl ? `${pnlPct! >= 0 ? '+' : ''}${pnlPct!.toFixed(2)}%` : '—'}
          </p>
          <p className={`text-xs tabular-nums ${pnlColor} opacity-70`}>
            {hasPnl ? formatUsd(pnlUsd!) : 'pending price'}
          </p>
        </div>
      </div>

      {/* Price + TP/SL row */}
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div className="text-slate-500">
          <span className="font-mono uppercase tracking-wider text-[10px]">entry</span>
          <p className="mt-0.5 font-mono tabular-nums text-slate-300">
            {priceUsd(p.entryPriceUsd)}
          </p>
        </div>
        <div className="text-slate-500">
          <span className="font-mono uppercase tracking-wider text-[10px]">now</span>
          <p className="mt-0.5 font-mono tabular-nums text-slate-300">
            {priceUsd(p.currentPriceUsd)}
          </p>
        </div>
        <div className="text-slate-500">
          <span className="font-mono uppercase tracking-wider text-[10px]">tp / sl</span>
          <p className="mt-0.5 font-mono tabular-nums text-slate-400">
            {p.takeProfitPrice != null ? (
              <span className="text-signal/80">
                <Target className="inline h-3 w-3" /> {priceUsd(p.takeProfitPrice)}
              </span>
            ) : null}
            {p.takeProfitPrice != null && p.stopLossPrice != null ? ' · ' : null}
            {p.stopLossPrice != null ? (
              <span className="text-danger/80">
                <Shield className="inline h-3 w-3" /> {priceUsd(p.stopLossPrice)}
              </span>
            ) : null}
            {p.takeProfitPrice == null && p.stopLossPrice == null ? 'arming…' : null}
          </p>
        </div>
      </div>

      {p.entryTxHash && (
        <div className="mt-3 border-t border-edge/30 pt-2">
          <Link
            href={explorerUrl(p.chain, p.entryTxHash)}
            target="_blank"
            className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-accent"
          >
            entry tx {p.entryTxHash.slice(0, 14)}…
            <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
