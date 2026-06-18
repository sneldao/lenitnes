import { Router } from 'express';
import { logger } from '../logger.js';

export const webhooksRouter = Router();

// POST /webhooks/test — test a webhook URL by sending a sample payload.
// Kept as a public utility; not tied to any specific exchange after the
// Day 1 pivot removed the per-user Kraken trading surface.
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
