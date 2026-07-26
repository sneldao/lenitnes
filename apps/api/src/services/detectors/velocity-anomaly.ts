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

/** Detect velocity anomalies across all active monitors. */
export async function detectVelocityAnomalies(): Promise<
  Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }>
> {
  const { rows: monitors } = await query<{ id: string; url: string; asset: string | null }>(
    `SELECT id, url, asset_mapping->>'coingeckoId' AS asset
       FROM monitors
      WHERE status = 'active'
        AND url LIKE 'https://github.com/%'
        AND url NOT LIKE 'narrative:%'
        AND url NOT LIKE 'synthesis:%'`,
  );

  const results: Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }> = [];

  for (const m of monitors) {
    try {
      const counts30d = await dailyCommitCounts(m.url, 30);
      if (counts30d.length === 0) continue;

      // Current 7-day window (most recent).
      const current7d = counts30d.slice(0, 7).reduce((s, v) => s + v, 0);
      // Baseline: days 8-30 (exclude current week to avoid self-contamination).
      const baselineDays = counts30d.slice(7);
      const { mean, std } = stats(baselineDays);

      // Normalize to weekly scale.
      const baselineWeekly = mean * 7;
      const stdWeekly = std * Math.sqrt(7);

      if (stdWeekly < 0.5) continue; // Too stable to measure deviation.

      const deviation = (current7d - baselineWeekly) / stdWeekly;

      // Threshold: ±2σ.
      if (Math.abs(deviation) < 2) continue;

      const isSpike = deviation > 0;
      const direction = isSpike ? 'elevated' : 'suppressed';
      const score = Math.min(100, Math.round(Math.abs(deviation) * 15));
      const confidence = Math.min(100, Math.round(50 + Math.abs(deviation) * 10));

      results.push({
        monitorId: m.id,
        url: m.url,
        asset: m.asset,
        classification: {
          type: 'velocity_anomaly',
          score,
          confidence,
          label: `${repoSlug(m.url)}: ${direction} commit velocity (${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}σ)`,
          metadata: {
            current7d,
            baselineWeekly: Math.round(baselineWeekly * 10) / 10,
            deviation: Math.round(deviation * 100) / 100,
            direction,
          },
        },
      });
    } catch (err) {
      logger.warn({ err, url: m.url }, 'velocity: anomaly check failed for monitor');
    }
  }

  return results;
}

function repoSlug(url: string): string {
  const parsed = parseRepo(url);
  return parsed ? `${parsed.owner}/${parsed.repo}` : url;
}
