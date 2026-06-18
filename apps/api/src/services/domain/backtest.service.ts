import { query } from '../../db/pool.js';
import { getPriceAtWindow } from '../price.js';
import { logger } from '../../logger.js';
import type { AssetMapping, DetectorBacktestStats, SignalOutcome } from '@lenitnes/types';

const DEFAULT_WINDOWS = [3600, 14400, 86400, 604800]; // 1h, 4h, 24h, 7d

function resolveAsset(mapping: AssetMapping): { id: string } | null {
  if (mapping.coingeckoId) return { id: mapping.coingeckoId };
  return null;
}

export async function processSignalOutcomes(
  windows: number[] = DEFAULT_WINDOWS,
): Promise<{ processed: number; errors: number }> {
  // Signals with classifications whose monitor has asset_mapping but no outcomes yet.
  const { rows: pending } = await query<{
    signal_id: string;
    detected_at: string;
    asset_mapping: AssetMapping;
  }>(
    `SELECT DISTINCT s.id AS signal_id, s.detected_at, m.asset_mapping
       FROM signals s
       JOIN monitors m ON m.id = s.monitor_id
       JOIN signal_classifications sc ON sc.signal_id = s.id
      WHERE NOT EXISTS (
        SELECT 1 FROM signal_outcomes so WHERE so.signal_id = s.id
      )
        AND m.asset_mapping != '{}'::jsonb
        AND s.is_heartbeat = false
      ORDER BY s.detected_at DESC
      LIMIT 100`,
  );

  let processed = 0;
  let errors = 0;

  for (const row of pending) {
    const asset = resolveAsset(row.asset_mapping);
    if (!asset) {
      errors++;
      continue;
    }

    const signalTime = new Date(row.detected_at);
    const outcomes: Array<{
      window_seconds: number;
      price_at_signal: number;
      price_after: number;
      pct_change: number;
      direction: string;
    }> = [];

    for (const windowSec of windows) {
      try {
        const result = await getPriceAtWindow(asset.id, signalTime, windowSec);
        if (!result) continue;

        const pctChange = ((result.afterWindow - result.atSignal) / result.atSignal) * 100;
        const direction = pctChange > 0.5 ? 'up' : pctChange < -0.5 ? 'down' : 'flat';

        outcomes.push({
          window_seconds: windowSec,
          price_at_signal: result.atSignal,
          price_after: result.afterWindow,
          pct_change: pctChange,
          direction,
        });
      } catch (err) {
        logger.warn(
          { err, signalId: row.signal_id, window: windowSec },
          'price fetch failed for outcome',
        );
      }
    }

    if (outcomes.length === 0) {
      errors++;
      continue;
    }

    try {
      for (const o of outcomes) {
        await query(
          `INSERT INTO signal_outcomes
             (signal_id, asset, window_seconds, price_at_signal, price_after, pct_change, direction)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (signal_id, asset, window_seconds) DO NOTHING`,
          [
            row.signal_id,
            asset.id,
            o.window_seconds,
            o.price_at_signal.toFixed(8),
            o.price_after.toFixed(8),
            o.pct_change.toFixed(4),
            o.direction,
          ],
        );
      }
      processed++;
    } catch (err) {
      logger.error({ err, signalId: row.signal_id }, 'outcome insert failed');
      errors++;
    }
  }

  if (processed > 0) {
    await refreshBacktestStats();
  }

  return { processed, errors };
}

export async function refreshBacktestStats(): Promise<void> {
  // Aggregate per (detector_type, asset) across all outcomes.
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
       SELECT sc.detector_type, so.asset, so.pct_change, so.window_seconds
         FROM signal_classifications sc
         JOIN signal_outcomes so ON so.signal_id = sc.signal_id
     ),
     agg AS (
       SELECT detector_type,
              asset,
              COUNT(*) AS total_signals,
              COUNT(*) FILTER (WHERE ABS(pct_change::numeric) > 1) AS correct_count,
              AVG(pct_change::numeric) AS avg_pct,
              AVG(ABS(pct_change::numeric)) AS avg_abs,
              (ARRAY_AGG(window_seconds ORDER BY ABS(pct_change::numeric) DESC))[1] AS best_window,
              ARRAY_AGG(pct_change::numeric ORDER BY pct_change::numeric) AS returns
         FROM joined
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
