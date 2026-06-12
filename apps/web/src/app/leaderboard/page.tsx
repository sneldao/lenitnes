'use client';

import Link from 'next/link';
import { Trophy, Zap, GitCommit, TrendingUp, ArrowLeft, Users, Activity } from 'lucide-react';

// TODO(replace-with-real-data): remove the MOCK_* constants once the
// `GET /leaderboard` endpoint is implemented. Today this is seeded for
// demo / video scaffolding and to give the page a non-empty layout in
// design reviews. Until then, the badge in the page header reads
// "Demo" rather than "Beta" to set expectations.
const MOCK_LEADERS = [
  {
    rank: 1,
    name: 'zcash_alpha',
    avatar: 'ZA',
    signals: 47,
    accuracy: '94%',
    streak: 12,
    topPair: 'ZEC/USD',
    lastSignal: '2 min ago',
  },
  {
    rank: 2,
    name: 'halo2_watcher',
    avatar: 'HW',
    signals: 38,
    accuracy: '91%',
    streak: 8,
    topPair: 'ZEC/USD',
    lastSignal: '15 min ago',
  },
  {
    rank: 3,
    name: 'circuit_breaker',
    avatar: 'CB',
    signals: 31,
    accuracy: '87%',
    streak: 5,
    topPair: 'BTC/USD',
    lastSignal: '1 hr ago',
  },
  {
    rank: 4,
    name: 'commit_hunter',
    avatar: 'CH',
    signals: 24,
    accuracy: '83%',
    streak: 3,
    topPair: 'ETH/USD',
    lastSignal: '3 hr ago',
  },
  {
    rank: 5,
    name: 'sentinel_node',
    avatar: 'SN',
    signals: 19,
    accuracy: '79%',
    streak: 2,
    topPair: 'SOL/USD',
    lastSignal: '5 hr ago',
  },
];

const MOCK_STATS = {
  totalSignals: 3124,
  activeHunters: 87,
  publicMonitors: 156,
  avgResponseTime: '4.2s',
};

export default function LeaderboardPage() {
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">Signal Leaderboard</h1>
          <span className="badge bg-warn/10 text-warn text-[10px]">Demo — Mock data</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Top code-signal hunters this week. Public feeds only.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="stat-card p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Zap className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Total Signals</span>
          </div>
          <p className="mt-1 text-xl font-semibold text-white">
            {MOCK_STATS.totalSignals.toLocaleString()}
          </p>
        </div>
        <div className="stat-card p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Users className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Active Hunters</span>
          </div>
          <p className="mt-1 text-xl font-semibold text-white">{MOCK_STATS.activeHunters}</p>
        </div>
        <div className="stat-card p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <GitCommit className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Public Monitors</span>
          </div>
          <p className="mt-1 text-xl font-semibold text-white">{MOCK_STATS.publicMonitors}</p>
        </div>
        <div className="stat-card p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Activity className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Avg Response</span>
          </div>
          <p className="mt-1 text-xl font-semibold text-white">{MOCK_STATS.avgResponseTime}</p>
        </div>
      </div>

      {/* Leaderboard table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-edge/40 px-5 py-3">
          <Trophy className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">This Week&apos;s Top Hunters</h2>
        </div>

        <div className="divide-y divide-edge/30">
          {MOCK_LEADERS.map((hunter) => (
            <div
              key={hunter.rank}
              className="flex items-center gap-4 px-5 py-4 hover:bg-ink-light/30 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-light text-sm font-bold text-slate-400">
                {hunter.rank <= 3 ? (
                  <Trophy
                    className={`h-4 w-4 ${
                      hunter.rank === 1
                        ? 'text-yellow-400'
                        : hunter.rank === 2
                          ? 'text-slate-300'
                          : 'text-amber-600'
                    }`}
                  />
                ) : (
                  <span className="text-xs">{hunter.rank}</span>
                )}
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">
                {hunter.avatar}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{hunter.name}</p>
                <p className="text-[10px] text-slate-500">
                  Streak {hunter.streak} days • {hunter.topPair}
                </p>
              </div>

              <div className="hidden sm:flex items-center gap-6 text-xs text-slate-400">
                <div className="text-center">
                  <p className="font-semibold text-white">{hunter.signals}</p>
                  <p className="text-[10px] text-slate-500">signals</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-signal">{hunter.accuracy}</p>
                  <p className="text-[10px] text-slate-500">accuracy</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-white">{hunter.lastSignal}</p>
                  <p className="text-[10px] text-slate-500">last signal</p>
                </div>
              </div>

              <TrendingUp className="h-4 w-4 text-signal hidden sm:block" />
            </div>
          ))}
        </div>
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
