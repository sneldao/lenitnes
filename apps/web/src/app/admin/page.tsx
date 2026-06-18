'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Activity,
  Zap,
  Target,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Database,
} from 'lucide-react';
import { api, type AdminStatusResponse } from '@/lib/api';

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [keySubmitted, setKeySubmitted] = useState(false);
  const queryClient = useQueryClient();

  const status = useQuery<AdminStatusResponse>({
    queryKey: ['admin', 'status', adminKey],
    queryFn: () => api.getAdminStatus(adminKey),
    enabled: keySubmitted && adminKey.length > 0,
    refetchInterval: 30_000,
    retry: false,
  });

  const invalidateAll = useMutation({
    mutationFn: () => api.invalidateAllCache(adminKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scorecard'] });
    },
  });

  const invalidateScorecard = useMutation({
    mutationFn: () => api.invalidateCache(adminKey, 'scorecard:'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scorecard'] });
    },
  });

  if (!keySubmitted) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <div className="card">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-accent/15 p-2.5">
              <Shield className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-100">Operator surface</h1>
              <p className="text-xs text-slate-500">
                Single-person admin — set the X-Admin-Key to view system status.
              </p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setKeySubmitted(true);
            }}
            className="space-y-3"
          >
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Admin key"
              className="input w-full text-sm"
              autoFocus
            />
            <button
              type="submit"
              disabled={adminKey.length === 0}
              className="btn w-full justify-center py-2 text-xs"
            >
              Open dashboard
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (status.isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading system status…
        </div>
      </main>
    );
  }

  if (status.isError) {
    const message = status.error instanceof Error ? status.error.message : 'unknown error';
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <div className="card border-danger/30 text-danger">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5" />
            <div>
              <h2 className="text-base font-semibold">Could not load status</h2>
              <p className="mt-1 text-sm opacity-80">{message}</p>
              <p className="mt-2 font-mono text-[10px] opacity-60">
                Check that ADMIN_API_KEY matches the API env, and that the API is up.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!status.data) {
    return null;
  }

  const d = status.data;
  const budgetPct = d.agent.dailyBudgetUsd > 0 ? d.agent.dailySpendUsd / d.agent.dailyBudgetUsd : 0;
  const budgetWarn = budgetPct >= 0.8;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-accent">
            operator surface
          </p>
          <h1 className="font-display text-2xl font-semibold text-slate-100">System status</h1>
        </div>
        <button
          onClick={() => status.refetch()}
          className="flex items-center gap-1.5 rounded-lg border border-edge/40 px-3 py-1.5 text-[10px] text-slate-400 transition-colors hover:border-edge-light hover:text-slate-200"
        >
          <RefreshCcw className="h-3 w-3" />
          Refresh
        </button>
      </header>

      {/* ── Budget bar ── */}
      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-accent" />
            Agent daily budget
          </h2>
          <span className={`font-mono text-xs ${budgetWarn ? 'text-danger' : 'text-slate-400'}`}>
            ${d.agent.dailySpendUsd.toFixed(4)} / ${d.agent.dailyBudgetUsd.toFixed(2)}
          </span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-edge/30">
          <div
            className={`absolute inset-y-0 left-0 ${budgetWarn ? 'bg-danger' : 'bg-accent'}`}
            style={{ width: `${Math.min(budgetPct * 100, 100)}%` }}
          />
        </div>
        {budgetWarn && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-danger">
            <AlertTriangle className="h-3 w-3" />
            Budget ≥ 80% — agent calls will start failing soon
          </p>
        )}
      </section>

      {/* ── Counts grid ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Activity} label="Signals (24h)" value={d.signals.last24h.toString()} />
        <Stat icon={Activity} label="Signals (7d)" value={d.signals.last7d.toString()} />
        <Stat icon={Target} label="Agent scores (24h)" value={d.agent.scoresLast24h.toString()} />
        <Stat icon={Zap} label="Trades (all-time)" value={d.trades.filledAllTime.toString()} />
      </section>

      {/* ── Treasury + cache control ── */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-accent" />
            Treasury
          </h2>
          <dl className="space-y-2 font-mono text-xs">
            <Row label="Active wallets" value={d.treasury.activeWallets.toString()} />
            <Row label="Default chain" value={d.treasury.defaultChain} />
            <Row label="Default mode" value={d.treasury.defaultMode} />
          </dl>
        </div>
        <div className="card">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-accent" />
            Cache control
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Manual cache flush. The loop invalidates the scorecard cache automatically on every new
            signal, so this is for edge cases (stale recent-calls, etc).
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => invalidateScorecard.mutate()}
              disabled={invalidateScorecard.isPending}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-edge/40 px-3 py-2 text-xs transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-40"
            >
              {invalidateScorecard.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCcw className="h-3 w-3" />
              )}
              Invalidate scorecard
            </button>
            <button
              onClick={() => invalidateAll.mutate()}
              disabled={invalidateAll.isPending}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-edge/40 px-3 py-2 text-xs transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-40"
            >
              {invalidateAll.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCcw className="h-3 w-3" />
              )}
              Invalidate ALL
            </button>
            {(invalidateScorecard.isSuccess || invalidateAll.isSuccess) && (
              <p className="flex items-center gap-1.5 text-[10px] text-signal">
                <CheckCircle2 className="h-3 w-3" />
                Cache flushed
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Latest signal ── */}
      {d.signals.latestAt && (
        <section className="card">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-accent" />
            Latest signal
          </h2>
          <dl className="space-y-2 font-mono text-xs">
            <Row label="Detected" value={new Date(d.signals.latestAt).toLocaleString()} />
            <Row label="ID" value={d.signals.latestId ?? '—'} mono />
          </dl>
        </section>
      )}
    </main>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="font-mono text-2xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-slate-200 ${mono ? 'font-mono' : ''} truncate`}>{value}</dd>
    </div>
  );
}
