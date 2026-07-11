// ─────────────────────────────────────────────────────────────
// Scorecard — public credibility surface. Pure SQL aggregations
// over signals × agent_scores × signal_outcomes × orders. No
// business logic — just composed queries.
// Day 7 of the pivot.
// ─────────────────────────────────────────────────────────────

import { query } from '../db/pool.js';
import { sqlHitPredicate } from './domain/outcome-metrics.js';

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
  /** Signals with a matured T+1d outcome — the honest hit-ratio denominator. */
  withT1d: number;
  hits: number;
  hitRatio: number;
  // Average directional pct change at each window — sign-adjusted
  // for the agent's recommended action so positive = trade was right.
  // Null when no T+1d outcome data exists for this detector yet.
  avgT1hPct: number | null;
  avgT1dPct: number | null;
  avgT7dPct: number | null;
}

export interface ScorecardByWatchlist {
  monitorId: string;
  url: string;
  total: number;
  /** Signals with a matured T+1d outcome — the honest hit-ratio denominator. */
  withT1d: number;
  hits: number;
  hitRatio: number;
}

export interface ScorecardByConvictionBand {
  /** Inclusive lower bound of the conviction range. */
  bandMin: number;
  /** Inclusive upper bound of the conviction range. */
  bandMax: number;
  /** Human-readable label (e.g. "70-79"). */
  label: string;
  /** Total scored signals in this band. */
  total: number;
  /** Subset that traded at all (above the firing threshold). */
  traded: number;
  /** Traded calls whose T+1d outcome has matured — the hit-ratio denominator. */
  closed: number;
  /** Subset of traded calls whose t1d outcome matched the recommended direction. */
  hits: number;
  hitRatio: number;
  /** Directional avg pct change (positive = trade was right). */
  avgT1hPct: number | null;
  avgT1dPct: number | null;
  avgT7dPct: number | null;
}

export interface ScorecardOverall {
  totalSignals: number;
  totalTrades: number;
  hitRatio: number;
  cumulativePnlUsd: number;
  sharpe: number;
  maxDrawdownUsd: number;
  // The denominator behind hitRatio / cumulativePnl / sharpe. `closed` is the
  // number of above-threshold calls with a T+1d outcome row; `pending` is the
  // number that traded but haven't reached T+1d yet. Together they let the
  // public scorecard render an honest "n=X of Y" caveat instead of presenting
  // a hit ratio based on a tiny denominator without context.
  outcomesSummary: {
    closed: number;
    pending: number;
  };
  bySignalType: ScorecardBySignalType[];
  byWatchlist: ScorecardByWatchlist[];
  /** Calibration breakdown: how well does conviction predict outcomes? */
  byConvictionBand: ScorecardByConvictionBand[];
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

/** Uses shared hit predicate — see domain/outcome-metrics.ts */
const isHitPredicate = sqlHitPredicate;

interface CountsRow {
  total_signals: string;
  total_trades: string;
  // Number of filled orders whose originating signal also has a T+1d
  // outcome row. The complement (total_trades − closed_trades) is the
  // count of trades still waiting on their T+1d snapshot — the caveat
  // the public scorecard needs so judges read the hit ratio in context.
  closed_trades: string;
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
  const [counts, outcomes, byType, byWatchlist, byBand, recent, proofCoverage] = await Promise.all([
    countsQuery(),
    outcomesQuery(),
    bySignalTypeQuery(),
    byWatchlistQuery(),
    byConvictionBandQuery(),
    recentCallsQuery(20),
    proofCoverageQuery(),
  ]);

  const closed = Number(counts.closed_trades);
  const pending = Math.max(0, Number(counts.total_trades) - closed);

