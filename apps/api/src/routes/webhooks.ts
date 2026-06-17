import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

export const webhooksRouter = Router();

// POST /webhooks/test — test a webhook URL by sending a sample payload.
webhooksRouter.post('/test', async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url_required' });
  }

  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'test',
        type: 'webhook_test',
        timestamp: new Date().toISOString(),
        message: 'This is a test webhook from LENITNES.',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const durationMs = Date.now() - start;
    res.json({ ok: response.ok, status: response.status, durationMs });
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.warn({ err, url }, 'webhook test failed');
    res.json({ ok: false, status: 0, durationMs });
  }
});

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
