import { Router, type Request, type Response } from 'express';
import { cacheGet, cacheSet } from '../middleware/cache.js';

export const ordersRouter = Router();

// GET /orders — list recent orders (public, system-facing after pivot)
ordersRouter.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const cacheKey = `orders:all:${limit}:${offset}`;
  const cached = cacheGet<unknown[]>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }
  // NOTE: kept as inline SQL for now because it joins 3 tables and the
  // resulting domain-service signature would be less readable than the SQL.
  const { query } = await import('../db/pool.js');
  const { rows } = await query(
    `SELECT
       o.id, o.order_params, o.status,
       o.placed_at, o.cancelled_at,
       s.id as signal_id, s.detected_at,
       m.id as monitor_id, m.url as monitor_url
     FROM orders o
     JOIN signals s ON s.id = o.signal_id
     JOIN monitors m ON m.id = s.monitor_id
     ORDER BY o.placed_at DESC NULLS LAST
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  cacheSet(cacheKey, rows, 30_000);
  res.setHeader('X-Cache', 'MISS');
  res.json(rows);
});
