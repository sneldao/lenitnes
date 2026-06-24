// ─────────────────────────────────────────────────────────────
// Scorecard — public credibility surface. Pure SQL aggregations
// over signals × agent_scores × signal_outcomes × orders. No
// business logic — just composed queries.
// Day 7 of the pivot.
// ─────────────────────────────────────────────────────────────

import { query } from '../db/pool.js';

export interface RecentCallOutcome {
  t1h: number | null;
  t1d: number | null;
  t7d: number | null;
}

export interface RecentCall {
  signalId: string;
  detectedAt: string;
  monitorUrl: string;
  detectorTypes: string[];
  conviction: number | null;
  thesis: string | null;
  recommendedAction: 'long' | 'short' | 'none' | null;
  tradeTxHash: string | null;
  outcomes: RecentCallOutcome;
}

export interface ScorecardBySignalType {
  detectorType: string;
  total: number;
  hits: number;
  hitRatio: number;
}

export interface ScorecardByWatchlist {
  monitorId: string;
  url: string;
  total: number;
  hits: number;
  hitRatio: number;
}

export interface ScorecardOverall {
  totalSignals: number;
  totalTrades: number;
  hitRatio: number;
  cumulativePnlUsd: number;
  sharpe: number;
  maxDrawdownUsd: number;
  bySignalType: ScorecardBySignalType[];
  byWatchlist: ScorecardByWatchlist[];
  recentCalls: RecentCall[];
  proofCoverage: {
    withHederaHcs: number;
    totalSignals: number;
    pct: number;
  };
  generatedAt: string;
}

// ── SQL building blocks ─────────────────────────────────────

/**
 * The T+1d window is the canonical hit window for the scorecard
 * (matches the canonical "did the agent's call land" check). T+1h
 * is too noisy; T+7d is too slow for a public surface.
 */
const T1D_WINDOW = 86400;

/** A signal is a "hit" if the price moved in the agent's predicted
 * direction at T+1d. Direction comes from signal_outcomes; the
 * agent's predicted direction comes from agent_scores.
 *
 * Uses the column aliases from the consuming CTE (recommended_action,
 * direction). The caller is responsible for the JOIN. */
function isHitPredicate(): string {
  return `
    (
      (recommended_action = 'long' AND direction = 'up') OR
      (recommended_action = 'short' AND direction = 'down')
    )
  `;
}

interface CountsRow {
  total_signals: string;
  total_trades: string;
}

interface OutcomesRow {
  total: string;
  hits: string;
  hit_ratio: string | null;
  cumulative_pnl: string;
  sharpe: string | null;
  max_drawdown: string;
}

interface RecentRow {
  signal_id: string;
  detected_at: string;
  monitor_url: string;
  conviction: number | null;
  thesis: string | null;
  recommended_action: 'long' | 'short' | 'none' | null;
  trade_tx_hash: string | null;
  outcomes: RecentCallOutcome;
  detector_types: string[];
}

// ── Public API ─────────────────────────────────────────────

