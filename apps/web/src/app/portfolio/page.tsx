'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  ExternalLink,
  Loader2,
  AlertCircle,
  BarChart3,
} from 'lucide-react';
import { api } from '@/lib/api';

interface OpenPosition {
  id: string;
  asset: string;
  chain: string;
  direction: string;
  entry_amount: number;
  entry_price_usd: number | null;
  entry_tx_hash: string | null;
  opened_at: string;
  conviction_at_open: number | null;
  unrealized_pnl_pct: number | null;
}

interface ClosedPosition {
  id: string;
  asset: string;
  chain: string;
  direction: string;
  entry_amount: number;
  exit_amount: number;
  pnl_pct: number;
  pnl_usd: number;
  opened_at: string;
  closed_at: string;
  conviction_at_open: number | null;
}

interface PortfolioSummary {
  total_open_positions: number;
  total_closed_positions: number;
  realized_pnl_usd: number;
  win_rate: number | null;
  best_trade_pct: number | null;
  worst_trade_pct: number | null;
  avg_hold_time_hours: number | null;
}

interface PortfolioData {
  summary: PortfolioSummary;
  open: OpenPosition[];
  closed: ClosedPosition[];
}

function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function formatUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(4)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function explorerUrl(chain: string, txHash: string): string {
  if (chain === 'bsc' || chain === 'bnb') return `https://testnet.bscscan.com/tx/${txHash}`;
  return '#';
}

export default function PortfolioPage() {
  const { data, isLoading, isError } = useQuery<PortfolioData>({
    queryKey: ['portfolio'],
    queryFn: () => api.listPortfolio(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading portfolio...
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-center justify-center gap-3 text-red-400">
          <AlertCircle className="h-4 w-4" />
          Failed to load portfolio
        </div>
      </main>
    );
  }

  const { summary, open: openPositions, closed: closedPositions } = data;

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Portfolio</h1>
        <p className="mt-1 text-sm text-slate-400">
          {summary.total_open_positions} open · {summary.total_closed_positions} closed
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-edge/60 bg-panel p-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Wallet className="h-4 w-4" />
            Realized P&L
          </div>
          <p
            className={`mt-1 text-xl font-bold ${summary.realized_pnl_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            {formatUsd(summary.realized_pnl_usd)}
          </p>
        </div>

        <div className="rounded-xl border border-edge/60 bg-panel p-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <BarChart3 className="h-4 w-4" />
            Win Rate
          </div>
          <p className="mt-1 text-xl font-bold text-slate-100">
            {summary.win_rate !== null ? `${summary.win_rate.toFixed(0)}%` : '—'}
          </p>
        </div>

        <div className="rounded-xl border border-edge/60 bg-panel p-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <TrendingUp className="h-4 w-4" />
            Best Trade
          </div>
          <p className="mt-1 text-xl font-bold text-green-400">
            {summary.best_trade_pct !== null ? formatPct(summary.best_trade_pct) : '—'}
          </p>
        </div>

        <div className="rounded-xl border border-edge/60 bg-panel p-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Clock className="h-4 w-4" />
            Avg Hold
          </div>
          <p className="mt-1 text-xl font-bold text-slate-100">
            {summary.avg_hold_time_hours !== null
              ? `${Math.round(summary.avg_hold_time_hours)}h`
              : '—'}
          </p>
        </div>
      </div>

      {/* Open positions */}
      <h2 className="mb-3 text-lg font-semibold text-slate-200">Open Positions</h2>
      {openPositions.length === 0 ? (
        <div className="mb-8 rounded-xl border border-dashed border-edge/60 p-8 text-center text-sm text-slate-500">
          No open positions
        </div>
      ) : (
        <div className="mb-8 space-y-2">
          {openPositions.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-edge/60 bg-panel p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                  <TrendingUp className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {p.asset} · {p.direction.toUpperCase()}
                  </p>
                  <p className="text-xs text-slate-500">
                    {timeAgo(p.opened_at)}
                    {p.conviction_at_open ? ` · conviction ${p.conviction_at_open}` : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-200">{p.entry_amount} entry</p>
                {p.entry_tx_hash && (
                  <Link
                    href={explorerUrl(p.chain, p.entry_tx_hash)}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    {p.entry_tx_hash.slice(0, 10)}…
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Closed positions */}
      <h2 className="mb-3 text-lg font-semibold text-slate-200">Trade History</h2>
      {closedPositions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge/60 p-8 text-center text-sm text-slate-500">
          No closed trades yet
        </div>
      ) : (
        <div className="space-y-2">
          {closedPositions.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-edge/60 bg-panel p-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    p.pnl_usd >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                  }`}
                >
                  {p.pnl_usd >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-400" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">{p.asset}</p>
                  <p className="text-xs text-slate-500">
                    {timeAgo(p.closed_at)}
                    {p.conviction_at_open ? ` · conviction ${p.conviction_at_open}` : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`text-sm font-bold ${p.pnl_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  {formatPct(p.pnl_pct)}
                </p>
                <p
                  className={`text-xs ${p.pnl_usd >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}
                >
                  {formatUsd(p.pnl_usd)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
