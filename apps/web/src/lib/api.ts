// Thin client for the LENITNES backend API.

import type { Monitor, MonitorStatus, Signal, SignalDetail } from '@lenitnes/types';

const BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new Error('session_expired');
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export { type Monitor, type MonitorStatus, type Signal, type SignalDetail };

export interface AuthUser {
  id: string;
  wallet_address: string;
  email: string | null;
}

export const api = {
  login: async (params: {
    walletAddress: string;
    publicKey: string;
    message: string;
    signature: string;
    email?: string;
  }) => {
    return req<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        walletAddress: params.walletAddress,
        publicKey: params.publicKey,
        message: params.message,
        signature: params.signature,
        email: params.email,
      }),
    });
  },
  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => req<AuthUser>('/auth/me'),

  listMonitors: () => req<Monitor[]>(`/monitors`),
  getMonitor: (id: string) => req<Monitor & { signals: Signal[] }>(`/monitors/${id}`),
  createMonitor: (body: {
    url: string;
    conditionText: string;
    frequencySeconds?: number;
    screenshotsEnabled?: boolean;
    isPublic?: boolean;
    confidenceThreshold?: number;
    assetMapping?: {
      coingeckoId?: string;
      tokenizedStock?: string;
      direction?: 'long' | 'short' | 'both';
    };
  }) => req<Monitor>(`/monitors`, { method: 'POST', body: JSON.stringify(body) }),
  deleteMonitor: (id: string) => req<{ ok: boolean }>(`/monitors/${id}`, { method: 'DELETE' }),
  triggerCheck: (id: string) =>
    req<{ ok: boolean; signalId: string | null }>(`/monitors/${id}/first-check`, {
      method: 'POST',
    }),
  listSignals: (monitorId?: string, includeHeartbeats?: boolean) => {
    const params = new URLSearchParams();
    if (monitorId) params.set('monitorId', monitorId);
    if (includeHeartbeats) params.set('includeHeartbeats', 'true');
    const qs = params.toString();
    return req<Signal[]>(`/signals${qs ? `?${qs}` : ''}`);
  },
  getSignal: (id: string) => req<SignalDetail>(`/signals/${id}`),
  getPublicProof: (id: string, shareToken?: string) =>
    req<SignalDetail>(
      `/proof/public/${id}${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''}`,
    ),

  listOrders: () =>
    req<
      Array<{
        id: string;
        order_params: Record<string, unknown>;
        status: string;
        placed_at: string | null;
        cancelled_at: string | null;
        signal_id: string;
        detected_at: string;
        monitor_id: string;
        monitor_url: string;
      }>
    >('/orders'),

  // DLQ admin — for inspecting/replaying stuck monitor check jobs.
  listDlq: (limit = 50) =>
    req<{
      depth: number;
      jobs: Array<{ monitorId: string; finalError: string; attemptsMade: number; movedAt: string }>;
    }>(`/dlq?limit=${limit}`),
  replayDlqJob: (jobId: string) =>
    req<{ ok: boolean }>(`/dlq/${encodeURIComponent(jobId)}/replay`, { method: 'POST' }),
  discardDlqJob: (jobId: string) =>
    req<{ ok: boolean }>(`/dlq/${encodeURIComponent(jobId)}`, { method: 'DELETE' }),

  getBacktestStats: (filters?: { detectorType?: string; asset?: string }) => {
    const params = new URLSearchParams();
    if (filters?.detectorType) params.set('detector', filters.detectorType);
    if (filters?.asset) params.set('asset', filters.asset);
    const qs = params.toString();
    return req<
      Array<{
        detector_type: string;
        asset: string;
        total_signals: number;
        correct_count: number;
        accuracy: string;
        avg_pct_change: string;
        median_pct_change: string;
        avg_abs_return: string;
        sharpe_estimate: string;
        best_window: number | null;
      }>
    >(`/backtest/stats${qs ? `?${qs}` : ''}`);
  },
  getSignalOutcomes: (signalId: string) =>
    req<
      Array<{
        asset: string;
        window_seconds: number;
        price_at_signal: string;
        price_after: string;
        pct_change: string;
        direction: string;
      }>
    >(`/backtest/signals/${signalId}/outcomes`),
  triggerBacktest: () =>
    req<{ ok: boolean; processed: number; errors: number }>('/backtest/process', {
      method: 'POST',
    }),

  // Public scorecard (Day 7) — replaces the per-user leaderboard
  getScorecard: () => req<ScorecardResponse>(`/scorecard`),
  getScorecardRecent: (limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return req<ScorecardRecentCall[]>(`/scorecard/recent${qs}`);
  },

  // Operator admin surface (Day 8) — X-Admin-Key header required
  getAdminStatus: (adminKey: string) =>
    req<AdminStatusResponse>(`/admin/status`, {
      headers: { 'X-Admin-Key': adminKey },
    }),
  invalidateCache: (adminKey: string, pattern: string) =>
    req<{ ok: boolean; pattern: string; invalidatedAt: string }>(
      `/admin/cache/invalidate?pattern=${encodeURIComponent(pattern)}`,
      { method: 'POST', headers: { 'X-Admin-Key': adminKey } },
    ),
  invalidateAllCache: (adminKey: string) =>
    req<{ ok: boolean; invalidatedAt: string }>(`/admin/cache/invalidate-all`, {
      method: 'POST',
      headers: { 'X-Admin-Key': adminKey },
    }),

  // Portfolio
  listPortfolio: () =>
    req<{
      summary: PortfolioSummary;
      open: OpenPosition[];
      closed: ClosedPosition[];
    }>(`/portfolio`),
};

