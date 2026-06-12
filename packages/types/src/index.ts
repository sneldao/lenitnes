// ─────────────────────────────────────────────────────────────
// LENITNES — shared domain types
// Consumed by both apps/api and apps/web.
// ─────────────────────────────────────────────────────────────

// ── Monitor ──────────────────────────────────────────────────

export type MonitorStatus = 'active' | 'paused' | 'triggered' | 'insufficient_balance';

export interface Monitor {
  id: string;
  user_id: string;
  url: string;
  condition_text: string;
  frequency_seconds: number;
  escrow_account_id: string | null;
  hbar_balance: string; // NUMERIC comes back as string from pg
  cost_per_check: string;
  status: MonitorStatus;
  screenshots_enabled: boolean;
  is_public: boolean;
  confidence_threshold: number;
  last_check_at: string | null;
  last_seen_commit_hash: string | null;
  asset_mapping: AssetMapping;
  created_at: string;
}

export interface CreateMonitorInput {
  userId: string;
  url: string;
  conditionText: string;
  frequencySeconds?: number; // default 3600
  costPerCheck?: number;
  screenshotsEnabled?: boolean; // default true
  isPublic?: boolean; // default true
  confidenceThreshold?: number; // 0-100, default 50
}

export interface UpdateMonitorInput {
  conditionText?: string;
  frequencySeconds?: number;
  status?: MonitorStatus;
  stakeHbar?: number; // top-up
  confidenceThreshold?: number;
}

// ── Signal ────────────────────────────────────────────────────

export interface Signal {
  id: string;
  monitor_id: string;
  detected_at: string;
  hedera_tx_id: string | null;
  hedera_hcs_message_id: string | null;
  tinyfish_run_id: string | null;
  ipfs_cid: string | null;
  evidence_text: string | null;
  screenshot_urls: string[];
  condition_summary: string | null;
  is_heartbeat: boolean;
  /** ISO timestamp; null means the owning user has not opened the signal yet. */
  viewed_at?: string | null;
  viewed_by?: string | null;
  orders_count?: number;
}

export interface SignalDetail extends Signal {
  monitor: Pick<Monitor, 'id' | 'url' | 'condition_text'> | null;
  orders: Order[];
  public_share_token?: string;
  evidence_hash?: string | null;
  verification_checklist?: { name: string; ok: boolean; detail: string }[];
  proof: {
    ipfsUrl: string | null;
    hashscanUrl: string | null;
  };
}

// ── Rule ─────────────────────────────────────────────────────

export type ActionType = 'trade' | 'webhook' | 'email' | 'telegram';

export interface Rule {
  id: string;
  monitor_id: string;
  action_type: ActionType;
  action_config: Record<string, unknown>;
  conditions: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface CreateRuleInput {
  monitorId: string;
  actionType: ActionType;
  actionConfig?: Record<string, unknown>;
  conditions?: Record<string, unknown>;
  isActive?: boolean;
}

// ── Order ─────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'placed'
  | 'filled'
  | 'partially_filled'
  | 'cancelled'
  | 'failed'
  | 'expired';

export interface Order {
  id: string;
  signal_id: string;
  rule_id: string | null;
  kraken_order_id: string | null;
  order_params: Record<string, unknown>;
  status: OrderStatus;
  placed_at: string | null;
  cancelled_at: string | null;
  kraken_response: Record<string, unknown> | null;
}

// ── User ──────────────────────────────────────────────────────

export interface User {
  id: string;
  wallet_address: string;
  email: string | null;
  created_at: string;
}

// ── Signal Types (typed detectors) ──────────────────────────

export type SignalType =
  | 'emergency_patch'
  | 'security_critical_patch'
  | 'dependency_rotation'
  | 'governance_shift'
  | 'maintainer_departure'
  | 'silent_merge'
  | 'protocol_upgrade'
  | 'supply_chain_risk'
  | 'generic';

export interface SignalClassification {
  type: SignalType;
  score: number;
  confidence: number;
  label: string;
  metadata: Record<string, unknown>;
}

// ── Asset Mapping ────────────────────────────────────────────

export interface AssetMapping {
  coingeckoId?: string;
  krakenPair?: string;
  tokenizedStock?: string;
  direction?: 'long' | 'short' | 'both';
}

// ── Signal Outcome (backtest) ────────────────────────────────

export interface SignalOutcome {
  signal_id: string;
  asset: string;
  window_seconds: number;
  price_at_signal: string;
  price_after: string;
  pct_change: string;
  direction: 'up' | 'down' | 'flat';
}

// ── Detector Backtest Stats ──────────────────────────────────

export interface DetectorBacktestStats {
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
}

// ── API response helpers ──────────────────────────────────────

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface ApiOk {
  ok: true;
}

// ── Health check ────────────────────────────────────────────

export interface HealthStatus {
  ok: boolean;
  service: string;
  version: string;
  checks?: {
    database: 'ok' | 'fail';
  };
}

// ── TinyFish result ─────────────────────────────────────────

export interface TinyFishResult {
  runId: string;
  conditionMet: boolean;
  confidence: number; // 0-100
  evidence: string;
  summary: string;
  screenshots: string[];
  latestCommitHash?: string;
  githubCommitsFetched?: number;
  commits?: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    url: string;
    additions: number;
    deletions: number;
    total: number;
  }>;
}
