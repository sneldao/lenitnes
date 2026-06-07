'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, burnRate, statusColor, type Monitor } from '@/lib/api';
import { useWallet } from '@/components/WalletConnect';
import {
  Activity,
  Shield,
  Zap,
  Eye,
  ArrowRight,
  ArrowDown,
  Clock,
  TrendingDown,
  Wallet,
  Play,
  Link as LinkIcon,
  GitCommit,
  FileText,
  Bell,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Sparkles,
} from 'lucide-react';

function useHasToken() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('storage', cb);
      return () => window.removeEventListener('storage', cb);
    },
    () => !!localStorage.getItem('lenitnes_token'),
    () => false,
  );
}

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
        <div key={s.label} className="flex items-center gap-3 sm:gap-2">
          <div className="flex flex-col items-center gap-1.5">
            <div className="stat-card flex h-14 w-14 items-center justify-center rounded-xl transition-transform hover:scale-105">
              <s.icon className={`h-6 w-6 ${s.color}`} />
            </div>
            <span className="text-[11px] font-semibold text-slate-300">{s.label}</span>
            <span className="text-[10px] text-slate-500">{s.desc}</span>
          </div>
          {i < steps.length - 1 && <ArrowRight className="mb-6 h-4 w-4 text-edge-light" />}
        </div>
      ))}
    </div>
  );
}

const TEMPLATES = [
  {
    icon: GitCommit,
    title: 'GitHub Security Watch',
    desc: 'Detect commits mentioning CVEs, vulnerabilities, or security patches in any repo.',
    url: 'https://github.com/ethereum/go-ethereum/commits/master',
    condition: 'A new commit mentions security, vulnerability, CVE, fix, or critical patch.',
    frequency: 3600,
    color: 'text-accent',
    bg: 'bg-accent/10',
  },
  {
    icon: FileText,
    title: 'Protocol Docs Change',
    desc: 'Watch when docs or changelogs update for breaking changes or new APIs.',
    url: 'https://docs.hedera.com/hedera/whats-new',
    condition: 'A new release, breaking change, deprecation, or migration guide is published.',
    frequency: 21600,
    color: 'text-signal',
    bg: 'bg-signal/10',
  },
  {
    icon: Bell,
    title: 'Exchange Status Monitor',
    desc: 'Get alerted the moment an exchange reports degraded performance or downtime.',
    url: 'https://status.kraken.com',
    condition: 'Any service shows degraded performance, partial outage, or maintenance.',
    frequency: 300,
    color: 'text-warn',
    bg: 'bg-warn/10',
  },
];

