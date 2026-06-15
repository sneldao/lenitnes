import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { logger } from '../logger.js';

export const statsRouter = Router();

// ── Types ──────────────────────────────────────────────────────────

export interface PublicStats {
  total_signals: number;
  active_monitors: number;
  total_orders: number;
  total_proofs: number;
  total_arb_proofs: number;
  total_waitlist: number;
}

// GET /stats/public — aggregate counters for the landing-page live counter.
// Fully public — no auth required. Cached for 30s to absorb traffic spikes.
statsRouter.get('/public', async (_req: Request, res: Response) => {
  const cached = cacheGet<PublicStats>('stats:public');
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  try {
    const [signals, monitors, orders, proofs, arbProofs, waitlist] = await Promise.all([
      // Non-heartbeat signals only — heartbeats are just liveness checks.
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM signals WHERE is_heartbeat = false`,
      ),
      // Only monitors with a positive balance that are actively checking.
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM monitors WHERE status = 'active'`,
      ),
      // All orders ever placed (not just pending).
      query<{ count: string }>(`SELECT count(*)::text AS count FROM orders`),
      // Signals that actually made it to Hedera (have a valid hedera_tx_id).
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM signals WHERE hedera_tx_id IS NOT NULL AND is_heartbeat = false`,
      ),
      // Signals that actually made it to Arbitrum (have a valid arb_tx_hash).
      // Powers the dual-chain counter on the landing page.
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM signals WHERE arb_tx_hash IS NOT NULL AND is_heartbeat = false`,
      ),
      // Waitlist signups for social proof.
      query<{ count: string }>(`SELECT count(*)::text AS count FROM waitlist`),
    ]);

    const stats: PublicStats = {
      total_signals: Number(signals.rows[0]?.count ?? 0),
      active_monitors: Number(monitors.rows[0]?.count ?? 0),
      total_orders: Number(orders.rows[0]?.count ?? 0),
      total_proofs: Number(proofs.rows[0]?.count ?? 0),
      total_arb_proofs: Number(arbProofs.rows[0]?.count ?? 0),
      total_waitlist: Number(waitlist.rows[0]?.count ?? 0),
    };

    cacheSet('stats:public', stats, 30_000); // 30s cache
    res.setHeader('X-Cache', 'MISS');
    res.json(stats);
  } catch (err) {
    logger.error({ err }, 'failed to fetch public stats');
    res.status(500).json({ error: 'failed to fetch stats' });
  }
});
