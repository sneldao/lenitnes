import { Router, type Request, type Response } from 'express';
import { getSharedRedis } from '../services/redis-client.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';

export const pricesRouter = Router();

// GET /prices — snapshot of the spot price hub (public).
// Served from the hub's own Redis keys (written every refresh cycle),
// cached 30s in-process so the portfolio ticker can't amplify load.
pricesRouter.get('/', async (_req: Request, res: Response) => {
  const cached = cacheGet('prices:snapshot');
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  const redis = await getSharedRedis('spot-prices');
  const prices: Record<string, number> = {};
  let updatedAt: string | null = null;

  if (redis) {
    try {
      const keys = await redis.keys('spot:usd:*');
      const realKeys = keys.filter((k) => k !== 'spot:usd:__meta__');
      if (realKeys.length > 0) {
        const values = await redis.mGet(realKeys);
        realKeys.forEach((k, i) => {
          const price = Number(values[i]);
          if (Number.isFinite(price) && price > 0) {
            prices[k.replace('spot:usd:', '')] = price;
          }
        });
      }
      const meta = await redis.get('spot:usd:__meta__');
      if (meta) {
        updatedAt = (JSON.parse(meta) as { updatedAt?: string }).updatedAt ?? null;
      }
    } catch {
      /* empty result is fine — callers poll */
    }
  }

  const payload = { prices, updatedAt };
  cacheSet('prices:snapshot', payload, 30_000);
  res.setHeader('X-Cache', 'MISS');
  res.json(payload);
});
