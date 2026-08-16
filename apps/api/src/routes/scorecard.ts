// ─────────────────────────────────────────────────────────────
// Scorecard route — public, no auth, cached 60s. Day 7.
// ─────────────────────────────────────────────────────────────

import { Router, type Request, type Response } from 'express';
import * as scorecard from '../services/scorecard.js';
import { resolveDomainParam } from '../services/domain/domains.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { logger } from '../logger.js';

export const scorecardRouter = Router();

const CACHE_TTL_MS = 60_000;

// GET /scorecard?domain=markets|research — public labels. Legacy aliases
// code|science are the internal wire values; `bio` remains a compatibility
// alias for old links. domain=research returns action-scoped event metrics.
// Retrospective replay rows are reported separately from the prospective live cohort.
// Default (no domain / domain=markets) returns the existing crypto card.
scorecardRouter.get('/', async (req: Request, res: Response) => {
  // Public labels (markets/research) and legacy aliases (code/science/bio)
  // all resolve to the canonical internal domain. See services/domain/domains.ts.
  const domain = resolveDomainParam(req.query.domain);
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
  const cacheKey =
    domain === 'science' ? `scorecard:${domain}:v2:${page}:${pageSize}` : `scorecard:${domain}:v1`;

  if (domain === 'science') {
    const cachedScience = cacheGet<scorecard.ScorecardScience>(cacheKey);
    if (cachedScience) {
      res.setHeader('X-Cache', 'HIT');
      res.json(cachedScience);
      return;
    }
    try {
      const data = await scorecard.science(page, pageSize);
      cacheSet(cacheKey, data, CACHE_TTL_MS);
      res.setHeader('X-Cache', 'MISS');
      res.json(data);
    } catch (err) {
      logger.error({ err }, 'scorecard:science query failed');
      res.status(500).json({ error: 'scorecard_unavailable' });
    }
    return;
  }

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
