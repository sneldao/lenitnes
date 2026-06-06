import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';
import { decrypt } from '../services/crypto.js';
import { addOrder, getBalance, type AddOrderParams } from '../services/kraken.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const krakenRouter = Router();

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
