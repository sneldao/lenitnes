import { query } from '../../db/pool.js';
import { getSectorForRepo } from './sector-graph.js';
import { monitorRepoFromUrl } from './repo-tier-policy.js';

const CHAIN_DETECTOR_TYPES = ['emergency_patch', 'security_critical_patch'] as const;
const CHAIN_LOOKBACK_DAYS = 7;
const MAX_CHAIN_BOOST = 10;

/**
 * Deterministic pre-trade boost when upstream sector repos recently fired
 * emergency/security detectors (Zcash pilot: halo2 → zebra → zcash).
 */
export async function computeChainConvictionBoost(monitorUrl: string): Promise<{
  boost: number;
  reason?: string;
}> {
  const repo = monitorRepoFromUrl(monitorUrl);
  const sector = getSectorForRepo(repo);
  if (!sector) return { boost: 0 };

  const repoIdx = sector.sequence.findIndex((r) => r.toLowerCase() === repo.toLowerCase());
  if (repoIdx <= 0) return { boost: 0 };

  const upstream = sector.sequence.slice(0, repoIdx);
  const patterns = upstream.map((r) => `%github.com/${r}%`);

  const { rows } = await query<{ repo: string; detector_type: string }>(
    `SELECT m.url AS repo, sc.detector_type
       FROM signals s
       JOIN monitors m ON m.id = s.monitor_id
       JOIN signal_classifications sc ON sc.signal_id = s.id
      WHERE s.is_heartbeat = false
        AND s.detected_at > now() - make_interval(days => $1)
        AND sc.detector_type = ANY($2::text[])
        AND m.url LIKE ANY($3::text[])
      ORDER BY s.detected_at DESC
      LIMIT 5`,
    [CHAIN_LOOKBACK_DAYS, CHAIN_DETECTOR_TYPES, patterns],
  );

  if (rows.length === 0) return { boost: 0 };

  const upstreamHit = rows[0];
  const peerRepo = upstreamHit.repo.replace(/^https?:\/\/github\.com\//i, '').replace(/\/.*$/, '');
  return {
    boost: MAX_CHAIN_BOOST,
    reason: `upstream ${peerRepo} · ${upstreamHit.detector_type} within ${CHAIN_LOOKBACK_DAYS}d`,
  };
}

export function applyChainConvictionBoost(conviction: number, boost: number): number {
  if (boost <= 0) return conviction;
  return Math.min(100, conviction + boost);
}
