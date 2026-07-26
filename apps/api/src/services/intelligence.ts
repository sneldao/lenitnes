// ─────────────────────────────────────────────────────────────
// Intelligence service — the visibility layer over the synthesis
// pipeline. Aggregates the analysis the system does every 2 hours
// (velocity baselines, PR impact scores, un-triggered commit
// pools, sub-threshold agent scores) and exposes it so users can
// see the reasoning surface, including near-misses that didn't
// clear threshold.
//
// This is the "we did the work even when nothing traded" surface.
// ─────────────────────────────────────────────────────────────

import { query } from '../db/pool.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { scanVelocity, VELOCITY_SIGNAL_THRESHOLD } from './detectors/velocity-anomaly.js';
import { scanPullRequests, PR_SIGNAL_THRESHOLD } from './detectors/pr-activity.js';
import type { VelocityReading } from './detectors/velocity-anomaly.js';
import type { PullRequestReading } from './detectors/pr-activity.js';

export interface NearMissSignal {
  signalId: string;
  detectedAt: string;
  asset: string | null;
  sourceCategory: string;
  sourceLabel: string;
  conviction: number;
  recommendedAction: 'long' | 'short' | 'none';
  thesis: string | null;
  repo: string | null;
}

export interface SynthesisActivity {
  category: string;
  label: string;
  total: number;
  traded: number;
  avgConviction: number | null;
}

export interface IntelligenceSnapshot {
  generatedAt: string;
  velocity: VelocityReading[];
  pullRequests: PullRequestReading[];
  nearMisses: NearMissSignal[];
  synthesisActivity: SynthesisActivity[];
  thresholds: {
    velocitySigma: number;
    prScore: number;
    conviction: number;
  };
}

const SYNTHESIS_MONITORS: Record<string, { category: string; label: string }> = {
  'narrative:portfolio': { category: 'narrative', label: 'Narrative synthesis' },
  'synthesis:thesis': { category: 'thesis', label: 'Thesis synthesis' },
  'proactive:signals': { category: 'proactive', label: 'Proactive scan' },
};

/**
 * Sub-threshold synthesis signals that were scored but didn't
 * trade — the "watch this" feed. These build trust by showing the
 * system reasoning even when it passes on a call.
 */
async function fetchNearMisses(limit = 12): Promise<NearMissSignal[]> {
  const { rows } = await query<{
    signal_id: string;
    detected_at: string;
    asset: string | null;
    monitor_url: string;
    conviction: number;
    recommended_action: 'long' | 'short' | 'none';
    thesis: string | null;
  }>(
    `SELECT s.id AS signal_id,
            s.detected_at::text,
            s.asset,
            m.url AS monitor_url,
            ag.conviction,
            ag.recommended_action,
            LEFT(ag.thesis, 160) AS thesis
       FROM agent_scores ag
       JOIN signals s ON s.id = ag.signal_id
       JOIN monitors m ON m.id = s.monitor_id
      WHERE m.url IN ('narrative:portfolio', 'synthesis:thesis', 'proactive:signals')
        AND ag.conviction < 70
        AND ag.conviction >= 40
      ORDER BY ag.created_at DESC
      LIMIT $1`,
    [limit],
  );

  return rows.map((r) => {
    const meta = SYNTHESIS_MONITORS[r.monitor_url] ?? {
      category: 'commit',
      label: 'Commit signal',
    };
    return {
      signalId: r.signal_id,
      detectedAt: r.detected_at,
      asset: r.asset,
      sourceCategory: meta.category,
      sourceLabel: meta.label,
      conviction: r.conviction,
      recommendedAction: r.recommended_action,
      thesis: r.thesis,
      repo: r.monitor_url,
    };
  });
}

/**
 * Aggregate synthesis pipeline activity by source over the last 7
 * days: how many signals each surface produced, how many traded,
 * and average conviction. Shows the pipeline is alive and working
 * even on quiet days.
 */
async function fetchSynthesisActivity(): Promise<SynthesisActivity[]> {
  const { rows } = await query<{
    monitor_url: string;
    total: string;
    traded: string;
    avg_conviction: string | null;
  }>(
    `SELECT m.url AS monitor_url,
            COUNT(DISTINCT s.id)::text AS total,
            COUNT(DISTINCT CASE WHEN ag.conviction >= 70 THEN s.id END)::text AS traded,
            AVG(ag.conviction)::text AS avg_conviction
       FROM signals s
       JOIN monitors m ON m.id = s.monitor_id
       LEFT JOIN agent_scores ag ON ag.signal_id = s.id
      WHERE m.url IN ('narrative:portfolio', 'synthesis:thesis', 'proactive:signals')
        AND s.is_heartbeat = false
        AND s.detected_at > now() - interval '7 days'
      GROUP BY m.url
      ORDER BY total DESC`,
  );

  return rows.map((r) => {
    const meta = SYNTHESIS_MONITORS[r.monitor_url] ?? { category: 'unknown', label: r.monitor_url };
    return {
      category: meta.category,
      label: meta.label,
      total: parseInt(r.total, 10),
      traded: parseInt(r.traded, 10),
      avgConviction: r.avg_conviction ? Math.round(parseFloat(r.avg_conviction)) : null,
    };
  });
}

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_KEY = 'intelligence:snapshot';

/**
 * Build the full intelligence snapshot. Cached for 5 minutes since
 * the underlying GitHub API calls (velocity + PR scans) are
 * expensive. The synthesis stats + near-misses are cheap DB reads.
 */
export async function getIntelligenceSnapshot(
  opts: { refresh?: boolean } = {},
): Promise<IntelligenceSnapshot> {
  if (!opts.refresh) {
    const cached = cacheGet<IntelligenceSnapshot>(CACHE_KEY);
    if (cached) return cached;
  }

  const [velocity, pullRequests, nearMisses, synthesisActivity] = await Promise.all([
    scanVelocity(),
    scanPullRequests(),
    fetchNearMisses(),
    fetchSynthesisActivity(),
  ]);

  const snapshot: IntelligenceSnapshot = {
    generatedAt: new Date().toISOString(),
    velocity,
    pullRequests,
    nearMisses,
    synthesisActivity,
    thresholds: {
      velocitySigma: VELOCITY_SIGNAL_THRESHOLD,
      prScore: PR_SIGNAL_THRESHOLD,
      conviction: 70,
    },
  };

  cacheSet(CACHE_KEY, snapshot, CACHE_TTL_MS);
  return snapshot;
}
