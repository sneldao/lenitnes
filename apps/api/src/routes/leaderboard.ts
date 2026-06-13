import { Router, type Request, type Response } from 'express';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { logger } from '../logger.js';
import { getLeaderboard, getHunterDetail } from '../services/domain/leaderboard.service.js';
import type { LeaderboardResponse } from '@lenitnes/types';
import type { HunterDetailResponse } from '../services/domain/leaderboard.service.js';

export const leaderboardRouter = Router();

type SortKey = 'signals' | 'accuracy' | 'streak' | 'recent';
const VALID_SORTS: ReadonlySet<string> = new Set(['signals', 'accuracy', 'streak', 'recent']);

// GET /leaderboard — top public-signal hunters.
// Fully public — no auth required. Cached for 30s.
// Supports: ?limit=N&offset=N&sort=signals|accuracy|streak|recent
leaderboardRouter.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const sortRaw = String(req.query.sort ?? 'signals');
  const sort: SortKey = VALID_SORTS.has(sortRaw) ? (sortRaw as SortKey) : 'signals';

  const cacheKey = `leaderboard:${limit}:${offset}:${sort}`;
  const cached = cacheGet<LeaderboardResponse>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  try {
    const response = await getLeaderboard({ limit, offset, sort });

    cacheSet(cacheKey, response, 30_000);
    res.setHeader('X-Cache', 'MISS');
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'failed to fetch leaderboard');
    res.status(500).json({ error: 'failed to fetch leaderboard' });
  }
});

// GET /leaderboard/:userId — single hunter detail + signals.
leaderboardRouter.get('/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const signalLimit = Math.min(Number(req.query.limit ?? 25), 50);
  const signalOffset = Math.max(Number(req.query.offset ?? 0), 0);
  const cacheKey = `leaderboard:user:${userId}:${signalLimit}:${signalOffset}`;
  const cached = cacheGet<HunterDetailResponse>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  try {
    const result = await getHunterDetail(userId, { limit: signalLimit, offset: signalOffset });
    if (!result) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    cacheSet(cacheKey, result, 30_000);
    res.setHeader('X-Cache', 'MISS');
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'failed to fetch hunter detail');
    res.status(500).json({ error: 'failed to fetch hunter detail' });
  }
});
