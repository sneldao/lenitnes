// ─────────────────────────────────────────────────────────────
// LENITNES — shared domain types
// Consumed by both apps/api and apps/web.
//
// Pivot note: User, KrakenKey, Waitlist, Rule, LeaderboardEntry,
// HunterDetail are gone after the zero-headcount pivot. AgentScore
// and TreasuryWallet are new. See docs/AGENT_ARCHITECTURE.md.
//
// Day 14: Kraken fields (Order.kraken_order_id, Order.kraken_response,
// AssetMapping.krakenPair) were removed. Trades are chain-native
// (chain + chain_tx_hash on Order). Price resolution is coingecko-only
// (see services/price.ts).
// ─────────────────────────────────────────────────────────────

// ── Monitor (now a watchlist entry) ──────────────────────────

export type MonitorStatus = 'active' | 'paused' | 'triggered';

export interface Monitor {
  id: string;
  url: string;
  condition_text: string;
  frequency_seconds: number;
  status: MonitorStatus;
  screenshots_enabled: boolean;
  is_public: boolean;
  confidence_threshold: number;
  last_check_at: string | null;
  last_seen_commit_hash: string | null;
  asset_mapping: AssetMapping;
  created_at: string;
  /**
   * @deprecated Removed after pivot (Day 2). Kept as optional so the
   * web typechecks until Day 9 rewrites the dashboard. The columns
   * no longer exist in the DB.
   */
  hbar_balance?: string;
  /** @deprecated Removed after pivot. See hbar_balance. */
  cost_per_check?: string;
}

export interface CreateMonitorInput {
  url: string;
  conditionText: string;
  frequencySeconds?: number;
  screenshotsEnabled?: boolean;
  isPublic?: boolean;
  confidenceThreshold?: number;
  assetMapping?: AssetMapping;
}

export interface UpdateMonitorInput {
  conditionText?: string;
  frequencySeconds?: number;
  status?: MonitorStatus;
  confidenceThreshold?: number;
}

// ── Signal ────────────────────────────────────────────────────

export interface Signal {
  id: string;
  monitor_id: string;
  detected_at: string;
  hedera_tx_id: string | null;
  hedera_hcs_message_id: string | null;
  /**
   * Topic ID of the dedicated HCS topic the agent minted for this
   * signal (only when agent_score.proof_action === 'dedicated_topic').
   * Created via hedera-agent-kit's create_topic_tool when the agent
   * chooses to mint a reference-quality proof artifact.
   */
  hedera_dedicated_topic_id?: string | null;
  tinyfish_run_id: string | null;
  ipfs_cid: string | null;
  evidence_text: string | null;
  screenshot_urls: string[];
  condition_summary: string | null;
  is_heartbeat: boolean;
  arb_tx_hash?: string | null;
  search_results?: Array<{ title: string; url: string; snippet: string; siteName?: string }>;
  orders_count?: number;
  /** @deprecated Removed after pivot. See Signal.viewed_at. */
  viewed_at?: string | null;
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
  classifications?: Array<{
    detector_type: string;
    score: number;
    confidence: number;
    label: string;
  }>;
  outcomes?: Array<{
    asset: string;
    window_seconds: number;
    price_at_signal: string;
    price_after: string;
    pct_change: string;
    direction: string;
  }>;
  agent_score?: AgentScore;
}

// ── Order (treasury trades) ──────────────────────────────────

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
  rule_id: string | null; // null after pivot (rules table dropped)
  order_params: Record<string, unknown>;
  status: OrderStatus;
  placed_at: string | null;
  cancelled_at: string | null;
  chain: string | null;
  chain_tx_hash: string | null;
}

// ── Agent (the operator) ─────────────────────────────────────

export type AgentAction = 'long' | 'short' | 'none';
export type ConfidenceBand = 'low' | 'mid' | 'high';

export interface AgentScore {
  id: string;
  signal_id: string;
  rubric_version: string;
  conviction: number; // 0-100
  thesis: string; // ≤280 chars for Telegram
  recommended_action: AgentAction;
  confidence_band: ConfidenceBand;
  /**
   * Tamper-evident dispatch — the agent's own words, written to
   * Hedera HCS as part of the signal's proof envelope. Lives
   * separately from `thesis` because the thesis is broadcast
   * voice (telegram-ready) while the dispatch is on-chain voice
   * (more formal, includes self-attestation). Max 600 chars to
   * fit comfortably inside an HCS topic message.
   */
  hcs_dispatch: string;
  /**
   * Agent's decision about how to anchor the proof on Hedera.
   * - 'standard': single write to the default LENITNES topic
   * - 'dedicated_topic': agent also requests a new HCS topic be
   *   created for this signal; the agent commits the dispatch
   *   to that topic too. Used by the agent on the highest-
   *   conviction calls where a permanent, isolated record is
   *   warranted.
   */
  proof_action: 'standard' | 'dedicated_topic';
  raw_response: Record<string, unknown>;
  created_at: string;
}

export interface AgentInput {
  signal_id: string;
  detector_classifications: Array<{
    detector_type: string;
    score: number;
    confidence: number;
    label: string;
    metadata?: Record<string, unknown>;
  }>;
  asset_mapping: AssetMapping;
  evidence_text: string | null;
  condition_summary: string | null;
  precedent_count: number;
  /** Past outcomes for this monitor+detector — T+1d avg return, win rate, volume. */
  past_outcomes?: string;
  /** CoinMarketCap market context — injected before agent scores. */
  market_context?: string;
  /**
   * Cross-signal narrative context — a summary of recent signals across
   * ALL monitors (last 24h) + SoSoValue news for the asset + cross-asset
   * activity. Lets the agent string commits across repos and weigh
   * corroboration rather than scoring each signal in isolation. v3.
   */
  narrative_context?: string;
  /**
   * Sector-chain sequence context — prior commits in upstream→downstream
   * repos within the last 7d (e.g. halo2 → zebra → zcash). v5 pilot.
   */
  sequence_context?: string;
  /**
   * Current open positions — asset, direction, conviction at open,
   * age, entry thesis. Drives the rubric's book discipline (no
   * pile-ons, no evidence-free reversals). Empty string = flat. v4.
   */
  book_context?: string;
}

// ── Treasury (system wallets) ────────────────────────────────

export type Chain = 'hedera' | 'arbitrum' | 'robinhood' | 'bnb' | 'valuechain';

export interface TreasuryWallet {
  chain: Chain;
  address: string;
  label: string | null;
  is_active: boolean;
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
  | 'news_signal'
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
  tokenizedStock?: string;
  direction?: 'long' | 'short' | 'both';
}

// ── Signal Outcome (backtest / live outcomes) ────────────────

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

// ── Leaderboard (deprecated — replaced by /scorecard in Day 7) ──────

export interface LeaderboardEntry {
  user_id: string;
  wallet_address: string;
  display_name: string | null;
  total_signals: number;
  chain_completed: number;
  accuracy: string | null;
  streak: number;
  top_pair: string | null;
  last_signal_at: string | null;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  stats: {
    total_signals: number;
    active_hunters: number;
    public_monitors: number;
    anchor_coverage: string;
  };
}

export interface HunterDetail {
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

export interface HunterDetailResponse {
  hunter: HunterDetail;
  signals: Signal[];
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

export {
  CONSENSUS_WATCHLIST,
  SECTOR_GRAPHS,
  findWatchlistEntry,
  watchlistAssetForRepo,
  type WatchlistEntry,
  type SectorGraphDef,
  type RepoTier,
} from './watchlist.js';
