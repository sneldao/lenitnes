import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { decrypt, encrypt } from '../services/crypto.js';
import {
  addOrder,
  getBalance,
  type AddOrderParams,
  type KrakenCredentials,
} from '../services/kraken.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const configureSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  apiSecret: z.string().min(1, 'API secret is required'),
});

export const krakenRouter = Router();

// POST /kraken/configure — store encrypted Kraken API keys for the authenticated user
krakenRouter.post('/configure', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const parsed = configureSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { apiKey, apiSecret } = parsed.data;

  // Validate keys by calling Kraken Balance endpoint before saving
  try {
    await getBalance({ apiKey, apiSecret } satisfies KrakenCredentials);
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

  await query(
    `UPDATE users SET kraken_api_key_encrypted = $1, kraken_api_secret_encrypted = $2 WHERE id = $3`,
    [encrypt(apiKey), encrypt(apiSecret), authReq.user.id],
  );
  res.json({ ok: true });
});

// GET /kraken/status — checks if Kraken CLI is available + user has keys configured
krakenRouter.get('/status', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { rows } = await query(
    `SELECT kraken_api_key_encrypted, kraken_api_secret_encrypted FROM users WHERE id = $1`,
    [authReq.user.id],
  );
  const user = rows[0] as
    | { kraken_api_key_encrypted: string | null; kraken_api_secret_encrypted: string | null }
    | undefined;

  const hasKeys = !!(user?.kraken_api_key_encrypted && user?.kraken_api_secret_encrypted);

  // Check CLI availability
  let cliAvailable = false;
  try {
    const { execSync } = await import('node:child_process');
    execSync('kraken --version', { encoding: 'utf-8', timeout: 5000 });
    cliAvailable = true;
  } catch {
    cliAvailable = false;
  }

  res.json({
    configured: hasKeys,
    cliAvailable,
    fallback: 'rest',
  });
});

// GET /kraken/balance — fetch live Kraken balance
krakenRouter.get('/balance', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { rows } = await query(
    `SELECT kraken_api_key_encrypted, kraken_api_secret_encrypted FROM users WHERE id = $1`,
    [authReq.user.id],
  );
  const user = rows[0] as
    | { kraken_api_key_encrypted: string | null; kraken_api_secret_encrypted: string | null }
    | undefined;

  if (!user?.kraken_api_key_encrypted || !user?.kraken_api_secret_encrypted) {
    return res.status(400).json({ error: 'Kraken API keys not configured' });
  }

  try {
    const balance = await getBalance({
      apiKey: decrypt(user.kraken_api_key_encrypted),
      apiSecret: decrypt(user.kraken_api_secret_encrypted),
    });
    res.json({ balance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'Kraken API error', message: msg });
  }
});

// POST /kraken/test-trade — paper-trade (validate=true) to verify keys and demonstrate flow
krakenRouter.post('/test-trade', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { rows } = await query(
    `SELECT kraken_api_key_encrypted, kraken_api_secret_encrypted FROM users WHERE id = $1`,
    [authReq.user.id],
  );
  const user = rows[0] as
    | { kraken_api_key_encrypted: string | null; kraken_api_secret_encrypted: string | null }
    | undefined;

  if (!user?.kraken_api_key_encrypted || !user?.kraken_api_secret_encrypted) {
    return res.status(400).json({ error: 'Kraken API keys not configured' });
  }

  const body = req.body as { pair?: string; type?: 'buy' | 'sell'; volume?: string };
  const order: AddOrderParams = {
    pair: body.pair || 'XBTUSD',
    type: body.type || 'buy',
    ordertype: 'market',
    volume: body.volume || '0.0001',
    validate: true, // paper trade — no real execution
  };

  try {
    const result = await addOrder(order, {
      apiKey: decrypt(user.kraken_api_key_encrypted),
      apiSecret: decrypt(user.kraken_api_secret_encrypted),
    });
    res.json({
      ok: true,
      krakenOrderId: result.krakenOrderId,
      raw: result.raw,
      note: 'This was a paper trade (validate=true). No real order was placed.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'Kraken API error', message: msg });
  }
});

// DELETE /kraken/configure — remove stored Kraken keys
krakenRouter.delete('/configure', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  await query(
    `UPDATE users SET kraken_api_key_encrypted = NULL, kraken_api_secret_encrypted = NULL WHERE id = $1`,
    [authReq.user.id],
  );
  res.json({ ok: true });
});
