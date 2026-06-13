import { Router, type Request, type Response } from 'express';
import { createHash } from 'crypto';
import { query } from '../db/pool.js';
import { groveGatewayUrl } from '../services/ipfs.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { Signal } from '@lenitnes/types';
import { cacheGet, cacheSet, cacheInvalidate } from '../middleware/cache.js';
import { createSignalShareToken } from '../services/share-token.js';
import { markSignalViewed } from '../services/domain/signal.service.js';

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
    `SELECT s.*, COALESCE(o.orders_count, 0) AS orders_count FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     LEFT JOIN (
       SELECT signal_id, COUNT(*) AS orders_count FROM orders GROUP BY signal_id
     ) o ON o.signal_id = s.id
     WHERE ${where.join(' AND ')}
     ORDER BY s.detected_at DESC
     LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
    vals,
  );

  cacheSet(cacheKey, rows, 30_000);
  res.setHeader('X-Cache', 'MISS');
  res.json(rows as unknown as Signal[]);
});

// GET /signals/:id — full proof package (own monitors only, DRY via getSignalWithProof).
signalsRouter.get('/:id', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { rows } = await query(
    `SELECT 1 FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     WHERE s.id = $1 AND m.user_id = $2`,
    [req.params.id, authReq.user.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });

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

// POST /signals/:id/viewed — mark a signal as viewed by the owning user.
// Idempotent. Side effect: if the parent monitor is currently in the
// `triggered` state, it is re-armed to `active` (so the dashboard's
// "Signal caught!" celebration goes away once the user has actually
// looked at the proof). Requires auth; only the signal's owner may
// acknowledge it.
signalsRouter.post('/:id/viewed', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const result = await markSignalViewed(req.params.id, authReq.user.id);
  if (!result) return res.status(404).json({ error: 'not_found' });
  if (result.monitorRearmed) {
    // Drop the user's monitor list cache so the dashboard sees the
    // re-armed status immediately.
    cacheInvalidate(`monitors:${authReq.user.id}:`);
  }
  return res.json({ ok: true, ...result });
});

// ── Signal Comments ───────────────────────────────────────────

export interface SignalComment {
  id: string;
  signal_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
}

// GET /signals/:id/comments — list comments for a signal (own monitors only).
signalsRouter.get('/:id/comments', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;

  const { rows: owned } = await query(
    `SELECT 1 FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     WHERE s.id = $1 AND m.user_id = $2`,
    [req.params.id, authReq.user.id],
  );
  if (!owned.length) return res.status(404).json({ error: 'not found' });

  const { rows } = await query(
    `SELECT sc.*, u.display_name AS author_name
     FROM signal_comments sc
     LEFT JOIN users u ON u.id = sc.user_id
     WHERE sc.signal_id = $1
     ORDER BY sc.created_at ASC`,
    [req.params.id],
  );
  res.json(rows);
});

// POST /signals/:id/comments — attach a note to a signal (own monitors only).
signalsRouter.post('/:id/comments', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { content } = req.body as { content?: string };

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'content_required' });
  }

  const { rows: owned } = await query(
    `SELECT 1 FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     WHERE s.id = $1 AND m.user_id = $2`,
    [req.params.id, authReq.user.id],
  );
  if (!owned.length) return res.status(404).json({ error: 'not found' });

  const { rows } = await query(
    `INSERT INTO signal_comments (signal_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, signal_id, user_id, content, created_at, updated_at`,
    [req.params.id, authReq.user.id, content.trim()],
  );

  const { rows: userRows } = await query<{ display_name: string | null }>(
    `SELECT display_name FROM users WHERE id = $1`,
    [authReq.user.id],
  );

  res.status(201).json({
    ...rows[0],
    author_name: userRows[0]?.display_name ?? null,
  });
});