  return {
    totalSignals: Number(counts.total_signals),
    totalTrades: Number(counts.total_trades),
    hitRatio: Number(outcomes.hit_ratio ?? 0),
    cumulativePnlUsd: Number(outcomes.cumulative_pnl ?? 0),
    sharpe: Number(outcomes.sharpe ?? 0),
    maxDrawdownUsd: Number(outcomes.max_drawdown ?? 0),
    outcomesSummary: { closed, pending },
    bySignalType: byType,
    byWatchlist: byWatchlist,
    byConvictionBand: byBand,
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
       (SELECT COUNT(*) FROM orders WHERE status = 'filled')::text AS total_trades,
       (SELECT COUNT(DISTINCT o.signal_id)
          FROM orders o
          JOIN signal_outcomes so ON so.signal_id = o.signal_id
         WHERE o.status = 'filled' AND so.window_seconds = $1)::text AS closed_trades`,
    [T1D_WINDOW],
  );
  return rows[0] ?? { total_signals: '0', total_trades: '0', closed_trades: '0' };
}

async function outcomesQuery(): Promise<OutcomesRow> {
  // Hit ratio + sharpe come from TRADED signals' T+1d outcomes,
  // direction-adjusted (a short profits when pct_change is negative).
  // Cumulative P&L + max drawdown come from the positions ledger —
  // realized, sized, direction-aware pnl_usd — NOT from raw price
  // deltas. (The previous version summed price_after −
  // price_at_signal across every outcome row: a $400 BTC daily move
  // showed up as -$400 "P&L" on a 0.01-unit paper position that was
  // never even traded on. The scorecard's whole premise is that it
  // cannot misremember performance; that math was misremembering it.)
  const { rows } = await query<OutcomesRow>(
    `WITH t1d AS (
       SELECT
         so.signal_id,
         ag.recommended_action,
         so.direction,
         CASE WHEN ag.recommended_action = 'short'
              THEN -so.pct_change ELSE so.pct_change END AS d_pct
       FROM signal_outcomes so
       JOIN agent_scores ag ON ag.signal_id = so.signal_id
       JOIN orders o ON o.signal_id = so.signal_id AND o.status = 'filled'
       WHERE so.window_seconds = $1
         AND ag.recommended_action != 'none'
     ),
     hits AS (
       SELECT
         COUNT(*) FILTER (WHERE ${isHitPredicate()})::text AS hits,
         COUNT(*)::text AS total
       FROM t1d
     ),
     returns AS (
       SELECT COALESCE(AVG(d_pct) / NULLIF(STDDEV_SAMP(d_pct), 0), 0)::text AS sharpe
       FROM t1d
     ),
     ledger AS (
       SELECT COALESCE(SUM(pnl_usd), 0)::text AS cumulative_pnl
       FROM positions WHERE status = 'closed'
     ),
     drawdown AS (
       WITH ordered AS (
         SELECT
           closed_at,
           SUM(pnl_usd) OVER (ORDER BY closed_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_pnl
         FROM positions
         WHERE status = 'closed' AND pnl_usd IS NOT NULL
       )
       SELECT COALESCE(MAX(peak - cum_pnl), 0)::text AS max_drawdown
       FROM (
         SELECT
           cum_pnl,
           MAX(cum_pnl) OVER (ORDER BY closed_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS peak
         FROM ordered
       ) t
     )
     SELECT
       (SELECT total FROM hits) AS total,
       (SELECT hits FROM hits) AS hits,
       CASE WHEN (SELECT total FROM hits)::int > 0
            THEN (SELECT hits FROM hits)::float / (SELECT total FROM hits)::int
            ELSE NULL END AS hit_ratio,
       (SELECT cumulative_pnl FROM ledger) AS cumulative_pnl,
       (SELECT sharpe FROM returns) AS sharpe,
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
  // For each detector, compute the count of signals that fired with
  // it + the count that were "right" (price moved in the agent's
  // recommended direction at T+1d) + the average directional pct
  // change at each outcome window. The directional pct change is
  // sign-flipped for short trades so positive = the trade made money.
  const { rows } = await query<{
    detector_type: string;
    total: string;
    with_t1d: string;
    hits: string;
    avg_t1h_pct: string | null;
    avg_t1d_pct: string | null;
    avg_t7d_pct: string | null;
  }>(
    `WITH outcomes_per_signal AS (
       SELECT
         so.signal_id,
         MAX(so.pct_change) FILTER (WHERE so.window_seconds = 3600)::float AS t1h_pct,
         MAX(so.pct_change) FILTER (WHERE so.window_seconds = 86400)::float AS t1d_pct,
         MAX(so.pct_change) FILTER (WHERE so.window_seconds = 604800)::float AS t7d_pct,
         MAX(so.direction) FILTER (WHERE so.window_seconds = 86400) AS direction,
         MAX(ag.recommended_action) AS recommended_action
       FROM signal_outcomes so
       LEFT JOIN agent_scores ag ON ag.signal_id = so.signal_id
       GROUP BY so.signal_id
     ),
     directional AS (
       -- Sign-flip the pct change so positive = trade was right.
       -- For 'long': keep pct as-is. For 'short': negate.
       SELECT
         signal_id,
         direction,
         recommended_action,
         CASE WHEN recommended_action = 'short' THEN -t1h_pct ELSE t1h_pct END AS d_t1h,
         CASE WHEN recommended_action = 'short' THEN -t1d_pct ELSE t1d_pct END AS d_t1d,
         CASE WHEN recommended_action = 'short' THEN -t7d_pct ELSE t7d_pct END AS d_t7d
       FROM outcomes_per_signal
     )
     SELECT
       sc.detector_type,
       COUNT(DISTINCT sc.signal_id)::text AS total,
       COUNT(DISTINCT CASE WHEN d.d_t1d IS NOT NULL THEN sc.signal_id END)::text AS with_t1d,
       COUNT(DISTINCT CASE WHEN ${isHitPredicate()} THEN sc.signal_id END)::text AS hits,
       AVG(d.d_t1h)::text AS avg_t1h_pct,
       AVG(d.d_t1d)::text AS avg_t1d_pct,
       AVG(d.d_t7d)::text AS avg_t7d_pct
     FROM signal_classifications sc
     LEFT JOIN directional d ON d.signal_id = sc.signal_id
     GROUP BY sc.detector_type
     ORDER BY total DESC`,
  );
  return rows.map((r) => ({
    detectorType: r.detector_type,
    total: Number(r.total),
    withT1d: Number(r.with_t1d),
    hits: Number(r.hits),
    hitRatio: Number(r.with_t1d) > 0 ? Number(r.hits) / Number(r.with_t1d) : 0,
    avgT1hPct: r.avg_t1h_pct != null ? Number(r.avg_t1h_pct) : null,
    avgT1dPct: r.avg_t1d_pct != null ? Number(r.avg_t1d_pct) : null,
    avgT7dPct: r.avg_t7d_pct != null ? Number(r.avg_t7d_pct) : null,
  }));
}

// ── Conviction-band calibration ───────────────────────────────
// Buckets every scored signal by its conviction score and reports
// how the cohort performed. The story this answers:
// "does higher conviction = better outcomes, or is the agent's
//  confidence uncalibrated?"
//
// Bands:
//   0-29   noise          (agent considered, declined)
//   30-49  weak           (agent leaned but didn't act)
//   50-69  borderline     (close to threshold)
//   70-79  threshold      (just over; lowest conviction acted on)
//   80-89  high           (the typical "fire" zone)
//   90-100 maximum        (rare; agent is most certain)
const CONVICTION_BANDS: Array<{ min: number; max: number; label: string }> = [
  { min: 0, max: 29, label: '0-29' },
  { min: 30, max: 49, label: '30-49' },
  { min: 50, max: 69, label: '50-69' },
  { min: 70, max: 79, label: '70-79' },
  { min: 80, max: 89, label: '80-89' },
  { min: 90, max: 100, label: '90-100' },
];

async function byConvictionBandQuery(): Promise<ScorecardByConvictionBand[]> {
  const { rows } = await query<{
    band_label: string;
    total: string;
    traded: string;
    closed: string;
    hits: string;
    avg_t1h_pct: string | null;
    avg_t1d_pct: string | null;
    avg_t7d_pct: string | null;
  }>(
    `WITH scored AS (
       SELECT
         ag.signal_id,
         ag.conviction,
         ag.recommended_action,
         o.id IS NOT NULL AS traded,
         MAX(so.pct_change) FILTER (WHERE so.window_seconds = 3600)::float AS t1h_pct,
         MAX(so.pct_change) FILTER (WHERE so.window_seconds = 86400)::float AS t1d_pct,
         MAX(so.pct_change) FILTER (WHERE so.window_seconds = 604800)::float AS t7d_pct,
         MAX(so.direction) FILTER (WHERE so.window_seconds = 86400) AS direction
       FROM agent_scores ag
       LEFT JOIN orders o ON o.signal_id = ag.signal_id AND o.status = 'filled'
       LEFT JOIN signal_outcomes so ON so.signal_id = ag.signal_id
       GROUP BY ag.signal_id, ag.conviction, ag.recommended_action, o.id
     ),
     directional AS (
       SELECT
         signal_id,
         conviction,
         recommended_action,
         direction,
         traded,
         CASE WHEN recommended_action = 'short' THEN -t1h_pct ELSE t1h_pct END AS d_t1h,
         CASE WHEN recommended_action = 'short' THEN -t1d_pct ELSE t1d_pct END AS d_t1d,
         CASE WHEN recommended_action = 'short' THEN -t7d_pct ELSE t7d_pct END AS d_t7d
       FROM scored
     ),
     bands AS (
       SELECT * FROM (VALUES
         (0, 29, '0-29'),
         (30, 49, '30-49'),
         (50, 69, '50-69'),
         (70, 79, '70-79'),
         (80, 89, '80-89'),
         (90, 100, '90-100')
       ) AS b(b_min, b_max, b_label)
     )
     SELECT
       b.b_label AS band_label,
       COUNT(d.signal_id)::text AS total,
       COUNT(d.signal_id) FILTER (WHERE d.traded)::text AS traded,
       COUNT(d.signal_id) FILTER (WHERE d.traded AND d.d_t1d IS NOT NULL)::text AS closed,
       COUNT(d.signal_id) FILTER (WHERE d.traded AND ${isHitPredicate()})::text AS hits,
       AVG(d.d_t1h)::text AS avg_t1h_pct,
       AVG(d.d_t1d)::text AS avg_t1d_pct,
       AVG(d.d_t7d)::text AS avg_t7d_pct
     FROM bands b
     LEFT JOIN directional d
       ON d.conviction BETWEEN b.b_min AND b.b_max
     GROUP BY b.b_label, b.b_min
     ORDER BY b.b_min ASC`,
  );

  // Hydrate every band even if there are no signals — frontend
  // renders the empty rows so the table shape is stable.
  return CONVICTION_BANDS.map((band) => {
    const row = rows.find((r) => r.band_label === band.label);
    const total = row ? Number(row.total) : 0;
    const traded = row ? Number(row.traded) : 0;
    const closed = row ? Number(row.closed) : 0;
    const hits = row ? Number(row.hits) : 0;
    return {
      bandMin: band.min,
      bandMax: band.max,
      label: band.label,
      total,
      traded,
      closed,
      hits,
      hitRatio: closed > 0 ? hits / closed : 0,
      avgT1hPct: row?.avg_t1h_pct != null ? Number(row.avg_t1h_pct) : null,
      avgT1dPct: row?.avg_t1d_pct != null ? Number(row.avg_t1d_pct) : null,
      avgT7dPct: row?.avg_t7d_pct != null ? Number(row.avg_t7d_pct) : null,
    };
  });
}

async function byWatchlistQuery(): Promise<ScorecardByWatchlist[]> {
  const { rows } = await query<{
    monitor_id: string;
    url: string;
    total: string;
    with_t1d: string;
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
       COUNT(DISTINCT CASE WHEN t.signal_id IS NOT NULL THEN s.id END)::text AS with_t1d,
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
    withT1d: Number(r.with_t1d),
    hits: Number(r.hits),
    hitRatio: Number(r.with_t1d) > 0 ? Number(r.hits) / Number(r.with_t1d) : 0,
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
