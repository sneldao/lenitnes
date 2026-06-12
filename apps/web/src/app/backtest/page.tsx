'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { BarChart3, TrendingUp, Target, Activity } from 'lucide-react';

function formatWindow(seconds: number | null): string {
  if (!seconds) return '—';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function formatPct(value: string): string {
  const n = parseFloat(value);
  if (isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

export default function BacktestPage() {
  const { isAuthenticated } = useAuth();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['backtest-stats'],
    queryFn: () => api.getBacktestStats(),
    enabled: isAuthenticated,
    retry: 1,
  });

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="text-sm text-slate-500">Connect your wallet to view backtest results.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-pulse rounded-xl bg-accent/20" />
      </div>
    );
  }

  const rows = stats ?? [];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Backtest Engine</h1>
        <p className="mt-1 text-sm text-slate-500">
          Correlation between code-level signals and subsequent price movement.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-400">No backtest data yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Backtest results appear once signals with asset mappings have been processed. The engine
            runs every 6 hours.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-accent" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Detector Types
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-white">
                {new Set(rows.map((r) => r.detector_type)).size}
              </p>
            </div>
            <div className="card">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-signal" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Total Signals
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-white">
                {rows.reduce((s, r) => s + r.total_signals, 0)}
              </p>
            </div>
            <div className="card">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-warn" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Assets Tracked
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-white">
                {new Set(rows.map((r) => r.asset)).size}
              </p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <h2 className="section-title mb-4 flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-accent" />
              Detector Performance
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-edge/40 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="pb-3 pr-4 font-semibold">Detector</th>
                    <th className="pb-3 pr-4 font-semibold">Asset</th>
                    <th className="pb-3 pr-4 text-right font-semibold">Signals</th>
                    <th className="pb-3 pr-4 text-right font-semibold">Accuracy</th>
                    <th className="pb-3 pr-4 text-right font-semibold">Avg Return</th>
                    <th className="pb-3 pr-4 text-right font-semibold">Sharpe</th>
                    <th className="pb-3 text-right font-semibold">Best Window</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const accuracy = parseFloat(r.accuracy);
                    return (
                      <tr
                        key={`${r.detector_type}-${r.asset}`}
                        className="border-b border-edge/20 last:border-0"
                      >
                        <td className="py-3 pr-4 font-medium capitalize text-slate-200">
                          {r.detector_type.replace(/_/g, ' ')}
                        </td>
                        <td className="py-3 pr-4 text-slate-400">{r.asset}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-slate-300">
                          {r.total_signals}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                              accuracy >= 60
                                ? 'bg-signal/15 text-signal'
                                : accuracy >= 40
                                  ? 'bg-warn/15 text-warn'
                                  : 'bg-slate-500/15 text-slate-400'
                            }`}
                          >
                            {r.accuracy}%
                          </span>
                        </td>
                        <td
                          className={`py-3 pr-4 text-right tabular-nums ${
                            parseFloat(r.avg_pct_change) > 0
                              ? 'text-signal'
                              : parseFloat(r.avg_pct_change) < 0
                                ? 'text-danger'
                                : 'text-slate-400'
                          }`}
                        >
                          {formatPct(r.avg_pct_change)}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-slate-300">
                          {parseFloat(r.sharpe_estimate).toFixed(2)}
                        </td>
                        <td className="py-3 text-right text-slate-400">
                          {formatWindow(r.best_window)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
