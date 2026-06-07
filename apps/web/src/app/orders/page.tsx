'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { TrendingUp, Check, X, Play, Settings, Hash, ArrowUpRight, Clock, Zap } from 'lucide-react';

interface Order {
  id: string;
  kraken_order_id: string | null;
  order_params: Record<string, unknown>;
  status: string;
  placed_at: string | null;
  kraken_response: Record<string, unknown> | null;
  signal_id: string;
  detected_at: string;
  monitor_id: string;
  monitor_url: string;
}

export default function OrdersPage() {
  const { isAuthenticated } = useAuth();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    krakenOrderId: string | null;
    note: string;
  } | null>(null);

  const {
    data: orders = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.listOrders(),
    enabled: isAuthenticated,
  });
  const { data: krakenStatus } = useQuery({
    queryKey: ['krakenStatus'],
    queryFn: () => api.krakenStatus(),
    retry: 1,
    enabled: isAuthenticated,
  });

  async function runPaperTrade() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.krakenTestTrade({ pair: 'XBTUSD', type: 'buy', volume: '0.0001' });
      setTestResult({ ok: res.ok, krakenOrderId: res.krakenOrderId, note: res.note });
    } catch (e) {
      setTestResult({ ok: false, krakenOrderId: null, note: String(e) });
    } finally {
      setTesting(false);
    }
  }

  const placedCount = orders.filter((o) => o.status === 'placed').length;
  const failedCount = orders.filter((o) => o.status === 'failed').length;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Orders</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kraken trade history and paper-trade validation
          </p>
        </div>
        <div className="flex items-center gap-3">
          {krakenStatus && (
            <span
              className={`badge ${
                krakenStatus.configured ? 'bg-signal/15 text-signal' : 'bg-danger/15 text-danger'
              }`}
            >
              {krakenStatus.configured ? (
                <>
                  <Check className="h-3 w-3" /> Connected
                </>
              ) : (
                <>
                  <X className="h-3 w-3" /> Keys missing
                </>
              )}
            </span>
          )}
          <button onClick={runPaperTrade} disabled={testing} className="btn text-xs">
            {testing ? (
              <span className="animate-pulse">Testing…</span>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Paper Trade
              </>
            )}
          </button>
        </div>
      </div>

      {testResult && (
        <div
          className={`card ${testResult.ok ? 'border-signal/30 bg-signal/5' : 'border-danger/30 bg-danger/5'}`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${testResult.ok ? 'bg-signal/20' : 'bg-danger/20'}`}
            >
              {testResult.ok ? (
                <Check className="h-4 w-4 text-signal" />
              ) : (
                <X className="h-4 w-4 text-danger" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">
                {testResult.ok ? 'Paper trade succeeded' : 'Paper trade failed'}
              </p>
              {testResult.krakenOrderId && (
                <p className="font-mono text-xs text-slate-500">ID: {testResult.krakenOrderId}</p>
              )}
              <p className="text-xs text-slate-500">{testResult.note}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="stat-card space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-accent" />
            <span className="section-title">Total</span>
          </div>
          <p className="text-2xl font-bold text-white">{orders.length}</p>
        </div>
        <div className="stat-card space-y-1">
          <div className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-signal" />
            <span className="section-title">Placed</span>
          </div>
          <p className="text-2xl font-bold text-white">{placedCount}</p>
        </div>
        <div className="stat-card space-y-1">
          <div className="flex items-center gap-2">
            <X className="h-3.5 w-3.5 text-danger" />
            <span className="section-title">Failed</span>
          </div>
          <p className="text-2xl font-bold text-white">{failedCount}</p>
        </div>
        <div className="stat-card space-y-1">
          <div className="flex items-center gap-2">
            <Settings className="h-3.5 w-3.5 text-slate-400" />
            <span className="section-title">Mode</span>
          </div>
          <p className="text-sm font-semibold text-white">
            {krakenStatus?.cliAvailable ? 'CLI' : (krakenStatus?.fallback ?? '—')}
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card animate-pulse py-4">
              <div className="flex gap-4">
                <div className="h-4 w-1/4 rounded bg-edge" />
                <div className="h-4 w-1/6 rounded bg-edge/60" />
                <div className="h-4 w-1/6 rounded bg-edge/40" />
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="card border-danger/30 bg-danger/5">
          <p className="text-sm text-danger">{error.message}</p>
        </div>
      )}

      {!isLoading && !error && orders.length === 0 && (
        <div className="card space-y-3 p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <TrendingUp className="h-7 w-7 text-accent" />
          </div>
          <p className="text-lg font-semibold text-white">No orders yet</p>
          <p className="text-sm text-slate-400">
            Orders appear when a signal triggers a rule with trade execution.
          </p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-edge/40 shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-light/80">
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-semibold">Monitor</th>
                <th className="px-5 py-3 font-semibold">Pair</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Volume</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Kraken ID</th>
                <th className="px-5 py-3 font-semibold">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/30">
              {orders.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-panel-hover/50">
                  <td className="px-5 py-3.5">
                    <span className="truncate text-sm text-slate-200" title={o.monitor_url}>
                      {o.monitor_url.replace(/^https?:\/\//, '').slice(0, 30)}
                      {o.monitor_url.length > 30 ? '…' : ''}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-300">
                    {String(o.order_params.pair ?? '—')}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`badge ${String(o.order_params.type) === 'buy' ? 'bg-signal/15 text-signal' : 'bg-danger/15 text-danger'}`}
                    >
                      <ArrowUpRight className="h-3 w-3" />
                      {String(o.order_params.type ?? '—')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-300">
                    {String(o.order_params.volume ?? '—')}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`badge ${
                        o.status === 'placed'
                          ? 'bg-signal/15 text-signal'
                          : o.status === 'failed'
                            ? 'bg-danger/15 text-danger'
                            : 'bg-slate-500/15 text-slate-400'
                      }`}
                    >
                      {o.status === 'placed' && <Check className="h-3 w-3" />}
                      {o.status === 'failed' && <X className="h-3 w-3" />}
                      {o.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs text-slate-500">
                      {o.kraken_order_id ? o.kraken_order_id.slice(0, 12) + '…' : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3 w-3" />
                      {o.placed_at
                        ? new Date(o.placed_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
