'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Layers,
  Zap,
  Sparkles,
  Shield,
  Radar,
} from 'lucide-react';
import {
  api,
  type ScorecardResponse,
  type ScorecardBioResponse,
  type PortfolioResponse,
} from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import {
  formatRatio,
  formatUsd,
  formatSharpe,
  formatDate,
  shortUrl,
  formatDetectorType,
} from '@/lib/format';
import { StatCard } from '@/components/ui/stat-card';
import { OutcomePill } from '@/components/ui/outcome-pill';
import { PageLoader, PageError } from '@/components/ui/page-states';
import { JudgmentCountdown } from '@/components/JudgmentCountdown';
import { PnlSparkline } from '@/components/ui/pnl-sparkline';

function fmtPct(n: number | null): string {
  if (n == null) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function pctTone(n: number | null): string {
  if (n == null) return 'text-slate-500';
  if (n > 0.1) return 'text-signal';
  if (n < -0.1) return 'text-danger';
  return 'text-slate-400';
}

export default function ScorecardPage() {
  const [domain, setDomain] = useState<'code' | 'bio'>(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('domain') === 'bio'
      ? 'bio'
      : 'code',
  );

  return (
    <div className="space-y-8">
      {/* Domain tabs — badge style, mono text, no emoji */}
      <div className="flex items-center gap-2 pt-2" role="tablist" aria-label="Scorecard domain">
        {(['code', 'bio'] as const).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={domain === d}
            onClick={() => setDomain(d)}
            className={`rounded border px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors ${
              domain === d
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-edge/40 text-slate-500 hover:border-edge hover:text-slate-300'
            }`}
          >
            [{d}]
          </button>
        ))}
      </div>
      {domain === 'bio' ? <BioScorecard /> : <CodeScorecard />}
    </div>
  );
}

// ── [bio] vertical: event-based integrity scorecard ──────────

