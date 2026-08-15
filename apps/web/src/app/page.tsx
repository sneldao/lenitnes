'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { api, type ScorecardResponse, type ScorecardRecentCall } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { timeAgo, convictionColor } from '@/lib/format';
import { cn } from '@/lib/utils';

import { ProofFlow } from '@/components/ProofFlow';

export default function LandingPage() {
  return (
    <div className="space-y-8 sm:space-y-12">
      <Hero />
      <TrackRecordStrip />
      <HowItWorksStrip />
      <RecentCalls />
    </div>
  );
}

// ── Hero: the live agent as the visual lede ──────────────────

function Hero() {
  const { data: recent } = useQuery<ScorecardRecentCall[]>({
    queryKey: qk.scorecardRecent(5),
    queryFn: () => api.getScorecardRecent(5),
    ...REFETCH,
    refetchInterval: REFETCH.fast,
  });

  const latest = recent?.[0];
  const scoredCount = recent?.length ?? 0;

  return (
    <header className="pt-4 text-center sm:pt-8">
      {/* Pulse — the autonomy signal */}
      <div className="mb-4 flex items-center justify-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
          {latest ? `last scored ${timeAgo(latest.detectedAt)}` : 'monitoring live'}
        </span>
      </div>

      <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-slate-100 sm:text-5xl">
        The agent that <em className="not-italic text-accent">would have shorted</em> halo2.
      </h1>

      {/* Vertical tags — the badge row */}
      <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[11px]">
        <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 uppercase tracking-widest text-accent">
          [code]
        </span>
        <span className="text-slate-600">·</span>
        <span className="rounded border border-signal/40 bg-signal/10 px-2 py-0.5 uppercase tracking-widest text-signal">
          [bio]
        </span>
      </div>

      <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
        One engine, two verticals. <span className="font-mono text-xs text-slate-300">[code]</span>{' '}
        watches consensus-critical crypto repos and scores against price.{' '}
        <span className="font-mono text-xs text-slate-300">[bio]</span> watches scientific software
        and scores against the record — retractions, corrections, disclosures. Every call committed
        on-chain before the outcome.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/scorecard"
          className="btn group inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider"
        >
          Live scorecard
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/case-study/halo2"
          className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider"
        >
          halo2 <span className="font-mono text-[10px] opacity-60">[code]</span>
        </Link>
        <Link
          href="/case-study/clustsim"
          className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider"
        >
          3dClustSim <span className="font-mono text-[10px] opacity-60">[bio]</span>
        </Link>
      </div>

      {/* Live activity preview — 3 most recent scores */}
      {scoredCount > 0 && (
        <div className="mx-auto mt-8 max-w-md space-y-1.5">
          {recent!.slice(0, 3).map((call) => (
            <Link
              key={call.signalId}
              href={`/signals/${call.signalId}`}
              className="group flex items-center gap-3 rounded-lg border border-edge/30 bg-panel/50 px-3 py-2 transition-all hover:border-accent/30 hover:bg-accent/5"
            >
              <span className={cn('font-mono text-sm font-bold', convictionColor(call.conviction))}>
                {call.conviction ?? '—'}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                {call.thesis ?? 'No thesis recorded'}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-slate-600">
                {timeAgo(call.detectedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

// ── Track record: 4 compact stats in one row ─────────────────

function TrackRecordStrip() {
  const { data } = useQuery<ScorecardResponse>({
    queryKey: qk.scorecard(),
    queryFn: () => api.getScorecard(),
    refetchInterval: REFETCH.medium,
  });

  const stats = [
    { label: 'Signals', value: data?.totalSignals?.toString() ?? '—' },
    { label: 'Trades', value: data?.totalTrades?.toString() ?? '—' },
    { label: 'Hit ratio', value: data ? `${(data.hitRatio * 100).toFixed(0)}%` : '—' },
    { label: 'Sharpe', value: data?.sharpe?.toFixed(2) ?? '—' },
  ];

  return (
    <section className="text-center">
      <div className="grid grid-cols-4 gap-2 rounded-xl border border-edge/40 bg-panel/40 p-3 sm:gap-4 sm:p-4">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="font-display text-2xl font-light text-slate-100 sm:text-3xl">
              {s.value}
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-slate-500 sm:text-[10px]">
              {s.label}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-600">
        Recomputed live — the system cannot misremember its own performance.
      </p>
    </section>
  );
}

function HowItWorksStrip() {
  return (
    <section className="text-center">
      <h2 className="mb-4 font-display text-xl font-semibold text-slate-100 sm:text-2xl">
        One loop. <span className="italic text-accent">No human input.</span>
      </h2>
      <div className="rounded-xl border border-edge/40 bg-panel/30 p-4 sm:p-6">
        <ProofFlow />
      </div>
      <p className="mt-3 text-[11px] text-slate-600">
        Every step timestamped on <span className="text-signal">Hedera HCS</span> before the market
        moves.
      </p>
    </section>
  );
}

// ── Recent calls: 5 tight rows ────────────────────────────────

function RecentCalls() {
  const { data, isLoading } = useQuery({
    queryKey: qk.scorecardRecent(5),
    queryFn: () => api.getScorecardRecent(5),
    refetchInterval: REFETCH.medium,
  });

  if (isLoading)
    return (
      <section>
        <h2 className="mb-4 text-center font-display text-xl font-semibold text-slate-100 sm:text-2xl">
          Recent calls, <span className="italic">with the receipts.</span>
        </h2>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-edge/20" />
          ))}
        </div>
      </section>
    );
  if (!data || data.length === 0) {
    return (
      <div className="text-center">
        <p className="text-sm text-slate-400">
          The agent is reading commits across the watchlist right now — the first scored signal
          lands here the moment it clears the rubric.
        </p>
        <Link
          href="/case-study/halo2"
          className="mt-2 inline-block font-mono text-xs text-accent hover:underline"
        >
          meanwhile: the halo2 replay →
        </Link>
      </div>
    );
  }

  return (
    <section>
      <h2 className="mb-4 text-center font-display text-xl font-semibold text-slate-100 sm:text-2xl">
        Recent calls, <span className="italic">with the receipts.</span>
      </h2>
      <ol className="space-y-0">
        {data.map((call, i) => {
          const isHit = call.outcomes.t1d != null && call.outcomes.t1d > 0;
          return (
            <li
              key={call.signalId}
              className="animate-signal-enter grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-edge/30 py-3 first:border-t-0 sm:gap-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="font-mono text-xs text-slate-600">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0">
                <Link
                  href={`/signals/${call.signalId}`}
                  className="block truncate text-sm text-slate-100 transition-colors hover:text-accent"
                >
                  {call.thesis ?? 'No thesis recorded'}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-slate-600">
                  <span>{new Date(call.detectedAt).toISOString().slice(0, 10)}</span>
                  {call.detectorTypes.length > 0 && (
                    <span className="truncate">{call.detectorTypes.join(', ')}</span>
                  )}
                  {call.tradeTxHash && <span className="text-accent">traded</span>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {call.conviction != null && (
                  <div
                    className={cn(
                      'font-display text-lg font-light',
                      convictionColor(call.conviction),
                    )}
                  >
                    {call.conviction}
                  </div>
                )}
                {call.outcomes.t1d != null && (
                  <div
                    className={cn('font-mono text-[10px]', isHit ? 'text-signal' : 'text-danger')}
                  >
                    T+1d {isHit ? '+' : ''}
                    {call.outcomes.t1d.toFixed(2)}%
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
