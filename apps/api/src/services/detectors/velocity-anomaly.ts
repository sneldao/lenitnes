// ─────────────────────────────────────────────────────────────
// Velocity anomaly detector — flags repos with unusual commit
// velocity relative to their baseline.
//
// Two patterns matter:
//   1. Spike: sudden burst (emergency response, protocol upgrade)
//   2. Drop: sudden quiet (maintainer departure, project pause)
//
// Baseline is a rolling 30-day average. Deviation is measured in
// standard deviations. Threshold: ±2σ for 7-day window.
// ─────────────────────────────────────────────────────────────

import { query } from '../../db/pool.js';
import { logger } from '../../logger.js';
import { fetchCommitsRange, parseRepo } from '../github.js';
import type { GitHubCommit } from '../github.js';
import type { SignalClassification } from '@lenitnes/types';

interface RepoVelocity {
  monitorId: string;
  url: string;
  asset: string | null;
  current7d: number;
  baseline30d: number;
  baselineStd: number;
  deviation: number;
}

/** Fetch commit counts per day for the last N days. */
async function dailyCommitCounts(repoUrl: string, days: number): Promise<number[]> {
  const repo = parseRepo(repoUrl);
  if (!repo) return [];

  const since = new Date(Date.now() - days * 24 * 3_600_000).toISOString();
  const until = new Date().toISOString();

  let commits: GitHubCommit[] | null = null;
  try {
    commits = await fetchCommitsRange(repoUrl, since, until, 5);
  } catch (err) {
    logger.warn({ err, repoUrl }, 'velocity: commit fetch failed');
    return [];
  }
  if (!commits || commits.length === 0) return new Array(days).fill(0);

  // Bucket by day (UTC).
  const buckets = new Array(days).fill(0);
  const now = Date.now();
  for (const c of commits) {
    const age = now - new Date(c.date).getTime();
    const dayIdx = Math.floor(age / (24 * 3_600_000));
    if (dayIdx >= 0 && dayIdx < days) {
      buckets[dayIdx]++;
    }
  }
  return buckets;
}

/** Compute mean and standard deviation of a numeric array. */
function stats(arr: number[]): { mean: number; std: number } {
  if (arr.length === 0) return { mean: 0, std: 0 };
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return { mean, std: Math.sqrt(variance) };
}

/** Deviation threshold (in σ) at which a velocity reading fires a signal. */
export const VELOCITY_SIGNAL_THRESHOLD = 2;

export interface VelocityReading {
  monitorId: string;
  url: string;
  repo: string;
  asset: string | null;
  current7d: number;
  baselineWeekly: number;
  stdWeekly: number;
  deviation: number;
  direction: 'elevated' | 'suppressed' | 'stable';
  /** True when |deviation| ≥ VELOCITY_SIGNAL_THRESHOLD. */
  triggered: boolean;
  score: number;
}

/**
 * Scan every active GitHub monitor and compute its current commit
 * velocity vs the 30-day baseline. Returns ALL readings (including
 * sub-threshold / near-miss) so the intelligence dashboard can
 * surface "watch this" signals, not just fired ones.
 */
export async function scanVelocity(): Promise<VelocityReading[]> {
  const { rows: monitors } = await query<{ id: string; url: string; asset: string | null }>(
    `SELECT id, url, asset_mapping->>'coingeckoId' AS asset
       FROM monitors
      WHERE status = 'active'
        AND url LIKE 'https://github.com/%'
        AND url NOT LIKE 'narrative:%'
        AND url NOT LIKE 'synthesis:%'
        AND url NOT LIKE 'proactive:%'`,
  );

  const readings: VelocityReading[] = [];

  for (const m of monitors) {
    try {
      const counts30d = await dailyCommitCounts(m.url, 30);
      if (counts30d.length === 0) continue;

      const current7d = counts30d.slice(0, 7).reduce((s, v) => s + v, 0);
      const baselineDays = counts30d.slice(7);
      const { mean, std } = stats(baselineDays);

      const baselineWeekly = mean * 7;
      const stdWeekly = std * Math.sqrt(7);

      // Too stable to measure deviation meaningfully.
      if (stdWeekly < 0.5) {
        readings.push({
          monitorId: m.id,
          url: m.url,
          repo: repoSlug(m.url),
          asset: m.asset,
          current7d,
          baselineWeekly: Math.round(baselineWeekly * 10) / 10,
          stdWeekly: Math.round(stdWeekly * 100) / 100,
          deviation: 0,
          direction: 'stable',
          triggered: false,
          score: 0,
        });
        continue;
      }

      const deviation = (current7d - baselineWeekly) / stdWeekly;
      const direction: VelocityReading['direction'] =
        Math.abs(deviation) < 0.5 ? 'stable' : deviation > 0 ? 'elevated' : 'suppressed';
      const triggered = Math.abs(deviation) >= VELOCITY_SIGNAL_THRESHOLD;

      readings.push({
        monitorId: m.id,
        url: m.url,
        repo: repoSlug(m.url),
        asset: m.asset,
        current7d,
        baselineWeekly: Math.round(baselineWeekly * 10) / 10,
        stdWeekly: Math.round(stdWeekly * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        direction,
        triggered,
        score: Math.min(100, Math.round(Math.abs(deviation) * 15)),
      });
    } catch (err) {
      logger.warn({ err, url: m.url }, 'velocity: scan failed for monitor');
    }
  }

  // Most anomalous first.
  readings.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  return readings;
}

/** Detect velocity anomalies (threshold-gated) for signal generation. */
export async function detectVelocityAnomalies(): Promise<
  Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }>
> {
  const readings = await scanVelocity();
  const results: Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }> = [];

  for (const r of readings) {
    if (!r.triggered || r.direction === 'stable') continue;
    const confidence = Math.min(100, Math.round(50 + Math.abs(r.deviation) * 10));
    results.push({
      monitorId: r.monitorId,
      url: r.url,
      asset: r.asset,
      classification: {
        type: 'velocity_anomaly',
        score: r.score,
        confidence,
        label: `${r.repo}: ${r.direction} commit velocity (${r.deviation > 0 ? '+' : ''}${r.deviation.toFixed(1)}σ)`,
        metadata: {
          current7d: r.current7d,
          baselineWeekly: r.baselineWeekly,
          deviation: r.deviation,
          direction: r.direction,
        },
      },
    });
  }

  return results;
}

function repoSlug(url: string): string {
  const parsed = parseRepo(url);
  return parsed ? `${parsed.owner}/${parsed.repo}` : url;
}
