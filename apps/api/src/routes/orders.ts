import { Router, type Request, type Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { cacheGet, cacheSet, cacheInvalidate } from '../middleware/cache.js';
import {
  queryOrders,
  cancelOrder,
  mapKrakenStatus,
  type KrakenCredentials,
} from '../services/kraken.js';
import { logger } from '../logger.js';
import { getKrakenCredentials } from '../services/domain/user.service.js';
import { FEATURES } from '../features.js';

export const ordersRouter = Router();

// GET /orders — list all orders for the authenticated user's monitors
ordersRouter.get('/', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const cacheKey = `orders:${authReq.user.id}:${limit}:${offset}`;
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
       o.id, o.kraken_order_id, o.order_params, o.status,
       o.placed_at, o.cancelled_at, o.kraken_response,
       s.id as signal_id, s.detected_at,
       m.id as monitor_id, m.url as monitor_url
     FROM orders o
     JOIN signals s ON s.id = o.signal_id
     JOIN monitors m ON m.id = s.monitor_id
     WHERE m.user_id = $1
      ORDER BY o.placed_at DESC NULLS LAST
     LIMIT $2 OFFSET $3`,
    [authReq.user.id, limit, offset],
  );
  cacheSet(cacheKey, rows, 30_000);
  res.setHeader('X-Cache', 'MISS');
  res.json(rows);
});

// GET /orders/sync — sync placed order statuses from Kraken
ordersRouter.get('/sync', async (req: Request, res: Response) => {
  if (!FEATURES.krakenTrading) {
    return res.status(501).json({ error: 'kraken_trading_not_configured' });
  }
  const authReq = req as unknown as AuthenticatedRequest;
  const creds = await getKrakenCredentials(authReq.user.id);
  if (!creds) {
    return res.status(400).json({ error: 'Kraken API keys not configured' });
  }

  const { query } = await import('../db/pool.js');
  const { rows: placed } = await query<{ id: string; kraken_order_id: string }>(
    `SELECT o.id, o.kraken_order_id FROM orders o
     JOIN signals s ON s.id = o.signal_id
     JOIN monitors m ON m.id = s.monitor_id
     WHERE m.user_id = $1 AND o.status = 'placed' AND o.kraken_order_id IS NOT NULL`,
    [authReq.user.id],
  );

  if (placed.length === 0) {
    return res.json({ synced: 0, updated: 0 });
  }

  const txIds = placed.map((o) => o.kraken_order_id);
  let updated = 0;

  try {
    const krakenOrders = await queryOrders(txIds, creds);
    for (const order of placed) {
      const info = krakenOrders[order.kraken_order_id];
      if (!info) continue;
      const newStatus = mapKrakenStatus(info);
      if (newStatus !== 'placed') {
        await query(`UPDATE orders SET status = $1, kraken_response = $2 WHERE id = $3`, [
          newStatus,
          JSON.stringify(info),
          order.id,
        ]);
        updated++;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'order sync failed');
    return res.status(502).json({ error: 'Kraken API error', message: String(err) });
  }

  cacheInvalidate(`orders:${authReq.user.id}:`);
  return res.json({ synced: placed.length, updated });
});

// POST /orders/:id/cancel — cancel a placed order
ordersRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  if (!FEATURES.krakenTrading) {
    return res.status(501).json({ error: 'kraken_trading_not_configured' });
  }
  const authReq = req as unknown as AuthenticatedRequest;
  const { id } = req.params;

  const { query } = await import('../db/pool.js');
  const { rows } = await query<{
    id: string;
    kraken_order_id: string | null;
    status: string;
    user_id: string;
  }>(
    `SELECT o.id, o.kraken_order_id, o.status, m.user_id
     FROM orders o
     JOIN signals s ON s.id = o.signal_id
     JOIN monitors m ON m.id = s.monitor_id
     WHERE o.id = $1`,
    [id],
  );

  const order = rows[0];
  if (!order) return res.status(404).json({ error: 'order not found' });
  if (order.user_id !== authReq.user.id) return res.status(403).json({ error: 'forbidden' });
  if (order.status !== 'placed') {
    return res.status(400).json({ error: `cannot cancel order in status: ${order.status}` });
  }
  if (!order.kraken_order_id) return res.status(400).json({ error: 'no Kraken order ID' });

  const creds = await getKrakenCredentials(authReq.user.id);
  if (!creds) {
    return res.status(400).json({ error: 'Kraken API keys not configured' });
  }

  try {
    await cancelOrder([order.kraken_order_id], creds);
    await query(`UPDATE orders SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [id]);
    cacheInvalidate(`orders:${authReq.user.id}:`);
    return res.json({ ok: true });
  } catch (err) {
    logger.warn({ err, orderId: id }, 'cancel order failed');
    return res.status(502).json({ error: 'Kraken API error', message: String(err) });
  }
});

// Suppress unused-import warning for KrakenCredentials — kept for type consumers.
export type { KrakenCredentials };
