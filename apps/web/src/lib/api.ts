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

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('lenitnes_token');
}

function setToken(t: string | null) {
  if (typeof window === 'undefined') return;
  if (t) localStorage.setItem('lenitnes_token', t);
  else localStorage.removeItem('lenitnes_token');
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export { type Monitor, type MonitorStatus, type Signal, type SignalDetail, type Rule };

export const api = {
  login: async (params: {
    walletAddress: string;
    publicKey: string;
    message: string;
    signature: string;
    email?: string;
  }) => {
    const data = await req<{ token: string; user: { id: string; wallet_address: string } }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          walletAddress: params.walletAddress,
          publicKey: params.publicKey,
          message: params.message,
          signature: params.signature,
          email: params.email,
        }),
      },
    );
    setToken(data.token);
    return data;
  },
  logout: () => setToken(null),

  listMonitors: (userId?: string) =>
    req<Monitor[]>(`/monitors${userId ? `?userId=${userId}` : ''}`),
  getMonitor: (id: string) => req<Monitor & { signals: Signal[] }>(`/monitors/${id}`),
  createMonitor: (body: CreateMonitorInput) =>
    req<Monitor>(`/monitors`, { method: 'POST', body: JSON.stringify(body) }),
  listSignals: (monitorId?: string) =>
    req<Signal[]>(`/signals${monitorId ? `?monitorId=${monitorId}` : ''}`),
  getSignal: (id: string) => req<SignalDetail>(`/signals/${id}`),
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
        kraken_response: Record<string, unknown> | null;
        signal_id: string;
        detected_at: string;
        monitor_id: string;
        monitor_url: string;
      }[]
    >('/orders'),

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
    const token = getToken();
    return executeWithPayment(`${BASE}/execute/${monitorId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
