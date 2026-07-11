import { query } from '../../db/pool.js';
import { priceData } from '../data-providers/registry.js';
import { logger } from '../../logger.js';
import { sqlHitPredicate } from './outcome-metrics.js';
import {
  loadVerdictContext,
  broadcastVerdictBatch,
  type VerdictBroadcastItem,
} from '../telegram-messages.js';
import type { DetectorBacktestStats, SignalOutcome } from '@lenitnes/types';

const DEFAULT_WINDOWS = [3600, 14400, 86400, 604800]; // 1h, 4h, 24h, 7d

export async function processSignalOutcomes(
  windows: number[] = DEFAULT_WINDOWS,
): Promise<{ processed: number; errors: number }> {
  // Signal × window pairs where the window has actually elapsed and
  // no outcome row exists yet. The maturity condition is the critical
  // part: the old query processed every window as soon as the signal
  // had classifications, so a T+7d "outcome" recorded on day 0 was
  // just the current price mislabeled — polluting the scorecard the
  // whole system exists to keep honest.
  // Asset resolution prefers the per-signal override (narrative
  // signals carry their dominant asset there; the narrative monitor
  // itself has no fixed coingeckoId) and falls back to the monitor's
  // asset_mapping for repo monitors.
  const { rows: pending } = await query<{
    signal_id: string;
    detected_at: string;
    asset_id: string;
    window_seconds: number;
  }>(
    `SELECT s.id AS signal_id, s.detected_at,
            COALESCE(s.asset, m.asset_mapping->>'coingeckoId') AS asset_id,
            w.window_seconds
       FROM signals s
       JOIN monitors m ON m.id = s.monitor_id
       CROSS JOIN unnest($1::int[]) AS w(window_seconds)
      WHERE EXISTS (
        SELECT 1 FROM signal_classifications sc WHERE sc.signal_id = s.id
      )
        AND NOT EXISTS (
          SELECT 1 FROM signal_outcomes so
           WHERE so.signal_id = s.id AND so.window_seconds = w.window_seconds
        )
        AND COALESCE(s.asset, m.asset_mapping->>'coingeckoId') IS NOT NULL
        AND s.is_heartbeat = false
        AND s.detected_at + (w.window_seconds || ' seconds')::interval <= now()
      ORDER BY s.detected_at DESC, w.window_seconds
      LIMIT 100`,
    [windows],
  );

  let processed = 0;
  let errors = 0;
  const verdictQueue: VerdictBroadcastItem[] = [];

  for (const row of pending) {
    // The SQL filters unresolvable assets; this guard covers callers
    // (and tests) that bypass it.
    if (!row.asset_id) {
      errors++;
      continue;
    }
    const asset = { id: row.asset_id };

    try {
      const result = await priceData.getPriceAtWindow(
        asset.id,
        new Date(row.detected_at),
        row.window_seconds,
      );
      if (!result) {
        errors++;
        continue;
      }

      const pctChange = ((result.afterWindow - result.atSignal) / result.atSignal) * 100;
      const direction = pctChange > 0.5 ? 'up' : pctChange < -0.5 ? 'down' : 'flat';

      await query(
        `INSERT INTO signal_outcomes
           (signal_id, asset, window_seconds, price_at_signal, price_after, pct_change, direction)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (signal_id, asset, window_seconds) DO NOTHING`,
        [
          row.signal_id,
          asset.id,
          row.window_seconds,
          result.atSignal.toFixed(8),
          result.afterWindow.toFixed(8),
          pctChange.toFixed(4),
          direction,
        ],
      );
      processed++;

      // Public verdict at T+1d and T+7d for above-threshold calls:
      // "we said X, price did Y". This is the accountability post —
      // the channel's best content — and it only exists because the
      // window genuinely elapsed before the snapshot was taken.
      // FRESH maturities only: a window that matured more than 6h
      // ago is a historical backfill (e.g. re-recording purged
      // premature rows), and broadcasting a burst of stale verdicts
      // would flood the channel with old-era noise.
      const maturedAt = new Date(row.detected_at).getTime() + row.window_seconds * 1000;
      const isFresh = Date.now() - maturedAt < 6 * 3_600_000;
      if (isFresh && (row.window_seconds === 86400 || row.window_seconds === 604800)) {
        const ctx = await loadVerdictContext(row.signal_id, asset.id);
        if (ctx) {
          verdictQueue.push({
            ...ctx,
            windowSeconds: row.window_seconds,
            pctChange,
          });
        }
      }
    } catch (err) {
      logger.warn(
        { err, signalId: row.signal_id, window: row.window_seconds },
        'outcome processing failed for window',
      );
      errors++;
    }
  }

  if (verdictQueue.length > 0) {
    await broadcastVerdictBatch(verdictQueue);
  }

  if (processed > 0) {
    await refreshBacktestStats();
  }

  return { processed, errors };
}

