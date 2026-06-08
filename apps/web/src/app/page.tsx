'use client';

import { useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, burnRate, statusColor, type Monitor } from '@/lib/api';
import { useWallet } from '@/components/WalletConnect';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import { useReveal } from '@/lib/useReveal';
import { Tooltip } from '@/components/Tooltip';
import {
  Activity,
  Shield,
  Zap,
  Eye,
  ArrowRight,
  ArrowDown,
  Clock,
  Wallet,
  Play,
  Link as LinkIcon,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  X,
  BarChart3,
  Coins,
  Unlock,
  Timer,
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

import { TEMPLATES } from '@/data/templates';

function categoryColor(url: string): string {
  if (url.includes('github.com')) return 'border-l-violet';
  if (url.includes('status.')) return 'border-l-warn';
  if (url.includes('docs.') || url.includes('hedera.com')) return 'border-l-signal';
  if (url.includes('sec.gov')) return 'border-l-danger';
  return 'border-l-accent';
}

type SortKey = 'newest' | 'balance' | 'daysLeft';
type FilterStatus = 'all' | 'active' | 'triggered' | 'paused' | 'insufficient_balance';

// ─── Proof Chain Diagram (animated) ───

function ProofChainDiagram() {
  const steps = [
    { icon: Eye, label: 'Detect', desc: 'TinyFish AI scans', color: 'text-accent' },
    { icon: Shield, label: 'Timestamp', desc: 'Hedera HCS proof', color: 'text-signal' },
    { icon: LinkIcon, label: 'Store', desc: 'Grove immutable', color: 'text-cyan-400' },
    { icon: Zap, label: 'Act', desc: 'Alert or trade', color: 'text-warn' },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-2">
      {steps.map((s, i) => (
        <div
          key={s.label}
          className={`flex items-center gap-3 sm:gap-2 proof-step reveal-delay-${i + 1}`}
        >
          <div className="flex flex-col items-center gap-1.5">
            <div className="stat-card flex h-14 w-14 items-center justify-center rounded-xl transition-transform hover:scale-110">
              <s.icon className={`h-6 w-6 ${s.color}`} />
            </div>
            <span className="text-[11px] font-semibold text-slate-300">{s.label}</span>
            <span className="text-[10px] text-slate-500">{s.desc}</span>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight
              className={`mb-6 h-4 w-4 text-edge-light proof-step reveal-delay-${i + 2}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

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

  return (
    <div className={`card group space-y-4 border-l-2 ${cat} !pl-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100 group-hover:text-white">
            {monitor.url.replace(/^https?:\/\//, '')}
          </p>
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

// ─── Landing Page Sections ───

function LandingHero({ onScrollToHow }: { onScrollToHow: () => void }) {
  return (
    <div className="reveal relative overflow-hidden rounded-3xl border border-edge/40 bg-hero-gradient px-8 py-14 text-center sm:px-12 sm:py-16">
      <div className="absolute inset-0 bg-glow-radial" />
      <div className="relative space-y-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-signal shadow-glow animate-glow-pulse">
          <Activity className="h-8 w-8 text-ink" />
        </div>
        <div className="space-y-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Signal Intelligence,{' '}
            <span className="bg-gradient-to-r from-accent via-violet to-signal bg-clip-text text-transparent">
              Proof-Chained
            </span>
          </h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-slate-400">
            Monitor GitHub repos and web sources for market-moving signals. Every detection carries
            an immutable <Tooltip term="HCS">Hedera timestamp</Tooltip> and{' '}
            <Tooltip term="Grove">Grove-stored</Tooltip> proof package — compliance-grade evidence
            that you saw it first.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link href="/monitors/new" className="btn">
            <Eye className="h-4 w-4" />
            Create Monitor
          </Link>
          <button className="btn-ghost" onClick={onScrollToHow}>
            <ArrowDown className="h-4 w-4" />
            See How It Works
          </button>
        </div>
      </div>
    </div>
  );
}

function CaseStudy() {
  return (
    <div className="reveal reveal-delay-1 space-y-6">
      <div className="text-center">
        <span className="badge bg-signal/15 text-signal">Real Case Study</span>
      </div>
      <div className="card overflow-hidden p-0">
        <div className="border-b border-edge/40 bg-ink-light/60 px-6 py-4 sm:px-8">
          <p className="text-sm font-semibold text-slate-200">
            The $ZEC halo2 bug: 4 days on GitHub before the market knew
          </p>
        </div>
        <div className="grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15">
                <Eye className="h-3.5 w-3.5 text-accent" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                1. Detection
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              On June 5, a commit landed in{' '}
              <span className="font-mono text-xs text-accent">zcash/halo2</span> changing the
              verifying key and anchoring a critical ECC multiplication base. Keywords like{' '}
              <em>&quot;verifying key&quot;</em>, <em>&quot;anchor&quot;</em>, and{' '}
              <em>&quot;security&quot;</em> were in the diff.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-signal/15">
                <Shield className="h-3.5 w-3.5 text-signal" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                2. Proof
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              A LENITNES monitor would have timestamped this via{' '}
              <Tooltip term="HCS">Hedera HCS</Tooltip> within seconds. The immutable{' '}
              <Tooltip term="proof chain">proof package</Tooltip> — commit screenshot, diff
              evidence, SHA — proves you saw it at T+0, not after the tweet.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warn/15">
                <Zap className="h-3.5 w-3.5 text-warn" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                3. Action
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              The bug was public on GitHub for{' '}
              <span className="font-semibold text-warn">4 days</span> while the market remained
              completely blind. A Kraken rule could have hedged ZEC exposure before the news broke.
              Bloomberg can&apos;t read git commits. We can.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-edge/40 bg-ink-light/40 px-6 py-3 sm:px-8">
          <div className="flex items-center gap-1.5 text-[10px] text-signal">
            <CheckCircle2 className="h-3 w-3" />
            <span className="font-semibold">Real commit: d8e48efd</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Clock className="h-3 w-3" />
            <span>Public: June 5, 2026</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <AlertTriangle className="h-3 w-3" />
            <span>4-day edge over market awareness</span>
          </div>
          <a
            href="https://github.com/zcash/halo2/commit/d8e48efddbe4746d76eb2c8a843a6ddc2b9a727a"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[10px] text-accent hover:text-accent/80"
          >
            <LinkIcon className="h-3 w-3" />
            View commit
          </a>
        </div>
      </div>
    </div>
  );
}

function PricingSection() {
  return (
    <div className="reveal reveal-delay-2 space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-bold text-white">Pay per signal, not per month</h2>
        <p className="mt-1 text-sm text-slate-500">
          No subscription. No credit card. Fund your monitor and pay only when it runs.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card group space-y-3 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-violet/10 transition-colors group-hover:bg-violet/20">
            <Coins className="h-5 w-5 text-violet" />
          </div>
          <h3 className="text-sm font-semibold text-slate-100">
            Stake <Tooltip term="ℏ">ℏ</Tooltip>
          </h3>
          <p className="text-xs leading-relaxed text-slate-400">
            Deposit HBAR into a per-monitor <Tooltip term="escrow">escrow</Tooltip>. Your funds stay
            on-chain and under your control.
          </p>
        </div>
        <div className="card group space-y-3 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 transition-colors group-hover:bg-accent/20">
            <Timer className="h-5 w-5 text-accent" />
          </div>
          <h3 className="text-sm font-semibold text-slate-100">~0.5ℏ per check</h3>
          <p className="text-xs leading-relaxed text-slate-400">
            Each automated check costs ~0.5 ℏ via <Tooltip term="x402">x402 micropayments</Tooltip>.
            Run every 5 minutes or once a day — you choose.
          </p>
        </div>
        <div className="card group space-y-3 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-signal/10 transition-colors group-hover:bg-signal/20">
            <Unlock className="h-5 w-5 text-signal" />
          </div>
          <h3 className="text-sm font-semibold text-slate-100">Withdraw anytime</h3>
          <p className="text-xs leading-relaxed text-slate-400">
            No lock-in period. Delete a monitor and remaining escrow returns to your wallet
            immediately.
          </p>
        </div>
      </div>
    </div>
  );
}

function TemplateGallery({
  onUseTemplate,
}: {
  onUseTemplate: (t: (typeof TEMPLATES)[number]) => void;
}) {
  return (
    <div className="reveal reveal-delay-1 space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-bold text-white">Start in 30 seconds</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick a template, connect your wallet, and you&apos;re monitoring. No config needed.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.title}
            onClick={() => onUseTemplate(t)}
            className="card group cursor-pointer space-y-3 text-left transition-all hover:border-accent/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.bg} transition-transform group-hover:scale-110`}
              >
                <t.icon className={`h-5 w-5 ${t.color}`} />
              </div>
              <ChevronRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 group-hover:text-white">
                {t.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.desc}</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <Clock className="h-3 w-3" />
              {t.frequency >= 3600 ? `Every ${t.frequency / 3600}h` : `Every ${t.frequency / 60}m`}
              <span className="text-edge-light">·</span>
              <Sparkles className="h-3 w-3" />
              Pre-configured
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function HowItWorks({ innerRef }: { innerRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div ref={innerRef} className="reveal reveal-delay-1 scroll-mt-24 space-y-8">
      <div className="text-center">
        <h2 className="text-lg font-bold text-white">How the proof chain works</h2>
        <p className="mt-1 text-sm text-slate-500">
          Four steps. Fully automated. Cryptographically verifiable.
        </p>
      </div>
      <ProofChainDiagram />
    </div>
  );
}

function FeatureCards() {
  return (
    <div className="reveal reveal-delay-2 grid gap-6 sm:grid-cols-3">
      {[
        {
          icon: Eye,
          title: 'AI Detection',
          desc: (
            <>
              <Tooltip term="TinyFish">TinyFish</Tooltip> natural-language web intelligence scans
              your targets for the exact conditions you describe — in plain English.
            </>
          ),
          accent: 'accent',
        },
        {
          icon: Shield,
          title: 'Hedera Timestamped',
          desc: (
            <>
              Every signal is written to <Tooltip term="HCS">Hedera Consensus Service</Tooltip> with
              a microsecond-accurate timestamp. Verifiable on HashScan by anyone.
            </>
          ),
          accent: 'signal',
        },
        {
          icon: Zap,
          title: 'Automated Action',
          desc: 'Connect webhooks, Telegram alerts, or Kraken trades — all triggered within seconds of detection. Zero manual intervention.',
          accent: 'warn',
        },
      ].map((f) => (
        <div key={f.title} className="card group space-y-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all group-hover:scale-110 ${
              f.accent === 'accent'
                ? 'bg-accent/10 text-accent group-hover:bg-accent/20'
                : f.accent === 'signal'
                  ? 'bg-signal/10 text-signal group-hover:bg-signal/20'
                  : 'bg-warn/10 text-warn group-hover:bg-warn/20'
            }`}
          >
            <f.icon className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-100">{f.title}</h3>
          <p className="text-xs leading-relaxed text-slate-400">{f.desc}</p>
        </div>
      ))}
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
          <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
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
        <div className="card space-y-4 p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <Eye className="h-7 w-7 text-accent" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-white">No monitors yet</p>
            <p className="text-sm text-slate-400">
              Create your first monitor to start watching for market signals.
            </p>
          </div>
          <Link href="/monitors/new" className="btn inline-flex">
            Create Monitor
          </Link>
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
  const { isConnected, executeWithPayment } = useWallet();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const howItWorksRef = useRef<HTMLDivElement>(null);
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
      } else {
        toast.error('Execution failed.');
      }
    } catch (e) {
      toast.error('Execution failed: ' + String(e));
    } finally {
      setExecuting((prev) => ({ ...prev, [monitorId]: false }));
    }
  }

  function handleUseTemplate(t: (typeof TEMPLATES)[number]) {
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
      <div ref={landingRef} className="space-y-20">
        <LandingHero
          onScrollToHow={() =>
            howItWorksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
        <CaseStudy />
        <PricingSection />
        <TemplateGallery onUseTemplate={handleUseTemplate} />
        <HowItWorks innerRef={howItWorksRef} />
        <FeatureCards />
        <div className="reveal text-center">
          <Link href="/monitors/new" className="btn">
            <Eye className="h-4 w-4" />
            Create Your First Monitor
          </Link>
          <p className="mt-3 text-xs text-slate-600">
            No credit card. Stake ℏ to run. Withdraw anytime.
          </p>
        </div>
      </div>
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
