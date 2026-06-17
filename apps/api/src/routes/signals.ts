import { Router, type Request, type Response } from 'express';
import { createHash } from 'crypto';
import { query } from '../db/pool.js';
import { groveGatewayUrl } from '../services/ipfs.js';
import type { Signal } from '@lenitnes/types';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { createSignalShareToken } from '../services/share-token.js';

export const signalsRouter = Router();

// ── Shared: assemble full proof package for a signal (DRY) ──────────
export interface ProofPackage {
  signal: Signal;
  monitor: { id: string; url: string; condition_text: string } | null;
  orders: unknown[];
  proof: { ipfsUrl: string | null; hashscanUrl: string | null };
}

export async function getSignalWithProof(
  signalId: string,
  options: { includeOrders?: boolean } = {},
): Promise<ProofPackage | null> {
  const { rows } = await query(
    `SELECT s.* FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     WHERE s.id = $1`,
    [signalId],
  );
  if (!rows.length) return null;
  const signal = rows[0] as unknown as Signal;

  const includeOrders = options.includeOrders ?? true;
  const [orders, monitor] = await Promise.all([
    includeOrders ? query(`SELECT * FROM orders WHERE signal_id = $1`, [signal.id]) : { rows: [] },
    query(`SELECT id, url, condition_text FROM monitors WHERE id = $1`, [signal.monitor_id]),
  ]);

  return {
    signal,
    monitor:
      (monitor.rows[0] as { id: string; url: string; condition_text: string } | undefined) ?? null,
    orders: orders.rows,
    proof: {
      ipfsUrl: signal.ipfs_cid ? groveGatewayUrl(signal.ipfs_cid) : null,
      hashscanUrl: signal.hedera_tx_id
        ? `https://hashscan.io/testnet/transaction/${encodeURIComponent(signal.hedera_tx_id)}`
        : null,
    },
  };
}

// GET /signals?monitorId=...  (public, system-facing after pivot)
signalsRouter.get('/', async (req: Request, res: Response) => {
  const monitorId = req.query.monitorId ? String(req.query.monitorId) : null;
  const includeHeartbeats = req.query.includeHeartbeats === 'true';
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  const cacheKey = `signals:all:${monitorId ?? ''}:${includeHeartbeats}:${limit}:${offset}`;
  const cached = cacheGet<Signal[]>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  const where: string[] = [];
  const vals: unknown[] = [];
  if (monitorId) {
    where.push(`m.id = $1`);
    vals.push(monitorId);
  }
  if (!includeHeartbeats) where.push(`s.is_heartbeat = false`);
  vals.push(limit, offset);

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT s.*, COALESCE(o.orders_count, 0) AS orders_count FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     LEFT JOIN (
       SELECT signal_id, COUNT(*) AS orders_count FROM orders GROUP BY signal_id
     ) o ON o.signal_id = s.id
     ${whereClause}
     ORDER BY s.detected_at DESC
     LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
    vals,
  );

  cacheSet(cacheKey, rows, 30_000);
  res.setHeader('X-Cache', 'MISS');
  res.json(rows as unknown as Signal[]);
});

// GET /signals/:id — full proof package (public, no auth after pivot).
signalsRouter.get('/:id', async (req: Request, res: Response) => {
  const pkg = await getSignalWithProof(req.params.id);
  if (!pkg) return res.status(404).json({ error: 'not found' });

  const [classifications, outcomes] = await Promise.all([
    query(
      `SELECT detector_type, score, confidence, label
         FROM signal_classifications
        WHERE signal_id = $1
        ORDER BY score DESC`,
      [req.params.id],
    ),
    query(
      `SELECT asset, window_seconds, price_at_signal::text, price_after::text,
              pct_change::text, direction
         FROM signal_outcomes
        WHERE signal_id = $1
        ORDER BY window_seconds`,
      [req.params.id],
    ),
  ]);

  const evidenceHash = pkg.signal.evidence_text
    ? createHash('sha256').update(pkg.signal.evidence_text).digest('hex')
    : null;
  const checklist = [
    {
      name: 'Detection timestamp',
      ok: Boolean(pkg.signal.detected_at),
      detail: pkg.signal.detected_at ?? 'Missing',
    },
    {
      name: 'Target URL verified',
      ok: Boolean(pkg.monitor?.url),
      detail: pkg.monitor?.url ?? 'Missing',
    },
    {
      name: 'Condition text recorded',
      ok: Boolean(pkg.monitor?.condition_text),
      detail: pkg.monitor?.condition_text ? 'Recorded' : 'Missing',
    },
    {
      name: 'HCS on-chain proof',
      ok: Boolean(pkg.signal.hedera_tx_id),
      detail: pkg.signal.hedera_tx_id ? 'HashScan link available' : 'Pending HCS submission',
    },
    {
      name: 'Grove evidence package',
      ok: Boolean(pkg.signal.ipfs_cid),
      detail: pkg.signal.ipfs_cid ? 'CID available' : 'Pending upload',
    },
    {
      name: 'Evidence collected',
      ok: Boolean(pkg.signal.evidence_text),
      detail: pkg.signal.evidence_text ? 'Evidence text available' : 'No evidence text',
    },
  ];

  res.json({
    ...pkg.signal,
    monitor: pkg.monitor,
    orders: pkg.orders,
    proof: pkg.proof,
    evidence_hash: evidenceHash,
    verification_checklist: checklist,
    public_share_token: createSignalShareToken(pkg.signal.id),
    classifications: classifications.rows,
    outcomes: outcomes.rows,
  });
});
