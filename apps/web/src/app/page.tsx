'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Monitor } from '@/lib/api';
import { useWallet } from '@/components/WalletConnect';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import { useReveal } from '@/lib/useReveal';
import { burnRate, statusColor } from '@/lib/format';
import { COPY, hostnameFromUrl } from '@/lib/copy';
import { WaitlistBanner } from '@/components/WaitlistBanner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Activity,
  Shield,
  Zap,
  Eye,
  Clock,
  Wallet,
  Play,
  ChevronRight,
  X,
  BarChart3,
  GitCommit,
  Bell,
  Sparkles,
} from 'lucide-react';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';

import CinematicHero from '@/components/landing/CinematicHero';
import ProofChainLive from '@/components/landing/ProofChainLive';
import StoryTimeline from '@/components/landing/StoryTimeline';
import SocialProof from '@/components/landing/SocialProof';
import BacktestProof from '@/components/landing/BacktestProof';
import InteractiveDemo from '@/components/landing/InteractiveDemo';
import LiveCounterBar from '@/components/landing/LiveCounterBar';
import LandingLeaderboard from '@/components/landing/LandingLeaderboard';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

type TemplateSelection = {
  url: string;
  condition: string;
  frequency: number;
};

function categoryColor(url: string): string {
  if (url.includes('github.com')) return 'border-l-violet';
  if (url.includes('status.')) return 'border-l-warn';
  if (url.includes('docs.') || url.includes('hedera.com')) return 'border-l-signal';
  if (url.includes('sec.gov')) return 'border-l-danger';
  return 'border-l-accent';
}

type SortKey = 'newest' | 'balance' | 'daysLeft';
type FilterStatus = 'all' | 'active' | 'triggered' | 'paused' | 'insufficient_balance';

// ─── Burn Bar ───

function BurnBar({ balance, daysLeft }: { balance: number; daysLeft: number }) {
  const pct = Math.min(100, Math.max(0, (daysLeft / 30) * 100));
  const color = daysLeft > 14 ? 'bg-signal' : daysLeft > 5 ? 'bg-warn' : 'bg-danger';
  return (
    <div className="space-y-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-edge/60">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-500">{COPY.funding.staked(balance)}</span>
        <span className="font-medium text-slate-400">
          {Number.isFinite(daysLeft)
            ? daysLeft < 1
              ? `${(daysLeft * 24).toFixed(1)}h remaining`
              : `${daysLeft.toFixed(0)}d remaining`
            : '∞'}
        </span>
      </div>
    </div>
  );
}

// ─── Monitor Card (redesigned for scanability) ───

