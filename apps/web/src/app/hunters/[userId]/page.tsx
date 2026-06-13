'use client';

import { useState, use } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Trophy,
  Shield,
  TrendingUp,
  Zap,
  Clock,
  ChevronRight,
  Loader2,
  Activity,
  Database,
  FileCheck,
  Eye,
  AlertTriangle,
} from 'lucide-react';

const PAGE_SIZE = 25;
import { api, type HunterDetailResponse, type Signal } from '@/lib/api';

/* ── Helpers ────────────────────────────────────────────── */

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── Proof chain progress dots ─────────────────────────── */

function ProofChainProgress({ signal }: { signal: Signal }) {
  const steps = [
    { label: 'Hedera', done: Boolean(signal.hedera_tx_id), color: 'bg-signal' },
    { label: 'IPFS', done: Boolean(signal.ipfs_cid), color: 'bg-cyan-400' },
    { label: 'Arbitrum', done: Boolean(signal.arb_tx_hash), color: 'bg-violet' },
    { label: 'Trade', done: (signal.orders_count ?? 0) > 0, color: 'bg-warn' },
  ];
  const completed = steps.filter((s) => s.done).length;
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-0">
          <div
            className={`h-1.5 w-1.5 rounded-full transition-all ${step.done ? step.color + ' shadow-glow-sm' : 'bg-edge'}`}
            title={`${step.label}: ${step.done ? 'Done' : 'Pending'}`}
          />
          {i < steps.length - 1 && (
            <div className={`h-px w-2 ${step.done ? 'bg-edge-light' : 'bg-edge/50'}`} />
          )}
        </div>
      ))}
      <span className="ml-1 text-[9px] font-mono text-slate-600">{completed}/4</span>
    </div>
  );
}

/* ── Stat Pill ──────────────────────────────────────────── */

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-edge/40 bg-ink-light/30 p-3 text-center">
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────── */

export default function HunterDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading, isFetching, error } = useQuery<HunterDetailResponse>({
    queryKey: ['hunter', userId, limit],
    queryFn: () => api.getHunterDetail(userId, { limit }),
    refetchInterval: 30_000,
    placeholderData: (prev: HunterDetailResponse | undefined) => prev,
  });

  const hunter = data?.hunter;
  const signals = data?.signals ?? [];
  const hasMore = signals.length >= PAGE_SIZE;

  return (
    <div className="space-y-8 animate-fade-in">
      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Leaderboard
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading hunter…
        </div>
      )}

      {error && (
        <div className="card border-danger/30 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load hunter</p>
          <p className="mt-1 text-xs text-slate-500">{(error as Error).message}</p>
        </div>
      )}

      {!isLoading && !error && !hunter && (
        <div className="card p-8 text-center">
          <p className="text-sm text-slate-400">Hunter not found.</p>
        </div>
      )}

      {hunter && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-sm font-medium text-accent">
              {formatAddress(hunter.wallet_address).slice(0, 2)}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {formatAddress(hunter.wallet_address)}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {hunter.streak > 0 ? `${hunter.streak}d streak • ` : ''}
                Last signal {timeAgo(hunter.last_signal_at)}
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatPill label="Total Signals" value={hunter.total_signals} color="text-white" />
            <StatPill
              label="Chain Completed"
              value={`${hunter.chain_completed}/${hunter.total_signals}`}
              color="text-signal"
            />
            <StatPill
              label="Accuracy"
              value={hunter.accuracy ?? '—'}
              color={hunter.accuracy ? 'text-signal' : 'text-slate-500'}
            />
            <StatPill label="Top Pair" value={hunter.top_pair ?? '—'} color="text-accent" />
          </div>

          {/* Signals list */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-edge/40 px-5 py-3">
              <Trophy className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-white">
                {signals.length} Signal{signals.length !== 1 ? 's' : ''}
              </h2>
            </div>

            {signals.length === 0 && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">No signals yet.</p>
              </div>
            )}

            {signals.length > 0 && (
              <div className="divide-y divide-edge/30">
                {signals.map((signal) => (
                  <Link
                    key={signal.id}
                    href={`/signals/${signal.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-ink-light/30 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Icon */}
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          signal.is_heartbeat
                            ? 'bg-slate-500/10'
                            : signal.viewed_at
                              ? 'bg-signal/10'
                              : 'bg-accent/15 ring-1 ring-accent/30'
                        }`}
                      >
                        {signal.is_heartbeat ? (
                          <Activity className="h-4 w-4 text-slate-500" />
                        ) : !signal.viewed_at ? (
                          <Eye className="h-4 w-4 text-accent" />
                        ) : (
                          <Zap className="h-4 w-4 text-signal" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-medium text-slate-200 group-hover:text-white">
                          {signal.condition_summary ?? 'Signal detected'}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1 text-[10px] text-slate-500">
                            <Clock className="h-3 w-3" />
                            {new Date(signal.detected_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <ProofChainProgress signal={signal as Signal} />
                          {signal.hedera_tx_id && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-signal/10 px-1.5 py-0.5 text-[9px] font-medium text-signal">
                              <Shield className="h-2 w-2" />
                              HCS
                            </span>
                          )}
                          {signal.ipfs_cid && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-medium text-cyan-400">
                              <Database className="h-2 w-2" />
                              IPFS
                            </span>
                          )}
                          {signal.arb_tx_hash && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet/10 px-1.5 py-0.5 text-[9px] font-medium text-violet">
                              <FileCheck className="h-2 w-2" />
                              Arb
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                  </Link>
                ))}
              </div>
            )}

            {/* Load More button */}
            {!isLoading && signals.length > 0 && hasMore && (
              <div className="border-t border-edge/30 px-5 py-4 text-center">
                <button
                  onClick={() => setLimit((p) => p + PAGE_SIZE)}
                  disabled={isFetching}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-edge/30 transition-all disabled:opacity-50"
                >
                  {isFetching ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-3.5 w-3.5" />
                      Load more signals
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
