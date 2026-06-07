import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';
import { groveGatewayUrl } from '../services/ipfs.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { Signal } from '../types.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';

export const signalsRouter = Router();

// GET /signals?monitorId=...  (heartbeats excluded by default, own monitors only)
signalsRouter.get('/', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const monitorId = req.query.monitorId ? String(req.query.monitorId) : null;
  const includeHeartbeats = req.query.includeHeartbeats === 'true';
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  if (monitorId) {
    const { rows: m } = await query<{ id: string }>(
      `SELECT id FROM monitors WHERE id = $1 AND user_id = $2`,
      [monitorId, authReq.user.id],
    );
    if (!m.length) return res.status(404).json({ error: 'not found' });
  }

  const cacheKey = `signals:${monitorId ?? authReq.user.id}:${includeHeartbeats}:${limit}:${offset}`;
  const cached = cacheGet<Signal[]>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  const where: string[] = [];
  if (monitorId) where.push(`m.id = $1`);
  else where.push(`m.user_id = $1`);
  const vals: unknown[] = [monitorId ?? authReq.user.id];
  if (!includeHeartbeats) where.push(`s.is_heartbeat = false`);
  vals.push(limit, offset);

  const { rows } = await query(
    `SELECT s.* FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.detected_at DESC
     LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
    vals,
  );

  cacheSet(cacheKey, rows, 30_000);
  res.setHeader('X-Cache', 'MISS');
  res.json(rows as unknown as Signal[]);
});

// GET /signals/:id — full proof package (own monitors only).
signalsRouter.get('/:id', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { rows } = await query(
    `SELECT s.* FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     WHERE s.id = $1 AND m.user_id = $2`,
    [req.params.id, authReq.user.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  const signal = rows[0] as unknown as Signal;

  const orders = await query(`SELECT * FROM orders WHERE signal_id = $1`, [signal.monitor_id]);
  const monitor = await query(`SELECT id, url, condition_text FROM monitors WHERE id = $1`, [
    signal.monitor_id,
  ]);

  res.json({
    ...signal,
    monitor: monitor.rows[0] ?? null,
    orders: orders.rows,
    proof: {
      ipfsUrl: signal.ipfs_cid ? groveGatewayUrl(signal.ipfs_cid) : null,
      hashscanUrl: signal.hedera_tx_id
        ? `https://hashscan.io/testnet/transaction/${encodeURIComponent(signal.hedera_tx_id)}`
        : null,
    },
  });
});