export async function overall(): Promise<ScorecardOverall> {
  const [counts, outcomes, byType, byWatchlist, recent, proofCoverage] = await Promise.all([
    countsQuery(),
    outcomesQuery(),
    bySignalTypeQuery(),
    byWatchlistQuery(),
    recentCallsQuery(20),
    proofCoverageQuery(),
  ]);

  return {
    totalSignals: Number(counts.total_signals),
    totalTrades: Number(counts.total_trades),
    hitRatio: Number(outcomes.hit_ratio ?? 0),
    cumulativePnlUsd: Number(outcomes.cumulative_pnl ?? 0),
    sharpe: Number(outcomes.sharpe ?? 0),
    maxDrawdownUsd: Number(outcomes.max_drawdown ?? 0),
    bySignalType: byType,
    byWatchlist: byWatchlist,
    recentCalls: recent,
    proofCoverage: {
      withHederaHcs: Number(proofCoverage.with_hedera),
      totalSignals: Number(proofCoverage.total),
      pct:
        Number(proofCoverage.total) > 0
          ? Math.round((Number(proofCoverage.with_hedera) / Number(proofCoverage.total)) * 100)
          : 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function recentCalls(limit: number = 20): Promise<RecentCall[]> {
  return recentCallsQuery(limit);
}

// ── Internal queries ───────────────────────────────────────

async function countsQuery(): Promise<CountsRow> {
  const { rows } = await query<CountsRow>(
    `SELECT
       (SELECT COUNT(*) FROM signals WHERE is_heartbeat = false)::text AS total_signals,
       (SELECT COUNT(*) FROM orders WHERE status = 'filled')::text AS total_trades`,
  );
  return rows[0] ?? { total_signals: '0', total_trades: '0' };
}

async function outcomesQuery(): Promise<OutcomesRow> {
  // One pass over T+1d outcomes, computing hit count, pnl, sharpe,
  // and max drawdown via a CTE.
  const { rows } = await query<OutcomesRow>(
    `WITH t1d AS (
       SELECT
         so.signal_id,
         so.pct_change,
         so.price_at_signal,
         so.price_after,
         so.direction,
         ag.recommended_action,
         (so.price_after - so.price_at_signal) AS pnl_abs
       FROM signal_outcomes so
       LEFT JOIN agent_scores ag ON ag.signal_id = so.signal_id
       WHERE so.window_seconds = $1
     ),
     hits AS (
       SELECT COUNT(*)::text AS hits, COUNT(*)::text AS total
       FROM t1d
       WHERE ${isHitPredicate()}
     ),
     pnl AS (
       SELECT
         COALESCE(SUM(pnl_abs), 0)::text AS cumulative_pnl,
         COALESCE(AVG(pct_change) / NULLIF(STDDEV_SAMP(pct_change), 0), 0)::text AS sharpe
       FROM t1d
     ),
     drawdown AS (
       WITH ordered AS (
         SELECT
           signal_id,
           SUM(pnl_abs) OVER (ORDER BY signal_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_pnl
         FROM t1d
       )
       SELECT COALESCE(MAX(peak - cum_pnl), 0)::text AS max_drawdown
       FROM (
         SELECT
           cum_pnl,
           MAX(cum_pnl) OVER (ORDER BY signal_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS peak
         FROM ordered
       ) t
     )
     SELECT
       (SELECT total FROM hits) AS total,
       (SELECT hits FROM hits) AS hits,
       CASE WHEN (SELECT total FROM hits)::int > 0
            THEN (SELECT hits FROM hits)::float / (SELECT total FROM hits)::int
            ELSE NULL END AS hit_ratio,
       (SELECT cumulative_pnl FROM pnl) AS cumulative_pnl,
       (SELECT sharpe FROM pnl) AS sharpe,
       (SELECT max_drawdown FROM drawdown) AS max_drawdown`,
    [T1D_WINDOW],
  );
  return (
    rows[0] ?? {
      total: '0',
      hits: '0',
      hit_ratio: null,
      cumulative_pnl: '0',
      sharpe: '0',
      max_drawdown: '0',
    }
  );
}

async function bySignalTypeQuery(): Promise<ScorecardBySignalType[]> {
  // Compute on the fly (not from detector_backtest_stats) so the
  // scorecard is always accurate even before the backtest cron runs.
  // The isHitPredicate now uses unqualified column names — it
  // expects the CTE to expose `recommended_action` and `direction`.
  const { rows } = await query<{
    detector_type: string;
    total: string;
    hits: string;
  }>(
    `WITH t1d_per_signal AS (
       SELECT DISTINCT ON (so.signal_id)
         so.signal_id,
         so.direction,
         ag.recommended_action
       FROM signal_outcomes so
       LEFT JOIN agent_scores ag ON ag.signal_id = so.signal_id
       WHERE so.window_seconds = $1
       ORDER BY so.signal_id, so.created_at DESC
     )
     SELECT
       sc.detector_type,
       COUNT(DISTINCT sc.signal_id)::text AS total,
       COUNT(DISTINCT CASE WHEN ${isHitPredicate()} THEN sc.signal_id END)::text AS hits
     FROM signal_classifications sc
     LEFT JOIN t1d_per_signal t ON t.signal_id = sc.signal_id
     GROUP BY sc.detector_type
     ORDER BY total DESC`,
    [T1D_WINDOW],
  );
  return rows.map((r) => ({
    detectorType: r.detector_type,
    total: Number(r.total),
    hits: Number(r.hits),
    hitRatio: Number(r.total) > 0 ? Number(r.hits) / Number(r.total) : 0,
  }));
}

async function byWatchlistQuery(): Promise<ScorecardByWatchlist[]> {
  const { rows } = await query<{
    monitor_id: string;
    url: string;
    total: string;
    hits: string;
  }>(
    `WITH t1d_per_signal AS (
       SELECT DISTINCT ON (so.signal_id)
         so.signal_id,
         so.direction,
         ag.recommended_action
       FROM signal_outcomes so
       LEFT JOIN agent_scores ag ON ag.signal_id = so.signal_id
       WHERE so.window_seconds = $1
       ORDER BY so.signal_id, so.created_at DESC
     )
     SELECT
       m.id AS monitor_id,
       m.url,
       COUNT(DISTINCT s.id)::text AS total,
       COUNT(DISTINCT CASE WHEN ${isHitPredicate()} THEN s.id END)::text AS hits
     FROM monitors m
     LEFT JOIN signals s ON s.monitor_id = m.id AND s.is_heartbeat = false
     LEFT JOIN t1d_per_signal t ON t.signal_id = s.id
     GROUP BY m.id, m.url
     ORDER BY total DESC, m.url ASC`,
    [T1D_WINDOW],
  );
  return rows.map((r) => ({
    monitorId: r.monitor_id,
    url: r.url,
    total: Number(r.total),
    hits: Number(r.hits),
    hitRatio: Number(r.total) > 0 ? Number(r.hits) / Number(r.total) : 0,
  }));
}

async function recentCallsQuery(limit: number): Promise<RecentCall[]> {
  const { rows } = await query<RecentRow>(
    `SELECT
       s.id AS signal_id,
       s.detected_at,
       m.url AS monitor_url,
       ag.conviction,
       ag.thesis,
       ag.recommended_action,
       o.chain_tx_hash AS trade_tx_hash,
       COALESCE(
         (SELECT json_build_object(
           't1h', MAX(CASE WHEN so.window_seconds = 3600 THEN so.pct_change END),
           't1d', MAX(CASE WHEN so.window_seconds = 86400 THEN so.pct_change END),
           't7d', MAX(CASE WHEN so.window_seconds = 604800 THEN so.pct_change END)
         )::text
         FROM signal_outcomes so
         WHERE so.signal_id = s.id),
         '{"t1h":null,"t1d":null,"t7d":null}'
       )::jsonb AS outcomes,
       COALESCE(
         (SELECT array_agg(DISTINCT sc.detector_type)
         FROM signal_classifications sc
         WHERE sc.signal_id = s.id),
         ARRAY[]::text[]
       ) AS detector_types
     FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     LEFT JOIN agent_scores ag ON ag.signal_id = s.id
     LEFT JOIN LATERAL (
       SELECT chain_tx_hash FROM orders
       WHERE signal_id = s.id AND status = 'filled'
       ORDER BY placed_at DESC LIMIT 1
     ) o ON true
     WHERE s.is_heartbeat = false
     ORDER BY s.detected_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    signalId: r.signal_id,
    detectedAt: r.detected_at,
    monitorUrl: r.monitor_url,
    detectorTypes: r.detector_types ?? [],
    conviction: r.conviction,
    thesis: r.thesis,
    recommendedAction: r.recommended_action,
    tradeTxHash: r.trade_tx_hash,
    outcomes: r.outcomes ?? { t1h: null, t1d: null, t7d: null },
  }));
}

interface ProofCoverageRow {
  total: string;
  with_hedera: string;
}

async function proofCoverageQuery(): Promise<ProofCoverageRow> {
  const { rows } = await query<ProofCoverageRow>(
    `SELECT
       COUNT(*)::text AS total,
       -- Count only successful HCS writes. The hedera_hcs_message_id
       -- column is written by a COALESCE update, so a failed attempt
       -- leaves the previous error JSON in place rather than NULL.
       -- A successful write stores either a clean 0.0.xxx@123.456
       -- transaction id (post-Day 17 extract fix) or the agent-kit
       -- envelope (pre-fix). Both contain a 0.0. account prefix; the
       -- failing writes contain "INVALID_SIGNATURE" or "Field ''".
       COUNT(*) FILTER (
         WHERE hedera_hcs_message_id IS NOT NULL
           AND hedera_hcs_message_id LIKE '0.0.%'
       )::text AS with_hedera
     FROM signals WHERE NOT is_heartbeat`,
  );
  return rows[0] ?? { total: '0', with_hedera: '0' };
}
