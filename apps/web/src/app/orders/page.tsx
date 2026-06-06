'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [krakenStatus, setKrakenStatus] = useState<{
    configured: boolean;
    cliAvailable: boolean;
    fallback: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    krakenOrderId: string | null;
    note: string;
  } | null>(null);

  useEffect(() => {
    api
      .listOrders()
      .then(setOrders)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    api
      .krakenStatus()
      .then(setKrakenStatus)
      .catch(() => setKrakenStatus(null));
  }, []);

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

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-slate-400">Kraken trade history and paper-trade validation.</p>
        </div>
        <div className="flex items-center gap-3">
          {krakenStatus && (
            <span
              className={`badge text-[10px] ${
                krakenStatus.configured ? 'bg-signal/15 text-signal' : 'bg-danger/15 text-danger'
              }`}
            >
              {krakenStatus.configured ? 'Kraken keys configured' : 'Kraken keys missing'}
            </span>
          )}
          <button onClick={runPaperTrade} disabled={testing} className="btn text-xs">
            {testing ? 'Testing…' : 'Paper Trade'}
          </button>
        </div>
      </div>

      {testResult && (
        <div className={`card mb-6 ${testResult.ok ? 'border-signal/40' : 'border-danger/40'}`}>
          <p className="text-sm font-semibold">
            {testResult.ok ? 'Paper trade succeeded' : 'Paper trade failed'}
          </p>
          {testResult.krakenOrderId && (
            <p className="text-xs text-slate-400">Kraken order ID: {testResult.krakenOrderId}</p>
          )}
          <p className="text-xs text-slate-500">{testResult.note}</p>
        </div>
      )}

      {krakenStatus && (
        <div className="card mb-6">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-500">Integration mode</span>
              <p className="font-semibold text-slate-200">
                {krakenStatus.cliAvailable ? 'Kraken CLI' : `REST API (${krakenStatus.fallback})`}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Keys configured</span>
              <p className="font-semibold text-slate-200">
                {krakenStatus.configured ? 'Yes' : 'No'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Total orders</span>
              <p className="font-semibold text-slate-200">{orders.length}</p>
            </div>
          </div>
        </div>
      )}

      {loading && <p className="text-slate-400">Loading…</p>}
      {error && <p className="text-danger">{error}</p>}

      {!loading && !error && orders.length === 0 && (
        <div className="card text-center">
          <p className="text-slate-300">No orders yet.</p>
          <p className="mt-2 text-xs text-slate-500">
            Orders appear when a signal triggers a rule with action_type = &quot;trade&quot;.
          </p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-edge">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Monitor</th>
                <th className="px-4 py-3">Pair</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Volume</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Kraken ID</th>
                <th className="px-4 py-3">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-ink/50">
                  <td className="px-4 py-3">
                    <span className="truncate text-slate-200" title={o.monitor_url}>
                      {o.monitor_url.replace(/^https?:\/\//, '').slice(0, 30)}
                      {o.monitor_url.length > 30 ? '…' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{String(o.order_params.pair ?? '—')}</td>
                  <td className="px-4 py-3 text-slate-300">{String(o.order_params.type ?? '—')}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {String(o.order_params.volume ?? '—')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge text-[10px] ${
                        o.status === 'placed'
                          ? 'bg-signal/15 text-signal'
                          : o.status === 'failed'
                            ? 'bg-danger/15 text-danger'
                            : 'bg-slate-500/15 text-slate-400'
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {o.kraken_order_id ? o.kraken_order_id.slice(0, 12) + '…' : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {o.placed_at ? new Date(o.placed_at).toLocaleString() : '—'}
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
