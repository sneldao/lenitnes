'use client';

// Long-form calibration surface — the answer to "is the agent's
// conviction actually predictive?". The scorecard has a condensed
// version of the same table; this page is the full narrative + the
// raw numbers + the open questions.

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Activity, AlertTriangle, GitBranch, Target, TrendingUp } from 'lucide-react';
import { api, type ScorecardResponse, type ResponsivenessResponse } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { formatRatio, formatDetectorType } from '@/lib/format';
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

function tierBadge(tier?: 'A' | 'B' | 'C'): string {
  if (tier === 'A') return 'bg-signal/15 text-signal';
  if (tier === 'C') return 'bg-danger/15 text-danger';
  if (tier === 'B') return 'bg-accent/10 text-accent';
  return 'bg-slate-800 text-slate-500';
}

function fmtRatio(n: number | null): string {
  if (n == null) return '—';
  return formatRatio(n);
}

export default function CalibrationPage() {
  const { data, isLoading, isError } = useQuery<ScorecardResponse>({
    queryKey: qk.scorecard(),
    queryFn: () => api.getScorecard(),
    refetchInterval: REFETCH.medium,
  });

  const {
    data: responsiveness,
    isLoading: respLoading,
    isError: respError,
  } = useQuery<ResponsivenessResponse>({
    queryKey: qk.responsiveness(),
    queryFn: () => api.getResponsiveness(),
    staleTime: REFETCH.backtest,
    refetchInterval: REFETCH.backtest,
  });

  if (isLoading) return <PageLoader label="Loading calibration…" />;
  if (isError || !data) return <PageError message="Failed to load calibration data." />;

  // Sample-size badge — calibration with n < 30 is provisional;
  // we'd want a much bigger sample before drawing conclusions.
  const totalTradedAbove70 = data.byConvictionBand
    .filter((b) => b.bandMin >= 70)
    .reduce((acc, b) => acc + b.traded, 0);
  const sampleSizeLabel =
    totalTradedAbove70 >= 30
      ? 'mature sample'
      : totalTradedAbove70 >= 10
        ? `provisional (n=${totalTradedAbove70})`
        : `early (n=${totalTradedAbove70})`;

  return (
    <article className="mx-auto max-w-3xl space-y-10 pb-16">
      <header className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">calibration</p>
        <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
          Is the agent&apos;s conviction predictive?
        </h1>
        <p className="text-base leading-relaxed text-slate-400">
          Does conviction 90 actually outperform conviction 70? This page is the ongoing answer,
          recomputed from the same outcome tables as the{' '}
          <Link href="/scorecard" className="link-underline text-accent">
            scorecard
          </Link>
          . Calibrated conviction is also what makes the same score trustworthy when the engine runs
          leak-scans over customer repos.
        </p>
        <p className="font-mono text-[10px] text-slate-500">
          conviction floor: 70/100 · settling delay: 30m · {sampleSizeLabel}
        </p>
      </header>

      {/* ── Conviction band table ── */}
      <section className="card reveal in-view">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-accent" />
          Conviction bands
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-edge/30 text-left text-slate-500">
                <th className="py-2 pr-3 font-normal">
                  <span className="t-tt-wrap">
                    Band
                    <span className="t-tt">
                      Agent fires on signals at conviction 70+; lower bands are scored but archived
                      without a trade.
                    </span>
                  </span>
                </th>
                <th className="py-2 px-3 text-right font-normal">Scored</th>
                <th className="py-2 px-3 text-right font-normal">Traded</th>
                <th className="py-2 px-3 text-right font-normal">Hits / total</th>
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
                      Sign-adjusted for recommended direction. Positive = trade was right. Negative
                      = wrong. Well-calibrated rubric trends up as the band rises; flat or inverted
                      means poorly calibrated.
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
                    <td className="py-2 pr-3 text-slate-300">
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
                    <td className="py-2 px-3 text-right text-slate-400">
                      {band.closed > 0 ? `${band.hits} / ${band.closed}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-200">
                      {band.closed > 0 ? formatRatio(band.hitRatio) : '—'}
                    </td>
                    <td className={`py-2 px-3 text-right ${pctTone(band.avgT1hPct)}`}>
                      {fmtPct(band.avgT1hPct)}
                    </td>
                    <td className={`py-2 px-3 text-right font-semibold ${pctTone(band.avgT1dPct)}`}>
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

      {/* ── Per-detector table ── */}
      {data.bySignalType.length > 0 && (
        <section className="card reveal in-view reveal-delay-1">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-accent" />
            By detector
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-edge/30 text-left text-slate-500">
                  <th className="py-2 pr-3 font-normal">Detector</th>
                  <th className="py-2 px-3 text-right font-normal">Signals</th>
                  <th className="py-2 px-3 text-right font-normal">Hits / total</th>
                  <th className="py-2 px-3 text-right font-normal">Avg T+1h</th>
                  <th className="py-2 pl-3 text-right font-normal">
                    <span className="t-tt-wrap">
                      Avg T+1d
                      <span className="t-tt">
                        Sign-adjusted for recommended direction. Positive = trade was right. Size of
                        the number is the size of the move.
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.bySignalType.map((row) => (
                  <tr key={row.detectorType} className="border-b border-edge/20 last:border-0">
                    <td className="py-2 pr-3 text-slate-300">
                      {formatDetectorType(row.detectorType)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">{row.total}</td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-200">
                      {row.withT1d > 0 ? `${row.hits} / ${row.withT1d}` : '—'}
                    </td>
                    <td className={`py-2 px-3 text-right ${pctTone(row.avgT1hPct)}`}>
                      {fmtPct(row.avgT1hPct)}
                    </td>
                    <td className={`py-2 pl-3 text-right font-semibold ${pctTone(row.avgT1dPct)}`}>
                      {fmtPct(row.avgT1dPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Historical responsiveness (replay sweep) ── */}
      <section className="card reveal in-view reveal-delay-1">
        <h2 className="section-title mb-2 flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-accent" />
          Repo responsiveness (90-day replay)
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          Same detectors + mock agent as{' '}
          <Link href="/scan" className="link-underline text-accent">
            leak-scan
          </Link>
          , run over each commit-level watchlist repo. Measures which codebases&apos; commit signals
          historically co-moved with price — the tradability filter before expanding the watchlist.
        </p>
        {respLoading && (
          <p className="font-mono text-xs text-slate-500">
            Running replay sweep in background (typically 2–4 min on first load)…
          </p>
        )}
        {respError && (
          <p className="text-xs text-danger">Failed to load responsiveness profiles.</p>
        )}
        {responsiveness && responsiveness.profiles.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-edge/30 text-left text-slate-500">
                  <th className="py-2 pr-3 font-normal">Tier</th>
                  <th className="py-2 pr-3 font-normal">Repo</th>
                  <th className="py-2 px-3 text-right font-normal">Flagged days</th>
                  <th className="py-2 px-3 text-right font-normal">Trade-grade</th>
                  <th className="py-2 px-3 text-right font-normal">Hit T+1d</th>
                  <th className="py-2 px-3 text-right font-normal">Hit T+7d</th>
                  <th className="py-2 px-3 text-right font-normal">Avg dir T+1d</th>
                  <th className="py-2 pl-3 text-right font-normal">Avg dir T+7d</th>
                </tr>
              </thead>
              <tbody>
                {[...responsiveness.profiles]
                  .sort(
                    (a, b) =>
                      (b.avgDirectionalT7d ?? -999) - (a.avgDirectionalT7d ?? -999) ||
                      b.flaggedBatches - a.flaggedBatches,
                  )
                  .map((row) => (
                    <tr key={row.repo} className="border-b border-edge/20 last:border-0">
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${tierBadge(row.tier)}`}
                          title={row.tierReason}
                        >
                          {row.tier ?? '—'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-slate-300">
                        <span className="text-slate-500">{row.asset.toUpperCase()}</span> {row.repo}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-400">{row.flaggedBatches}</td>
                      <td className="py-2 px-3 text-right text-slate-400">{row.tradeGradeCalls}</td>
                      <td className="py-2 px-3 text-right text-slate-200">
                        {fmtRatio(row.hitRateT1d)}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-200">
                        {fmtRatio(row.hitRateT7d)}
                      </td>
                      <td className={`py-2 px-3 text-right ${pctTone(row.avgDirectionalT1d)}`}>
                        {fmtPct(row.avgDirectionalT1d)}
                      </td>
                      <td
                        className={`py-2 pl-3 text-right font-semibold ${pctTone(row.avgDirectionalT7d)}`}
                      >
                        {fmtPct(row.avgDirectionalT7d)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {responsiveness && (
          <p className="mt-3 font-mono text-[10px] text-slate-600">
            window {responsiveness.from.slice(0, 10)} → {responsiveness.to.slice(0, 10)} · mode{' '}
            {responsiveness.mode} · background sweep · cached 30m · A-tier = expand spend, C-tier =
            deprioritize
          </p>
        )}
      </section>

      {/* ── What we're learning ── */}
      <section className="card border-edge/30 reveal in-view reveal-delay-2">
        <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-slate-100">
          <TrendingUp className="h-5 w-5 text-accent" />
          What we&apos;re learning
        </h2>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex gap-2">
            <span className="font-mono text-[11px] text-slate-600">May–Jun 2026</span>
            <span>
              First cohort (5 trades) at 70+ floor: ~0% win rate, avg T+1h ≈ −0.5% — consistent with
              firing on commits already priced in.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-[11px] text-slate-600">2026-06-26</span>
            <span>
              Set the trade floor at <strong className="text-slate-200">70</strong> and added a{' '}
              <strong className="text-slate-200">30-min settling delay</strong> so the agent only
              sees commits past the immediate news pop. Rubric v4 (Jul 2026) hardened what 70+
              requires: cited commit SHA + independent corroboration.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-[11px] text-slate-600">Next ~30 trades</span>
            <span>
              If higher conviction doesn&apos;t visibly outperform lower conviction, the rubric
              needs more than a threshold bump.
            </span>
          </li>
        </ul>
        <div className="mt-4 rounded-xl border border-warn/20 bg-warn/[0.04] p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-warn">Provisional, not proof</p>
              <p className="text-xs leading-relaxed text-slate-400">
                A calibration call with n &lt; 30 closed positions per band is observational, not
                evidence. The bar to flip live trading on is meaningful sample size AND visible
                separation between bands.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-edge/30 pt-6 text-sm text-slate-500">
        <p>
          For the full rubric + detector definitions, see the{' '}
          <Link href="/methodology" className="link-underline text-accent">
            methodology page
          </Link>
          .
        </p>
      </footer>
    </article>
  );
}
