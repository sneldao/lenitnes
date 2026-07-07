// Thin client for the LENITNES backend API.
//
// Boundary contract: every value that crosses this module is camelCase.
// The API still speaks snake_case for backward compatibility with the
// proof URLs and the seed:demo output, but the UI never sees the raw
// shape. New code must consume the exported types (Signal, Monitor,
// Scorecard, etc.) and never type-cast snake_case fields directly.

import type { Monitor as ApiMonitor, MonitorStatus, OrderStatus } from '@lenitnes/types';

const BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: process.env.NODE_ENV === 'development' ? 'no-store' : 'default',
  });
  if (res.status === 401) {
    throw new Error('session_expired');
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── Snake → camel helpers ─────────────────────────────────────

function toCamel<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => toCamel(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const ck = k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
      out[ck] = toCamel(v);
    }
    return out as T;
  }
  return value as T;
}

async function reqCamel<T>(path: string, init?: RequestInit): Promise<T> {
  const raw = await req<unknown>(path, init);
  return toCamel<T>(raw);
}

// ── Domain types (camelCase, UI-facing) ───────────────────────

export interface OutcomeWindow {
  asset: string;
  windowSeconds: number;
  // pg numeric columns are serialized as ::text by the API to avoid
  // float precision loss, so price/pct fields arrive as strings.
  priceAtSignal: string;
  priceAfter: string;
  pctChange: string;
  direction: 'up' | 'down' | 'flat';
}

export interface DetectorClassification {
  detectorType: string;
  score: number;
  confidence: number;
  label: string;
}

export interface VerificationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface AgentScore {
  conviction: number;
  thesis: string;
  recommendedAction: 'long' | 'short' | 'none';
  confidenceBand: 'low' | 'mid' | 'high';
  rubricVersion: string;
  createdAt: string;
  /**
   * The agent's first-person dispatch anchored on Hedera HCS via
   * hedera-agent-kit. v2+ scores carry this; legacy v1 rows fall
   * back to "[legacy v1] <thesis>".
   */
  hcsDispatch: string;
  /**
   * Whether the agent requested a dedicated HCS topic for this
   * signal. Only granted at conviction ≥ 90.
   */
  proofAction: 'standard' | 'dedicated_topic';
}

export interface AssetMapping {
  coingeckoId?: string;
  tokenizedStock?: string;
  direction?: 'long' | 'short' | 'both';
}

export interface Monitor {
  id: string;
  url: string;
  conditionText: string;
  frequencySeconds: number;
  status: MonitorStatus;
  screenshotsEnabled: boolean;
  isPublic: boolean;
  confidenceThreshold: number;
  lastCheckAt: string | null;
  lastSeenCommitHash: string | null;
  assetMapping: AssetMapping;
  createdAt: string;
}

export interface Order {
  id: string;
  signalId: string;
  status: OrderStatus;
  chain: string | null;
  chainTxHash: string | null;
  placedAt: string | null;
  cancelledAt: string | null;
  orderParams: Record<string, unknown>;
}

export interface Signal {
  id: string;
  monitorId: string;
  detectedAt: string;
  hederaTxId: string | null;
  /** Topic ID minted by the agent's dedicated_topic proof_action. */
  hederaDedicatedTopicId: string | null;
  ipfsCid: string | null;
  evidenceText: string | null;
  screenshotUrls: string[];
  conditionSummary: string | null;
  isHeartbeat: boolean;
  arbTxHash: string | null;
  ordersCount: number;
}

export interface SignalDetail extends Signal {
  monitor: Pick<Monitor, 'id' | 'url' | 'conditionText'> | null;
  orders: Order[];
  publicShareToken?: string;
  evidenceHash: string | null;
  verificationChecklist?: VerificationCheck[];
  proof: { ipfsUrl: string | null; hashscanUrl: string | null };
  classifications: DetectorClassification[];
  outcomes: OutcomeWindow[];
  agentScore: AgentScore | null;
}

// ── Scorecard (public, the credibility surface) ───────────────

export interface OutcomePill {
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
  outcomes: OutcomePill;
}

export interface ScorecardBySignalType {
  detectorType: string;
  total: number;
  /** Signals with a matured T+1d outcome — the hit-ratio denominator. */
  withT1d: number;
  hits: number;
  hitRatio: number;
  // Directional avg pct change at each window (sign-flipped so
  // positive = trade was right). Null until enough outcomes settle.
  avgT1hPct: number | null;
  avgT1dPct: number | null;
  avgT7dPct: number | null;
}

export interface ScorecardByConvictionBand {
  bandMin: number;
  bandMax: number;
  label: string;
  total: number;
  traded: number;
  /** Traded calls with a matured T+1d outcome — the hit-ratio denominator. */
  closed: number;
  hits: number;
  hitRatio: number;
  avgT1hPct: number | null;
  avgT1dPct: number | null;
  avgT7dPct: number | null;
}

