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
  Loader2,
  Shield,
} from 'lucide-react';
import { api, type ScorecardResponse } from '@/lib/api';

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}k`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(4)}`;
}

function formatSharpe(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname === '/' ? '' : u.pathname).slice(0, 32);
  } catch {
    return url.slice(0, 40);
  }
}

export default function ScorecardPage() {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery<ScorecardResponse>({
    queryKey: ['scorecard', 'overall'],
    queryFn: () => api.getScorecard(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading scorecard…
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="card border-danger/30 text-danger">
          Failed to load scorecard. The API may be down — try again in a moment.
        </div>
      </main>
    );
  }

  const isEmpty = data.totalSignals === 0;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
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
          T+1d. Conviction is the agent's 0-100 score against a versioned rubric; hit means the
          price moved in the predicted direction.
        </p>
        <p className="mt-1 font-mono text-[10px] text-slate-600">
          generated {formatDate(data.generatedAt)} · refreshed every 60s
        </p>
      </header>

      {isEmpty ? (
        <div className="card border-edge/30">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-edge/30 p-3">
              <Activity className="h-5 w-5 text-slate-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-200">No signals yet</h2>
              <p className="mt-1 max-w-prose text-sm leading-relaxed text-slate-500">
                The agent is monitoring the watchlist. The first committed signal will land here,
                with the agent's conviction, the trade receipt, and the T+1h / T+1d / T+7d price
                outcomes. Sub-threshold scores (conviction &lt; {70}) are persisted in the agent
                reasoning archive and only above-threshold trades post here.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Top stats grid ── */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              icon={Activity}
              label="Total signals"
              value={data.totalSignals.toString()}
              tone="neutral"
            />
            <Stat
              icon={Zap}
              label="Trades executed"
              value={data.totalTrades.toString()}
              tone="neutral"
            />
            <Stat
              icon={Target}
              label="Hit ratio (T+1d)"
              value={formatPct(data.hitRatio)}
              tone={data.hitRatio >= 0.5 ? 'positive' : 'negative'}
            />
            <Stat
              icon={data.cumulativePnlUsd >= 0 ? TrendingUp : TrendingDown}
              label="Cumulative P&L"
              value={formatUsd(data.cumulativePnlUsd)}
              tone={data.cumulativePnlUsd >= 0 ? 'positive' : 'negative'}
            />
            <Stat
              icon={Layers}
              label="Sharpe / max DD"
              value={`${formatSharpe(data.sharpe)} / ${formatUsd(data.maxDrawdownUsd)}`}
              tone="neutral"
            />
            <Stat
              icon={Shield}
              label="HCS-proofed"
              value={data.proofCoverage ? `${data.proofCoverage.pct}%` : '—'}
              tone={data.proofCoverage && data.proofCoverage.pct >= 50 ? 'positive' : 'neutral'}
            />
          </section>

          {/* ── By signal type ── */}
          {data.bySignalType.length > 0 && (
            <section className="card">
              <h2 className="section-title mb-4 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                By signal type
              </h2>
              <div className="space-y-2">
                {data.bySignalType.map((row) => (
                  <div key={row.detectorType} className="flex items-center gap-3 font-mono text-xs">
                    <span className="w-44 truncate text-slate-300">{row.detectorType}</span>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-edge/30">
                      <div
                        className="absolute inset-y-0 left-0 bg-accent"
                        style={{ width: `${row.hitRatio * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-slate-400">
                      {row.hits} / {row.total}
                    </span>
                    <span className="w-14 text-right font-semibold text-slate-200">
                      {formatPct(row.hitRatio)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── By watchlist ── */}
          {data.byWatchlist.length > 0 && (
            <section className="card">
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
                        <td className="py-2 px-4 text-right text-slate-400">{row.hits}</td>
                        <td className="py-2 pl-4 text-right font-semibold text-slate-200">
                          {row.total > 0 ? formatPct(row.hitRatio) : '—'}
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
            <section className="card">
              <h2 className="section-title mb-4 flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-accent" />
                Recent calls
              </h2>
              <ul className="space-y-3">
                {data.recentCalls.map((call) => (
                  <li
                    key={call.signalId}
                    className="group rounded-xl border border-edge/30 bg-ink-light/40 p-4 transition-colors hover:border-accent/30"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          <span>{formatDate(call.detectedAt)}</span>
                          {call.detectorTypes.length > 0 && (
                            <>
                              <span>&middot;</span>
                              <span className="truncate">{call.detectorTypes.join(', ')}</span>
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
                    <div className="grid grid-cols-3 gap-2 border-t border-edge/20 pt-3 font-mono text-[10px]">
                      <Outcome label="T+1h" value={call.outcomes.t1h} />
                      <Outcome label="T+1d" value={call.outcomes.t1d} />
                      <Outcome label="T+7d" value={call.outcomes.t7d} />
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
    </main>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const valueColor =
    tone === 'positive' ? 'text-signal' : tone === 'negative' ? 'text-danger' : 'text-slate-100';
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`font-mono text-2xl font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}

function Outcome({ label, value }: { label: string; value: number | null }) {
  if (value == null) {
    return (
      <div className="rounded-md bg-edge/20 px-2 py-1.5 text-center">
        <div className="text-slate-600">{label}</div>
        <div className="text-slate-500">pending</div>
      </div>
    );
  }
  const positive = value > 0;
  return (
    <div
      className={`rounded-md px-2 py-1.5 text-center ${positive ? 'bg-signal/10' : 'bg-danger/10'}`}
    >
      <div className="text-slate-500">{label}</div>
      <div className={positive ? 'text-signal' : 'text-danger'}>
        {positive ? '+' : ''}
        {value.toFixed(2)}%
      </div>
    </div>
  );
}
