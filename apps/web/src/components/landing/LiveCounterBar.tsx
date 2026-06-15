'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useReveal } from '@/lib/useReveal';
import { Shield, Activity, Zap, FileCheck, ArrowUpRight } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PublicStats {
  total_signals: number;
  active_monitors: number;
  total_orders: number;
  total_proofs: number;
  total_waitlist: number;
}

interface CounterItem {
  key: keyof PublicStats;
  label: string;
  suffix: string;
  icon: typeof Shield;
  color: string;
  glowColor: string;
  href: string;
}

const COUNTERS: CounterItem[] = [
  {
    key: 'total_signals',
    label: 'Signals',
    suffix: '',
    icon: Activity,
    color: 'text-accent',
    glowColor: 'rgba(6,182,212,0.15)',
    href: '/signals',
  },
  {
    key: 'total_proofs',
    label: 'Proofs Anchored',
    suffix: '',
    icon: FileCheck,
    color: 'text-signal',
    glowColor: 'rgba(16,185,129,0.15)',
    href: '/signals',
  },
  {
    key: 'active_monitors',
    label: 'Active Monitors',
    suffix: '',
    icon: Shield,
    color: 'text-violet',
    glowColor: 'rgba(139,92,246,0.15)',
    href: '/',
  },
  {
    key: 'total_orders',
    label: 'Trades',
    suffix: '+',
    icon: Zap,
    color: 'text-warn',
    glowColor: 'rgba(245,158,11,0.15)',
    href: '/orders',
  },
];

/* ------------------------------------------------------------------ */
/*  Animated Counter Sub-component                                     */
/* ------------------------------------------------------------------ */

function AnimatedNumber({
  value,
  suffix = '',
  duration = 2000,
}: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevValue = useRef(0);

  useEffect(() => {
    if (value === prevValue.current) {
      setDisplay(value);
      return;
    }

    const from = prevValue.current;
    const range = value - from;
    prevValue.current = value;
    startRef.current = null;

    function step(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for nice deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + range * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span className="tabular-nums">
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function LiveCounterBar() {
  const containerRef = useReveal();
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || '/api';
      const res = await fetch(`${base}/stats/public`, { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const data = (await res.json()) as PublicStats;
      setStats(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Refetch every 30 seconds to keep numbers fresh
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) return null;

  // Always render — show zeros if no data yet rather than blank gap
  const displayStats: PublicStats = stats ?? {
    total_signals: 0,
    active_monitors: 0,
    total_orders: 0,
    total_proofs: 0,
    total_waitlist: 0,
  };

  return (
    <div
      ref={containerRef}
      className="reveal w-full max-w-2xl mx-auto"
      style={{ animationDelay: '1.9s' }}
    >
      <div className="mx-4 rounded-2xl border border-edge/50 bg-panel/60 backdrop-blur-md shadow-card">
        <div className="grid grid-cols-2 divide-x divide-y divide-edge/40 sm:grid-cols-4 sm:divide-y-0">
          {COUNTERS.map((counter) => {
            const Icon = counter.icon;
            return (
              <Link
                key={counter.key}
                href={counter.href}
                className="group relative flex flex-col items-center justify-center px-3 py-3.5 transition-all hover:bg-ink-light/40"
              >
                <Icon className={`h-3.5 w-3.5 ${counter.color} mb-1`} />
                <p className={`text-lg font-bold tabular-nums ${counter.color}`}>
                  <AnimatedNumber value={displayStats[counter.key] ?? 0} suffix={counter.suffix} />
                </p>
                <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wider mt-0.5 group-hover:text-slate-300 transition-colors">
                  {counter.label}
                </p>
                {/* Arrow on hover */}
                <ArrowUpRight className="absolute right-1.5 top-1.5 h-2.5 w-2.5 text-slate-600 opacity-0 transition-all group-hover:opacity-100 group-hover:text-accent" />
              </Link>
            );
          })}
        </div>

        {/* Live indicator dot */}
        <div className="flex items-center justify-center gap-1.5 border-t border-edge/40 px-3 py-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal" />
          </span>
          <span className="text-[9px] font-medium text-slate-600">Live on Hedera + Arbitrum</span>
        </div>
      </div>
    </div>
  );
}
