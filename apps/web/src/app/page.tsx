'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Monitor } from '@/lib/api';
import { useWallet } from '@/components/WalletConnect';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import { useReveal } from '@/lib/useReveal';
import { burnRate, statusColor } from '@/lib/format';
import { WaitlistBanner } from '@/components/WaitlistBanner';
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
import InteractiveDemo from '@/components/landing/InteractiveDemo';
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
        <span className="text-slate-500">{balance.toFixed(1)} ℏ staked</span>
        <span className="font-medium text-slate-400">
          {Number.isFinite(daysLeft) ? `${daysLeft.toFixed(0)}d remaining` : '∞'}
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
}: {
  monitor: Monitor;
  executing: boolean;
  isConnected: boolean;
  onExecute: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { perDay, daysLeft } = burnRate(monitor);
  const bal = Number(monitor.hbar_balance);
  const daysDisplay = Number.isFinite(daysLeft) ? daysLeft.toFixed(0) : '∞';
  const daysColor = daysLeft > 14 ? 'text-signal' : daysLeft > 5 ? 'text-warn' : 'text-danger';
  const cat = categoryColor(monitor.url);
  const isCodeSignal = monitor.url.includes('github.com');

  return (
    <div className={`card group space-y-4 border-l-2 ${cat} !pl-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-100 group-hover:text-white">
              {monitor.url.replace(/^https?:\/\//, '')}
            </p>
            {isCodeSignal && (
              <span className="badge shrink-0 bg-violet-500/15 text-violet-400">
                <GitCommit className="h-2.5 w-2.5" /> Code Signal
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{monitor.condition_text}</p>
        </div>
        <span className={`badge shrink-0 ${statusColor(monitor.status)}`}>
          {monitor.status === 'active' && (
            <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />
          )}
          {monitor.status.replace('_', ' ')}
        </span>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <p className={`text-3xl font-bold tabular-nums ${daysColor}`}>{daysDisplay}</p>
          <p className="text-[10px] text-slate-500">days left</p>
        </div>
        <div className="mb-1 grid flex-1 grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-200">{bal.toFixed(1)}</p>
            <p className="text-[10px] text-slate-500">ℏ</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-200">{perDay.toFixed(2)}</p>
            <p className="text-[10px] text-slate-500">ℏ/day</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-200">
              {monitor.frequency_seconds >= 3600
                ? `${(monitor.frequency_seconds / 3600).toFixed(0)}h`
                : `${(monitor.frequency_seconds / 60).toFixed(0)}m`}
            </p>
            <p className="text-[10px] text-slate-500">freq</p>
          </div>
        </div>
      </div>

      <BurnBar balance={bal} daysLeft={daysLeft} />

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <Clock className="h-3 w-3" />
          {monitor.last_check_at
            ? new Date(monitor.last_check_at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'No checks yet'}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDelete(monitor.id)}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium text-slate-500 transition-colors hover:text-danger cursor-pointer select-none"
          >
            <X className="h-3 w-3" />
            Delete
          </button>
          <button
            onClick={() => onExecute(monitor.id)}
            disabled={executing || !isConnected}
            className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[10px] font-semibold text-accent transition-all hover:bg-accent/20 hover:shadow-glow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
          >
            {executing ? (
              <span className="animate-pulse">Running…</span>
            ) : (
              <>
                <Play className="h-3 w-3" />
                Execute
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
  isLoading,
  error,
  isRefetching,
  isConnected,
  executing,
  search,
  setSearch,
  onExecute,
  onDelete,
}: {
  monitors: Monitor[];
  signals: { detected_at: string }[];
  isLoading: boolean;
  error: Error | null;
  isRefetching: boolean;
  isConnected: boolean;
  executing: Record<string, boolean>;
  search: string;
  setSearch: (s: string) => void;
  onExecute: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [sort, setSort] = useState<SortKey>('newest');

  const activeCount = monitors.filter((m) => m.status === 'active').length;
  const triggeredCount = monitors.filter((m) => m.status === 'triggered').length;
  const totalBalance = monitors.reduce((s, m) => s + Number(m.hbar_balance), 0);

  const filtered = useMemo(() => {
    let list = monitors;
    if (filter !== 'all') {
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
    { key: 'active', label: 'Active' },
    { key: 'triggered', label: 'Triggered' },
    { key: 'paused', label: 'Paused' },
    { key: 'insufficient_balance', label: 'Low balance' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
            <span className="badge bg-accent/10 text-accent text-[10px]">Beta — Free</span>
            <Link
              href="/leaderboard"
              className="badge bg-ink-light/50 text-slate-400 hover:text-white text-[10px] transition-colors"
            >
              🏆 Leaderboard
            </Link>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {monitors.length} monitor{monitors.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isRefetching && !isLoading && (
            <span className="text-[10px] text-slate-500 animate-pulse">Refreshing…</span>
          )}
          <div className="relative hidden sm:block">
            <input
              className="input py-2 pl-8 pr-3 text-xs"
              placeholder="Search monitors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Eye className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
          </div>
          <Link href="/monitors/new" className="btn text-xs">
            + New Monitor
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="stat-card space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-accent" />
            <span className="section-title">Active</span>
          </div>
          <p className="text-2xl font-bold text-white">{activeCount}</p>
        </div>
        <div className="stat-card space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-signal" />
            <span className="section-title">Triggered</span>
          </div>
          <p className="text-2xl font-bold text-white">{triggeredCount}</p>
        </div>
        <div className="stat-card space-y-1">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-warn" />
            <span className="section-title">Total Staked</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {totalBalance.toFixed(1)} <span className="text-sm font-normal text-slate-500">ℏ</span>
          </p>
        </div>
        <div className="stat-card space-y-1">
          <div className="flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-slate-400" />
            <span className="section-title">Monitors</span>
          </div>
          <p className="text-2xl font-bold text-white">{monitors.length}</p>
        </div>
      </div>

      <details className="group cursor-pointer rounded-xl border border-edge/40 bg-ink-light/30 px-5 py-3 transition-colors hover:border-edge-light">
        <summary className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <Shield className="h-3.5 w-3.5 text-accent" />
          Why Hedera + x402?
          <ChevronRight className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-90 text-slate-600" />
        </summary>
        <div className="mt-3 space-y-2 border-t border-edge/40 pt-3 text-xs leading-relaxed text-slate-500">
          <p>
            <strong className="text-slate-300">Hedera Consensus Service (HCS)</strong> timestamps
            every signal in 3-5 seconds for ~$0.0001 — fast and cheap enough to timestamp every
            check, not just signals. The carbon-negative network means proof chains are
            environmentally auditable too.
          </p>
          <p>
            <strong className="text-slate-300">x402 micropayments</strong> let you pay per check via
            HBAR directly from your wallet — no subscription, no credit card, no platform holding
            your funds. When you click &quot;Execute,&quot; your wallet signs a micro-transaction
            that&apos;s settled on Hedera before the check runs. Payment and execution are
            inseparable.
          </p>
          <p>
            <strong className="text-slate-300">HBAR staking</strong> for scheduled checks sits in
            per-monitor escrow. Each check debits ~0.5 ℏ. You can withdraw remaining funds anytime
            by deleting the monitor.
          </p>
        </div>
      </details>

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card animate-pulse space-y-3">
              <div className="h-4 w-2/3 rounded bg-edge" />
              <div className="h-3 w-full rounded bg-edge/60" />
              <div className="h-1 w-full rounded-full bg-edge/40" />
            </div>
          ))}
        </div>
      )}

      {error && error.message !== 'session_expired' && (
        <div className="card border-danger/30 bg-danger/5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/10">
              <Zap className="h-4 w-4 text-danger" />
            </div>
            <div>
              <p className="text-sm font-medium text-danger">Connection Error</p>
              <p className="text-xs text-slate-500">{error.message}</p>
            </div>
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
          <div className="card space-y-4 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
              <Eye className="h-7 w-7 text-accent" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">No monitors yet</p>
              <p className="text-sm text-slate-400">
                Pick a template below and create your first monitor in one click.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'Zcash halo2 — Code Alpha',
                url: 'https://github.com/zcash/halo2/commits/main',
                condition:
                  'A new commit fixes a critical cryptography bug, soundness issue, or verifying key change in the halo2 circuit — something that could affect ZEC token confidence or require immediate network attention.',
                freq: 1800,
                icon: Shield,
                color: 'text-danger',
                bg: 'bg-danger/10',
              },
              {
                title: 'GitHub Security Watch',
                url: 'https://github.com/ethereum/go-ethereum/commits/master',
                condition:
                  'A new commit mentions security, vulnerability, CVE, fix, or critical patch.',
                freq: 3600,
                icon: GitCommit,
                color: 'text-accent',
                bg: 'bg-accent/10',
              },
              {
                title: 'Exchange Status Monitor',
                url: 'https://status.kraken.com',
                condition:
                  'Any service shows degraded performance, partial outage, or maintenance.',
                freq: 300,
                icon: Bell,
                color: 'text-warn',
                bg: 'bg-warn/10',
              },
            ].map((t) => (
              <div key={t.title} className="card space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.bg}`}>
                    <t.icon className={`h-4 w-4 ${t.color}`} />
                  </div>
                  <p className="text-sm font-semibold text-slate-200">{t.title}</p>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">{t.condition}</p>
                <Link
                  href={`/monitors/new?url=${encodeURIComponent(t.url)}&condition=${encodeURIComponent(t.condition)}&frequency=${t.freq}`}
                  className="btn inline-flex w-full justify-center text-xs"
                >
                  <Play className="h-3 w-3 fill-ink" />
                  Create Monitor
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <MonitorCard
              key={m.id}
              monitor={m}
              executing={!!executing[m.id]}
              isConnected={isConnected}
              onExecute={onExecute}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
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
  const { isAuthenticated } = useAuth();
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

  async function handleExecute(monitorId: string) {
    if (!isConnected) {
      toast.warn('Connect your Hedera wallet first to pay via x402.');
      return;
    }
    setExecuting((prev) => ({ ...prev, [monitorId]: true }));
    toast.info('Step 1/3: Sending 0.5 HBAR x402 payment request…');
    try {
      toast.info('Step 2/3: Waiting for wallet approval…');
      const res = await api.executeMonitor(monitorId, executeWithPayment);
      const data = await res.json();
      if (data.ok) {
        toast.success('Step 3/3: Payment confirmed — check complete!');
        queryClient.invalidateQueries({ queryKey: ['signals'] });
        queryClient.invalidateQueries({ queryKey: ['monitors'] });
        return;
      }
      // Backend returned ok: false
      if (data.error === 'monitor_not_active') {
        toast.error('Monitor is paused or has insufficient balance. Top up to re-enable.');
      } else {
        toast.error('Check failed on the server. Try again in a moment.');
      }
    } catch (e) {
      const msg = String(e).toLowerCase();
      if (msg.includes('rejected') || msg.includes('cancel') || msg.includes('denied')) {
        toast.error('Payment rejected in wallet. You were not charged.');
      } else if (msg.includes('402') || msg.includes('payment') || msg.includes('x402')) {
        toast.error('x402 payment setup failed. Check your wallet balance and try again.');
      } else if (msg.includes('timeout') || msg.includes('timed out')) {
        toast.error('Request timed out. The network may be congested — try again.');
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

  async function handleDelete(monitorId: string) {
    if (!confirm('Delete this monitor and release remaining escrow?')) return;
    try {
      await api.deleteMonitor(monitorId);
      toast.success('Monitor deleted');
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
    } catch (e) {
      toast.error('Delete failed: ' + String(e));
    }
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

          {/* Social Proof Stats */}
          <SocialProof />

          {/* Proof Chain Live Animation */}
          <div id="how-it-works">
            <ProofChainLive />
          </div>

          {/* Story Timeline (ZEC narrative) */}
          <div id="zec-story">
            <StoryTimeline />
          </div>

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
    <DashboardView
      monitors={monitors}
      signals={signals}
      isLoading={isLoading}
      error={error as Error | null}
      isRefetching={isRefetching}
      isConnected={isConnected}
      executing={executing}
      search={search}
      setSearch={setSearch}
      onExecute={handleExecute}
      onDelete={handleDelete}
    />
  );
}
