'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, type Signal } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import {
  Eye,
  Clock,
  Shield,
  Activity,
  ChevronRight,
  Zap,
  MessageCircle,
  FileCheck,
  Database,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Summary Stats Bar                                                  */
/* ------------------------------------------------------------------ */

function SignalsSummaryBar({ signals }: { signals: Signal[] }) {
  const stats = useMemo(() => {
    const total = signals.length;
    const proofsAnchored = signals.filter((s) => s.hedera_tx_id).length;
    const proofsStored = signals.filter((s) => s.ipfs_cid).length;
    const traded = signals.filter((s) => (s.orders_count ?? 0) > 0).length;
    const arbProofs = signals.filter((s) => s.arb_tx_hash).length;
    const unviewed = signals.filter((s) => !s.viewed_at && !s.is_heartbeat).length;
    return { total, proofsAnchored, proofsStored, traded, arbProofs, unviewed };
  }, [signals]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <SummaryCard
        icon={Activity}
        label="Total Signals"
        value={stats.total}
        color="text-accent"
        bg="bg-accent/10"
      />
      <SummaryCard
        icon={Shield}
        label="Hedera Proofs"
        value={stats.proofsAnchored}
        color="text-signal"
        bg="bg-signal/10"
        sub={`${stats.total > 0 ? ((stats.proofsAnchored / stats.total) * 100).toFixed(0) : 0}%`}
      />
      <SummaryCard
        icon={Database}
        label="IPFS Stored"
        value={stats.proofsStored}
        color="text-cyan-400"
        bg="bg-cyan-400/10"
        sub={`${stats.total > 0 ? ((stats.proofsStored / stats.total) * 100).toFixed(0) : 0}%`}
      />
      <SummaryCard
        icon={FileCheck}
        label="Arbitrum Proofs"
        value={stats.arbProofs}
        color="text-violet"
        bg="bg-violet/10"
      />
      <SummaryCard
        icon={TrendingUp}
        label="Traded"
        value={stats.traded}
        color="text-warn"
        bg="bg-warn/10"
      />
      <SummaryCard
        icon={AlertTriangle}
        label="Unviewed"
        value={stats.unviewed}
        color={stats.unviewed > 0 ? 'text-danger' : 'text-slate-500'}
        bg={stats.unviewed > 0 ? 'bg-danger/10' : 'bg-slate-500/10'}
      />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  color: string;
  bg: string;
  sub?: string;
}) {
  return (
    <div className="stat-card flex items-center gap-3 px-3 py-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
        <p className="text-[10px] text-slate-500 truncate">{label}</p>
        {sub && <p className="text-[9px] text-slate-600 font-mono">{sub}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Proof Chain Progress Bar                                           */
/* ------------------------------------------------------------------ */

function ProofChainProgress({ signal }: { signal: Signal }) {
  const steps = [
    { label: 'Hedera', done: Boolean(signal.hedera_tx_id), color: 'bg-signal' },
    { label: 'IPFS', done: Boolean(signal.ipfs_cid), color: 'bg-cyan-400' },
    { label: 'Arbitrum', done: Boolean(signal.arb_tx_hash), color: 'bg-violet' },
    { label: 'Trade', done: (signal.orders_count ?? 0) > 0, color: 'bg-warn' },
  ];

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-0">
          <div
            className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
              step.done ? step.color : 'bg-edge'
            } ${step.done ? 'shadow-glow-sm' : ''}`}
            title={`${step.label}: ${step.done ? 'Done' : 'Pending'}`}
          />
          {i < steps.length - 1 && (
            <div
              className={`h-px w-2 transition-all duration-300 ${
                step.done ? 'bg-edge-light' : 'bg-edge/50'
              }`}
            />
          )}
        </div>
      ))}
      <span className="ml-1 text-[9px] font-mono text-slate-600">
        {completed}/{total}
      </span>
    </div>
  );
}

/* ── Filter types ───────────────────────────────────────────── */

type ProofFilter = 'all' | 'hedera' | 'ipfs' | 'arbitrum' | 'traded' | 'unviewed';

type TimeFilter = 'all' | 'today' | '7d' | '30d';

const PROOF_FILTERS: { key: ProofFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'hedera', label: 'Hedera' },
  { key: 'ipfs', label: 'IPFS' },
  { key: 'arbitrum', label: 'Arbitrum' },
  { key: 'traded', label: 'Traded' },
  { key: 'unviewed', label: 'Unviewed' },
];

const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

/* ── Filter function ───────────────────────────────────────── */

function applyFilters(
  signals: Signal[],
  proofFilter: ProofFilter,
  timeFilter: TimeFilter,
): Signal[] {
  return signals.filter((s) => {
    // Proof status filter
    switch (proofFilter) {
      case 'hedera':
        if (!s.hedera_tx_id) return false;
        break;
      case 'ipfs':
        if (!s.ipfs_cid) return false;
        break;
      case 'arbitrum':
        if (!s.arb_tx_hash) return false;
        break;
      case 'traded':
        if ((s.orders_count ?? 0) === 0) return false;
        break;
      case 'unviewed':
        if (s.viewed_at || s.is_heartbeat) return false;
        break;
      // 'all' — no filter
    }

    // Time range filter
    if (timeFilter !== 'all') {
      const detected = new Date(s.detected_at);
      const now = Date.now();
      const ms =
        timeFilter === 'today'
          ? 86_400_000
          : timeFilter === '7d'
            ? 7 * 86_400_000
            : 30 * 86_400_000;
      if (now - detected.getTime() > ms) return false;
    }

    return true;
  });
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function SignalsPage() {
  const { isAuthenticated } = useAuth();
  const [proofFilter, setProofFilter] = useState<ProofFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  const {
    data: signals = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['signals'],
    queryFn: () => api.listSignals(),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  });

  const filtered = useMemo(
    () => applyFilters(signals, proofFilter, timeFilter),
    [signals, proofFilter, timeFilter],
  );

  const hasActiveFilter = proofFilter !== 'all' || timeFilter !== 'all';

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Signals</h1>
          <p className="mt-1 text-sm text-slate-500">Detection timeline with proof chain records</p>
        </div>
        {signals.length > 0 && (
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-600">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />
              Auto-refreshing
            </span>
          </div>
        )}
      </div>

      {/* Summary Stats Bar */}
      {!isLoading && signals.length > 0 && <SignalsSummaryBar signals={signals} />}

      {/* Filter Bar */}
      {!isLoading && signals.length > 0 && (
        <div className="space-y-3">
          {/* Proof status filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="section-title mr-1">Proof</span>
            {PROOF_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setProofFilter(f.key)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer select-none ${
                  proofFilter === f.key
                    ? 'bg-accent/10 text-accent shadow-glow-sm'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-edge/40'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Time range filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="section-title mr-1">Time</span>
            {TIME_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setTimeFilter(f.key)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer select-none ${
                  timeFilter === f.key
                    ? 'bg-accent/10 text-accent shadow-glow-sm'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-edge/40'
                }`}
              >
                {f.label}
              </button>
            ))}
            {/* Clear filter button — shown when any filter is active */}
            {hasActiveFilter && (
              <button
                onClick={() => {
                  setProofFilter('all');
                  setTimeFilter('all');
                }}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-300 hover:bg-edge/40 transition-all cursor-pointer select-none ml-2"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filtered count indicator */}
      {!isLoading && signals.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span>
            Showing <span className="text-slate-300 font-medium">{filtered.length}</span>
            {hasActiveFilter && (
              <>
                {' '}
                of <span className="text-slate-400">{signals.length}</span>
              </>
            )}{' '}
            signal{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card animate-pulse py-4">
              <div className="flex gap-4">
                <div className="h-4 w-1/3 rounded bg-edge" />
                <div className="h-4 w-1/4 rounded bg-edge/60" />
                <div className="h-4 w-1/6 rounded bg-edge/40" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="card border-danger/30 bg-danger/5">
          <p className="text-sm text-danger">{(error as Error).message}</p>
        </div>
      )}

      {!isLoading && !error && signals.length === 0 && (
        <div className="card space-y-4 p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <Activity className="h-7 w-7 text-accent" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-white">No signals yet</p>
            <p className="text-sm text-slate-400">
              Signals appear when a monitor detects a condition match.
            </p>
          </div>
          <a
            href="https://t.me/lenitnesapp"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost inline-flex text-xs text-slate-400"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            See live public signals on Telegram
          </a>
        </div>
      )}

      {filtered.length === 0 && hasActiveFilter && (
        <div className="stat-card p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warn/10">
            <AlertTriangle className="h-6 w-6 text-warn/60" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-300">No signals match these filters</p>
          <button
            onClick={() => {
              setProofFilter('all');
              setTimeFilter('all');
            }}
            className="btn-ghost mt-3 inline-flex text-xs"
          >
            Clear filters
          </button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((s: Signal) => (
            <Link
              key={s.id}
              href={`/signals/${s.id}`}
              className="card group flex items-center justify-between py-4 transition-all hover:border-accent/30"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {/* Icon with viewed/unviewed state */}
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
                    s.is_heartbeat
                      ? 'bg-slate-500/10'
                      : s.viewed_at
                        ? 'bg-signal/10'
                        : 'bg-accent/15 ring-1 ring-accent/30'
                  }`}
                >
                  {s.is_heartbeat ? (
                    <Activity className="h-4 w-4 text-slate-500" />
                  ) : !s.viewed_at ? (
                    <Eye className="h-4 w-4 text-accent" />
                  ) : (
                    <Zap className="h-4 w-4 text-signal" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* Title and condition summary */}
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-200 group-hover:text-white">
                      {s.condition_summary ?? 'Signal detected'}
                    </p>
                    {!s.viewed_at && !s.is_heartbeat && (
                      <span className="badge shrink-0 bg-accent/15 text-accent text-[9px] px-1.5 py-0">
                        New
                      </span>
                    )}
                  </div>

                  {/* Bottom row: timestamp + proof chain progress */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock className="h-3 w-3" />
                      {new Date(s.detected_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    {/* Proof chain progress dots */}
                    <ProofChainProgress signal={s} />

                    {/* Detailed status pills — only show active ones */}
                    <div className="flex items-center gap-1.5">
                      {s.hedera_tx_id && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-signal/10 px-2 py-0.5 text-[9px] font-medium text-signal">
                          <Shield className="h-2.5 w-2.5" />
                          HCS
                        </span>
                      )}
                      {s.ipfs_cid && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[9px] font-medium text-cyan-400">
                          <Database className="h-2.5 w-2.5" />
                          IPFS
                        </span>
                      )}
                      {s.arb_tx_hash && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet/10 px-2 py-0.5 text-[9px] font-medium text-violet">
                          <FileCheck className="h-2.5 w-2.5" />
                          Arb
                        </span>
                      )}
                      {(s.orders_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-[9px] font-medium text-warn">
                          <TrendingUp className="h-2.5 w-2.5" />
                          {s.orders_count} Trade{s.orders_count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <ChevronRight className="ml-2 h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
