'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import {
  TrendingUp,
  Check,
  X,
  Play,
  Clock,
  ArrowUpRight,
  RefreshCw,
  Ban,
  Loader,
  Search,
} from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-500/15 text-slate-400',
  placed: 'bg-accent/15 text-accent',
  filled: 'bg-signal/15 text-signal',
  partially_filled: 'bg-warn/15 text-warn',
  cancelled: 'bg-slate-500/15 text-slate-400',
  failed: 'bg-danger/15 text-danger',
  expired: 'bg-slate-500/15 text-slate-500',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`}>
      {status === 'placed' && <ArrowUpRight className="h-3 w-3" />}
      {status === 'filled' && <Check className="h-3 w-3" />}
      {status === 'failed' && <X className="h-3 w-3" />}
      {status === 'cancelled' && <Ban className="h-3 w-3" />}
      {status.replace('_', ' ')}
    </span>
  );
}

/* ── Reusable Filter Chip ───────────────────────────────────── */

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer select-none ${
        active
          ? 'bg-accent/10 text-accent shadow-glow-sm'
          : 'text-slate-500 hover:text-slate-300 hover:bg-edge/40'
      }`}
    >
      {children}
    </button>
  );
}

function fillData(response: Record<string, unknown> | null) {
  if (!response) return null;
  const price = response.price as string | undefined;
  const cost = response.cost as string | undefined;
  const volExec = response.vol_exec as string | undefined;
  if (!price || !volExec || Number(volExec) === 0) return null;
  return { avgPrice: Number(price), cost: Number(cost ?? 0), volExec: Number(volExec) };
}

