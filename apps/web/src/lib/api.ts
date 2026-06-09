// Thin client for the LENITNES backend API.

import type {
  Monitor,
  MonitorStatus,
  Signal,
  SignalDetail,
  Rule,
  CreateMonitorInput,
  CreateRuleInput,
} from '@lenitnes/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

export { type Monitor, type MonitorStatus, type Signal, type SignalDetail, type Rule };

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

  listMonitors: (userId?: string) =>
    req<Monitor[]>(`/monitors${userId ? `?userId=${userId}` : ''}`),
  getMonitor: (id: string) => req<Monitor & { signals: Signal[] }>(`/monitors/${id}`),
  createMonitor: (body: CreateMonitorInput) =>
    req<Monitor>(`/monitors`, { method: 'POST', body: JSON.stringify(body) }),
  deleteMonitor: (id: string) => req<{ ok: boolean }>(`/monitors/${id}`, { method: 'DELETE' }),

  /** Top up monitor escrow balance (replaces inline fetch calls in rules.tsx and monitors/new/page.tsx). */
  topUpMonitor: (id: string, amountHbar: number) =>
    req<Monitor>(`/monitors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ topUpHbar: amountHbar }),
    }),
  listSignals: (monitorId?: string) =>
    req<Signal[]>(`/signals${monitorId ? `?monitorId=${monitorId}` : ''}`),
  getSignal: (id: string) => req<SignalDetail>(`/signals/${id}`),
  getPublicProof: (id: string, shareToken?: string) =>
    req<SignalDetail>(
      `/proof/public/${id}${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''}`,
    ),
  createRule: (body: CreateRuleInput) =>
    req<Rule>(`/rules`, { method: 'POST', body: JSON.stringify(body) }),
  listRules: (monitorId?: string) =>
    req<Rule[]>(`/rules${monitorId ? `?monitorId=${monitorId}` : ''}`),
  deleteRule: (id: string) => req<{ ok: boolean }>(`/rules/${id}`, { method: 'DELETE' }),

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

  /** Execute a monitor on-demand via the x402-gated endpoint. */

  executeMonitor: async (
    monitorId: string,
    executeWithPayment: (url: string, init?: RequestInit) => Promise<Response>,
  ) => {
    return executeWithPayment(`${BASE}/execute/${monitorId}`, {
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
};

// Helpers — re-exported from @/lib/format for backward compatibility.
export { burnRate, statusColor } from '@/lib/format';
