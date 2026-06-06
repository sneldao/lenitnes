import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const ordersRouter = Router();

// GET /orders — list all orders for the authenticated user's monitors
ordersRouter.get('/', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const { rows } = await query(
    `SELECT
       o.id,
       o.kraken_order_id,
       o.order_params,
       o.status,
       o.placed_at,
       o.kraken_response,
       s.id as signal_id,
       s.detected_at,
       m.id as monitor_id,
       m.url as monitor_url
     FROM orders o
     JOIN signals s ON s.id = o.signal_id
     JOIN monitors m ON m.id = s.monitor_id
     WHERE m.user_id = $1
     ORDER BY o.placed_at DESC NULLS LAST, o.created_at DESC
     LIMIT $2 OFFSET $3`,
    [authReq.user.id, limit, offset],
  );
  res.json(rows);
});
