// ─────────────────────────────────────────────────────────────
// Admin surface — single-operator persona. Gated by X-Admin-Key
// (matches ADMIN_API_KEY env). When ADMIN_API_KEY is empty, the
// routes return 503 (don't leak info). Day 8 of the pivot.
// ─────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { cacheInvalidate } from '../middleware/cache.js';
import { _internalDailySpendUsd } from '../services/agent.js';
import { logger } from '../logger.js';

export const adminRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!config.admin.apiKey) {
    res.status(503).json({ error: 'admin_not_configured', hint: 'set ADMIN_API_KEY' });
    return;
  }
  const provided = req.header('x-admin-key') ?? '';
  if (provided !== config.admin.apiKey) {
    res.status(401).json({ error: 'invalid_admin_key' });
    return;
  }
  next();
}

// GET /admin/status — daily counts, budget, last signal
adminRouter.get('/status', requireAdmin, async (_req, res) => {
  try {
    const [signals24h, signals7d, agentScores24h, tradesAllTime, treasuryWallets, latestSignal] =
      await Promise.all([
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM signals WHERE is_heartbeat = false AND detected_at > now() - interval '24 hours'`,
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM signals WHERE is_heartbeat = false AND detected_at > now() - interval '7 days'`,
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM agent_scores WHERE created_at > now() - interval '24 hours'`,
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM orders WHERE status = 'filled'`,
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM treasury_wallets WHERE is_active = true`,
        ),
        query<{ latest_at: string | null; latest_id: string | null }>(
          `SELECT MAX(detected_at) AS latest_at, MAX(id) AS latest_id FROM signals WHERE is_heartbeat = false`,
        ),
      ]);

    res.json({
      signals: {
        last24h: Number(signals24h.rows[0]?.count ?? 0),
        last7d: Number(signals7d.rows[0]?.count ?? 0),
        latestAt: latestSignal.rows[0]?.latest_at ?? null,
        latestId: latestSignal.rows[0]?.latest_id ?? null,
      },
      agent: {
        scoresLast24h: Number(agentScores24h.rows[0]?.count ?? 0),
        dailySpendUsd: _internalDailySpendUsd(),
        dailyBudgetUsd: config.agent.dailyBudgetUsd,
      },
      trades: {
        filledAllTime: Number(tradesAllTime.rows[0]?.count ?? 0),
      },
      treasury: {
        activeWallets: Number(treasuryWallets.rows[0]?.count ?? 0),
        defaultChain: config.treasury.defaultChain,
        defaultMode: config.treasury.defaultMode,
      },
    });
  } catch (err) {
    logger.error({ err }, 'admin/status query failed');
    res.status(500).json({ error: 'admin_status_failed' });
  }
});

// POST /admin/cache/invalidate?pattern=scorecard:
// Drop cache entries matching the prefix. Used when a new signal
// commits and the scorecard needs to refresh before its 60s TTL.
adminRouter.post('/cache/invalidate', requireAdmin, (req, res) => {
  const pattern = String(req.query.pattern ?? '');
  if (!pattern) {
    res.status(400).json({ error: 'pattern_required' });
    return;
  }
  cacheInvalidate(pattern);
  res.json({ ok: true, pattern, invalidatedAt: new Date().toISOString() });
});

// POST /admin/cache/invalidate-all — nuke every cache entry
adminRouter.post('/cache/invalidate-all', requireAdmin, (_req, res) => {
  cacheInvalidate('');
  res.json({ ok: true, invalidatedAt: new Date().toISOString() });
});
