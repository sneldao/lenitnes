import { query } from '../../db/pool.js';
import type { AssetMapping } from '@lenitnes/types';
import { getSectorForRepo } from './sector-graph.js';

export interface SequenceEvent {
  repo: string;
  asset: string;
  day: string;
  detectors: string[];
  summary: string;
}

/**
 * Build a compact sequence_context string from prior cross-repo events
 * in the same sector within the lookback window (replay path).
 */
export function buildSequenceContextFromEvents(
  repo: string,
  day: string,
  priorEvents: SequenceEvent[],
  lookbackDays = 7,
): string {
  const sector = getSectorForRepo(repo);
  const dayMs = new Date(`${day}T00:00:00Z`).getTime();
  const windowStart = dayMs - lookbackDays * 86_400_000;

  const related = priorEvents.filter((e) => {
    if (e.day >= day) return false;
    const eMs = new Date(`${e.day}T00:00:00Z`).getTime();
    if (eMs < windowStart) return false;
    if (e.repo.toLowerCase() === repo.toLowerCase()) return true;
    if (!sector) {
      const anchor = priorEvents.find((p) => p.repo.toLowerCase() === repo.toLowerCase());
      return anchor ? e.asset === anchor.asset : false;
    }
    const eSector = getSectorForRepo(e.repo);
    return eSector?.id === sector.id;
  });

  if (related.length === 0) return '';

  const lines = related
    .sort((a, b) => a.day.localeCompare(b.day) || a.repo.localeCompare(b.repo))
    .slice(-6)
    .map(
      (e) =>
        `• ${e.day} · ${e.repo} · ${e.detectors.join(', ') || 'signal'} — ${e.summary.slice(0, 120)}`,
    );

  const header = sector
    ? `Sector chain (${sector.label}, last ${lookbackDays}d before ${day}):`
    : `Related repo activity (last ${lookbackDays}d before ${day}):`;

  return `${header}\n${lines.join('\n')}`;
}

/** Live path — recent signals from sector peers in the DB. */
export async function buildSequenceContextLive(
  monitorUrl: string,
  assetMapping: AssetMapping,
): Promise<string> {
  const repo = monitorUrl.replace(/^https?:\/\/github\.com\//i, '').replace(/\/.*$/, '');
  const sector = getSectorForRepo(repo);
  const asset = assetMapping.coingeckoId ?? '';

  const peerFilter = sector
    ? sector.sequence.map((r) => `%github.com/${r}%`)
    : [`%${repo.split('/')[0]}%`];

  const { rows } = await query<{
    url: string;
    detected_at: string;
    detector_types: string[] | null;
    thesis: string | null;
  }>(
    `SELECT m.url,
            s.detected_at::text,
            ARRAY_AGG(DISTINCT sc.detector_type) AS detector_types,
            LEFT(a.thesis, 120) AS thesis
       FROM signals s
       JOIN monitors m ON m.id = s.monitor_id
       LEFT JOIN agent_scores a ON a.signal_id = s.id
       LEFT JOIN signal_classifications sc ON sc.signal_id = s.id
      WHERE s.is_heartbeat = false
        AND s.detected_at > now() - interval '7 days'
        AND m.url LIKE ANY($1::text[])
        AND m.url NOT LIKE 'narrative:%'
      GROUP BY s.id, m.url, s.detected_at, a.thesis
      ORDER BY s.detected_at DESC
      LIMIT 8`,
    [peerFilter],
  );

  if (rows.length === 0) return '';

  const events: SequenceEvent[] = rows.map((r) => {
    const peerRepo = r.url.replace(/^https?:\/\/github\.com\//i, '').replace(/\/.*$/, '');
    return {
      repo: peerRepo,
      asset,
      day: r.detected_at.slice(0, 10),
      detectors: r.detector_types ?? [],
      summary: r.thesis ?? 'signal detected',
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  return buildSequenceContextFromEvents(repo, today, events, 7);
}
