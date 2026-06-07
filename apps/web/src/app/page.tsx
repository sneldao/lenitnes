'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, burnRate, statusColor, type Monitor } from '@/lib/api';
import { useWallet } from '@/components/WalletConnect';

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

export default function DashboardPage() {
  const [executing, setExecuting] = useState<Record<string, boolean>>({});
  const { isConnected, executeWithPayment } = useWallet();
  const hasToken = useHasToken();

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

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitors</h1>
          <p className="text-sm text-slate-400">Active watchers and their burn rate.</p>
        </div>
        <Link href="/monitors/new" className="btn">
          + New Monitor
        </Link>
      </div>

      {!hasToken && (
        <div className="card text-center">
          <p className="text-slate-300">Connect your Hedera wallet to view monitors.</p>
          <p className="mt-2 text-xs text-slate-500">
            Use the <strong>Connect Wallet</strong> button in the header.
          </p>
        </div>
      )}

      {hasToken && isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="mb-2 h-4 w-3/4 rounded bg-slate-700" />
              <div className="mb-4 h-8 rounded bg-slate-700" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-12 rounded-lg bg-slate-700" />
                <div className="h-12 rounded-lg bg-slate-700" />
                <div className="h-12 rounded-lg bg-slate-700" />
              </div>
            </div>
          ))}
        </div>
      )}
      {hasToken && error && error.message !== 'session_expired' && (
        <div className="card border-danger/40 text-danger">
          Could not reach API. Start the backend, then refresh.{' '}
          <span className="text-slate-500">({error.message})</span>
        </div>
      )}
      {hasToken && isRefetching && !isLoading && (
        <p className="mb-2 text-xs text-slate-500">Refreshing data…</p>
      )}

      {hasToken && !isLoading && !error && monitors.length === 0 && (
        <div className="card text-center">
          <p className="text-slate-300">No monitors yet.</p>
          <Link href="/monitors/new" className="btn mt-4">
            Create your first monitor
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {monitors.map((m) => {
          const { perDay, daysLeft } = burnRate(m);
          return (
            <div key={m.id} className="card">
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-100">{m.url}</span>
                <span className={`badge ${statusColor(m.status)}`}>
                  {m.status.replace('_', ' ')}
                </span>
              </div>
              <p className="mb-4 line-clamp-2 text-sm text-slate-400">{m.condition_text}</p>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <Stat label="Balance" value={`${Number(m.hbar_balance).toFixed(2)} ℏ`} />
                <Stat label="Burn / day" value={`${perDay.toFixed(2)} ℏ`} />
                <Stat
                  label="Days left"
                  value={Number.isFinite(daysLeft) ? daysLeft.toFixed(1) : '∞'}
                />
              </dl>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Last check: {m.last_check_at ? new Date(m.last_check_at).toLocaleString() : '—'}
                </span>
                <button
                  onClick={() => handleExecute(m.id)}
                  disabled={executing[m.id] || !isConnected}
                  className="rounded bg-accent/80 px-2 py-1 text-[10px] font-bold text-white hover:bg-accent disabled:opacity-50"
                >
                  {executing[m.id] ? 'Running…' : 'Execute'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-edge bg-ink p-2">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-100">{value}</dd>
    </div>
  );
}
