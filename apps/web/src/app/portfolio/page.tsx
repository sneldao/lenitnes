'use client';

import { useMemo } from 'react';
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
import {
  api,
  type PortfolioResponse,
  type OpenPosition,
  type PositionVenue,
  type PricesSnapshot,
} from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { formatPct, formatUsd, timeAgo, explorerUrl, txHashVenue } from '@/lib/format';
import { StatCard } from '@/components/ui/stat-card';
import { SkeletonStatCard, SkeletonList } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Tooltip } from '@/components/ui/tooltip';
import { SignalSourceBadge } from '@/components/SignalSourceBadge';

type VenueBadge = PositionVenue | 'onchain';

function venueBadge(venue: VenueBadge | null): React.ReactNode {
  if (!venue) return null;
  const styles: Record<VenueBadge, string> = {
    paper: 'bg-slate-700/40 text-slate-400 border-slate-700/60',
    spot: 'bg-signal/10 text-signal border-signal/30',
    propr: 'bg-accent/15 text-accent border-accent/30',
    onchain: 'bg-signal/10 text-signal border-signal/30',
  };
  const labels: Record<VenueBadge, string> = {
    paper: 'Paper',
    spot: 'Spot',
    propr: 'Propr',
    onchain: 'Spot',
  };
  const style = styles[venue];
  const label = labels[venue];
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${style}`}
    >
      {label}
    </span>
  );
}

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

  // Live tick between full refetches — the portfolio API's 60s cycle
  // reads from the same hub, but this page is the product's one spot
  // where 'it moves while you watch' IS the message.
  const { data: prices } = useQuery<PricesSnapshot>({
    queryKey: ['prices'],
    queryFn: () => api.getPrices(),
    refetchInterval: REFETCH.fast,
  });

  // Merge hub ticks into position rows: live current price + recomputed
  // unrealized P&L per position; sort by drama (|pnl %| desc, priced
  // positions first).
  const liveOpen = useMemo(() => {
    const merged = (data?.open ?? []).map((p) => {
      const tick = prices?.prices[p.asset];
      if (!tick || p.entryPriceUsd == null || p.entryAmount <= 0) return p;
      const sign = p.direction === 'short' ? -1 : 1;
      return {
        ...p,
        currentPriceUsd: tick,
        unrealizedPnlUsd: sign * (tick - p.entryPriceUsd) * p.entryAmount,
        unrealizedPnlPct: sign * ((tick - p.entryPriceUsd) / p.entryPriceUsd) * 100,
      };
    });
    return merged.sort(
      (a, b) => Math.abs(b.unrealizedPnlPct ?? -1) - Math.abs(a.unrealizedPnlPct ?? -1),
    );
  }, [data, prices]);

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
      <div className="reveal in-view">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 reveal reveal-delay-1 in-view">
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
        <div className="mb-8 rounded-xl border border-dashed border-edge/60 p-6 text-center">
          <p className="text-sm text-slate-500">No open positions.</p>
          <Link
            href="/scorecard"
            className="mt-1 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            View the scorecard →
          </Link>
        </div>
      ) : (
        <div className="mb-8 grid gap-3 lg:grid-cols-2">
          {liveOpen.map((p, i) => (
            <OpenPositionCard key={p.id} position={p} index={i} />
          ))}
        </div>
      )}

      {/* Closed positions */}
      <h2 className="section-title">Trade History</h2>
      <p className="mb-3 text-[11px] text-slate-500">
        Positions predating rubric v4 were closed manually on 7 Jul 2026 — the scored record starts
        there.
      </p>
      {closedPositions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge/60 p-6 text-center">
          <p className="text-sm text-slate-500">No closed trades yet.</p>
          <Link
            href="/case-study/halo2"
            className="mt-1 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            See a full example →
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
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    {priceUsd(p.entryPriceUsd)} → {priceUsd(p.exitPriceUsd)}
                    {' · '}
                    {timeAgo(p.closedAt)}
                    {p.convictionAtOpen ? ` · conviction ${p.convictionAtOpen}` : ''}
                    {venueBadge(p.venue)}
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
  const venue = txHashVenue(p.entryTxHash, p.venue);

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
            <p className="flex items-center gap-2 text-xs text-slate-500">
              {timeAgo(p.openedAt)}
              {p.convictionAtOpen ? ` · conviction ${p.convictionAtOpen}` : ''}
              {venueBadge(venue)}
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

      {/* Price + TP/SL row — one glance tells you where the bet sits */}
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div className="text-slate-500">
          <span className="font-mono uppercase tracking-wider text-[10px]">entry</span>
          <p className="mt-0.5 font-mono tabular-nums text-slate-300">
            {priceUsd(p.entryPriceUsd)}
          </p>
        </div>
        <div className="text-slate-500">
          <span className="font-mono uppercase tracking-wider text-[10px]">now · live</span>
          <p
            className={cn(
              'mt-0.5 font-mono tabular-nums text-slate-300 transition-colors duration-500',
              isUp && 'text-signal',
              isDown && 'text-danger',
            )}
          >
            {priceUsd(p.currentPriceUsd)}
          </p>
        </div>
        <div className="text-slate-500">
          <Tooltip
            wide
            label="Take-profit (green target) and stop-loss (red shield) price levels. The stop-loss widens and the take-profit extends as conviction rises."
          >
            <span className="font-mono uppercase tracking-wider text-[10px]">tp / sl</span>
          </Tooltip>
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

      {/* TP/SL progress rail: where is the price inside the bracket? */}
      {p.takeProfitPrice != null && p.stopLossPrice != null && p.currentPriceUsd != null && (
        <PositionRail position={p} />
      )}

      {p.reasoning && (p.reasoning.thesis || p.reasoning.sourceCategory !== 'commit') && (
        <div className="mt-3 rounded-lg border border-edge/40 bg-ink-light/40 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <SignalSourceBadge
              category={p.reasoning.sourceCategory}
              label={p.reasoning.sourceLabel}
            />
            {p.reasoning.repo && (
              <span className="truncate font-mono text-[10px] text-slate-500">
                {p.reasoning.repo}
              </span>
            )}
            {p.reasoning.detectorTypes.length > 0 && (
              <span className="truncate font-mono text-[10px] text-slate-600">
                {p.reasoning.detectorTypes.join(' · ')}
              </span>
            )}
          </div>
          {p.reasoning.thesis && (
            <p className="text-xs leading-relaxed text-slate-400">{p.reasoning.thesis}</p>
          )}
          {p.reasoning.sourceCategory !== 'commit' && (
            <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
              {p.reasoning.sourceExplanation}
            </p>
          )}
          {p.reasoning.signalId && (
            <Link
              href={`/signals/${p.reasoning.signalId}`}
              className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-mono text-accent hover:underline"
            >
              full reasoning →
            </Link>
          )}
        </div>
      )}

      {p.entryTxHash && (
        <div className="mt-3 border-t border-edge/30 pt-2">
          {venue === 'onchain' ? (
            <Link
              href={explorerUrl(p.chain, p.entryTxHash)}
              target="_blank"
              className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-accent"
            >
              entry tx {p.entryTxHash.slice(0, 14)}…
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          ) : (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-mono ${
                venue === 'propr' ? 'text-accent' : 'text-slate-500'
              }`}
            >
              {venue === 'propr' ? 'Propr perp' : 'paper'} ·{' '}
              {p.entryTxHash.slice(0, venue === 'propr' ? 16 : 14)}…
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Position bracket rail ──
// One line: SL on the danger end, TP on the signal end, a live marker
// at the current price, and a tick at entry. For shorts the geometry
// flips (TP below entry). Fill color follows the position's current
// P&L; when the marker escapes the bracket the rail glows at the
// breached end.
function PositionRail({ position: p }: { position: OpenPosition }) {
  const tp = p.takeProfitPrice!;
  const sl = p.stopLossPrice!;
  const entry = p.entryPriceUsd;
  const current = p.currentPriceUsd!;

  const lo = Math.min(tp, sl);
  const hi = Math.max(tp, sl);
  const domainHi = Math.max(hi, current);
  const domainLo = Math.min(lo, current);
  const span = domainHi - domainLo || 1;
  const pct = (v: number) => ((v - domainLo) / span) * 100;

  const tpLeft = pct(tp);
  const slLeft = pct(sl);
  const curLeft = Math.min(Math.max(pct(current), 0), 100);
  const entryLeft = entry != null ? pct(entry) : null;

  const isUp = (p.unrealizedPnlPct ?? 0) > 0;

  return (
    <div className="mt-4">
      <div className="relative h-2 overflow-visible rounded-full bg-edge/50">
        {/* SL→TP span shading */}
        <div
          className={cn(
            'absolute inset-y-0 rounded-full opacity-40',
            isUp
              ? 'bg-gradient-to-r from-edge/60 to-signal/50'
              : 'bg-gradient-to-r from-danger/50 to-edge/60',
          )}
          style={{ left: `${Math.min(slLeft, tpLeft)}%`, width: `${Math.abs(tpLeft - slLeft)}%` }}
        />
        {/* entry tick */}
        {entryLeft != null && (
          <div
            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-slate-400"
            style={{ left: `${entryLeft}%` }}
            aria-hidden="true"
          />
        )}
        {/* current marker — live */}
        <div
          className={cn(
            'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel shadow transition-[left] duration-500',
            isUp ? 'bg-signal' : 'bg-danger',
          )}
          style={{ left: `${curLeft}%` }}
        />
        {/* TP + SL endcaps */}
        <div
          className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 bg-signal"
          style={{ left: `${tpLeft}%` }}
        />
        <div
          className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 bg-danger"
          style={{ left: `${slLeft}%` }}
        />
      </div>
      {/* End labels follow the bracket geometry — for shorts the TP is
          on the LEFT of the entry and the SL on the right. */}
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-slate-600">
        <span>
          {sl < tp ? (
            <>
              <Shield className="inline h-2 w-2 text-danger/70" /> sl
            </>
          ) : (
            <>
              <Target className="inline h-2 w-2 text-signal/70" /> tp
            </>
          )}
        </span>
        <span>
          {sl < tp ? (
            <>
              <Target className="inline h-2 w-2 text-signal/70" /> tp
            </>
          ) : (
            <>
              <Shield className="inline h-2 w-2 text-danger/70" /> sl
            </>
          )}
        </span>
      </div>
    </div>
  );
}
