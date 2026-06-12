'use client';

import { useMemo } from 'react';
import { Sparkles, Shield, Zap, GitBranch, Target, TrendingUp, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useReveal } from '@/lib/useReveal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BacktestStat {
  detector_type: string;
  asset: string;
  total_signals: number;
  correct_count: number;
  accuracy: string;
  avg_pct_change: string;
}

interface Stat {
  icon: typeof Sparkles;
  text: string;
  highlight?: boolean;
}

const FALLBACK_STATS: Stat[] = [
  { icon: Sparkles, text: '10+ Templates' },
  { icon: Shield, text: 'Hedera Powered' },
  { icon: Zap, text: '< 60s Detection' },
  { icon: GitBranch, text: 'Open Source' },
];

/* ------------------------------------------------------------------ */
/*  Keyframes                                                          */
/* ------------------------------------------------------------------ */

const MARQUEE_KEYFRAMES = `
@keyframes social-marquee {
  0%   { transform: translateX(0) }
  100% { transform: translateX(-50%) }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes social-marquee {
    0%, 100% { transform: translateX(0) }
  }
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SocialProof() {
  const containerRef = useReveal();

  const { data: backtestStats } = useQuery<BacktestStat[]>({
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

  const stats = useMemo<Stat[]>(() => {
    if (!backtestStats || backtestStats.length === 0) {
      return FALLBACK_STATS;
    }

    const totalSignals = backtestStats.reduce((sum, s) => sum + s.total_signals, 0);
    const totalCorrect = backtestStats.reduce((sum, s) => sum + s.correct_count, 0);
    const avgAccuracy = totalSignals > 0 ? ((totalCorrect / totalSignals) * 100).toFixed(0) : null;
    const uniqueAssets = new Set(backtestStats.map((s) => s.asset)).size;
    const detectorTypes = new Set(backtestStats.map((s) => s.detector_type)).size;

    const dynamicStats: Stat[] = [];

    if (totalSignals > 0) {
      dynamicStats.push({
        icon: Activity,
        text: `${totalSignals} Signals Detected`,
        highlight: true,
      });
    }
    if (avgAccuracy && Number(avgAccuracy) > 50) {
      dynamicStats.push({ icon: Target, text: `${avgAccuracy}% Accuracy`, highlight: true });
    }
    if (uniqueAssets > 0) {
      dynamicStats.push({ icon: TrendingUp, text: `${uniqueAssets} Assets Tracked` });
    }
    if (detectorTypes > 0) {
      dynamicStats.push({ icon: Zap, text: `${detectorTypes} Detector Types` });
    }

    dynamicStats.push({ icon: Shield, text: 'Hedera Powered' });

    return dynamicStats.length > 0 ? dynamicStats : FALLBACK_STATS;
  }, [backtestStats]);

  return (
    <section ref={containerRef} className="relative px-4 py-12">
      <style dangerouslySetInnerHTML={{ __html: MARQUEE_KEYFRAMES }} />

      <div className="reveal mx-auto max-w-3xl">
        {/* Glassmorphism strip */}
        <div className="glass rounded-2xl px-2 py-4 sm:px-6">
          {/* Desktop: centered row */}
          <div className="hidden items-center justify-center gap-6 sm:flex">
            {stats.map((stat) => (
              <StatPill key={stat.text} stat={stat} />
            ))}
          </div>

          {/* Mobile: auto-scrolling marquee */}
          <div className="relative overflow-hidden sm:hidden">
            <div
              className="flex w-max gap-6"
              style={{
                animation: 'social-marquee 20s linear infinite',
              }}
            >
              {/* Duplicate for seamless loop */}
              {[...stats, ...stats].map((stat, i) => (
                <StatPill key={`${stat.text}-${i}`} stat={stat} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat pill sub-component                                            */
/* ------------------------------------------------------------------ */

function StatPill({ stat }: { stat: Stat }) {
  const Icon = stat.icon;

  return (
    <div
      className={`badge border px-3.5 py-1.5 text-xs font-medium ${
        stat.highlight
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-edge/60 bg-ink-light/60 text-slate-300'
      }`}
    >
      <Icon className={stat.highlight ? 'h-3.5 w-3.5 text-accent' : 'h-3.5 w-3.5 text-accent'} />
      <span>{stat.text}</span>
    </div>
  );
}
