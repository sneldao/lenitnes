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
  deleteMonitor: (id: string) => req<{ ok: boolean }>(`/monitors/${id}`, { method: 'DELETE' }),
  deleteRule: (id: string) => req<{ ok: boolean }>(`/rules/${id}`, { method: 'DELETE' }),

  executeMonitor: async (
    monitorId: string,
    executeWithPayment: (url: string, init?: RequestInit) => Promise<Response>,
  ) => {
    return executeWithPayment(`${BASE}/execute/${monitorId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

// Helpers ------------------------------------------------------

export function burnRate(m: Monitor): { perDay: number; daysLeft: number } {
  const checksPerDay = 86400 / m.frequency_seconds;
  const perDay = checksPerDay * Number(m.cost_per_check);
  const daysLeft = perDay > 0 ? Number(m.hbar_balance) / perDay : Infinity;
  return { perDay, daysLeft };
}

export function statusColor(s: MonitorStatus): string {
  switch (s) {
    case 'active':
      return 'bg-signal/15 text-signal';
    case 'triggered':
      return 'bg-accent/15 text-accent';
    case 'paused':
      return 'bg-slate-500/15 text-slate-400';
    case 'insufficient_balance':
      return 'bg-danger/15 text-danger';
  }
}
