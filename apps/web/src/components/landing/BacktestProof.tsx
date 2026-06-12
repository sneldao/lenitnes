'use client';

import { useQuery } from '@tanstack/react-query';
import { useReveal } from '@/lib/useReveal';
import { TrendingUp, Target, Zap, BarChart3 } from 'lucide-react';

interface BacktestStat {
  detector_type: string;
  asset: string;
  total_signals: number;
  correct_count: number;
  accuracy: string;
  avg_pct_change: string;
  best_window: number | null;
}

const DETECTOR_LABELS: Record<string, string> = {
  emergency_patch: 'Emergency Patch',
  security_critical_patch: 'Security Critical',
  dependency_rotation: 'Dependency Rotation',
  governance_shift: 'Governance Shift',
  maintainer_departure: 'Maintainer Departure',
  silent_merge: 'Silent Merge',
  protocol_upgrade: 'Protocol Upgrade',
  supply_chain_risk: 'Supply Chain Risk',
};

function windowLabel(seconds: number | null): string {
  if (!seconds) return '—';
  if (seconds < 3600) return `${seconds / 60}m`;
  if (seconds < 86400) return `${seconds / 3600}h`;
  return `${seconds / 86400}d`;
}

export default function BacktestProof() {
  const containerRef = useReveal();

  const { data: stats, isLoading } = useQuery<BacktestStat[]>({
    queryKey: ['backtestStatsPublic'],
    queryFn: async () => {
      const base = process.env.NEXT_PUBLIC_API_URL || '/api';
      const res = await fetch(`${base}/backtest/stats`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const hasData = stats && stats.length > 0;
  const totalSignals = hasData ? stats.reduce((s, r) => s + r.total_signals, 0) : 0;

  if (isLoading || !hasData || totalSignals === 0) return null;

  const topPerformers = [...stats]
    .filter((s) => s.total_signals >= 1)
    .sort((a, b) => Number(b.accuracy) - Number(a.accuracy))
    .slice(0, 4);

  return (
    <section ref={containerRef} className="relative px-4 py-16">
      <div className="reveal mx-auto max-w-3xl space-y-8">
        <div className="text-center">
          <h2 className="text-xl font-bold tracking-tight text-white">
            Proven Signal Intelligence
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Backtested against historical price data. Code signals correlated with asset movements.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={Target}
            label="Signals Analyzed"
            value={totalSignals.toLocaleString()}
            color="text-accent"
          />
          <StatCard
            icon={Zap}
            label="Detector Types"
            value={new Set(stats.map((s) => s.detector_type)).size.toString()}
            color="text-warn"
          />
          <StatCard
            icon={TrendingUp}
            label="Assets Tracked"
            value={new Set(stats.map((s) => s.asset)).size.toString()}
            color="text-signal"
          />
        </div>

        {topPerformers.length > 0 && (
          <div className="rounded-xl border border-edge/40 bg-ink-light/30 overflow-hidden">
            <div className="border-b border-edge/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-semibold text-slate-300">
                  Top Performing Detectors
                </span>
              </div>
            </div>
            <div className="divide-y divide-edge/30">
              {topPerformers.map((stat) => {
                const accuracy = Number(stat.accuracy);
                const accuracyColor =
                  accuracy >= 60 ? 'text-signal' : accuracy >= 40 ? 'text-warn' : 'text-slate-400';
                return (
                  <div
                    key={`${stat.detector_type}-${stat.asset}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-200">
                        {DETECTOR_LABELS[stat.detector_type] ?? stat.detector_type}
                      </p>
                      <p className="text-[10px] text-slate-500 uppercase">{stat.asset}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={`text-sm font-bold tabular-nums ${accuracyColor}`}>
                          {accuracy.toFixed(0)}%
                        </p>
                        <p className="text-[9px] text-slate-500">accuracy</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-slate-300 tabular-nums">
                          {stat.total_signals}
                        </p>
                        <p className="text-[9px] text-slate-500">signals</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 tabular-nums">
                          {windowLabel(stat.best_window)}
                        </p>
                        <p className="text-[9px] text-slate-500">best window</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-slate-600">
          Accuracy measured against historical price movements at optimal time windows. Past
          performance does not guarantee future results.
        </p>
      </div>
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-edge/40 bg-ink-light/30 p-4 text-center">
      <Icon className={`mx-auto h-4 w-4 ${color}`} />
      <p className={`mt-2 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{label}</p>
    </div>
  );
}
