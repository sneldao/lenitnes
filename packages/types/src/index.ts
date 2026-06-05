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
  last_check_at: string | null;
  last_seen_commit_hash: string | null;
  created_at: string;
}

export interface CreateMonitorInput {
  userId: string;
  url: string;
  conditionText: string;
  frequencySeconds?: number; // default 3600
  stakeHbar?: number; // default 0
  costPerCheck?: number;
}

export interface UpdateMonitorInput {
  conditionText?: string;
  frequencySeconds?: number;
  status?: MonitorStatus;
  stakeHbar?: number; // top-up
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
}

export interface SignalDetail extends Signal {
  monitor: Pick<Monitor, 'id' | 'url' | 'condition_text'> | null;
  orders: Order[];
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

export type OrderStatus = 'pending' | 'placed' | 'failed';

export interface Order {
  id: string;
  signal_id: string;
  rule_id: string | null;
  kraken_order_id: string | null;
  order_params: Record<string, unknown>;
  status: OrderStatus;
  placed_at: string | null;
  kraken_response: Record<string, unknown> | null;
}

// ── User ──────────────────────────────────────────────────────

export interface User {
  id: string;
  wallet_address: string;
  email: string | null;
  created_at: string;
}

// ── API response shapes ───────────────────────────────────────

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface ApiOk {
  ok: true;
}

// ── Health check ───────────────────────────────────────────────

export interface HealthStatus {
  ok: boolean;
  service: string;
  version: string;
  checks?: {
    database: 'ok' | 'fail';
  };
}

// ── TinyFish result ────────────────────────────────────────────

export interface TinyFishResult {
  runId: string;
  conditionMet: boolean;
  evidence: string;
  summary: string;
  screenshots: string[]; // base64 or URLs
  latestCommitHash?: string;
}