export interface ScorecardByWatchlist {
  monitorId: string;
  url: string;
  total: number;
  /** Signals with a matured T+1d outcome — the hit-ratio denominator. */
  withT1d: number;
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
  outcomesSummary: { closed: number; pending: number };
  bySignalType: ScorecardBySignalType[];
  byWatchlist: ScorecardByWatchlist[];
  byConvictionBand: ScorecardByConvictionBand[];
  recentCalls: ScorecardRecentCall[];
  proofCoverage: { withHederaHcs: number; totalSignals: number; pct: number };
  generatedAt: string;
}

// ── Portfolio ─────────────────────────────────────────────────

export interface PortfolioSummary {
  totalOpenPositions: number;
  totalClosedPositions: number;
  totalInvestedUsd: number;
  currentValueUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  winRate: number | null;
  bestTradePct: number | null;
  worstTradePct: number | null;
  avgHoldTimeHours: number | null;
}

export interface OpenPosition {
  id: string;
  asset: string;
  chain: string;
  direction: string;
  entryAmount: number;
  entryPriceUsd: number | null;
  entryTxHash: string | null;
  openedAt: string;
  convictionAtOpen: number | null;
  currentPriceUsd: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct: number | null;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
}

export interface ClosedPosition {
  id: string;
  asset: string;
  chain: string;
  direction: string;
  entryAmount: number;
  entryPriceUsd: number | null;
  exitAmount: number;
  exitPriceUsd: number | null;
  pnlPct: number;
  pnlUsd: number;
  openedAt: string;
  closedAt: string;
  convictionAtOpen: number | null;
}

export interface PortfolioResponse {
  summary: PortfolioSummary;
  open: OpenPosition[];
  closed: ClosedPosition[];
}

// ── Backtest ──────────────────────────────────────────────────

export interface BacktestStat {
  detectorType: string;
  asset: string;
  totalSignals: number;
  correctCount: number;
  // Decimal columns from the materialized view are returned as strings.
  accuracy: string;
  avgPctChange: string;
  medianPctChange: string;
  avgAbsReturn: string;
  sharpeEstimate: string;
  bestWindow: number | null;
}

// ── Admin ─────────────────────────────────────────────────────

export interface AdminStatusResponse {
  signals: { last24h: number; last7d: number; latestAt: string | null; latestId: string | null };
  agent: { scoresLast24h: number; dailySpendUsd: number; dailyBudgetUsd: number };
  trades: { filledAllTime: number };
  treasury: { activeWallets: number; defaultChain: string; defaultMode: string };
}

// ── Public client ─────────────────────────────────────────────

export const api = {
  listMonitors: () => reqCamel<Monitor[]>('/monitors'),
  getMonitor: (id: string) => reqCamel<Monitor & { signals: Signal[] }>(`/monitors/${id}`),

  listSignals: (monitorId?: string, includeHeartbeats?: boolean) => {
    const params = new URLSearchParams();
    if (monitorId) params.set('monitorId', monitorId);
    if (includeHeartbeats) params.set('includeHeartbeats', 'true');
    const qs = params.toString();
    return reqCamel<Signal[]>(`/signals${qs ? `?${qs}` : ''}`);
  },
  getSignal: (id: string) => reqCamel<SignalDetail>(`/signals/${id}`),
  getPublicProof: (id: string, shareToken?: string) =>
    reqCamel<SignalDetail>(
      `/proof/public/${id}${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''}`,
    ),

  listOrders: () =>
    reqCamel<
      Array<{
        id: string;
        orderParams: Record<string, unknown>;
        status: string;
        placedAt: string | null;
        cancelledAt: string | null;
        signalId: string;
        detectedAt: string;
        monitorId: string;
        monitorUrl: string;
      }>
    >('/orders'),

  listDlq: (limit = 50) =>
    reqCamel<{
      depth: number;
      jobs: Array<{
        monitorId: string;
        finalError: string;
        attemptsMade: number;
        movedAt: string;
      }>;
    }>(`/dlq?limit=${limit}`),

  getBacktestStats: (filters?: { detectorType?: string; asset?: string }) => {
    const params = new URLSearchParams();
    if (filters?.detectorType) params.set('detector', filters.detectorType);
    if (filters?.asset) params.set('asset', filters.asset);
    const qs = params.toString();
    return reqCamel<BacktestStat[]>(`/backtest/stats${qs ? `?${qs}` : ''}`);
  },

  getScorecard: () => reqCamel<ScorecardResponse>(`/scorecard`),
  getScorecardRecent: (limit?: number) =>
    reqCamel<ScorecardRecentCall[]>(`/scorecard/recent${limit ? `?limit=${limit}` : ''}`),

  getAdminStatus: (adminKey: string) =>
    reqCamel<AdminStatusResponse>(`/admin/status`, {
      headers: { 'X-Admin-Key': adminKey },
    }),

  listPortfolio: () => reqCamel<PortfolioResponse>(`/portfolio`),
};

// Backwards-compatible re-exports for old callers that imported
// Monitor / Signal / SignalDetail from this module.
export type { ApiMonitor, MonitorStatus };
