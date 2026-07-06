import { query } from '../../db/pool.js';
import { priceData } from '../data-providers/registry.js';
import { config } from '../../config.js';
import { sendTelegram } from '../notify.js';
import { logger } from '../../logger.js';
import type { AssetMapping, DetectorBacktestStats, SignalOutcome } from '@lenitnes/types';

const DEFAULT_WINDOWS = [3600, 14400, 86400, 604800]; // 1h, 4h, 24h, 7d

const WINDOW_LABEL: Record<number, string> = {
  3600: 'T+1h',
  14400: 'T+4h',
  86400: 'T+1d',
  604800: 'T+7d',
};

function resolveAsset(mapping: AssetMapping): { id: string } | null {
  if (mapping.coingeckoId) return { id: mapping.coingeckoId };
  return null;
}

export async function processSignalOutcomes(
  windows: number[] = DEFAULT_WINDOWS,
): Promise<{ processed: number; errors: number }> {
  // Signal × window pairs where the window has actually elapsed and
  // no outcome row exists yet. The maturity condition is the critical
  // part: the old query processed every window as soon as the signal
  // had classifications, so a T+7d "outcome" recorded on day 0 was
  // just the current price mislabeled — polluting the scorecard the
  // whole system exists to keep honest.
  const { rows: pending } = await query<{
    signal_id: string;
    detected_at: string;
    asset_mapping: AssetMapping;
    window_seconds: number;
  }>(
    `SELECT s.id AS signal_id, s.detected_at, m.asset_mapping, w.window_seconds
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
        AND m.asset_mapping != '{}'::jsonb
        AND s.is_heartbeat = false
        AND s.detected_at + (w.window_seconds || ' seconds')::interval <= now()
      ORDER BY s.detected_at DESC, w.window_seconds
      LIMIT 100`,
    [windows],
  );

  let processed = 0;
  let errors = 0;

  for (const row of pending) {
    const asset = resolveAsset(row.asset_mapping);
    if (!asset) {
      errors++;
      continue;
    }

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
      if (row.window_seconds === 86400 || row.window_seconds === 604800) {
        await broadcastOutcomeVerdict(row.signal_id, asset.id, row.window_seconds, pctChange);
      }
    } catch (err) {
      logger.warn(
        { err, signalId: row.signal_id, window: row.window_seconds },
        'outcome processing failed for window',
      );
      errors++;
    }
  }

  if (processed > 0) {
    await refreshBacktestStats();
  }

  return { processed, errors };
}

/**
 * Post a "was the agent right?" verdict to the public channel for an
 * above-threshold directional call whose outcome window just matured.
 * Best-effort; never throws.
 */
async function broadcastOutcomeVerdict(
  signalId: string,
  asset: string,
  windowSeconds: number,
  pctChange: number,
): Promise<void> {
  try {
    if (!config.telegram.botToken || !config.telegram.publicChannelId) return;

    const { rows } = await query<{
      conviction: number;
      recommended_action: string;
    }>(
      `SELECT conviction, recommended_action FROM agent_scores
        WHERE signal_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [signalId],
    );
    const score = rows[0];
    if (!score || score.conviction < 70 || score.recommended_action === 'none') return;

    const action = score.recommended_action.toUpperCase();
    const label = WINDOW_LABEL[windowSeconds] ?? `${windowSeconds}s`;
    const move = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`;

    let verdict: string;
    if (Math.abs(pctChange) <= 0.5) {
      verdict = `⚪ flat (${move}) — no verdict`;
    } else {
      const correct =
        (score.recommended_action === 'long' && pctChange > 0) ||
        (score.recommended_action === 'short' && pctChange < 0);
      verdict = correct ? `✅ ${move} — call CORRECT` : `❌ ${move} — call WRONG`;
    }

    const message = [
      `🔎 LENITNES · verdict · ${asset.toUpperCase()} ${action} @ ${score.conviction}/100 · ${label}`,
      ``,
      verdict,
      ``,
      `🔗 ${config.webOrigin}/signals/${signalId}`,
    ].join('\n');

    await sendTelegram(config.telegram.publicChannelId, message);
    logger.info({ signalId, windowSeconds, pctChange }, 'outcome verdict broadcast');
  } catch (err) {
    logger.error({ err, signalId, windowSeconds }, 'outcome verdict broadcast failed');
  }
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
