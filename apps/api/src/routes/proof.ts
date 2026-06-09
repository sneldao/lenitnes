import { Router, type Request, type Response } from 'express';
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

  // Public proof exposes signal data + proof links + monitor metadata.
  // Orders are excluded since they contain potentially sensitive trade data.
  const publicPayload = {
    id: pkg.signal.id,
    detected_at: pkg.signal.detected_at,
    condition_summary: pkg.signal.condition_summary,
    evidence_text: pkg.signal.evidence_text,
    screenshot_urls: pkg.signal.screenshot_urls,
    is_heartbeat: pkg.signal.is_heartbeat,
    hedera_tx_id: pkg.signal.hedera_tx_id,
    ipfs_cid: pkg.signal.ipfs_cid,
    monitor: pkg.monitor,
    proof: pkg.proof,
  };

  cacheSet(cacheKey, publicPayload, 60_000); // 60s TTL
  res.setHeader('X-Cache', 'MISS');
  res.json(publicPayload);
});
