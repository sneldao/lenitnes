import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { logger } from '../logger.js';
import type { LeaderboardEntry, LeaderboardResponse } from '@lenitnes/types';

export const leaderboardRouter = Router();

// GET /leaderboard — top public-signal hunters.
// Fully public — no auth required. Cached for 30s.
// Supports pagination with ?limit=25&offset=0 (limit max 100).
leaderboardRouter.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  const cacheKey = `leaderboard:${limit}:${offset}`;
  const cached = cacheGet<LeaderboardResponse>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  try {
    // ── Hunter signal aggregation ──────────────────────────────
    const hunterResult = await query<{
      user_id: string;
      wallet_address: string;
      email: string | null;
      total_signals: string;
      chain_completed: string;
      hit_rate: string | null;
      top_pair: string | null;
      last_signal_at: string | null;
      current_streak: string;
    }>(
      `WITH hunter_signals AS (
         SELECT
           m.user_id,
           COUNT(s.id)::int AS total_signals,
           COUNT(s.id) FILTER (
             WHERE s.hedera_tx_id IS NOT NULL
               AND s.ipfs_cid IS NOT NULL
               AND s.arb_tx_hash IS NOT NULL
           )::int AS chain_completed,
           MAX(s.detected_at) AS last_signal_at
         FROM monitors m
         JOIN signals s ON s.monitor_id = m.id AND s.is_heartbeat = false
         WHERE m.is_public = true
         GROUP BY m.user_id
         HAVING COUNT(s.id) > 0
       ),
       top_pairs AS (
         SELECT
           m.user_id,
           o.order_params->>'pair' AS pair,
           COUNT(*) AS pair_count
         FROM orders o
         JOIN signals s ON s.id = o.signal_id
         JOIN monitors m ON m.id = s.monitor_id AND m.is_public = true
         WHERE o.order_params->>'pair' IS NOT NULL
         GROUP BY m.user_id, o.order_params->>'pair'
       ),
       ranked_pairs AS (
         SELECT user_id, pair,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY pair_count DESC) AS rn
         FROM top_pairs
       ),
       user_accuracy AS (
         SELECT
           m.user_id,
           COUNT(*) FILTER (
             WHERE (so.pct_change::numeric > 0 AND so.direction = 'up')
                OR (so.pct_change::numeric < 0 AND so.direction = 'down')
           )::int AS correct,
           COUNT(*)::int AS total
         FROM signal_outcomes so
         JOIN signals s ON s.id = so.signal_id
         JOIN monitors m ON m.id = s.monitor_id AND m.is_public = true
         GROUP BY m.user_id
       ),
       active_dates AS (
         SELECT DISTINCT m.user_id, s.detected_at::date AS active_date
         FROM monitors m
         JOIN signals s ON s.monitor_id = m.id AND s.is_heartbeat = false
         WHERE m.is_public = true
       ),
       date_groups AS (
         SELECT user_id, active_date,
           active_date - (ROW_NUMBER() OVER (
             PARTITION BY user_id ORDER BY active_date
           ))::int AS grp
         FROM active_dates
       ),
       current_streaks AS (
         SELECT user_id, streak_days AS current_streak
         FROM (
           SELECT
             user_id,
             COUNT(*) AS streak_days,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY grp DESC) AS rn
           FROM date_groups
           GROUP BY user_id, grp
         ) ranked
         WHERE rn = 1
       )
       SELECT
         u.id AS user_id,
         u.wallet_address,
         u.email,
         hs.total_signals,
         hs.chain_completed,
         (ua.correct::numeric / NULLIF(ua.total, 0))::text AS hit_rate,
         rp.pair AS top_pair,
         hs.last_signal_at,
         COALESCE(cs.current_streak, 0)::text AS current_streak
       FROM hunter_signals hs
       JOIN users u ON u.id = hs.user_id
       LEFT JOIN ranked_pairs rp ON rp.user_id = hs.user_id AND rp.rn = 1
       LEFT JOIN user_accuracy ua ON ua.user_id = hs.user_id
       LEFT JOIN current_streaks cs ON cs.user_id = hs.user_id
       ORDER BY hs.total_signals DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const entries: LeaderboardEntry[] = hunterResult.rows.map((row) => ({
      user_id: row.user_id,
      wallet_address: row.wallet_address,
      total_signals: Number(row.total_signals),
      chain_completed: Number(row.chain_completed),
      accuracy: row.hit_rate ? `${(Number(row.hit_rate) * 100).toFixed(0)}%` : null,
      streak: Number(row.current_streak),
      top_pair: row.top_pair ?? null,
      last_signal_at: row.last_signal_at ?? null,
    }));

    // ── Aggregate stats ─────────────────────────────────────────
    const statsResult = await query<{
      total_signals: string;
      active_hunters: string;
      public_monitors: string;
      anchored: string;
    }>(
      `SELECT
         COALESCE(SUM(sig.total), 0)::text AS total_signals,
         COUNT(DISTINCT m.user_id)::text AS active_hunters,
         COUNT(DISTINCT m.id)::text AS public_monitors,
         COALESCE(SUM(sig.anchored), 0)::text AS anchored
       FROM monitors m
       LEFT JOIN (
         SELECT
           monitor_id,
           COUNT(*) FILTER (WHERE is_heartbeat = false) AS total,
           COUNT(*) FILTER (WHERE is_heartbeat = false AND hedera_tx_id IS NOT NULL) AS anchored
         FROM signals
         GROUP BY monitor_id
       ) sig ON sig.monitor_id = m.id
       WHERE m.is_public = true`,
    );

    const statsRow = statsResult.rows[0];
    const totalSig = Number(statsRow?.total_signals ?? 0);
    const anchored = Number(statsRow?.anchored ?? 0);
    const anchorCoverage = totalSig > 0 ? `${((anchored / totalSig) * 100).toFixed(0)}%` : '0%';

    const response: LeaderboardResponse = {
      entries,
      stats: {
        total_signals: totalSig,
        active_hunters: Number(statsRow?.active_hunters ?? 0),
        public_monitors: Number(statsRow?.public_monitors ?? 0),
        anchor_coverage: anchorCoverage,
      },
    };

    cacheSet(cacheKey, response, 30_000);
    res.setHeader('X-Cache', 'MISS');
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'failed to fetch leaderboard');
    res.status(500).json({ error: 'failed to fetch leaderboard' });
  }
});