export async function refreshBacktestStats(): Promise<void> {
  const hitSql = sqlHitPredicate();
  // Aggregate per (detector_type, asset) with direction-adjusted hits.
  const { rows } = await query<{
    detector_type: string;
    asset: string;
    total_signals: string;
    correct_count: string;
    avg_pct: string;
    avg_abs: string;
    best_window: number | null;
    returns: string;
  }>(
    `WITH joined AS (
       SELECT sc.detector_type,
              so.asset,
              so.pct_change,
              so.window_seconds,
              ag.recommended_action,
              so.direction
         FROM signal_classifications sc
         JOIN signal_outcomes so ON so.signal_id = sc.signal_id
         LEFT JOIN agent_scores ag ON ag.signal_id = sc.signal_id
        WHERE so.window_seconds = 86400
          AND ag.recommended_action IS NOT NULL
          AND ag.recommended_action != 'none'
     ),
     directional AS (
       SELECT detector_type,
              asset,
              CASE WHEN recommended_action = 'short'
                   THEN -pct_change::numeric
                   ELSE pct_change::numeric
              END AS d_pct,
              window_seconds,
              recommended_action,
              direction
         FROM joined
     ),
     agg AS (
       SELECT detector_type,
              asset,
              COUNT(*) AS total_signals,
              COUNT(*) FILTER (WHERE ${hitSql}) AS correct_count,
              AVG(d_pct) AS avg_pct,
              AVG(ABS(d_pct)) AS avg_abs,
              (ARRAY_AGG(window_seconds ORDER BY ABS(d_pct) DESC))[1] AS best_window,
              ARRAY_AGG(d_pct ORDER BY d_pct) AS returns
         FROM directional
        GROUP BY detector_type, asset
     )
     SELECT detector_type, asset,
            total_signals::text,
            correct_count::text,
            avg_pct::text,
            avg_abs::text,
            best_window,
            returns::text
       FROM agg`,
  );

  for (const row of rows) {
    const returns = parseReturnArray(row.returns);
    const median = computeMedian(returns);
    const sharpe = computeSharpe(returns);

    await query(
      `INSERT INTO detector_backtest_stats
         (detector_type, asset, total_signals, correct_count, accuracy,
          avg_pct_change, median_pct_change, avg_abs_return, sharpe_estimate, best_window, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (detector_type, asset) DO UPDATE SET
         total_signals = EXCLUDED.total_signals,
         correct_count = EXCLUDED.correct_count,
         accuracy = EXCLUDED.accuracy,
         avg_pct_change = EXCLUDED.avg_pct_change,
         median_pct_change = EXCLUDED.median_pct_change,
         avg_abs_return = EXCLUDED.avg_abs_return,
         sharpe_estimate = EXCLUDED.sharpe_estimate,
         best_window = EXCLUDED.best_window,
         updated_at = now()`,
      [
        row.detector_type,
        row.asset,
        parseInt(row.total_signals, 10),
        parseInt(row.correct_count, 10),
        row.total_signals !== '0'
          ? ((parseInt(row.correct_count, 10) / parseInt(row.total_signals, 10)) * 100).toFixed(2)
          : '0',
        row.avg_pct,
        median.toFixed(4),
        row.avg_abs,
        sharpe.toFixed(4),
        row.best_window,
      ],
    );
  }
}

export async function getBacktestStats(filters?: {
  detectorType?: string;
  asset?: string;
}): Promise<DetectorBacktestStats[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (filters?.detectorType) {
    conditions.push(`detector_type = $${i++}`);
    params.push(filters.detectorType);
  }
  if (filters?.asset) {
    conditions.push(`asset = $${i++}`);
    params.push(filters.asset);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query<DetectorBacktestStats>(
    `SELECT * FROM detector_backtest_stats ${where} ORDER BY accuracy DESC NULLS LAST`,
    params,
  );
  return rows;
}

export async function getSignalOutcomes(signalId: string): Promise<SignalOutcome[]> {
  const { rows } = await query<SignalOutcome>(
    `SELECT signal_id, asset, window_seconds,
            price_at_signal::text, price_after::text,
            pct_change::text, direction
       FROM signal_outcomes
      WHERE signal_id = $1
      ORDER BY window_seconds`,
    [signalId],
  );
  return rows;
}

// ── Helpers ──────────────────────────────────────────────────────

function parseReturnArray(raw: string): number[] {
  // Postgres ARRAY_AGG returns e.g. "{1.2,-0.5,3.4}"
  if (!raw || raw === '{}') return [];
  return raw
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map(Number)
    .filter((n) => !isNaN(n));
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return mean / std;
}
