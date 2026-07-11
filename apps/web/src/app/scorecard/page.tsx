'use client';

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
  ArrowUpRight,
  Shield,
} from 'lucide-react';
import { api, type ScorecardResponse, type RepoTiersResponse } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import {
  formatRatio,
  formatUsd,
  formatSharpe,
  formatDate,
  shortUrl,
  formatDetectorType,
  tierBadgeClass,
} from '@/lib/format';
import { StatCard } from '@/components/ui/stat-card';
import { OutcomePill } from '@/components/ui/outcome-pill';
import { PageLoader, PageError } from '@/components/ui/page-states';

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
  const { data, isLoading, isError, dataUpdatedAt } = useQuery<ScorecardResponse>({
    queryKey: qk.scorecard(),
    queryFn: () => api.getScorecard(),
    refetchInterval: REFETCH.medium,
  });

  const { data: repoTiers } = useQuery<RepoTiersResponse>({
    queryKey: qk.repoTiers(),
    queryFn: () => api.getRepoTiers(),
    staleTime: REFETCH.backtest,
    refetchInterval: REFETCH.backtest,
  });

  if (isLoading) return <PageLoader label="Loading scorecard…" />;
  if (isError || !data)
    return (
      <PageError message="Failed to load scorecard. The API may be down — try again in a moment." />
    );

  const isEmpty = data.totalSignals === 0;

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <header>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-accent">
          public track record
        </p>
        <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
          LENITNES agent scorecard
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Every signal the agent has committed to a trade on, with the price outcome recorded at
          T+1d. Conviction is the agent&apos;s 0–100 score against a versioned rubric; hit means the
          price moved in the predicted direction.
        </p>
        <p className="mt-1 font-mono text-[10px] text-slate-600">
          generated {formatDate(data.generatedAt)} · refreshed every 60s
        </p>
      </header>

      {/* ── Learning-phase badge ── */}
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.06] px-3 py-1.5 font-mono text-[11px] text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          Paper trading — building track record before going live
        </span>
        <Link
          href="/methodology"
          className="font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:text-accent"
        >
          how it works →
        </Link>
      </div>

      {repoTiers?.tiers && repoTiers.tiers.length > 0 && (
        <section className="card border-edge/30 reveal in-view">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="section-title mb-1 flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-accent" />
                Repo tradability (90d replay)
              </h2>
              <p className="max-w-prose text-xs leading-relaxed text-slate-500">
                Which watchlist repos&apos; commit signals historically co-moved with price — mock
                agent, background sweep. A-tier = expand spend; C-tier = deprioritize.
              </p>
            </div>
            <Link
              href="/calibration"
              className="font-mono text-[10px] uppercase tracking-wider text-accent hover:underline"
            >
              full table →
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {repoTiers.tiers.map((t) => (
              <span
                key={t.repo}
                title={t.tierReason}
                className="inline-flex items-center gap-1.5 rounded-lg border border-edge/30 bg-ink-light/40 px-2.5 py-1.5 font-mono text-[11px] text-slate-400"
              >
                <span
                  className={`rounded px-1 py-0.5 text-[9px] uppercase ${tierBadgeClass(t.tier)}`}
                >
                  {t.tier}
                </span>
                {t.repo.split('/')[1] ?? t.repo}
              </span>
            ))}
          </div>
        </section>
      )}

      {isEmpty ? (
        <div className="card border-edge/30">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-edge/30 p-3">
              <Activity className="h-5 w-5 text-slate-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-200">
                Agent is live — no trades committed yet
              </h2>
              <p className="mt-1 max-w-prose text-sm leading-relaxed text-slate-500">
                The agent is scoring commits but no signal has cleared the conviction 70 threshold
                yet. The first above-threshold signal will populate this scorecard with a trade
                receipt and T+1h / T+1d / T+7d price outcomes.
              </p>
              <p className="mt-3 text-sm text-slate-500">
                See the{' '}
                <Link href="/case-study/halo2" className="link-underline text-accent">
                  halo2 case study
                </Link>{' '}
                for a full example of a scored signal.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Top stats grid ── */}
          <section className="reveal in-view grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
              icon={<Target className="h-3 w-3" />}
              label="Hit ratio (T+1d)"
              value={data.outcomesSummary.closed > 0 ? formatRatio(data.hitRatio) : '—'}
              tone={
                data.outcomesSummary.closed === 0
                  ? 'neutral'
                  : data.hitRatio >= 0.5
                    ? 'positive'
                    : 'negative'
              }
              caveat={`n=${data.outcomesSummary.closed} closed · ${data.outcomesSummary.pending} pending`}
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
              tone={
                data.outcomesSummary.closed === 0
                  ? 'neutral'
                  : data.cumulativePnlUsd >= 0
                    ? 'positive'
                    : 'negative'
              }
              caveat={
                data.outcomesSummary.closed === 0
                  ? `${data.outcomesSummary.pending} trades pending T+1d`
                  : undefined
              }
            />
            <StatCard
              icon={<Layers className="h-3 w-3" />}
              label="Sharpe / max DD"
              value={`${formatSharpe(data.sharpe)} / ${formatUsd(data.maxDrawdownUsd)}`}
            />
            <StatCard
              icon={<Shield className="h-3 w-3" />}
              label="HCS-proofed"
              value={data.proofCoverage ? `${data.proofCoverage.pct}%` : '—'}
              tone={data.proofCoverage && data.proofCoverage.pct >= 50 ? 'positive' : 'neutral'}
            />
          </section>

          {/* ── Calibration: does higher conviction = better outcomes? ──
              The reason the learning banner says "observation phase".
              If conviction is well-calibrated, the avg T+1d column
              should trend up as the band increases. If it doesn't,
              the rubric needs work. */}
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
                      <th className="py-2 px-3 text-right font-normal">Scored</th>
                      <th className="py-2 px-3 text-right font-normal">Traded</th>
                      <th className="py-2 px-3 text-right font-normal">
                        <span className="t-tt-wrap">
                          Hit ratio
                          <span className="t-tt">
                            Binary: did the price move in the predicted direction by T+1d?
                          </span>
                        </span>
                      </th>
                      <th className="py-2 px-3 text-right font-normal">Avg T+1h</th>
                      <th className="py-2 px-3 text-right font-normal">
                        <span className="t-tt-wrap">
                          Avg T+1d
                          <span className="t-tt">
                            Sign-adjusted for recommended direction. Positive = trade was right. A
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
                          <td className="py-2 px-3 text-right text-slate-400">
                            {band.total > 0 ? band.total : '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-400">
                            {band.traded > 0 ? band.traded : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-200">
                            {band.closed > 0 ? formatRatio(band.hitRatio) : '—'}
                          </td>
                          <td className={`py-2 px-3 text-right ${pctTone(band.avgT1hPct)}`}>
                            {fmtPct(band.avgT1hPct)}
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-semibold ${pctTone(band.avgT1dPct)}`}
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

          {/* ── By signal type, with directional outcomes ── */}
          {data.bySignalType.length > 0 && (
            <section className="card reveal in-view reveal-delay-2">
              <h2 className="section-title mb-4 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                By detector
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs">
                  <thead>
                    <tr className="border-b border-edge/30 text-left text-slate-500">
                      <th className="py-2 pr-4 font-normal">Detector</th>
                      <th className="py-2 px-3 text-right font-normal">Signals</th>
                      <th className="py-2 px-3 text-right font-normal">
                        <span className="t-tt-wrap">
                          Hit ratio
                          <span className="t-tt">
                            Binary: did the price move in the predicted direction by T+1d?
                          </span>
                        </span>
                      </th>
                      <th className="py-2 px-3 text-right font-normal">Avg T+1h</th>
                      <th className="py-2 pl-3 text-right font-normal">
                        <span className="t-tt-wrap">
                          Avg T+1d
                          <span className="t-tt">
                            Sign-adjusted for recommended direction. Positive = trade was right.
                          </span>
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySignalType.map((row) => (
                      <tr key={row.detectorType} className="border-b border-edge/20 last:border-0">
                        <td className="py-2 pr-4 text-slate-300">
                          {formatDetectorType(row.detectorType)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400">{row.total}</td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-200">
                          {row.withT1d > 0 ? `${row.hits}/${row.withT1d}` : '—'}
                        </td>
                        <td className={`py-2 px-3 text-right ${pctTone(row.avgT1hPct)}`}>
                          {fmtPct(row.avgT1hPct)}
                        </td>
                        <td
                          className={`py-2 pl-3 text-right font-semibold ${pctTone(row.avgT1dPct)}`}
                        >
                          {fmtPct(row.avgT1dPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── By watchlist ── */}
          {data.byWatchlist.length > 0 && (
            <section className="card reveal in-view reveal-delay-3">
              <h2 className="section-title mb-4 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-accent" />
                By watchlist entry
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs">
                  <thead>
                    <tr className="border-b border-edge/30 text-left text-slate-500">
                      <th className="py-2 pr-4 font-normal">URL</th>
                      <th className="py-2 px-4 text-right font-normal">Signals</th>
                      <th className="py-2 px-4 text-right font-normal">Hits</th>
                      <th className="py-2 pl-4 text-right font-normal">Hit ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byWatchlist.map((row) => (
                      <tr key={row.monitorId} className="border-b border-edge/20 last:border-0">
                        <td className="py-2 pr-4 text-slate-300">{shortUrl(row.url)}</td>
                        <td className="py-2 px-4 text-right text-slate-400">{row.total}</td>
                        <td className="py-2 px-4 text-right text-slate-400">
                          {row.withT1d > 0 ? row.hits : '—'}
                        </td>
                        <td className="py-2 pl-4 text-right font-semibold text-slate-200">
                          {row.withT1d > 0 ? formatRatio(row.hitRatio) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Recent calls ── */}
          {data.recentCalls.length > 0 && (
            <section className="card reveal in-view reveal-delay-4">
              <h2 className="section-title mb-4 flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-accent" />
                Recent calls
              </h2>
              <ul className="space-y-3">
                {data.recentCalls.map((call, i) => (
                  <li
                    key={call.signalId}
                    className="group animate-signal-enter rounded-xl border border-edge/30 bg-ink-light/40 p-4 transition-colors hover:border-accent/30"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          <span>{formatDate(call.detectedAt)}</span>
                          {call.detectorTypes.length > 0 && (
                            <>
                              <span>&middot;</span>
                              <span className="truncate">
                                {call.detectorTypes.map(formatDetectorType).join(', ')}
                              </span>
                            </>
                          )}
                        </div>
                        <Link
                          href={`/signals/${call.signalId}`}
                          className="text-sm text-slate-200 transition-colors group-hover:text-accent"
                        >
                          {call.thesis ?? 'No thesis recorded'}
                        </Link>
                        <div className="mt-1 font-mono text-[10px] text-slate-500">
                          {shortUrl(call.monitorUrl)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {call.conviction != null && (
                          <div className="font-mono text-2xl font-bold text-accent">
                            {call.conviction}
                            <span className="text-xs text-slate-500">/100</span>
                          </div>
                        )}
                        {call.recommendedAction && (
                          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                            {call.recommendedAction}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-edge/20 pt-3">
                      <OutcomePill label="T+1h" value={call.outcomes.t1h} />
                      <OutcomePill label="T+1d" value={call.outcomes.t1d} />
                      <OutcomePill label="T+7d" value={call.outcomes.t7d} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
                      <Link
                        href={`/signals/${call.signalId}`}
                        className="inline-flex items-center gap-1 text-accent transition-colors hover:text-accent-glow"
                      >
                        Open signal <ArrowUpRight className="h-3 w-3" />
                      </Link>
                      {call.tradeTxHash && (
                        <span className="font-mono">trade {call.tradeTxHash.slice(0, 10)}…</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="text-center font-mono text-[10px] text-slate-600">
        last fetch {new Date(dataUpdatedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}