// ── Portfolio types ──────────────────────────────────────────

export interface PortfolioSummary {
  total_open_positions: number;
  total_closed_positions: number;
  realized_pnl_usd: number;
  win_rate: number | null;
  best_trade_pct: number | null;
  worst_trade_pct: number | null;
  avg_hold_time_hours: number | null;
}

export interface OpenPosition {
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

export interface ClosedPosition {
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

// ── Scorecard types (Day 7) ──────────────────────────────────

export interface ScorecardRecentCallOutcome {
  t1h: number | null;
  t1d: number | null;
  t7d: number | null;
}

export interface ScorecardRecentCall {
  signalId: string;
  detectedAt: string;
  monitorUrl: string;
  detectorTypes: string[];
  conviction: number | null;
  thesis: string | null;
  recommendedAction: 'long' | 'short' | 'none' | null;
  tradeTxHash: string | null;
  outcomes: ScorecardRecentCallOutcome;
}

export interface ScorecardBySignalType {
  detectorType: string;
  total: number;
  hits: number;
  hitRatio: number;
}

export interface ScorecardByWatchlist {
  monitorId: string;
  url: string;
  total: number;
  hits: number;
  hitRatio: number;
}

export interface ScorecardResponse {
  totalSignals: number;
  totalTrades: number;
  hitRatio: number;
  cumulativePnlUsd: number;
  sharpe: number;
  maxDrawdownUsd: number;
  bySignalType: ScorecardBySignalType[];
  byWatchlist: ScorecardByWatchlist[];
  recentCalls: ScorecardRecentCall[];
  generatedAt: string;
}

// ── Admin types (Day 8) ─────────────────────────────────────

export interface AdminStatusResponse {
  signals: {
    last24h: number;
    last7d: number;
    latestAt: string | null;
    latestId: string | null;
  };
  agent: {
    scoresLast24h: number;
    dailySpendUsd: number;
    dailyBudgetUsd: number;
  };
  trades: {
    filledAllTime: number;
  };
  treasury: {
    activeWallets: number;
    defaultChain: string;
    defaultMode: string;
  };
}

// Helpers — re-exported from @/lib/format for backward compatibility.
export { burnRate, statusColor } from '@/lib/format';
