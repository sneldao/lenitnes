import { Router, type Request, type Response } from 'express';
import { createHash } from 'crypto';
import { getSignalWithProof } from './signals.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { verifySignalShareToken } from '../services/share-token.js';

// ── Public proof endpoint (no auth required) ────────────────────────
// Shares the same getSignalWithProof() function as the auth'd signals route (DRY).

export const proofRouter = Router();

proofRouter.get('/public/:id', async (req: Request, res: Response) => {
  const shareToken = typeof req.query.share === 'string' ? req.query.share : undefined;
  if (!verifySignalShareToken(req.params.id, shareToken)) {
    return res.status(404).json({ error: 'not found' });
  }

  const cacheKey = `proof:public:${req.params.id}:${shareToken}`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  const pkg = await getSignalWithProof(req.params.id, { includeOrders: false });
  if (!pkg) return res.status(404).json({ error: 'not found' });

  // Build verification checklist from what we actually have
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

  const evidenceHash = pkg.signal.evidence_text
    ? createHash('sha256').update(pkg.signal.evidence_text).digest('hex')
    : null;

  // Public proof exposes signal data + proof links + monitor metadata.
  // Orders are excluded since they contain potentially sensitive trade data.
  const publicPayload = {
    id: pkg.signal.id,
    detected_at: pkg.signal.detected_at,
    condition_summary: pkg.signal.condition_summary,
    evidence_text: pkg.signal.evidence_text,
    evidence_hash: evidenceHash,
    screenshot_urls: pkg.signal.screenshot_urls,
    is_heartbeat: pkg.signal.is_heartbeat,
    hedera_tx_id: pkg.signal.hedera_tx_id,
    ipfs_cid: pkg.signal.ipfs_cid,
    monitor: pkg.monitor,
    proof: pkg.proof,
    verification_checklist: checklist,
  };

  cacheSet(cacheKey, publicPayload, 60_000); // 60s TTL
  res.setHeader('X-Cache', 'MISS');
  res.json(publicPayload);
});