export default function OrdersPage() {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
    refetchInterval: 15_000,
  });

  useQuery({
    queryKey: ['orders-sync'],
    queryFn: () => api.syncOrders().catch(() => ({ synced: 0, updated: 0 })),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const { data: krakenStatus, isLoading: krakenLoading } = useQuery({
    queryKey: ['krakenStatus'],
    queryFn: () => api.krakenStatus(),
    retry: 1,
    enabled: isAuthenticated,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelOrder(id),
    onSuccess: () => {
      toast.success('Order cancelled');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: Error) => toast.error(e.message),
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

  // ── Filters ──────────────────────────────────────────────────

  type OrderStatusFilter =
    | 'all'
    | 'pending'
    | 'placed'
    | 'filled'
    | 'partially_filled'
    | 'cancelled'
    | 'failed'
    | 'expired';

  type TimeFilter = 'all' | 'today' | '7d' | '30d';

  const STATUS_FILTERS: { key: OrderStatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'placed', label: 'Open' },
    { key: 'filled', label: 'Filled' },
    { key: 'partially_filled', label: 'Part Filled' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'failed', label: 'Failed' },
    { key: 'expired', label: 'Expired' },
  ];

  const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
    { key: 'all', label: 'All time' },
    { key: 'today', label: 'Today' },
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
  ];

  type OrderTypeFilter = 'all' | 'buy' | 'sell';

  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [typeFilter, setTypeFilter] = useState<OrderTypeFilter>('all');
  const [searchPair, setSearchPair] = useState('');

  const hasActiveFilter =
    statusFilter !== 'all' || timeFilter !== 'all' || typeFilter !== 'all' || searchPair !== '';

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      // Status filter
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;

      // Time filter
      if (timeFilter !== 'all') {
        const placed = o.placed_at ? new Date(o.placed_at).getTime() : null;
        if (!placed) return false;
        const now = Date.now();
        const ms =
          timeFilter === 'today'
            ? 86_400_000
            : timeFilter === '7d'
              ? 7 * 86_400_000
              : 30 * 86_400_000;
        if (now - placed > ms) return false;
      }

      // Type filter (buy / sell)
      if (typeFilter !== 'all') {
        const orderType = String(o.order_params.type ?? '').toLowerCase();
        if (orderType !== typeFilter) return false;
      }

      // Pair search
      if (searchPair) {
        const pair = String(o.order_params.pair ?? '').toLowerCase();
        if (!pair.includes(searchPair.toLowerCase())) return false;
      }

      return true;
    });
  }, [orders, statusFilter, timeFilter, typeFilter, searchPair]);

  const placedCount = orders.filter((o) => o.status === 'placed').length;
  const filledCount = orders.filter(
    (o) => o.status === 'filled' || o.status === 'partially_filled',
  ).length;
  const failedCount = orders.filter((o) => o.status === 'failed').length;
  const totalCost = orders.reduce((sum, o) => {
    const fd = fillData(o.kraken_response);
    return sum + (fd?.cost ?? 0);
  }, 0);

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
          {krakenLoading ? (
            <span className="badge bg-slate-500/15 text-slate-400">
              <Loader className="h-3 w-3 animate-spin" /> Checking…
            </span>
          ) : krakenStatus ? (
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
          ) : null}
          <button
            onClick={async () => {
              setSyncing(true);
              try {
                await queryClient.refetchQueries({ queryKey: ['orders'] });
                toast.success('Orders synced from Kraken');
              } catch {
                toast.error('Sync failed. Check your Kraken connection.');
              } finally {
                setSyncing(false);
              }
            }}
            className="btn text-xs"
            disabled={syncing}
            title="Sync order statuses from Kraken"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
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

      <div className="flex flex-wrap items-center rounded-2xl border border-edge/50 bg-ink-light/40 px-1 backdrop-blur-sm">
        {[
          { label: 'Total', value: orders.length, color: 'text-slate-300' },
          { label: 'Open', value: placedCount, color: 'text-accent', pulse: placedCount > 0 },
          { label: 'Filled', value: filledCount, color: 'text-signal' },
          {
            label: 'Failed',
            value: failedCount,
            color: failedCount > 0 ? 'text-danger' : 'text-slate-600',
          },
          {
            label: 'Cost',
            value:
              totalCost > 0
                ? `$${totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                : '—',
            color: 'text-warn',
          },
        ].map((s, i, arr) => (
          <div key={s.label} className="flex items-stretch">
            <div className="flex items-center gap-3 px-5 py-3.5">
              {s.pulse && <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-slate-600">
                  {s.label}
                </p>
                <p
                  className={`font-mono text-lg font-semibold tabular-nums leading-none ${s.color}`}
                >
                  {s.value}
                </p>
              </div>
            </div>
            {i < arr.length - 1 && <div className="w-px self-stretch bg-edge/60 my-2" />}
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      {!isLoading && orders.length > 0 && (
        <div className="space-y-3">
          {/* Status filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="section-title mr-1">Status</span>
            {STATUS_FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                active={statusFilter === f.key}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
          {/* Time range filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="section-title mr-1">Time</span>
            {TIME_FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                active={timeFilter === f.key}
                onClick={() => setTimeFilter(f.key)}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
          {/* Type filter (buy / sell) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="section-title mr-1">Type</span>
            <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
              All
            </FilterChip>
            <FilterChip active={typeFilter === 'buy'} onClick={() => setTypeFilter('buy')}>
              <TrendingUp className="h-2.5 w-2.5 text-signal" />
              Buy
            </FilterChip>
            <FilterChip active={typeFilter === 'sell'} onClick={() => setTypeFilter('sell')}>
              <TrendingUp className="h-2.5 w-2.5 rotate-180 text-danger" />
              Sell
            </FilterChip>
          </div>
          {/* Pair search + clear */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px] max-w-[240px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
              <input
                type="text"
                value={searchPair}
                onChange={(e) => setSearchPair(e.target.value)}
                placeholder="Search pair…"
                className="w-full rounded-lg border border-edge/40 bg-ink-light/50 py-1.5 pl-7 pr-2.5 text-[11px] text-slate-300 outline-none transition-colors placeholder:text-slate-600 focus:border-accent/40 focus:bg-ink-light"
              />
            </div>
            {hasActiveFilter && (
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setTimeFilter('all');
                  setTypeFilter('all');
                  setSearchPair('');
                }}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-300 hover:bg-edge/40 transition-all cursor-pointer select-none"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filtered count indicator */}
      {!isLoading && orders.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span>
            Showing <span className="text-slate-300 font-medium">{filtered.length}</span>
            {hasActiveFilter && (
              <>
                {' '}
                of <span className="text-slate-400">{orders.length}</span>
              </>
            )}{' '}
            order{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="divide-y divide-edge/30 overflow-hidden rounded-xl border border-edge/50 bg-ink-light/30">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse px-5 py-4">
              <div className="h-4 w-1/4 rounded bg-edge" />
              <div className="h-4 w-1/6 rounded bg-edge/60" />
              <div className="h-4 w-1/6 rounded bg-edge/40" />
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
        <div className="relative overflow-hidden rounded-2xl border border-edge/40 bg-ink-light/30 px-8 py-12">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
          <div className="flex items-start gap-6">
            <div className="shrink-0 pt-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/5">
                <TrendingUp className="h-4 w-4 text-accent/60" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-slate-200">No orders yet</p>
              <p className="text-sm text-slate-500">
                Orders appear when a signal triggers a rule with trade execution.
              </p>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 && hasActiveFilter && (
        <p className="py-6 text-center font-mono text-sm text-slate-600">
          no orders match these filters —{' '}
          <button
            onClick={() => {
              setStatusFilter('all');
              setTimeFilter('all');
              setTypeFilter('all');
              setSearchPair('');
            }}
            className="text-accent underline-offset-2 hover:underline"
          >
            clear
          </button>
        </p>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-edge/40 shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-light/80">
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-semibold">Monitor</th>
                <th className="px-5 py-3 font-semibold">Pair</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Volume</th>
                <th className="px-5 py-3 font-semibold">Avg Price</th>
                <th className="px-5 py-3 font-semibold">Cost</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Kraken ID</th>
                <th className="px-5 py-3 font-semibold">Placed</th>
                <th className="px-5 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/30">
              {filtered.map((o) => (
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
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-300">
                    {fillData(o.kraken_response)?.avgPrice.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    }) ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-300">
                    {fillData(o.kraken_response)?.cost.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    }) ?? '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={o.status} />
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
                  <td className="px-5 py-3.5">
                    {o.status === 'placed' && (
                      <button
                        className="text-xs text-danger hover:text-danger/80 transition-colors"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(o.id)}
                        title="Cancel order"
                      >
                        {cancelMutation.isPending ? (
                          <Loader className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
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
