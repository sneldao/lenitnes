'use client';

// Long-form calibration surface — the answer to "is the agent's
// conviction actually predictive?". The scorecard has a condensed
// version of the same table; this page is the full narrative + the
// raw numbers + the open questions.

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Activity, AlertTriangle, Target, TrendingUp } from 'lucide-react';
import { api, type ScorecardResponse } from '@/lib/api';
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

export default function CalibrationPage() {
  const { data, isLoading, isError } = useQuery<ScorecardResponse>({
    queryKey: qk.scorecard(),
    queryFn: () => api.getScorecard(),
    refetchInterval: REFETCH.medium,
  });

  if (isLoading) return <PageLoader label="Loading calibration…" />;
  if (isError || !data) return <PageError message="Failed to load calibration data." />;

  // Sample-size badge — calibration with n < 30 is provisional;
  // we'd want a much bigger sample before drawing conclusions.
  const totalTradedAbove80 = data.byConvictionBand
    .filter((b) => b.bandMin >= 80)
    .reduce((acc, b) => acc + b.traded, 0);
  const sampleSizeLabel =
    totalTradedAbove80 >= 30
      ? 'mature sample'
      : totalTradedAbove80 >= 10
        ? `provisional (n=${totalTradedAbove80})`
        : `early (n=${totalTradedAbove80})`;

  return (
    <article className="mx-auto max-w-3xl space-y-10 pb-16">
      <header className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">calibration</p>
        <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
          Is the agent&apos;s conviction predictive?
        </h1>
        <p className="text-base leading-relaxed text-slate-400">
          The hardest question in agent trading is whether the model&apos;s confidence is calibrated
          — does conviction 90 actually outperform conviction 70? This page is the ongoing answer,
          recomputed from the same outcome tables as the{' '}
          <Link href="/scorecard" className="link-underline text-accent">
            scorecard
          </Link>
          .
        </p>
        <p className="font-mono text-[10px] text-slate-500">
          conviction floor: 80/100 · settling delay: 30m · {sampleSizeLabel}
        </p>
      </header>

      {/* ── How to read this ── */}
      <section className="card border-accent/20 bg-accent/[0.03]">
        <h2 className="mb-2 text-sm font-semibold text-slate-100">How to read this</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400 marker:text-slate-600">
          <li>
            Each row is a band of conviction scores. The agent fires on signals at conviction 80+;
            lower bands are scored but archived without a trade.
          </li>
          <li>
            <strong className="text-slate-200">Avg T+1d</strong> is sign-adjusted for the
            agent&apos;s recommended direction. Positive = the trade was right. Negative = the trade
            was wrong. The size of the number is the size of the move.
          </li>
          <li>
            A <strong className="text-slate-200">well-calibrated</strong> rubric shows Avg T+1d
            trending up as the band rises — higher conviction, better outcomes.
          </li>
          <li>
            A <strong className="text-slate-200">poorly calibrated</strong> rubric shows flat or
            inverted outcomes across bands. The bands aren&apos;t separating signal from noise.
          </li>
        </ul>
      </section>

      {/* ── Conviction band table ── */}
      <section className="card">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-accent" />
          Conviction bands
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-edge/30 text-left text-slate-500">
                <th className="py-2 pr-3 font-normal">Band</th>
                <th className="py-2 px-3 text-right font-normal">Scored</th>
                <th className="py-2 px-3 text-right font-normal">Traded</th>
                <th className="py-2 px-3 text-right font-normal">Hits / total</th>
                <th className="py-2 px-3 text-right font-normal">Hit ratio</th>
                <th className="py-2 px-3 text-right font-normal">Avg T+1h</th>
                <th className="py-2 px-3 text-right font-normal">Avg T+1d</th>
                <th className="py-2 pl-3 text-right font-normal">Avg T+7d</th>
              </tr>
            </thead>
            <tbody>
              {data.byConvictionBand.map((band) => {
                const isFireBand = band.bandMin >= 80;
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
                      {band.traded > 0 ? `${band.hits} / ${band.traded}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-200">
                      {band.traded > 0 ? formatRatio(band.hitRatio) : '—'}
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
        <section className="card">
          <h2 className="section-title mb-2 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-accent" />
            By detector
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Which detectors actually carry predictive weight? Hit ratio is binary (right/wrong); the
            avg pct columns show the size of the move.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-edge/30 text-left text-slate-500">
                  <th className="py-2 pr-3 font-normal">Detector</th>
                  <th className="py-2 px-3 text-right font-normal">Signals</th>
                  <th className="py-2 px-3 text-right font-normal">Hits / total</th>
                  <th className="py-2 px-3 text-right font-normal">Avg T+1h</th>
                  <th className="py-2 pl-3 text-right font-normal">Avg T+1d</th>
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
                      {row.total > 0 ? `${row.hits} / ${row.total}` : '—'}
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

      {/* ── What we're learning ── */}
      <section className="card border-edge/30">
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-slate-100">
          <TrendingUp className="h-5 w-5 text-accent" />
          What we&apos;re learning
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-slate-400">
          <p>
            The first cohort (5 trades, May-June 2026) ran at the 70+ conviction floor and closed at
            ~0% win rate with avg T+1h ≈ −0.5%. That&apos;s consistent with the agent firing on
            commits already priced in within the hour.
          </p>
          <p>
            On 2026-06-26 we raised the floor to <strong className="text-slate-200">80</strong> and
            added a <strong className="text-slate-200">30-minute settling delay</strong> so the
            agent only sees commits old enough that the immediate news pop has played out. The table
            above is the live measurement; if higher conviction doesn&apos;t visibly outperform
            lower conviction over the next ~30 closed trades, the rubric needs more than a threshold
            bump.
          </p>
        </div>
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
