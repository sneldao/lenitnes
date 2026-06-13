'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Trophy,
  Zap,
  GitCommit,
  TrendingUp,
  ArrowLeft,
  Users,
  Activity,
  Shield,
  Search,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { api, type LeaderboardResponse } from '@/lib/api';

const PAGE_SIZE = 25;

/* ── Helpers ────────────────────────────────────────────── */

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function avatarInitials(address: string): string {
  return `${address[2] ?? 'X'}${address[3] ?? 'Y'}`.toUpperCase();
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

/* ── Stat Card ──────────────────────────────────────────── */

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
  sub,
}: {
  icon: typeof Zap;
  label: string;
  value: string | number;
  color: string;
  bg: string;
  sub?: string;
}) {
  return (
    <div className="stat-card p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`mt-1 text-xl font-semibold ${color}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-[9px] text-slate-600 leading-tight mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────── */

export default function LeaderboardPage() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pairSearch, setPairSearch] = useState('');
  const [minSignals, setMinSignals] = useState(0);
  const [sort, setSort] = useState<'signals' | 'accuracy' | 'streak' | 'recent'>('signals');

  const {
    data: leaderboard,
    isLoading,
    isFetching,
    error,
  } = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', limit, sort],
    queryFn: () => api.getLeaderboard({ limit, sort }),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  let entries = leaderboard?.entries ?? [];
  const stats = leaderboard?.stats;

  // Client-side filtering for pair search and min signals
  if (pairSearch) {
    entries = entries.filter(
      (e) => e.top_pair && e.top_pair.toLowerCase().includes(pairSearch.toLowerCase()),
    );
  }
  if (minSignals > 0) {
    entries = entries.filter((e) => e.total_signals >= minSignals);
  }

  // If we got back fewer entries than a full page, there are no more to load.
  // Uses PAGE_SIZE (not limit) so the button stays visible during pagination load.
  const hasMore = (leaderboard?.entries.length ?? 0) >= PAGE_SIZE;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Signal Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Top code-signal hunters. Public feeds only. Updated every 30s.
        </p>
      </div>

      {/* Filter bar — visibility tied to unfiltered entries so it stays visible when filters match zero */}
      {!isLoading && (leaderboard?.entries.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[160px] max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
            <input
              className="w-full rounded-lg border border-edge/40 bg-ink-light/50 py-1.5 pl-7 pr-2.5 text-[11px] outline-none transition-colors placeholder:text-slate-600 focus:border-accent/40"
              placeholder="Filter by pair…"
              value={pairSearch}
              onChange={(e) => setPairSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>Min signals:</span>
            {[0, 5, 10, 25, 50].map((n) => (
              <button
                key={n}
                onClick={() => setMinSignals(n)}
                className={`rounded-lg px-2 py-1 font-semibold transition-all cursor-pointer select-none ${
                  minSignals === n
                    ? 'bg-accent/10 text-accent shadow-glow-sm'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-edge/40'
                }`}
              >
                {n === 0 ? 'All' : `${n}+`}
              </button>
            ))}
          </div>
          {(pairSearch || minSignals > 0) && (
            <button
              onClick={() => {
                setPairSearch('');
                setMinSignals(0);
              }}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-300 hover:bg-edge/40 transition-all cursor-pointer select-none"
            >
              Clear filters
            </button>
          )}
          {/* Sort controls */}
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] text-slate-600 mr-1">Sort:</span>
            {(['signals', 'accuracy', 'streak', 'recent'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSort(s);
                  setLimit(PAGE_SIZE);
                }}
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-all cursor-pointer select-none ${
                  sort === s
                    ? 'bg-accent/10 text-accent shadow-glow-sm'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-edge/40'
                }`}
              >
                {s === 'signals'
                  ? 'Signals'
                  : s === 'accuracy'
                    ? 'Accuracy'
                    : s === 'streak'
                      ? 'Streak'
                      : 'Recent'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard
            icon={Zap}
            label="Total Signals"
            value={stats.total_signals}
            color="text-white"
            bg="bg-accent/10"
          />
          <StatCard
            icon={Users}
            label="Active Hunters"
            value={stats.active_hunters}
            color="text-white"
            bg="bg-accent/10"
          />
          <StatCard
            icon={GitCommit}
            label="Public Monitors"
            value={stats.public_monitors}
            color="text-white"
            bg="bg-accent/10"
          />
          <StatCard
            icon={Activity}
            label="Avg Response"
            value="—"
            color="text-white"
            bg="bg-accent/10"
            sub="coming soon"
          />
          <StatCard
            icon={Shield}
            label="Chain Coverage"
            value={stats.anchor_coverage}
            color="text-signal"
            bg="bg-signal/10"
            sub="of signals anchored on Hedera"
          />
        </div>
      )}

      {/* Leaderboard table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-edge/40 px-5 py-3">
          <Trophy className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">
            {isLoading ? 'Loading…' : `Top ${entries.length} Hunters`}
          </h2>
          {isFetching && !isLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-500" />}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-3 px-5 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading leaderboard…
          </div>
        )}

        {error && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-danger">Failed to load leaderboard</p>
            <p className="mt-1 text-xs text-slate-500">{(error as Error).message}</p>
          </div>
        )}

        {!isLoading && !error && entries.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-slate-400">No hunters yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Signals from public monitors will appear here once detected.
            </p>
          </div>
        )}

        {!isLoading && entries.length > 0 && (
          <div className="divide-y divide-edge/30">
            {entries.map((hunter, idx) => {
              const rank = idx + 1;
              const name = hunter.display_name ?? formatAddress(hunter.wallet_address);
              const avatar = avatarInitials(hunter.display_name ?? hunter.wallet_address);
              return (
                <Link
                  key={hunter.user_id}
                  href={`/hunters/${hunter.user_id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-ink-light/30 transition-colors group"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-light text-sm font-bold text-slate-400">
                    {rank <= 3 ? (
                      <Trophy
                        className={`h-4 w-4 ${
                          rank === 1
                            ? 'text-yellow-400'
                            : rank === 2
                              ? 'text-slate-300'
                              : 'text-amber-600'
                        }`}
                      />
                    ) : (
                      <span className="text-xs">{rank}</span>
                    )}
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">
                    {avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate group-hover:text-accent transition-colors">
                        {name}
                      </p>
                      {/* Mobile chain completion — inline with name */}
                      <span className="sm:hidden flex items-center gap-1 text-[10px]">
                        <span className="tabular-nums font-semibold text-signal">
                          {hunter.chain_completed}
                        </span>
                        <span className="text-slate-600">/{hunter.total_signals}</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {hunter.top_pair ? `${hunter.top_pair} • ` : ''}
                      {hunter.streak > 0 ? `${hunter.streak}d streak • ` : ''}
                      Last signal {timeAgo(hunter.last_signal_at)}
                    </p>
                  </div>
                  {/* Per-hunter chain completion */}
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold tabular-nums text-signal">
                          {hunter.chain_completed}
                        </span>
                        <span className="text-[10px] text-slate-600">/ {hunter.total_signals}</span>
                      </div>
                      <div className="mt-0.5 flex h-1 w-14 overflow-hidden rounded-full bg-edge/50">
                        <div
                          className="h-full rounded-full bg-signal transition-all"
                          style={{
                            width: `${hunter.total_signals > 0 ? (hunter.chain_completed / hunter.total_signals) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>{' '}
                  <div className="hidden sm:flex items-center gap-6 text-xs text-slate-400">
                    <div className="text-center">
                      <p className="font-semibold text-white">{hunter.total_signals}</p>
                      <p className="text-[10px] text-slate-500">signals</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-white tabular-nums">
                        {hunter.streak > 0 ? `${hunter.streak}d` : '—'}
                      </p>
                      <p className="text-[10px] text-slate-500">streak</p>
                    </div>
                    <div className="text-center">
                      <p
                        className={`font-semibold ${hunter.accuracy ? 'text-signal' : 'text-slate-500'}`}
                      >
                        {hunter.accuracy ?? '—'}
                      </p>
                      <p className="text-[10px] text-slate-500">accuracy</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-white">{timeAgo(hunter.last_signal_at)}</p>
                      <p className="text-[10px] text-slate-500">last signal</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              );
            })}
          </div>
        )}

        {/* Load More button */}
        {!isLoading && !error && entries.length > 0 && hasMore && (
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
                  Load more
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="text-center">
        <p className="text-sm text-slate-500">
          Want your signals here?{' '}
          <Link href="/monitors/new" className="text-accent hover:underline">
            Create a public monitor
          </Link>{' '}
          and start hunting.
        </p>
      </div>
    </div>
  );
}
