// ─────────────────────────────────────────────────────────────
// Detector track record — the learning loop.
//
// We already record matured T+1d outcomes for every signal. This
// module turns that history into a per-detector win-rate ledger and
// feeds it two ways:
//
//   1. SOFT — a `detector_track_record` string injected into the
//      agent prompt so the LLM can discount detectors that
//      chronically lose and trust ones that hit (rubric v5).
//
//   2. HARD — `isChronicallyLosing` powers a trade gate in the
//      treasury that downgrades a detector's signals to paper when
//      it has enough matured history AND a win rate below a floor.
//      The soft input nudges; the hard floor protects the book from
//      a detector the market has disproven.
//
// Both read the same 90-day, T+1d-matured, directional-hit data so
// the two surfaces never disagree about what "losing" means.
// ─────────────────────────────────────────────────────────────

import { query } from '../../db/pool.js';
import { sqlHitPredicate } from '../domain/outcome-metrics.js';

/** Lookback window for the track record. */
const TRACK_RECORD_LOOKBACK_DAYS = 90;
/**
 * Minimum matured outcomes before a win rate is trusted enough to
 * hard-gate. Below this, history is too thin to act on and we only
 * report (soft) — never downgrade.
 */
export const MIN_MATURED_FOR_HARD_FLOOR = 12;
/** A detector with a directional hit rate below this is "chronically losing". */
export const CHRONIC_LOSS_WIN_RATE = 0.4;

export interface DetectorTrackRecord {
  detectorType: string;
  totalSignals: number;
  maturedT1d: number;
  hitsT1d: number;
  /** Directional hit rate, 0-1. Null when no matured outcomes yet. */
  winRate: number | null;
  avgDirectionalPct1d: number;
  avgConviction: number;
}

/**
 * Per-detector win-rate ledger across ALL monitors over the lookback
 * window. One row per detector type that has fired at least once.
 * Cached in-process for 10 minutes — the ledger is slow-moving and
 * the query scans the whole signals table.
 */
let cache: { at: number; rows: DetectorTrackRecord[] } | null = null;
const CACHE_TTL_MS = 10 * 60_000;

export async function getDetectorTrackRecords(): Promise<DetectorTrackRecord[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;

  const hitSql = sqlHitPredicate();
  const { rows } = await query<{
    detector_type: string;
    total_signals: string;
    matured_t1d: string;
    hits_t1d: string;
    avg_dir_1d: string;
    avg_conviction: string;
  }>(
    `WITH per_signal AS (
       SELECT
         sc.detector_type,
         s.id AS signal_id,
         ag.recommended_action,
         MAX(so.pct_change) FILTER (WHERE so.window_seconds = 86400)::float AS t1d_pct,
         MAX(so.direction) FILTER (WHERE so.window_seconds = 86400) AS direction,
         MAX(ag.conviction) AS conviction
       FROM signals s
       JOIN signal_classifications sc ON sc.signal_id = s.id
       LEFT JOIN agent_scores ag ON ag.signal_id = s.id
       LEFT JOIN signal_outcomes so ON so.signal_id = s.id
       WHERE s.is_heartbeat = false
         AND s.detected_at > now() - ($1 || ' days')::interval
         AND ag.recommended_action IN ('long', 'short')
       GROUP BY sc.detector_type, s.id, ag.recommended_action
     )
     SELECT
       detector_type,
       COUNT(*)::text AS total_signals,
       COUNT(*) FILTER (WHERE t1d_pct IS NOT NULL)::text AS matured_t1d,
       COUNT(*) FILTER (WHERE t1d_pct IS NOT NULL AND ${hitSql})::text AS hits_t1d,
       COALESCE(AVG(
         CASE WHEN recommended_action = 'short' THEN -t1d_pct ELSE t1d_pct END
       ) FILTER (WHERE t1d_pct IS NOT NULL), 0)::text AS avg_dir_1d,
       COALESCE(AVG(conviction) FILTER (WHERE t1d_pct IS NOT NULL), 0)::text AS avg_conviction
     FROM per_signal
     GROUP BY detector_type
     ORDER BY detector_type`,
    [TRACK_RECORD_LOOKBACK_DAYS],
  );

  const records: DetectorTrackRecord[] = rows.map((r) => {
    const matured = parseInt(r.matured_t1d, 10);
    const hits = parseInt(r.hits_t1d, 10);
    return {
      detectorType: r.detector_type,
      totalSignals: parseInt(r.total_signals, 10),
      maturedT1d: matured,
      hitsT1d: hits,
      winRate: matured > 0 ? hits / matured : null,
      avgDirectionalPct1d: parseFloat(r.avg_dir_1d),
      avgConviction: parseFloat(r.avg_conviction),
    };
  });

  cache = { at: Date.now(), rows: records };
  return records;
}

