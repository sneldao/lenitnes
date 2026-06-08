import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

export const webhooksRouter = Router();

function verifyHmac(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// POST /webhooks/kraken — receive Kraken order confirmations.
webhooksRouter.post('/kraken', async (req, res) => {
  const hmacSecret = config.webhookSecret;
  if (!hmacSecret) {
    logger.error('WEBHOOK_SECRET is not configured — rejecting webhook');
    res.status(503).json({ error: 'webhooks_not_configured' });
    return;
  }

  const rawBody = (req as unknown as Record<string, unknown>).rawBody as string | undefined;
  const signature = req.headers['x-webhook-signature'] as string;
  if (!signature || !rawBody || !verifyHmac(rawBody, signature, hmacSecret)) {
    logger.warn({ ip: req.ip }, 'webhook HMAC verification failed');
    res.status(401).json({ error: 'invalid_signature' });
    return;
  }

  const { krakenOrderId, status, raw } = req.body ?? {};
  if (!krakenOrderId || typeof krakenOrderId !== 'string') {
    res.status(400).json({ error: 'missing krakenOrderId' });
    return;
  }
  if (status && !['pending', 'placed', 'failed'].includes(status)) {
    res.status(400).json({ error: 'invalid status' });
    return;
  }

  await query(
    `UPDATE orders SET status = COALESCE($1, status), kraken_response = $2 WHERE kraken_order_id = $3`,
    [status ?? null, JSON.stringify(raw ?? req.body), krakenOrderId],
  );
  res.json({ ok: true });
});
