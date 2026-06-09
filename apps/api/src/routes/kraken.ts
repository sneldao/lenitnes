import { Router, type Request, type Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { addOrder, getBalance, type AddOrderParams } from '../services/kraken.js';
import { krakenConfigSchema, testTradeSchema } from '../validation/index.js';
import { validate } from '../middleware/validate.js';
import {
  getKrakenCredentials,
  saveKrakenCredentials,
  deleteKrakenCredentials,
} from '../services/domain/user.service.js';
import { FEATURES } from '../features.js';

export const krakenRouter = Router();

// POST /kraken/configure — store encrypted Kraken API keys for the authenticated user
krakenRouter.post(
  '/configure',
  validate(krakenConfigSchema),
  async (req: Request, res: Response) => {
    const authReq = req as unknown as AuthenticatedRequest;
    const { apiKey, apiSecret } = req.body as { apiKey: string; apiSecret: string };

    // Validate keys by calling Kraken Balance endpoint before saving
    try {
      await getBalance({ apiKey, apiSecret });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: 'Kraken API validation failed', message: msg });
    }

    // Verify the key has trade permission via a validate-mode order
    try {
      const testOrder: AddOrderParams = {
        pair: 'XBTUSD',
        type: 'buy',
        ordertype: 'market',
        volume: '0.00001',
        validate: true,
      };
      await addOrder(testOrder, { apiKey, apiSecret });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isPermission = msg.toLowerCase().includes('permission');
      return res.status(400).json({
        error: isPermission
          ? 'API key lacks trading permission. Enable "Create & cancel orders" at kraken.com/settings/api'
          : 'Trade permission check failed',
        message: msg,
      });
    }

    await saveKrakenCredentials(authReq.user.id, apiKey, apiSecret);
    return res.json({ ok: true });
  },
);

// GET /kraken/status — checks if Kraken CLI is available + user has keys configured
krakenRouter.get('/status', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const creds = await getKrakenCredentials(authReq.user.id);
  const hasKeys = !!creds;

  // Check CLI availability
  let cliAvailable = false;
  try {
    const { execSync } = await import('node:child_process');
    execSync('kraken --version', { encoding: 'utf-8', timeout: 5000 });
    cliAvailable = true;
  } catch {
    cliAvailable = false;
  }

  return res.json({
    configured: hasKeys,
    cliAvailable,
    fallback: 'rest',
  });
});

// GET /kraken/balance — fetch live Kraken balance
krakenRouter.get('/balance', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const creds = await getKrakenCredentials(authReq.user.id);
  if (!creds) {
    return res.status(400).json({ error: 'Kraken API keys not configured' });
  }

  try {
    const balance = await getBalance(creds);
    return res.json({ balance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: 'Kraken API error', message: msg });
  }
});

// POST /kraken/test-trade — paper-trade (validate=true) to verify keys and demonstrate flow
krakenRouter.post('/test-trade', validate(testTradeSchema), async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const creds = await getKrakenCredentials(authReq.user.id);
  if (!creds) {
    return res.status(400).json({ error: 'Kraken API keys not configured' });
  }

  const body = (req.body ?? {}) as { pair?: string; type?: 'buy' | 'sell'; volume?: string };
  const order: AddOrderParams = {
    pair: body.pair || 'XBTUSD',
    type: body.type || 'buy',
    ordertype: 'market',
    volume: body.volume || '0.0001',
    validate: true, // paper trade — no real execution
  };

  try {
    const result = await addOrder(order, creds);
    return res.json({
      ok: true,
      krakenOrderId: result.krakenOrderId,
      raw: result.raw,
      note: 'This was a paper trade (validate=true). No real order was placed.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: 'Kraken API error', message: msg });
  }
});

// DELETE /kraken/configure — remove stored Kraken keys
krakenRouter.delete('/configure', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  await deleteKrakenCredentials(authReq.user.id);
  return res.json({ ok: true });
});

// Reference FEATURES so the feature flag is observable from this module (helps future auditing).
export const _features = FEATURES;
