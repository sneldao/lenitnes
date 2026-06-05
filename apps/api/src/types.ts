// Shared domain types for LENITNES.

export type MonitorStatus =
  | "active"
  | "paused"
  | "triggered"
  | "insufficient_balance";

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

export type ActionType = "trade" | "webhook" | "email" | "telegram";

export interface Rule {
  id: string;
  monitor_id: string;
  action_type: ActionType;
  action_config: Record<string, unknown>;
  conditions: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  signal_id: string;
  rule_id: string | null;
  kraken_order_id: string | null;
  order_params: Record<string, unknown>;
  status: "pending" | "placed" | "failed";
  placed_at: string | null;
  kraken_response: Record<string, unknown> | null;
}

// Structured output we ask the TinyFish agent to return.
export interface TinyFishResult {
  runId: string;
  conditionMet: boolean;
  evidence: string;
  summary: string;
  screenshots: string[]; // base64 or URLs
  latestCommitHash?: string;
}
