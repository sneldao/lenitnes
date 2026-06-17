// ─────────────────────────────────────────────────────────────
// Scorecard route — public, no auth, cached 60s. Day 7.
// ─────────────────────────────────────────────────────────────

import { Router, type Request, type Response } from 'express';
import * as scorecard from '../services/scorecard.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { logger } from '../logger.js';

export const scorecardRouter = Router();

const CACHE_TTL_MS = 60_000;

// GET /scorecard — public, cached 60s.
scorecardRouter.get('/', async (_req: Request, res: Response) => {
  const cacheKey = 'scorecard:overall:v1';
  const cached = cacheGet<scorecard.ScorecardOverall>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  try {
    const data = await scorecard.overall();
    cacheSet(cacheKey, data, CACHE_TTL_MS);
    res.setHeader('X-Cache', 'MISS');
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'scorecard:overall query failed');
    res.status(500).json({ error: 'scorecard_unavailable' });
  }
});

// GET /scorecard/recent?limit=20 — public, cached 30s (shorter TTL
// because the recent list changes on every signal).
scorecardRouter.get('/recent', async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
  const cacheKey = `scorecard:recent:${limit}`;
  const cached = cacheGet<scorecard.RecentCall[]>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  try {
    const data = await scorecard.recentCalls(limit);
    cacheSet(cacheKey, data, 30_000);
    res.setHeader('X-Cache', 'MISS');
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'scorecard:recent query failed');
    res.status(500).json({ error: 'scorecard_unavailable' });
  }
});
