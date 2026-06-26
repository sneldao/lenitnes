'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { formatWindow, formatPct, scoreColor } from '@/lib/format';
import { BarChart3, TrendingUp, Target, Activity } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { SkeletonStatCard, SkeletonTable } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

// Day 13: the backtest stats endpoint is public (no auth) but the
// web page was gated behind useAuth().isAuthenticated, which is
// hardcoded false in the zero-headcount pivot. Result: anyone
// navigating to /backtest saw 'Connect your wallet to view
// backtest results.' even though GET /api/backtest/stats is open.
//
// The page is now public. Per-detector stats and the hit-rate by
// detector type are part of the credibility surface; gating them
// behind a never-resolving auth check was dead code with a
// confusing UX side effect.
export default function BacktestPage() {
  const {
    data: stats,
    isLoading,
    error,
  } = useQuery({
    queryKey: qk.backtest(),
    queryFn: () => api.getBacktestStats(),
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
        <Breadcrumbs crumbs={[{ label: 'Backtest' }]} />
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100">
            Backtest Engine
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Correlation between code-level signals and subsequent price movement.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <SkeletonTable rows={3} />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-3xl py-20">
        <Breadcrumbs crumbs={[{ label: 'Backtest' }]} />
        <div className="card mt-6 border-dashed border-edge/60 text-center">
          <BarChart3 className="mx-auto mb-3 h-8 w-8 text-slate-500" />
          <p className="text-sm text-slate-500">
            No backtest data yet. Run{' '}
            <code className="rounded bg-panel px-1.5 py-0.5 font-mono text-xs">
              npm run seed:demo
            </code>{' '}
            to populate it.
          </p>
        </div>
      </div>
    );
  }

  // ... rest unchanged
  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
      <Breadcrumbs crumbs={[{ label: 'Backtest' }]} />
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100">
          Backtest Engine
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Correlation between code-level signals and subsequent price movement.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Detectors tracked"
          value={stats.length.toString()}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Total signals"
          value={stats.reduce((s, b) => s + b.totalSignals, 0).toString()}
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Total correct"
          value={stats.reduce((s, b) => s + b.correctCount, 0).toString()}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Avg return"
          value={formatPct(
            stats.length === 0
              ? 0
              : stats.reduce((s, b) => s + parseFloat(b.avgPctChange || '0'), 0) / stats.length,
          )}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-edge/40 bg-panel/60 backdrop-blur-xl">
        <table className="w-full">
          <thead className="border-b border-edge/40 bg-ink-light/30">
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 font-medium">Detector</th>
              <th className="px-4 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 text-right font-medium">Signals</th>
              <th className="px-4 py-3 text-right font-medium">Hit rate</th>
              <th className="px-4 py-3 text-right font-medium">Avg %</th>
              <th className="px-4 py-3 text-right font-medium">Best window</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row, i) => (
              <tr
                key={`${row.detectorType}-${row.asset}-${i}`}
                className="animate-signal-enter border-b border-edge/20 last:border-b-0 hover:bg-ink-light/20"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <td className="px-4 py-3">
                  <code className="rounded bg-ink-light/50 px-1.5 py-0.5 font-mono text-xs text-slate-300">
                    {row.detectorType}
                  </code>
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">{row.asset}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-slate-300">
                  {row.totalSignals}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm">
                  <span className={scoreColor(parseFloat(row.accuracy) * 100)}>
                    {(parseFloat(row.accuracy) * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm">
                  <span
                    className={
                      parseFloat(row.avgPctChange) > 0
                        ? 'text-signal'
                        : parseFloat(row.avgPctChange) < 0
                          ? 'text-danger'
                          : 'text-slate-400'
                    }
                  >
                    {formatPct(parseFloat(row.avgPctChange))}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-slate-400">
                  {formatWindow(row.bestWindow)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
