import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';

export const reasoningRouter = Router();

interface ReasoningRow {
  signal_id: string;
  detected_at: string;
  created_at: string;
  asset: string | null;
  monitor_url: string;
  condition_summary: string | null;
  detector_types: string[] | null;
  conviction: number | null;
  thesis: string | null;
  recommended_action: string | null;
  confidence_band: string | null;
  rubric_version: string;
  traded: boolean;
}

// GET /reasoning?limit=40 — the public reasoning archive.
// Every scored call, most recent first — including the ones the agent
// passed on. This is the "show me what it saw" surface: sub-threshold
// conviction rows are content, not noise.
reasoningRouter.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
  const cacheKey = `reasoning:${limit}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  const { rows } = await query<ReasoningRow>(
    `SELECT
       s.id::text                                          AS signal_id,
       s.detected_at::text                                 AS detected_at,
       a.created_at::text                                  AS created_at,
       COALESCE(m.asset_mapping->>'coingeckoId')           AS asset,
       m.url                                               AS monitor_url,
       LEFT(s.condition_summary, 300)                      AS condition_summary,
       COALESCE(
         (SELECT array_agg(DISTINCT sc.detector_type)
            FROM signal_classifications sc
           WHERE sc.signal_id = s.id),
         '{}'
       )                                                   AS detector_types,
       a.conviction                                        AS conviction,
       LEFT(a.thesis, 400)                                 AS thesis,
       a.recommended_action                                AS recommended_action,
       a.confidence_band                                   AS confidence_band,
       a.rubric_version                                    AS rubric_version,
       EXISTS (SELECT 1 FROM orders o WHERE o.signal_id = s.id) AS traded
     FROM agent_scores a
     JOIN signals s ON s.id = a.signal_id
     JOIN monitors m ON m.id = s.monitor_id
     WHERE s.is_heartbeat = false
     ORDER BY a.created_at DESC
     LIMIT $1`,
    [limit],
  );

  const payload = {
    items: rows,
    count: rows.length,
    generatedAt: new Date().toISOString(),
  };
  cacheSet(cacheKey, payload, 60_000);
  res.setHeader('X-Cache', 'MISS');
  res.json(payload);
});
