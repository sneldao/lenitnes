// Thin client for the LENITNES backend API.

import type {
  Monitor,
  MonitorStatus,
  Signal,
  SignalDetail,
  LeaderboardResponse,
} from '@lenitnes/types';

/** Inlined to avoid Docker workspace resolution issues with @lenitnes/types */
interface HunterDetail {
  user_id: string;
  wallet_address: string;
  email: string | null;
  display_name: string | null;
  total_signals: number;
  chain_completed: number;
  accuracy: string | null;
  streak: number;
  top_pair: string | null;
  last_signal_at: string | null;
}

interface HunterDetailResponse {
  hunter: HunterDetail;
  signals: Signal[];
}

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

export {
  type Monitor,
  type MonitorStatus,
  type Signal,
  type SignalDetail,
  type LeaderboardResponse,
};

export type { HunterDetail, HunterDetailResponse };

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
      krakenPair?: string;
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
      {
        id: string;
        kraken_order_id: string | null;
        order_params: Record<string, unknown>;
        status: string;
        placed_at: string | null;
        cancelled_at: string | null;
        kraken_response: Record<string, unknown> | null;
        signal_id: string;
        detected_at: string;
        monitor_id: string;
        monitor_url: string;
      }[]
    >('/orders'),
  syncOrders: () => req<{ synced: number; updated: number }>('/orders/sync'),
  cancelOrder: (id: string) => req<{ ok: boolean }>(`/orders/${id}/cancel`, { method: 'POST' }),

  krakenConfigure: (body: { apiKey: string; apiSecret: string }) =>
    req<{ ok: boolean }>('/kraken/configure', { method: 'POST', body: JSON.stringify(body) }),
  krakenDeleteConfigure: () => req<{ ok: boolean }>('/kraken/configure', { method: 'DELETE' }),
  krakenStatus: () =>
    req<{ configured: boolean; cliAvailable: boolean; fallback: string }>('/kraken/status'),
  krakenBalance: () => req<{ balance: Record<string, string> }>('/kraken/balance'),
  krakenTestTrade: (params?: { pair?: string; type?: 'buy' | 'sell'; volume?: string }) =>
    req<{
      ok: boolean;
      krakenOrderId: string | null;
      raw: unknown;
      note: string;
    }>('/kraken/test-trade', { method: 'POST', body: JSON.stringify(params ?? {}) }),

  joinWaitlist: (email: string) =>
    req<{ ok: boolean; message: string }>('/waitlist', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  /** Free first check — no escrow debit. One-time per monitor. */
  firstCheck: (monitorId: string) =>
    req<{
      ok: boolean;
      monitorId: string;
      signalId: string | null;
      conditionMet: boolean;
      isHeartbeat: boolean;
      summary: string | null;
      publicShareToken: string | null;
      metadata?: {
        checkMethod: 'tinyfish' | 'scraper-fallback';
        circuitOpen: boolean;
        githubCommitsFetched: number;
        confidence: number;
        confidenceThreshold: number;
        thresholdBlocked: boolean;
      };
    }>(`/monitors/${monitorId}/first-check`, { method: 'POST' }),

  /** Execute a monitor on-demand (system-facing after pivot). */

  executeMonitor: async (monitorId: string) => {
    return fetch(`${BASE}/execute/${monitorId}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

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

  getLeaderboard: (params?: {
    limit?: number;
    offset?: number;
    sort?: 'signals' | 'accuracy' | 'streak' | 'recent';
  }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.sort) qs.set('sort', params.sort);
    const suffix = qs.toString();
    return req<LeaderboardResponse>(`/leaderboard${suffix ? `?${suffix}` : ''}`);
  },

  getProfile: () =>
    req<{
      id: string;
      wallet_address: string;
      email: string | null;
      display_name: string | null;
      created_at: string;
    }>('/account/profile'),
  updateProfile: (body: { display_name?: string; email?: string }) =>
    req<{ id: string; wallet_address: string; email: string | null; display_name: string | null }>(
      '/account/profile',
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    ),

  /** Test a webhook URL by sending a sample signal payload. */
  testWebhook: (url: string) =>
    req<{ ok: boolean; status: number; durationMs: number }>('/webhooks/test', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  /** Recent webhook delivery log for the current user. */
  getWebhookDeliveries: (limit = 20) =>
    req<
      Array<{
        id: string;
        rule_id: string;
        signal_id: string;
        url: string;
        status_code: number | null;
        duration_ms: number;
        error: string | null;
        created_at: string;
        action_type: string;
        rule_url: string | null;
        // Note: the backend also returns durationMs in camelCase — this field
        // is named duration_ms in the type to match the PG column convention.
      }>
    >(`/webhooks/deliveries?limit=${limit}`),

  /** Add a comment to a signal. */
  addComment: (signalId: string, content: string) =>
    req<{
      id: string;
      signal_id: string;
      user_id: string;
      content: string;
      created_at: string;
      updated_at: string;
      author_name: string | null;
    }>(`/signals/${signalId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  /** Edit a comment on a signal. */
  updateComment: (signalId: string, commentId: string, content: string) =>
    req<{
      id: string;
      signal_id: string;
      user_id: string;
      content: string;
      created_at: string;
      updated_at: string;
      author_name: string | null;
    }>(`/signals/${signalId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  /** Delete a comment on a signal. */
  deleteComment: (signalId: string, commentId: string) =>
    req<{ ok: boolean }>(`/signals/${signalId}/comments/${commentId}`, {
      method: 'DELETE',
    }),

  /** List comments on a signal. */
  getComments: (signalId: string) =>
    req<
      Array<{
        id: string;
        signal_id: string;
        user_id: string;
        content: string;
        created_at: string;
        updated_at: string;
        author_name: string | null;
      }>
    >(`/signals/${signalId}/comments`),

  getHunterDetail: (userId: string, params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const suffix = qs.toString();
    return req<HunterDetailResponse>(`/leaderboard/${userId}${suffix ? `?${suffix}` : ''}`);
  },
};

// Helpers — re-exported from @/lib/format for backward compatibility.
export { burnRate, statusColor } from '@/lib/format';
