'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Trophy, Loader2, ArrowRight } from 'lucide-react';
import { api, type LeaderboardResponse } from '@/lib/api';

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

export default function LandingLeaderboard() {
  const { data, isLoading, error } = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', 3],
    queryFn: () => api.getLeaderboard({ limit: 3 }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const topHunters = data?.entries ?? [];

  if (isLoading) {
    return (
      <section className="relative px-4 py-12">
        <div className="mx-auto max-w-3xl text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading leaderboard…
          </div>
        </div>
      </section>
    );
  }

  if (error || topHunters.length === 0) return null;

  return (
    <section className="relative px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold tracking-tight text-white">Top Signal Hunters</h2>
          <p className="mt-1 text-sm text-slate-400">
            Most signals detected this week from public monitors
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {topHunters.map((hunter, idx) => {
            const rank = idx + 1;
            return (
              <Link
                key={hunter.user_id}
                href={`/hunters/${hunter.user_id}`}
                className="group rounded-xl border border-edge/40 bg-ink-light/30 p-4 text-center transition-all hover:border-accent/30 hover:bg-ink-light/50"
              >
                {/* Rank badge */}
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 mb-3">
                  {rank === 1 ? (
                    <Trophy className="h-5 w-5 text-yellow-400" />
                  ) : rank === 2 ? (
                    <Trophy className="h-5 w-5 text-slate-300" />
                  ) : (
                    <Trophy className="h-5 w-5 text-amber-600" />
                  )}
                </div>

                {/* Avatar */}
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-sm font-medium text-accent">
                  {avatarInitials(hunter.wallet_address)}
                </div>

                <p className="text-sm font-medium text-slate-200 group-hover:text-accent transition-colors">
                  {hunter.display_name ?? formatAddress(hunter.wallet_address)}
                </p>

                {/* Stats */}
                <div className="mt-3 flex items-center justify-center gap-4 text-xs">
                  <div className="text-center">
                    <p className="font-semibold text-white tabular-nums">{hunter.total_signals}</p>
                    <p className="text-[10px] text-slate-500">signals</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-signal tabular-nums">
                      {hunter.chain_completed}/{hunter.total_signals}
                    </p>
                    <p className="text-[10px] text-slate-500">chained</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold tabular-nums text-white">
                      {hunter.streak > 0 ? `${hunter.streak}d` : '—'}
                    </p>
                    <p className="text-[10px] text-slate-500">streak</p>
                  </div>
                </div>

                {hunter.top_pair && (
                  <p className="mt-2 text-[10px] text-slate-500">
                    Top pair: <span className="text-slate-400">{hunter.top_pair}</span>
                  </p>
                )}
              </Link>
            );
          })}
        </div>

        <div className="text-center">
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-glow transition-colors"
          >
            View full leaderboard
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}
