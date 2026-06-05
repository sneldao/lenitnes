// Thin client for the LENITNES backend API.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export type MonitorStatus = "active" | "paused" | "triggered" | "insufficient_balance";

export interface Monitor {
  id: string;
  url: string;
  condition_text: string;
  frequency_seconds: number;
  hbar_balance: string;
  cost_per_check: string;
  status: MonitorStatus;
  last_check_at: string | null;
  created_at: string;
}

export interface Signal {
  id: string;
  monitor_id: string;
  detected_at: string;
  hedera_tx_id: string | null;
  ipfs_cid: string | null;
  evidence_text: string | null;
  screenshot_urls: string[];
  condition_summary: string | null;
  is_heartbeat: boolean;
}

export const api = {
  listMonitors: (userId?: string) =>
    req<Monitor[]>(`/monitors${userId ? `?userId=${userId}` : ""}`),
  getMonitor: (id: string) => req<Monitor & { signals: Signal[] }>(`/monitors/${id}`),
  createMonitor: (body: unknown) =>
    req<Monitor>(`/monitors`, { method: "POST", body: JSON.stringify(body) }),
  listSignals: (monitorId?: string) =>
    req<Signal[]>(`/signals${monitorId ? `?monitorId=${monitorId}` : ""}`),
  getSignal: (id: string) => req<any>(`/signals/${id}`),
  createRule: (body: unknown) =>
    req<any>(`/rules`, { method: "POST", body: JSON.stringify(body) }),
  listRules: (monitorId?: string) =>
    req<any[]>(`/rules${monitorId ? `?monitorId=${monitorId}` : ""}`),
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
    case "active": return "bg-signal/15 text-signal";
    case "triggered": return "bg-accent/15 text-accent";
    case "paused": return "bg-slate-500/15 text-slate-400";
    case "insufficient_balance": return "bg-danger/15 text-danger";
  }
}