/**
 * Soft input for the agent prompt. Renders the detectors that fired
 * on THIS signal alongside their historical record, so the agent can
 * weigh credibility per detector rather than treating all detectors
 * as equally trustworthy. Returns '' when none of the fired detectors
 * have matured history (nothing to say yet).
 */
export async function buildDetectorTrackRecordContext(
  firedDetectorTypes: string[],
): Promise<string> {
  if (firedDetectorTypes.length === 0) return '';
  const all = await getDetectorTrackRecords();
  const byType = new Map(all.map((r) => [r.detectorType, r]));

  const relevant = firedDetectorTypes
    .map((t) => byType.get(t))
    .filter((r): r is DetectorTrackRecord => r != null);

  if (relevant.length === 0) {
    return 'Detector track record: no matured T+1d history yet for the detectors that fired. Treat as unproven — do not assume they win.';
  }

  const lines = ['--- Detector track record (90d, T+1d matured) ---'];
  for (const r of relevant) {
    if (r.winRate == null || r.maturedT1d === 0) {
      lines.push(
        `  ${r.detectorType}: ${r.totalSignals} signals, no matured outcomes yet — unproven.`,
      );
      continue;
    }
    const pct = (r.winRate * 100).toFixed(0);
    const verdict =
      r.maturedT1d >= MIN_MATURED_FOR_HARD_FLOOR && r.winRate < CHRONIC_LOSS_WIN_RATE
        ? ' [chronically losing — discount hard]'
        : r.winRate >= 0.6
          ? ' [historically reliable]'
          : '';
    lines.push(
      `  ${r.detectorType}: ${pct}% directional hit (${r.hitsT1d}/${r.maturedT1d}), ` +
        `avg T+1d ${r.avgDirectionalPct1d >= 0 ? '+' : ''}${r.avgDirectionalPct1d.toFixed(2)}%, ` +
        `avg conviction ${r.avgConviction.toFixed(0)}.${verdict}`,
    );
  }
  return lines.join('\n');
}

/**
 * Hard-floor predicate: true when a detector has enough matured
 * history AND a win rate below the floor — i.e. the market has
 * disproven it often enough that we downgrade its trades to paper.
 * Thin history (fewer than MIN_MATURED_FOR_HARD_FLOOR matured
 * outcomes) never returns true, so a new detector gets a fair
 * trial before any gate applies.
 */
export function isChronicallyLosing(record: DetectorTrackRecord | undefined): boolean {
  if (!record) return false;
  if (record.maturedT1d < MIN_MATURED_FOR_HARD_FLOOR) return false;
  if (record.winRate == null) return false;
  return record.winRate < CHRONIC_LOSS_WIN_RATE;
}

/** Convenience: is ANY of the fired detectors chronically losing? */
export async function anyDetectorChronicallyLosing(
  firedDetectorTypes: string[],
): Promise<{ losing: boolean; losingDetectors: string[] }> {
  if (firedDetectorTypes.length === 0) return { losing: false, losingDetectors: [] };
  const all = await getDetectorTrackRecords();
  const byType = new Map(all.map((r) => [r.detectorType, r]));
  const losingDetectors = firedDetectorTypes.filter((t) => isChronicallyLosing(byType.get(t)));
  return { losing: losingDetectors.length > 0, losingDetectors };
}

// Test helper — drop the cache between tests.
export function _internalResetTrackRecordCache(): void {
  cache = null;
}
