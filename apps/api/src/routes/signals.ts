import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';
import { ipfsGatewayUrl } from '../services/ipfs.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { Signal } from '../types.js';

export const signalsRouter = Router();

// GET /signals?monitorId=...  (heartbeats excluded by default, own monitors only)
signalsRouter.get('/', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const monitorId = req.query.monitorId ? String(req.query.monitorId) : null;
  const includeHeartbeats = req.query.includeHeartbeats === 'true';

  if (monitorId) {
    const { rows: m } = await query<{ id: string }>(
      `SELECT id FROM monitors WHERE id = $1 AND user_id = $2`,
      [monitorId, authReq.user.id],
    );
    if (!m.length) return res.status(404).json({ error: 'not found' });
  }

  const where: string[] = [];
  if (monitorId) where.push(`m.id = $1`);
  else where.push(`m.user_id = $1`);
  const vals: unknown[] = [monitorId ?? authReq.user.id];
  if (!includeHeartbeats) where.push(`s.is_heartbeat = false`);

  const { rows } = await query(
    `SELECT s.* FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.detected_at DESC`,
    vals,
  );

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
      ipfsUrl: signal.ipfs_cid ? ipfsGatewayUrl(signal.ipfs_cid) : null,
      hashscanUrl: signal.hedera_tx_id
        ? `https://hashscan.io/testnet/transaction/${encodeURIComponent(signal.hedera_tx_id)}`
        : null,
    },
  });
});
