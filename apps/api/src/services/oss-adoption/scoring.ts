/**
 * OSS adoption — Phase 1: velocity and acceleration scoring.
 *
 * The proposal (oss-adoption-trading.md §2.2) defines the scoring pipeline:
 * aggregate weekly adoption curves → measure velocity (slope of the adoption
 * metric over a trailing window) and acceleration (slope of velocity) → score.
 *
 * The proposal's canonical metric is `adoption_rate = net_change / total_tracking`
 * (repos currently tracking a company's packages). This module defaults to
 * `netAdd` as the adoption metric when total tracking is unknown (which is the
 * case for a snapshot corpus: we do not maintain cumulative per-repo tracking
 * state), and exposes the metric as a parameter so a future pipeline that has
 * `total_tracking` can score `netAdd / max(1, total_tracking)` instead.
 *
 * Velocity/acceleration are computed with a trailing-window least-squares
 * slope (window = 4 weeks, matching the proposal). The first few weeks have
 * no slope (null) and are excluded from correlations downstream.
 */
import type { AdoptionWeek } from './curves.js';

/** Adoption metric that can be scored. */
export type ScoreMetric =
  | 'added'
  | 'removed'
  | 'upgraded'
  | 'downgraded'
  | 'changed'
  | 'netAdd'
  | 'activeRepos';

/** A weekly curve bucket annotated with its trailing velocity/acceleration. */
export interface ScoredWeek extends AdoptionWeek {
  /** Least-squares slope of the metric over the trailing window (null when not enough history). */
  velocity: number | null;
  /** Least-squares slope of velocity over the trailing window (null when not enough history). */
  acceleration: number | null;
}

export interface ScoreOptions {
  /** Metric to score (default netAdd). */
  metric?: ScoreMetric;
  /** Trailing window in weeks for the slope (default 4). */
  window?: number;
}

/** Least-squares slope of y over its index positions; null for <2 points. */
export function linearSlope(values: number[]): number | null {
  if (values.length < 2) return null;
  const n = values.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += values[i];
    sxy += i * values[i];
    sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return (n * sxy - sx * sy) / denom;
}

/**
 * Trailing-window slopes for a series. `slopes[i]` is the slope over
 * `values[i - window + 1 .. i]`; entries with fewer than 2 points in the
 * window are null.
 */
export function trailingSlopes(values: number[], window: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(linearSlope(slice));
  }
  return out;
}

/**
 * Annotate gap-filled weekly curves with velocity/acceleration per ticker.
 * Input curves are expected to be already gap-filled (one row per ticker per
 * week) so that slope windows span contiguous weeks.
 */
export function scoreCurves(curves: AdoptionWeek[], options: ScoreOptions = {}): ScoredWeek[] {
  const metric = options.metric ?? 'netAdd';
  const window = options.window ?? 4;

  const tickers = [...new Set(curves.map((c) => c.companyTicker))].sort();
  const scored: ScoredWeek[] = [];
  for (const ticker of tickers) {
    const tickerCurves = curves.filter((c) => c.companyTicker === ticker);
    const values = tickerCurves.map((c) => c[metric]);
    const velocity = trailingSlopes(values, window);
    // Acceleration: slope of velocity (nulls skipped, velocities are null
    // until the first window fills, so acceleration lags one more window).
    const acceleration: Array<number | null> = [];
    const velNumbers = velocity.map((v) => (v == null ? null : v));
    for (let i = 0; i < velocity.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = velNumbers.slice(start, i + 1).filter((v): v is number => v != null);
      acceleration.push(linearSlope(slice));
    }
    for (let i = 0; i < tickerCurves.length; i++) {
      scored.push({ ...tickerCurves[i], velocity: velocity[i], acceleration: acceleration[i] });
    }
  }
  return scored;
}

/** Format a scored-week table to CSV (extends the curves CSV with the two columns). */
export function scoredCurvesToCsv(curves: ScoredWeek[]): string {
  const header = [
    'weekStart',
    'companyTicker',
    'added',
    'removed',
    'upgraded',
    'downgraded',
    'changed',
    'netAdd',
    'activeRepos',
    'velocity',
    'acceleration',
  ];
  const fmt = (v: number | null): string => (v == null ? '' : v.toFixed(6));
  const lines = curves.map((c) =>
    [
      c.weekStart,
      c.companyTicker,
      c.added,
      c.removed,
      c.upgraded,
      c.downgraded,
      c.changed,
      c.netAdd,
      c.activeRepos,
      fmt(c.velocity),
      fmt(c.acceleration),
    ].join(','),
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}