function BioScorecard() {
  const { data, isLoading, isError } = useQuery<ScorecardBioResponse>({
    queryKey: qk.scorecardBio(),
    queryFn: () => api.getScorecardBio(),
    refetchInterval: REFETCH.medium,
  });

  if (isLoading) return <PageLoader label="Recomputing the record…" />;
  if (isError || !data)
    return (
      <PageError message="Failed to load the bio scorecard. The API may be down — try again in a moment." />
    );

  return (
    <div className="space-y-8">
      <header>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-signal">
          lenitnes[bio] · scientific software integrity
        </p>
        <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
          Did the alert precede the record?
        </h1>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Activity className="h-3 w-3" />}
          label="Alerts committed"
          value={data.totalAlerts.toString()}
        />
        <StatCard
          icon={<Target className="h-3 w-3" />}
          label="Confirmed events"
          value={data.confirmedEvents.toString()}
        />
        <StatCard
          icon={<Zap className="h-3 w-3" />}
          label="Precision"
          value={data.precision != null ? formatRatio(data.precision) : '—'}
          caveat="confirmed / alerts"
        />
        <StatCard
          icon={<Radar className="h-3 w-3" />}
          label="Avg lead time"
          value={data.avgLeadDays != null ? `${Math.round(data.avgLeadDays)}d` : '—'}
          caveat={data.maxLeadDays != null ? `best ${data.maxLeadDays}d` : 'alert → event'}
        />
      </section>

      {data.alerts.length > 0 ? (
        <section className="card">
          <h2 className="section-title mb-2 flex items-center gap-2">
            <Radar className="h-3.5 w-3.5 text-accent" />
            Alerts
          </h2>
          <ul>
            {data.alerts.map((a, i) => (
              <li key={a.signalId} className="border-t border-edge/20 first:border-t-0">
                <Link
                  href={`/signals/${a.signalId}`}
                  className="group grid animate-signal-enter grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-2 py-3 transition-colors hover:bg-accent/[0.04] sm:grid-cols-[150px_1fr_auto_auto]"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="order-2 min-w-0 font-mono text-[10px] text-slate-600 sm:order-1">
                    <div>{formatDate(a.detectedAt)}</div>
                    <div className="truncate">
                      {a.primaryDetector
                        ? formatDetectorType(a.primaryDetector)
                        : shortUrl(a.monitorUrl)}
                    </div>
                  </div>
                  <p className="order-1 min-w-0 truncate text-sm text-slate-200 transition-colors group-hover:text-accent sm:order-2">
                    {a.thesis ?? 'No thesis recorded'}
                  </p>
                  <div className="order-3 flex items-center gap-2">
                    {a.eventKind ? (
                      <span className="badge bg-signal/15 text-[9px] uppercase text-signal">
                        {a.eventKind}
                        {a.leadDays != null ? ` +${a.leadDays}d` : ''}
                      </span>
                    ) : (
                      <span className="badge bg-slate-500/15 text-[9px] uppercase text-slate-400">
                        pending
                      </span>
                    )}
                    {a.conviction != null && (
                      <span className="font-mono text-base font-bold text-accent">
                        {a.conviction}
                      </span>
                    )}
                  </div>
                  <div className="order-4 font-mono text-[10px] text-slate-600">
                    {shortUrl(a.monitorUrl)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="card border-edge/30 py-10 text-center">
          <h2 className="mt-2 font-display text-xl font-semibold text-slate-200">
            No bio alerts committed yet.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            The founding replay is live — see the 3dClustSim case study.
          </p>
          <div className="mt-5">
            <Link
              href="/case-study/clustsim"
              className="btn px-4 py-2 text-xs uppercase tracking-wider"
            >
              See the founding example
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function CodeScorecard() {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery<ScorecardResponse>({
    queryKey: qk.scorecard(),
    queryFn: () => api.getScorecard(),
    refetchInterval: REFETCH.medium,
  });

  // Venue data drives the paper/live chip: the moment the first
  // Propr fill lands, the badge flips from "paper" to "live venue"
  // automatically — no hardcoded banner to go stale.
  const { data: portfolio } = useQuery<PortfolioResponse>({
    queryKey: qk.portfolio(),
    queryFn: () => api.listPortfolio(),
    refetchInterval: REFETCH.medium,
  });

  const hasLiveFill = useMemo(
    () =>
      [...(portfolio?.open ?? []), ...(portfolio?.closed ?? [])].some(
        // The venue column is canonical; the 0xpropr tx prefix check
        // covers legacy rows (ClosedPosition doesn't carry entryTxHash).
        (p) =>
          p.venue === 'propr' ||
          ('entryTxHash' in p && (p.entryTxHash ?? '')?.startsWith('0xpropr')),
      ),
    [portfolio],
  );

  // Cumulative realized P&L curve for the hero sparkline.
  const pnlCurve = useMemo(() => {
    const closed = [...(portfolio?.closed ?? [])].sort(
      (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime(),
    );
    let acc = 0;
    return closed.map((p) => (acc += p.pnlUsd));
  }, [portfolio]);

  // Per-venue realized P&L — "which platform made/lost money?" at a glance.
  const venueBreakdown = useMemo(() => {
    const map = new Map<string, { pnl: number; n: number }>();
    for (const p of portfolio?.closed ?? []) {
      const key = ('venue' in p ? (p.venue as string) : null) ?? 'paper';
      const cur = map.get(key) ?? { pnl: 0, n: 0 };
      cur.pnl += p.pnlUsd;
      cur.n += 1;
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].pnl - a[1].pnl);
  }, [portfolio]);

  // ── Progressive disclosure state ──
  const [showAllDetectors, setShowAllDetectors] = useState(false);
  const [showAllWatchlist, setShowAllWatchlist] = useState(false);
  const [showAllCalls, setShowAllCalls] = useState(false);
  const [callWindow, setCallWindow] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

  const DETECTOR_VISIBLE = 8;
  const WATCHLIST_VISIBLE = 8;
  const CALLS_VISIBLE = 5;

  // Recent calls filtered by the selected time window.
  const filteredCalls = useMemo(() => {
    if (callWindow === 'all') return data?.recentCalls ?? [];
    const ms =
      callWindow === '24h' ? 86_400_000 : callWindow === '7d' ? 604_800_000 : 2_592_000_000;
    const cutoff = Date.now() - ms;
    return (data?.recentCalls ?? []).filter((c) => new Date(c.detectedAt).getTime() >= cutoff);
  }, [data, callWindow]);

  if (isLoading) return <PageLoader label="Recomputing the track record…" />;
  if (isError || !data)
    return (
      <PageError message="Failed to load scorecard. The API may be down — try again in a moment." />
    );

  const isEmpty = data.totalSignals === 0;
  const latestCall = data.recentCalls[0];

  return (
    <div className="space-y-8">
      {/* ── Header — one line, then let the numbers talk ── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-accent">
            lenitnes[code] · public track record · updated live
          </p>
          <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
            Was the agent right?
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] ${
              hasLiveFill
                ? 'border-signal/40 bg-signal/[0.08] text-signal'
                : 'border-accent/30 bg-accent/[0.06] text-accent'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {hasLiveFill ? 'Live venue · Propr perps' : 'Paper · track record phase'}
          </span>
          <Link
            href="/methodology"
            className="font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:text-accent"
          >
            how it works →
          </Link>
        </div>
      </header>

      {isEmpty ? (
        /* ── Empty state — the agent is mid-hunt, not broken ── */
        <div className="card border-edge/30 py-10 text-center">
          <span className="relative mx-auto flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold text-slate-200">
            The agent is reading commits right now.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            No signal has cleared the conviction-70 gate yet. The first one lands here with a trade
            receipt and T+1h / T+1d / T+7d outcomes — scored, not curated.
          </p>
          <div className="mt-5 flex items-center justify-center gap-4">
            <Link
              href="/case-study/halo2"
              className="btn px-4 py-2 text-xs uppercase tracking-wider"
            >
              See a full example
            </Link>
            <Link
              href="/methodology"
              className="font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:text-accent"
            >
              the pipeline →
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── Season 1 framing — the record is real, the losses are the lesson ── */}
          <section className="card reveal in-view border-warn/25 bg-panel/60">
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-danger/25 bg-danger/[0.04] p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-danger">
                  Why it failed
                </p>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-400">
                  <li>
                    · PnL units bug: perp notionals fed a quantity formula — reported −$283k was
                    really ≈ −$607. Found via this scorecard, restated publicly (migration 010)
                  </li>
                  <li>
                    · Even corrected: ZEC shorts ran into a +9% rally; 80–89 conviction hit only
                    25.6%
                  </li>
                  <li>· T+1d price is a noisy oracle for commit-driven theses</li>
                </ul>
              </div>
              <div className="rounded-lg border border-signal/25 bg-signal/[0.04] p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-signal">
                  What Season 2 changes
                </p>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-400">
                  <li>· Venue-aware PnL: notional books compute percent × notional</li>
                  <li>· Rubric v6: detector track records feed every score</li>
                  <li>· Notional capped $20–$500/trade; live venue gated behind calibration</li>
                  <li>· New oracle: [bio] scores against dated events, not price noise</li>
                </ul>
              </div>
            </div>
          </section>

          {/* ── Hero: the answer, big ── */}
          <section className="card reveal in-view border-accent/20 bg-panel/80">
            <div className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Hit ratio · T+1d
                  </p>
                  <p
                    className={`mt-1 font-display text-6xl font-semibold leading-none tracking-tight ${
                      data.outcomesSummary.closed === 0
                        ? 'text-slate-500'
                        : data.hitRatio >= 0.5
                          ? 'text-signal'
                          : 'text-danger'
                    }`}
                  >
                    {data.outcomesSummary.closed > 0 ? formatRatio(data.hitRatio) : '—'}
                  </p>
                  <p className="mt-2 font-mono text-[10px] text-slate-500">
                    {data.outcomesSummary.closed} judged · {data.outcomesSummary.pending} pending
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Cumulative P&L
                  </p>
                  <p
                    className={`mt-1 font-display text-4xl font-semibold leading-none tracking-tight ${
                      data.cumulativePnlUsd >= 0 ? 'text-signal' : 'text-danger'
                    }`}
                  >
                    {data.outcomesSummary.closed > 0
                      ? formatUsd(data.cumulativePnlUsd, { showPositiveSign: true })
                      : '—'}
                  </p>
                  {pnlCurve.length > 1 && (
                    <PnlSparkline points={pnlCurve} className="mt-3" width={140} height={36} />
                  )}
                  {/* Per-venue realized breakdown */}
                  {venueBreakdown.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
                        by venue:
                      </span>
                      {venueBreakdown.map(([venue, v]) => (
                        <span
                          key={venue}
                          className="inline-flex items-center gap-1 rounded border border-edge/40 px-1.5 py-0.5 font-mono text-[9px]"
                        >
                          <span className="uppercase text-slate-500">{venue}</span>
                          <span className={v.pnl >= 0 ? 'text-signal' : 'text-danger'}>
                            {formatUsd(v.pnl, { showPositiveSign: true })}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Latest call — the suspense beat ── */}
              {latestCall && (
                <Link
                  href={`/signals/${latestCall.signalId}`}
                  className="group block rounded-2xl border border-edge/40 bg-ink-light/40 p-4 transition-colors hover:border-accent/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-accent">
                      latest call · {formatDate(latestCall.detectedAt)}
                    </p>
                    {latestCall.outcomes.t1d == null && (
                      <JudgmentCountdown detectedAt={latestCall.detectedAt} />
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-200 transition-colors group-hover:text-accent">
                    {latestCall.thesis ?? 'No thesis recorded'}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {latestCall.recommendedAction && (
                        <span
                          className={`badge text-[10px] uppercase ${
                            latestCall.recommendedAction === 'long'
                              ? 'bg-signal/15 text-signal'
                              : latestCall.recommendedAction === 'short'
                                ? 'bg-danger/15 text-danger'
                                : 'bg-slate-500/15 text-slate-400'
                          }`}
                        >
                          {latestCall.recommendedAction}
                        </span>
                      )}
                      {latestCall.conviction != null && (
                        <span className="font-mono text-xs font-bold text-accent">
                          {latestCall.conviction}
                          <span className="text-slate-500">/100</span>
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <OutcomePill label="1h" value={latestCall.outcomes.t1h} />
                      <OutcomePill label="1d" value={latestCall.outcomes.t1d} />
                      <OutcomePill label="7d" value={latestCall.outcomes.t7d} />
                    </div>
                  </div>
                </Link>
              )}
            </div>
          </section>

          {/* ── Top stats grid ── */}
          <section className="reveal in-view grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              icon={<Activity className="h-3 w-3" />}
              label="Total signals"
              value={data.totalSignals.toString()}
            />
            <StatCard
              icon={<Zap className="h-3 w-3" />}
              label="Trades executed"
              value={data.totalTrades.toString()}
            />
            <StatCard
              icon={
                data.cumulativePnlUsd >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )
              }
              label="Sharpe / max DD"
              value={`${formatSharpe(data.sharpe)} / ${formatUsd(data.maxDrawdownUsd)}`}
            />
            <StatCard
              icon={<Layers className="h-3 w-3" />}
              label="Conviction bands"
              value={`${data.byConvictionBand.filter((b) => b.traded > 0).length} traded`}
              caveat="does higher conviction win? →"
            />
            <StatCard
              icon={<Shield className="h-3 w-3" />}
              label="HCS-proofed"
              value={data.proofCoverage ? `${data.proofCoverage.pct}%` : '—'}
              tone={data.proofCoverage && data.proofCoverage.pct >= 50 ? 'positive' : 'neutral'}
            />
          </section>

          {/* ── Calibration: does higher conviction = better outcomes? ── */}
          {data.byConvictionBand && data.byConvictionBand.some((b) => b.total > 0) && (
            <section className="card reveal in-view reveal-delay-1">
              <h2 className="section-title mb-4 flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-accent" />
                Calibration · is conviction predictive?
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs">
                  <thead>
                    <tr className="border-b border-edge/30 text-left text-slate-500">
                      <th className="py-2 pr-4 font-normal">
                        <span className="t-tt-wrap">
                          Conviction band
                          <span className="t-tt">
                            Agent fires on signals at conviction 70+; lower bands are scored but
                            archived without a trade.
                          </span>
                        </span>
                      </th>
                      <th className="px-3 py-2 text-right font-normal">Scored</th>
                      <th className="px-3 py-2 text-right font-normal">Traded</th>
                      <th className="px-3 py-2 text-right font-normal">
                        <span className="t-tt-wrap">
                          Hit ratio
                          <span className="t-tt">
                            Binary: did price move in the predicted direction by T+1d?
                          </span>
                        </span>
                      </th>
                      <th className="px-3 py-2 text-right font-normal">Avg T+1h</th>
                      <th className="px-3 py-2 text-right font-normal">
                        <span className="t-tt-wrap">
                          Avg T+1d
                          <span className="t-tt">
                            Sign-adjusted for direction. Positive = the trade was right. A
                            well-calibrated rubric trends up as the band rises.
                          </span>
                        </span>
                      </th>
                      <th className="py-2 pl-3 text-right font-normal">Avg T+7d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byConvictionBand.map((band) => {
                      const isFireBand = band.bandMin >= 70;
                      return (
                        <tr
                          key={band.label}
                          className={`border-b border-edge/20 last:border-0 ${
                            isFireBand ? 'bg-accent/[0.03]' : ''
                          }`}
                        >
                          <td className="py-2 pr-4 text-slate-300">
                            {band.label}
                            {isFireBand && (
                              <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[9px] text-accent">
                                FIRES
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-400">
                            {band.total > 0 ? band.total : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-400">
                            {band.traded > 0 ? band.traded : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-200">
                            {band.closed > 0 ? formatRatio(band.hitRatio) : '—'}
                          </td>
                          <td className={`px-3 py-2 text-right ${pctTone(band.avgT1hPct)}`}>
                            {fmtPct(band.avgT1hPct)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-semibold ${pctTone(band.avgT1dPct)}`}
                          >
                            {fmtPct(band.avgT1dPct)}
                          </td>
                          <td className={`py-2 pl-3 text-right ${pctTone(band.avgT7dPct)}`}>
                            {fmtPct(band.avgT7dPct)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── By detector + by watchlist, side by side ── */}
          {(data.bySignalType.length > 0 || data.byWatchlist.length > 0) && (
            <section className="grid gap-3 lg:grid-cols-2">
              {data.bySignalType.length > 0 && (
                <div className="card reveal in-view min-w-0 reveal-delay-2">
                  <h2 className="section-title mb-4 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    By detector
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full font-mono text-xs">
                      <thead>
                        <tr className="border-b border-edge/30 text-left text-slate-500">
                          <th className="py-2 pr-3 font-normal">Detector</th>
                          <th className="px-2 py-2 text-right font-normal">n</th>
                          <th className="px-2 py-2 text-right font-normal">
                            <span className="t-tt-wrap">
                              Hits
                              <span className="t-tt">
                                Direction-correct by T+1d, over judged signals.
                              </span>
                            </span>
                          </th>
                          <th className="px-2 py-2 text-right font-normal">T+1h</th>
                          <th className="py-2 pl-2 text-right font-normal">T+1d</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllDetectors
                          ? data.bySignalType
                          : data.bySignalType.slice(0, DETECTOR_VISIBLE)
                        ).map((row) => (
                          <tr
                            key={row.detectorType}
                            className="border-b border-edge/20 last:border-0"
                          >
                            <td className="py-2 pr-3 text-slate-300">
                              {formatDetectorType(row.detectorType)}
                            </td>
                            <td className="px-2 py-2 text-right text-slate-400">{row.total}</td>
                            <td className="px-2 py-2 text-right font-semibold text-slate-200">
                              {row.withT1d > 0 ? `${row.hits}/${row.withT1d}` : '—'}
                            </td>
                            <td className={`px-2 py-2 text-right ${pctTone(row.avgT1hPct)}`}>
                              {fmtPct(row.avgT1hPct)}
                            </td>
                            <td
                              className={`py-2 pl-2 text-right font-semibold ${pctTone(row.avgT1dPct)}`}
                            >
                              {fmtPct(row.avgT1dPct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.bySignalType.length > DETECTOR_VISIBLE && (
                    <button
                      onClick={() => setShowAllDetectors((v) => !v)}
                      className="mt-2 w-full rounded-lg border border-edge/40 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      {showAllDetectors
                        ? `collapse to ${DETECTOR_VISIBLE}`
                        : `show all ${data.bySignalType.length} detectors`}
                    </button>
                  )}
                </div>
              )}

              {data.byWatchlist.length > 0 && (
                <div className="card reveal in-view min-w-0 reveal-delay-3">
                  <h2 className="section-title mb-4 flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-accent" />
                    By watchlist entry
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full font-mono text-xs">
                      <thead>
                        <tr className="border-b border-edge/30 text-left text-slate-500">
                          <th className="py-2 pr-3 font-normal">Repo</th>
                          <th className="px-2 py-2 text-right font-normal">n</th>
                          <th className="px-2 py-2 text-right font-normal">Hits</th>
                          <th className="py-2 pl-2 text-right font-normal">Hit ratio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllWatchlist
                          ? data.byWatchlist
                          : data.byWatchlist.slice(0, WATCHLIST_VISIBLE)
                        ).map((row) => (
                          <tr key={row.monitorId} className="border-b border-edge/20 last:border-0">
                            <td className="py-2 pr-3 text-slate-300">{shortUrl(row.url)}</td>
                            <td className="px-2 py-2 text-right text-slate-400">{row.total}</td>
                            <td className="px-2 py-2 text-right text-slate-400">
                              {row.withT1d > 0 ? row.hits : '—'}
                            </td>
                            <td className="py-2 pl-2 text-right font-semibold text-slate-200">
                              {row.withT1d > 0 ? formatRatio(row.hitRatio) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.byWatchlist.length > WATCHLIST_VISIBLE && (
                    <button
                      onClick={() => setShowAllWatchlist((v) => !v)}
                      className="mt-2 w-full rounded-lg border border-edge/40 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      {showAllWatchlist
                        ? `collapse to ${WATCHLIST_VISIBLE}`
                        : `show all ${data.byWatchlist.length} repos`}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── Recent calls — tight rows, whole row clickable, filtered by window ── */}
          {(() => {
            const inWindow = filteredCalls;
            const visible = showAllCalls ? inWindow : inWindow.slice(0, CALLS_VISIBLE);
            return (
              <section className="card reveal in-view reveal-delay-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title flex items-center gap-2">
                    <Radar className="h-3.5 w-3.5 text-accent" />
                    Recent calls
                    <span className="font-mono text-[10px] font-normal normal-case tracking-normal text-slate-600">
                      {inWindow.length} in window
                    </span>
                  </h2>
                  <div className="flex gap-1" role="tablist" aria-label="Time window">
                    {(['24h', '7d', '30d', 'all'] as const).map((w) => (
                      <button
                        key={w}
                        role="tab"
                        aria-selected={callWindow === w}
                        onClick={() => {
                          setCallWindow(w);
                          setShowAllCalls(false);
                        }}
                        className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                          callWindow === w
                            ? 'border-accent/50 bg-accent/10 text-accent'
                            : 'border-edge/40 text-slate-500 hover:border-edge hover:text-slate-300'
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
                {inWindow.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    No calls in this window.
                  </p>
                ) : (
                  <>
                    <ul>
                      {visible.map((call, i) => (
                        <li
                          key={call.signalId}
                          className="border-t border-edge/20 first:border-t-0"
                        >
                          <Link
                            href={`/signals/${call.signalId}`}
                            className="group grid animate-signal-enter grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-2 py-3 transition-colors hover:bg-accent/[0.04] sm:grid-cols-[150px_1fr_auto_auto]"
                            style={{ animationDelay: `${i * 50}ms` }}
                          >
                            <div className="order-2 min-w-0 font-mono text-[10px] text-slate-600 sm:order-1">
                              <div>{formatDate(call.detectedAt)}</div>
                              <div className="truncate">
                                {call.detectorTypes
                                  .slice(0, 2)
                                  .map(formatDetectorType)
                                  .join(' · ') || shortUrl(call.monitorUrl)}
                              </div>
                            </div>
                            <p className="order-1 min-w-0 truncate text-sm text-slate-200 transition-colors group-hover:text-accent sm:order-2">
                              {call.thesis ?? 'No thesis recorded'}
                            </p>
                            <div className="order-3 flex items-center gap-2">
                              {call.recommendedAction && (
                                <span
                                  className={`badge text-[9px] uppercase ${
                                    call.recommendedAction === 'long'
                                      ? 'bg-signal/15 text-signal'
                                      : call.recommendedAction === 'short'
                                        ? 'bg-danger/15 text-danger'
                                        : 'bg-slate-500/15 text-slate-400'
                                  }`}
                                >
                                  {call.recommendedAction}
                                </span>
                              )}
                              {call.conviction != null && (
                                <span className="font-mono text-base font-bold text-accent">
                                  {call.conviction}
                                </span>
                              )}
                            </div>
                            <div className="order-4 flex gap-1.5">
                              <OutcomePill label="1h" value={call.outcomes.t1h} />
                              <OutcomePill label="1d" value={call.outcomes.t1d} />
                              <OutcomePill label="7d" value={call.outcomes.t7d} />
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {inWindow.length > CALLS_VISIBLE && (
                      <button
                        onClick={() => setShowAllCalls((v) => !v)}
                        className="mt-2 w-full rounded-lg border border-edge/40 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:border-accent/40 hover:text-accent"
                      >
                        {showAllCalls
                          ? `collapse to ${CALLS_VISIBLE}`
                          : `show all ${inWindow.length} calls`}
                      </button>
                    )}
                  </>
                )}
              </section>
            );
          })()}
        </>
      )}

      <p className="text-center font-mono text-[10px] text-slate-600">
        recomputed {new Date(dataUpdatedAt).toLocaleTimeString()} — the system cannot misremember
        its own performance
      </p>
    </div>
  );
}