function BurnBar({ balance, daysLeft }: { balance: number; daysLeft: number }) {
  const pct = Math.min(100, Math.max(0, (daysLeft / 30) * 100));
  const color = daysLeft > 14 ? 'bg-signal' : daysLeft > 5 ? 'bg-warn' : 'bg-danger';
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-500">{balance.toFixed(1)} ℏ remaining</span>
        <span className="font-medium text-slate-400">
          {Number.isFinite(daysLeft) ? `${daysLeft.toFixed(0)}d left` : '∞'}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-edge/60">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [executing, setExecuting] = useState<Record<string, boolean>>({});
  const { isConnected, executeWithPayment } = useWallet();
  const hasToken = useHasToken();
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const {
    data: monitors = [],
    isLoading,
    error,
    isRefetching,
  } = useQuery({
    queryKey: ['monitors', hasToken],
    queryFn: () => api.listMonitors(),
    staleTime: 10_000,
    enabled: hasToken,
    retry: false,
  });

  async function handleExecute(monitorId: string) {
    if (!isConnected) {
      alert('Connect your Hedera wallet first to pay via x402.');
      return;
    }
    setExecuting((prev) => ({ ...prev, [monitorId]: true }));
    try {
      const res = await api.executeMonitor(monitorId, executeWithPayment);
      const data = await res.json();
      alert(data.ok ? 'Execution successful! Check signals for results.' : 'Execution failed.');
    } catch (e) {
      alert('Execution failed: ' + String(e));
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

  const activeCount = monitors.filter((m) => m.status === 'active').length;
  const triggeredCount = monitors.filter((m) => m.status === 'triggered').length;
  const totalBalance = monitors.reduce((s, m) => s + Number(m.hbar_balance), 0);

  if (!hasToken) {
    return (
      <div className="space-y-20">
        {/* ─── Hero ─── */}
        <div className="relative overflow-hidden rounded-3xl border border-edge/40 bg-hero-gradient px-8 py-14 text-center sm:px-12 sm:py-16">
          <div className="absolute inset-0 bg-glow-radial" />
          <div className="relative space-y-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-signal shadow-glow">
              <Activity className="h-8 w-8 text-ink" />
            </div>
            <div className="space-y-4">
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Signal Intelligence,{' '}
                <span className="bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent">
                  Proof-Chained
                </span>
              </h1>
              <p className="mx-auto max-w-xl text-base leading-relaxed text-slate-400">
                Monitor GitHub repos and web sources for market-moving signals. Every detection
                carries an immutable Hedera timestamp and Grove-stored proof package —
                compliance-grade evidence that you saw it first.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link href="/monitors/new" className="btn">
                <Eye className="h-4 w-4" />
                Create Monitor
              </Link>
              <button
                className="btn-ghost"
                onClick={() =>
                  howItWorksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                <ArrowDown className="h-4 w-4" />
                See How It Works
              </button>
            </div>
          </div>
        </div>

        {/* ─── Case Study ─── */}
        <div className="space-y-6">
          <div className="text-center">
            <span className="badge bg-accent/15 text-accent">Case Study</span>
          </div>
          <div className="card overflow-hidden p-0">
            <div className="border-b border-edge/40 bg-ink-light/60 px-6 py-4 sm:px-8">
              <p className="text-sm font-semibold text-slate-200">
                How a go-ethereum CVE was caught 47 minutes before CT
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
                  A LENITNES monitor watching{' '}
                  <span className="font-mono text-xs text-accent">go-ethereum/commits</span> flagged
                  a commit containing <em>&quot;consensus critical&quot;</em> and{' '}
                  <em>&quot;CVE-2024&quot;</em> in the message.
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
                  Within 8 seconds, a Hedera HCS message timestamped the detection at{' '}
                  <span className="font-mono text-xs text-slate-400">14:02:31.847 UTC</span>, and a
                  Grove proof package was stored immutably — screenshot, evidence, and hash.
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
                  A Telegram alert fired to the team&apos;s channel. A linked Kraken rule reduced
                  ETH exposure by 15%. Crypto Twitter didn&apos;t pick up the CVE for another{' '}
                  <span className="font-semibold text-warn">47 minutes</span>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 border-t border-edge/40 bg-ink-light/40 px-6 py-3 sm:px-8">
              <div className="flex items-center gap-1.5 text-[10px] text-signal">
                <CheckCircle2 className="h-3 w-3" />
                <span className="font-semibold">Verifiable on HashScan</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <Clock className="h-3 w-3" />
                <span>Detection to proof: 8 seconds</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <AlertTriangle className="h-3 w-3" />
                <span>47 min edge over public awareness</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Quick Start Templates ─── */}
        <div className="space-y-6">
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
                onClick={() => handleUseTemplate(t)}
                className="card group cursor-pointer space-y-3 text-left transition-all hover:border-accent/30 active:scale-[0.98]"
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.bg}`}>
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
                  {t.frequency >= 3600
                    ? `Every ${t.frequency / 3600}h`
                    : `Every ${t.frequency / 60}m`}
                  <span className="text-edge-light">·</span>
                  <Sparkles className="h-3 w-3" />
                  Pre-configured
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ─── How It Works ─── */}
        <div ref={howItWorksRef} className="scroll-mt-24 space-y-8">
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">How the proof chain works</h2>
            <p className="mt-1 text-sm text-slate-500">
              Four steps. Fully automated. Cryptographically verifiable.
            </p>
          </div>
          <ProofChainDiagram />
        </div>

        {/* ─── Feature Cards ─── */}
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: Eye,
              title: 'AI Detection',
              desc: 'TinyFish natural-language web intelligence scans your targets for the exact conditions you describe — in plain English.',
            },
            {
              icon: Shield,
              title: 'Hedera Timestamped',
              desc: 'Every signal is written to Hedera Consensus Service with a microsecond-accurate timestamp. Verifiable on HashScan by anyone.',
            },
            {
              icon: Zap,
              title: 'Automated Action',
              desc: 'Connect webhooks, Telegram alerts, or Kraken trades — all triggered within seconds of detection. Zero manual intervention.',
            },
          ].map((f) => (
            <div key={f.title} className="card group space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent/20">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100">{f.title}</h3>
              <p className="text-xs leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* ─── Bottom CTA ─── */}
        <div className="text-center">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {monitors.map((m) => {
          const { perDay, daysLeft } = burnRate(m);
          const bal = Number(m.hbar_balance);
          return (
            <div key={m.id} className="card group space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-100 group-hover:text-white">
                    {m.url.replace(/^https?:\/\//, '')}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{m.condition_text}</p>
                </div>
                <span className={`badge shrink-0 ${statusColor(m.status)}`}>
                  {m.status === 'active' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />
                  )}
                  {m.status.replace('_', ' ')}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="stat-card py-2 text-center">
                  <p className="text-[10px] text-slate-500">Balance</p>
                  <p className="text-xs font-semibold text-slate-200">{bal.toFixed(1)} ℏ</p>
                </div>
                <div className="stat-card py-2 text-center">
                  <p className="text-[10px] text-slate-500">Burn/day</p>
                  <p className="text-xs font-semibold text-slate-200">{perDay.toFixed(2)} ℏ</p>
                </div>
                <div className="stat-card py-2 text-center">
                  <p className="text-[10px] text-slate-500">Frequency</p>
                  <p className="text-xs font-semibold text-slate-200">
                    {m.frequency_seconds >= 3600
                      ? `${(m.frequency_seconds / 3600).toFixed(0)}h`
                      : `${(m.frequency_seconds / 60).toFixed(0)}m`}
                  </p>
                </div>
              </div>

              <BurnBar balance={bal} daysLeft={daysLeft} />

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                  <Clock className="h-3 w-3" />
                  {m.last_check_at
                    ? new Date(m.last_check_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'No checks yet'}
                </div>
                <button
                  onClick={() => handleExecute(m.id)}
                  disabled={executing[m.id] || !isConnected}
                  className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[10px] font-semibold text-accent transition-all hover:bg-accent/20 hover:shadow-glow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
                >
                  {executing[m.id] ? (
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
          );
        })}
      </div>
    </div>
  );
}