function MonitorCard({
  monitor,
  executing,
  isConnected,
  onExecute,
  onDelete,
  latestSignal,
  signalCount,
}: {
  monitor: Monitor;
  executing: boolean;
  isConnected: boolean;
  onExecute: (id: string) => void;
  onDelete: (id: string) => void;
  latestSignal?: { id: string; detected_at: string; viewed_at?: string | null } | null;
  signalCount?: number;
}) {
  const { perDay, daysLeft, checksRemaining } = burnRate(monitor);
  const bal = Number(monitor.hbar_balance);
  const cost = Number(monitor.cost_per_check);
  const isFunded = bal > 0 && checksRemaining > 0;
  const isLowFunds = isFunded && checksRemaining < 5;
  const cat = categoryColor(monitor.url);
  const isCodeSignal = monitor.url.includes('github.com');
  const [expanded, setExpanded] = useState(false);
  const canExecute = isConnected && monitor.status !== 'insufficient_balance';
  const host = hostnameFromUrl(monitor.url);

  // ── Countdown timer for low-balance monitors ──
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    if (!isFunded || checksRemaining >= 5) {
      setCountdown('');
      return;
    }
    function tick() {
      const secondsLeft = checksRemaining * monitor.frequency_seconds;
      setCountdown(COPY.monitor.expiresIn(secondsLeft));
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [isFunded, checksRemaining, monitor.frequency_seconds]);

  // ── Next check countdown (active monitors) ──
  const [nextCheckIn, setNextCheckIn] = useState('');
  useEffect(() => {
    if (!isFunded || monitor.status !== 'active' || !monitor.last_check_at) {
      setNextCheckIn('');
      return;
    }
    function tick() {
      const lastMs = new Date(monitor.last_check_at!).getTime();
      const nextMs = lastMs + monitor.frequency_seconds * 1000;
      const diffSec = Math.max(0, Math.round((nextMs - Date.now()) / 1000));
      if (diffSec === 0) {
        setNextCheckIn('checking now…');
        return;
      }
      const m = Math.floor(diffSec / 60);
      const s = diffSec % 60;
      setNextCheckIn(m > 0 ? `next check ~${m}m` : `next check ~${s}s`);
    }
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [isFunded, monitor.status, monitor.last_check_at, monitor.frequency_seconds]);

  // ── Time since inactive (loss aversion) ──
  const darkFor = useMemo(() => {
    if (isFunded || !monitor.last_check_at) return '';
    const ms = Date.now() - new Date(monitor.last_check_at).getTime();
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    if (h > 0) return `Dark for ${h}h ${m}m — top up to resume`;
    if (m > 0) return `Dark for ${m}m — top up to resume`;
    return 'Just went dark — top up to resume';
  }, [isFunded, monitor.last_check_at]);

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-edge/50 bg-ink-light/60 p-5 transition-all duration-300 border-l-2 ${cat}
        hover:border-edge-light/60 hover:bg-ink-light/80`}
    >
      {/* Scan-line shimmer on hover */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
      </div>

      {/* Terminal header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {monitor.status === 'active' && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
                </span>
              )}
              <p className="truncate font-mono text-xs font-medium text-slate-400 group-hover:text-slate-300">
                {monitor.url.replace(/^https?:\/\//, '')}
              </p>
              {isCodeSignal && (
                <span className="badge shrink-0 bg-violet-500/10 text-violet-400">
                  <GitCommit className="h-2.5 w-2.5" /> Code
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm font-medium text-slate-200 leading-snug">
              {monitor.condition_text}
            </p>
          </div>
          <span className={`badge shrink-0 ${statusColor(monitor.status)}`}>
            {COPY.monitor.statusLabel(monitor.status)}
          </span>
        </div>
      </button>

      {/* Funding strip */}
      <div className="mt-4 flex items-end gap-4">
        {!isFunded ? (
          <div className="flex-1">
            <p className="font-mono text-2xl font-bold text-danger">DARK</p>
            <p className="text-[10px] text-danger/70 mt-0.5">
              {darkFor || COPY.monitor.inactive(0)}
            </p>
          </div>
        ) : (
          <>
            <div className="shrink-0">
              <p
                className={`font-mono text-4xl font-bold tabular-nums leading-none ${isLowFunds ? 'text-warn' : 'text-signal'}`}
              >
                {checksRemaining}
              </p>
              <p className="mt-1 text-[10px] text-slate-600 uppercase tracking-wider">
                {isLowFunds ? 'checks left ⚠' : 'checks left'}
              </p>
            </div>
            <div className="flex-1 space-y-1">
              {/* Burn progress */}
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-edge/60">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (daysLeft / 30) * 100 > 50
                      ? 'bg-signal'
                      : (daysLeft / 30) * 100 > 20
                        ? 'bg-warn'
                        : 'bg-danger'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, (daysLeft / 30) * 100))}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-1 pt-1">
                {[
                  { v: `${Number(monitor.hbar_balance).toFixed(1)} ℏ`, l: 'staked' },
                  { v: `${perDay.toFixed(2)}/d`, l: 'burn' },
                  {
                    v:
                      monitor.frequency_seconds >= 3600
                        ? `${(monitor.frequency_seconds / 3600).toFixed(0)}h`
                        : `${(monitor.frequency_seconds / 60).toFixed(0)}m`,
                    l: 'interval',
                  },
                ].map(({ v, l }) => (
                  <div key={l}>
                    <p className="font-mono text-xs font-semibold text-slate-300">{v}</p>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {countdown && <p className="mt-2 font-mono text-[10px] text-warn">{countdown}</p>}

      {latestSignal && !latestSignal.viewed_at && (
        <Link
          href={`/signals/${latestSignal.id}`}
          className="mt-4 flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2.5 text-xs transition-all hover:border-accent/40 hover:bg-accent/10"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-accent">{COPY.signals.detected(host).headline}</p>
            <p className="truncate text-slate-400">{COPY.signals.detected(host).cta}</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-accent/50" />
        </Link>
      )}

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-edge/40 pt-4">
          <p className="text-xs leading-relaxed text-slate-400">{monitor.condition_text}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11px]">
            {[
              ['Sensitivity', `${monitor.confidence_threshold}/100`],
              ['Cost/check', COPY.funding.perCheck(Number(monitor.cost_per_check))],
              ['Public', monitor.is_public ? 'Yes' : 'No'],
              ['Signals', String(signalCount ?? 0)],
            ].map(([l, v]) => (
              <div key={l}>
                <span className="text-slate-600">{l} </span>
                <span className="text-slate-300">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[10px] text-slate-600">
          <Clock className="h-3 w-3 shrink-0" />
          {monitor.last_check_at
            ? new Date(monitor.last_check_at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'no checks yet'}
          {nextCheckIn && <span className="text-signal/70">· {nextCheckIn}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(monitor.id);
            }}
            className="rounded px-2 py-1.5 text-[10px] text-slate-600 transition-colors hover:text-danger cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExecute(monitor.id);
            }}
            disabled={executing || !canExecute}
            title={!isConnected ? COPY.errors.noWallet : COPY.monitor.actions.executeSubtitle}
            className="flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/8 px-3 py-1.5 font-mono text-[10px] font-semibold text-accent transition-all hover:border-accent/40 hover:bg-accent/15 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {executing ? (
              <span className="animate-pulse">running…</span>
            ) : (
              <>
                <Play className="h-3 w-3" /> run
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard (authenticated view) ───

function DashboardView({
  monitors,
  signals,
  ordersCount,
  isLoading,
  error,
  isRefetching,
  isConnected,
  executing,
  search,
  setSearch,
  onExecute,
  onDelete,
  onConnect,
}: {
  monitors: Monitor[];
  signals: {
    id: string;
    monitor_id: string;
    detected_at: string;
    viewed_at?: string | null;
    is_heartbeat?: boolean;
  }[];
  ordersCount: number;
  isLoading: boolean;
  error: Error | null;
  isRefetching: boolean;
  isConnected: boolean;
  executing: Record<string, boolean>;
  search: string;
  setSearch: (s: string) => void;
  onExecute: (id: string) => void;
  onDelete: (id: string) => void;
  onConnect: () => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [sort, setSort] = useState<SortKey>('newest');

  const activeCount = monitors.filter((m) => m.status === 'active').length;
  // Count monitors with either a `triggered` status *or* an unviewed signal.
  // The two can briefly diverge after viewing a signal: the monitor re-arms
  // to `active` but the dashboard may not have re-fetched yet, so we OR
  // the two sources for a stable count.
  const triggeredCount = monitors.filter((m) => {
    if (m.status === 'triggered') return true;
    return signals.some((s) => s.monitor_id === m.id && !s.is_heartbeat && !s.viewed_at);
  }).length;
  const totalBalance = monitors.reduce((s, m) => s + Number(m.hbar_balance), 0);

  const filtered = useMemo(() => {
    let list = monitors;
    if (filter === 'triggered') {
      // Match either status='triggered' OR any monitor with an unviewed signal,
      // so the user can find their unread signal even after re-arm.
      list = list.filter((m) => {
        if (m.status === 'triggered') return true;
        return signals.some((s) => s.monitor_id === m.id && !s.is_heartbeat && !s.viewed_at);
      });
    } else if (filter !== 'all') {
      list = list.filter((m) => m.status === filter);
    }
    if (search) {
      list = list.filter(
        (m) =>
          m.url.toLowerCase().includes(search.toLowerCase()) ||
          m.condition_text.toLowerCase().includes(search.toLowerCase()),
      );
    }
    const sorted = [...list];
    switch (sort) {
      case 'balance':
        sorted.sort((a, b) => Number(b.hbar_balance) - Number(a.hbar_balance));
        break;
      case 'daysLeft':
        sorted.sort((a, b) => burnRate(a).daysLeft - burnRate(b).daysLeft);
        break;
      case 'newest':
      default:
        sorted.sort(
          (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        );
        break;
    }
    return sorted;
  }, [monitors, filter, search, sort]);

  const signalChartData = signals
    .filter((s) => {
      const d = new Date(s.detected_at);
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      return d >= weekAgo;
    })
    .reduce<{ date: string; count: number }[]>((acc, s) => {
      const d = new Date(s.detected_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const existing = acc.find((e) => e.date === d);
      if (existing) existing.count++;
      else acc.push({ date: d, count: 1 });
      return acc;
    }, [])
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const STATUS_FILTERS: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Watching' },
    { key: 'triggered', label: 'Signal caught!' },
    { key: 'paused', label: 'Paused' },
    { key: 'insufficient_balance', label: 'Needs funds' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
            <span className="badge bg-violet/10 text-violet text-[10px]">Beta</span>
            <Link
              href="/leaderboard"
              className="badge bg-ink-light/50 text-slate-500 hover:text-slate-300 text-[10px] transition-colors"
            >
              🏆 Leaderboard
            </Link>
          </div>
          <p className="mt-1 font-mono text-xs text-slate-600">
            {monitors.length} monitor{monitors.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRefetching && !isLoading && (
            <span className="text-[10px] text-slate-500 animate-pulse">Refreshing…</span>
          )}
          <div className="relative flex-1 sm:flex-none">
            <input
              className="input w-full py-2 pl-8 pr-3 text-xs sm:w-auto"
              placeholder="Search monitors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Eye className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
          </div>
          <Link href="/monitors/new" className="btn shrink-0 text-xs">
            + Watch
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 rounded-2xl border border-edge/50 bg-ink-light/40 backdrop-blur-sm sm:flex sm:flex-wrap sm:items-center">
        {isLoading ? (
          <div className="col-span-2 flex gap-6 px-5 py-4 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-14 rounded bg-edge/60" />
                <div className="h-6 w-8 rounded bg-edge/40" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {[
              {
                icon: <Activity className="h-3 w-3 text-signal" />,
                label: 'Active',
                value: activeCount,
                color: 'text-signal',
                pulse: activeCount > 0,
              },
              {
                icon: <Eye className="h-3 w-3 text-accent" />,
                label: 'Triggered',
                value: triggeredCount,
                color: triggeredCount > 0 ? 'text-warn' : 'text-slate-400',
                pulse: triggeredCount > 0,
              },
              {
                icon: <Wallet className="h-3 w-3 text-violet" />,
                label: 'Staked',
                value: COPY.funding.staked(totalBalance),
                color: 'text-slate-200',
              },
              {
                icon: <BarChart3 className="h-3 w-3 text-accent/70" />,
                label: 'Trades',
                value: ordersCount,
                color: 'text-slate-400',
              },
            ].map((stat, i, arr) => (
              <div key={stat.label} className="flex items-stretch">
                <div className="flex items-center gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5">
                  <div className="relative">
                    {stat.pulse && (
                      <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />
                    )}
                    {stat.icon}
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-slate-600">
                      {stat.label}
                    </p>
                    <p
                      className={`font-mono text-base font-semibold tabular-nums leading-none sm:text-lg ${stat.color}`}
                    >
                      {stat.value}
                    </p>
                  </div>
                </div>
                {i < arr.length - 1 && <div className="w-px self-stretch bg-edge/60 my-2" />}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Global Live Counter — system-wide stats */}
      <LiveCounterBar />

      {signalChartData.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 border-b border-edge/40 pb-4">
            <BarChart3 className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-slate-200">Signal Activity (7d)</h2>
          </div>
          <div className="pt-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={signalChartData}
                margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="signalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,35,50,0.5)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: '#0d111c',
                    border: '1px solid rgba(26,35,50,0.8)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fill="url(#signalGradient)"
                  dot={{ fill: '#06b6d4', r: 3 }}
                  activeDot={{ r: 5, fill: '#06b6d4' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter + Sort Bar */}
      {monitors.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all cursor-pointer select-none ${
                  filter === f.key
                    ? 'bg-accent/10 text-accent shadow-glow-sm'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-edge/40'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="ml-auto rounded-lg border border-edge/40 bg-ink-light/50 px-2 py-1.5 text-[11px] font-medium text-slate-400 outline-none transition-colors hover:border-edge-light focus:border-accent/40"
          >
            <option value="newest">Newest first</option>
            <option value="balance">Highest balance</option>
            <option value="daysLeft">Lowest days left</option>
          </select>
        </div>
      )}

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl border border-edge/40 bg-ink-light/40"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="card border-danger/30 bg-danger/5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/10">
              {error.message === 'session_expired' ? (
                <Shield className="h-4 w-4 text-warn" />
              ) : (
                <Zap className="h-4 w-4 text-danger" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-danger">
                {error.message === 'session_expired' ? 'Session Expired' : 'Connection Error'}
              </p>
              <p className="text-xs text-slate-500">
                {error.message === 'session_expired'
                  ? 'Your session has expired. Connect your wallet to sign in again.'
                  : error.message}
              </p>
            </div>
            {error.message === 'session_expired' ? (
              <button type="button" onClick={onConnect} className="btn shrink-0 py-1.5 text-[11px]">
                Reconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={() => queryClient.refetchQueries({ queryKey: ['monitors'] })}
                className="btn-ghost shrink-0 py-1.5 text-[11px]"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && monitors.length > 0 && (
        <div className="stat-card p-6 text-center">
          <p className="text-sm text-slate-500">No monitors match your filters</p>
        </div>
      )}

      {!isLoading && !error && monitors.length === 0 && (
        <div className="space-y-6">
          {/* Intentional empty state — feels like an ops console waiting for targets */}
          <div className="relative overflow-hidden rounded-2xl border border-edge/40 bg-ink-light/30 px-8 py-12">
            <div className="pointer-events-none absolute inset-0 opacity-30">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
            </div>
            <div className="relative flex items-start gap-8">
              <div className="shrink-0 pt-1">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-accent/20 bg-accent/5">
                  <Eye className="h-5 w-5 text-accent/60" />
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-ink bg-slate-700" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-200">No targets configured</p>
                <p className="max-w-md text-sm leading-relaxed text-slate-500">
                  Point LENITNES at any URL — a GitHub repo, exchange status page, or SEC filing —
                  and describe what to watch for in plain English. Signals fire in under 60s.
                </p>
                <div className="pt-3">
                  <Link href="/monitors/new" className="btn text-sm">
                    + Watch New Target
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-slate-600">
            Quick start
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                title: 'Zcash halo2',
                url: 'https://github.com/zcash/halo2/commits/main',
                condition:
                  'A new commit fixes a critical cryptography bug, soundness issue, or verifying key change in the halo2 circuit — something that could affect ZEC token confidence or require immediate network attention.',
                freq: 1800,
                icon: Shield,
                accent: 'text-danger border-danger/20 bg-danger/5',
                label: 'Code alpha',
              },
              {
                title: 'go-ethereum',
                url: 'https://github.com/ethereum/go-ethereum/commits/master',
                condition:
                  'A new commit mentions security, vulnerability, CVE, fix, or critical patch.',
                freq: 3600,
                icon: GitCommit,
                accent: 'text-accent border-accent/20 bg-accent/5',
                label: 'Security watch',
              },
              {
                title: 'Kraken Status',
                url: 'https://status.kraken.com',
                condition:
                  'Any service shows degraded performance, partial outage, or maintenance.',
                freq: 300,
                icon: Bell,
                accent: 'text-warn border-warn/20 bg-warn/5',
                label: 'Exchange uptime',
              },
            ].map((t) => (
              <Link
                key={t.title}
                href={`/monitors/new?url=${encodeURIComponent(t.url)}&condition=${encodeURIComponent(t.condition)}&frequency=${t.freq}`}
                className={`group flex items-start gap-3 rounded-xl border px-4 py-3.5 transition-all hover:scale-[1.01] ${t.accent}`}
              >
                <t.icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t.title}</p>
                  <p className="text-[10px] uppercase tracking-wider opacity-60">{t.label}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{t.condition}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className={`grid gap-3 ${filtered.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {filtered.map((m) => {
            const monitorSignals = signals.filter((s) => s.monitor_id === m.id);
            const latest = monitorSignals.sort(
              (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime(),
            )[0];
            return (
              <MonitorCard
                key={m.id}
                monitor={m}
                executing={!!executing[m.id]}
                isConnected={isConnected}
                onExecute={onExecute}
                onDelete={onDelete}
                latestSignal={latest ?? null}
                signalCount={monitorSignals.length}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section Divider ───

function SectionDivider({ variant = 'default' }: { variant?: 'default' | 'accent' | 'signal' }) {
  const colors = {
    default: 'from-edge/40 via-edge-light/20 to-edge/40',
    accent: 'from-edge/40 via-accent/20 to-edge/40',
    signal: 'from-edge/40 via-signal/20 to-edge/40',
  };
  return (
    <div className="relative py-8">
      <div className="mx-auto max-w-xs">
        <div className={`h-px bg-gradient-to-r ${colors[variant]}`} />
      </div>
      {/* Orbs on edges */}
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ${
          variant === 'accent'
            ? 'bg-accent/40'
            : variant === 'signal'
              ? 'bg-signal/40'
              : 'bg-edge-light'
        }`}
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Main Page Export ───

export default function DashboardPage() {
  const [executing, setExecuting] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const { isConnected, executeWithPayment, connect } = useWallet();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const toast = useToast();

  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'execute' | 'delete';
    monitorId: string;
    monitorUrl?: string;
    monitorBalance?: number;
  } | null>(null);
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const landingRef = useReveal();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: monitors = [],
    isLoading,
    error,
    isRefetching,
  } = useQuery({
    queryKey: ['monitors', isAuthenticated],
    queryFn: () => api.listMonitors(),
    staleTime: 10_000,
    refetchInterval: 30_000,
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: signals = [] } = useQuery({
    queryKey: ['signals'],
    queryFn: () => api.listSignals(),
    refetchInterval: 30_000,
    enabled: isAuthenticated,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.listOrders(),
    refetchInterval: 30_000,
    enabled: isAuthenticated,
  });

  function handleExecute(monitorId: string) {
    if (!isConnected) {
      toast.warn(COPY.errors.noWallet);
      return;
    }
    const m = monitors.find((x) => x.id === monitorId);
    setConfirmDialog({
      type: 'execute',
      monitorId,
      monitorUrl: m?.url,
      monitorBalance: m ? Number(m.hbar_balance) : undefined,
    });
  }

  async function doExecute(monitorId: string) {
    setExecuting((prev) => ({ ...prev, [monitorId]: true }));
    try {
      const res = await api.executeMonitor(monitorId, executeWithPayment);
      const data = await res.json();
      if (data.ok) {
        toast.success('Payment confirmed — check complete!');
        queryClient.invalidateQueries({ queryKey: ['signals'] });
        queryClient.invalidateQueries({ queryKey: ['monitors'] });
        return;
      }
      if (data.error === 'monitor_not_active') {
        toast.error(COPY.errors.monitorInactive);
      } else {
        toast.error(COPY.errors.serverError);
      }
    } catch (e) {
      const msg = String(e).toLowerCase();
      if (msg.includes('rejected') || msg.includes('cancel') || msg.includes('denied')) {
        toast.error(COPY.errors.paymentRejected);
      } else if (msg.includes('402') || msg.includes('payment') || msg.includes('x402')) {
        toast.error(COPY.errors.paymentFailed);
      } else if (msg.includes('timeout') || msg.includes('timed out')) {
        toast.error(COPY.errors.timeout);
      } else {
        toast.error('Execution failed: ' + String(e));
      }
    } finally {
      setExecuting((prev) => ({ ...prev, [monitorId]: false }));
    }
  }

  function handleUseTemplate(t: TemplateSelection) {
    const params = new URLSearchParams({
      url: t.url,
      condition: t.condition,
      frequency: String(t.frequency),
    });
    router.push(`/monitors/new?${params.toString()}`);
  }

  function handleDelete(monitorId: string) {
    const m = monitors.find((x) => x.id === monitorId);
    setConfirmDialog({
      type: 'delete',
      monitorId,
      monitorUrl: m?.url,
      monitorBalance: m ? Number(m.hbar_balance) : undefined,
    });
  }

  async function doDelete(monitorId: string) {
    try {
      await api.deleteMonitor(monitorId);
      toast.success('Monitor removed');
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
    } catch (e) {
      toast.error(COPY.errors.deleteFailed + String(e));
    }
  }

  // Show a loading state while auth resolves to prevent flash of landing content
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="h-8 w-8 animate-pulse rounded-xl bg-accent/20" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <div
          ref={landingRef}
          aria-hidden={showOnboarding || undefined}
          inert={showOnboarding || undefined}
          className="space-y-16 pb-24"
        >
          {/* Cinematic Hero */}
          <CinematicHero
            onStartOnboarding={() => setShowOnboarding(true)}
            onScrollToHow={() => {
              const el = document.getElementById('how-it-works');
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />

          {/* Section Divider */}
          <SectionDivider />

          {/* Social Proof Stats */}
          <SocialProof />

          {/* Section Divider */}
          <SectionDivider variant="accent" />

          {/* Proof Chain Live Animation */}
          <div id="how-it-works">
            <ProofChainLive />
          </div>

          {/* Section Divider */}
          <SectionDivider />

          {/* Story Timeline (ZEC narrative) */}
          <div id="zec-story">
            <StoryTimeline />
          </div>

          {/* Section Divider */}
          <SectionDivider variant="signal" />

          {/* Backtest Proof — live accuracy stats */}
          <BacktestProof />

          {/* Section Divider */}
          <SectionDivider />

          {/* Top Signal Hunters — live leaderboard */}
          <LandingLeaderboard />

          {/* Section Divider */}
          <SectionDivider variant="accent" />

          {/* Interactive Sandbox Demo */}
          <InteractiveDemo onUseTemplate={handleUseTemplate} />

          {/* Bottom Call to Action */}
          <div className="reveal text-center py-12">
            <button onClick={() => setShowOnboarding(true)} className="btn text-base px-8 py-3.5">
              <Eye className="h-4 w-4" />
              Start Watching in 30 Seconds
            </button>
            <p className="mt-3 text-xs text-slate-600">
              No credit card. Stake ℏ to run. Withdraw anytime.
            </p>
          </div>

          {/* Waitlist / Feedback */}
          <WaitlistBanner />
        </div>
        {/* Onboarding Wizard Modal */}
        {showOnboarding && (
          <OnboardingWizard
            onClose={() => setShowOnboarding(false)}
            onComplete={() => setShowOnboarding(false)}
            isWalletConnected={isConnected}
            onConnectWallet={connect}
          />
        )}
      </>
    );
  }

  return (
    <>
      <DashboardView
        monitors={monitors}
        signals={signals}
        ordersCount={orders.length}
        isLoading={isLoading}
        error={error as Error | null}
        isRefetching={isRefetching}
        isConnected={isConnected}
        executing={executing}
        search={search}
        setSearch={setSearch}
        onExecute={handleExecute}
        onDelete={handleDelete}
        onConnect={connect}
      />
      <ConfirmDialog
        isOpen={!!confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onConfirm={() => {
          if (!confirmDialog) return;
          if (confirmDialog.type === 'execute') {
            doExecute(confirmDialog.monitorId);
          } else {
            doDelete(confirmDialog.monitorId);
          }
          setConfirmDialog(null);
        }}
        title={
          confirmDialog?.type === 'execute'
            ? COPY.confirmation.execute.title
            : COPY.confirmation.delete.title
        }
        description={(() => {
          const host = hostnameFromUrl(confirmDialog?.monitorUrl || '');
          return confirmDialog?.type === 'execute'
            ? COPY.confirmation.execute.description(host)
            : COPY.confirmation.delete.description(host, confirmDialog?.monitorBalance ?? 0);
        })()}
        confirmLabel={
          confirmDialog?.type === 'execute'
            ? COPY.confirmation.execute.confirmLabel
            : COPY.confirmation.delete.confirmLabel
        }
        confirmVariant={confirmDialog?.type === 'execute' ? 'accent' : 'danger'}
      />
    </>
  );
}
