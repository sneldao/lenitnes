import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withRetry } from './retry.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────
// Kraken integration — prefers the Kraken CLI (AI-native trading
// interface) and falls back to the REST API.
//
// Install CLI: curl --proto '=https' --tlsv1.2 -LsSf
//   https://github.com/krakenfx/kraken-cli/releases/latest/download/kraken-cli-installer.sh | sh
// Reference: https://docs.kraken.com/rest/  and  https://www.kraken.com/kraken-cli
// ─────────────────────────────────────────────────────────────

const KRAKEN_API_URL = 'https://api.kraken.com';

export interface KrakenCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface AddOrderParams {
  pair: string; // e.g. "XBTUSD"
  type: 'buy' | 'sell';
  ordertype:
    | 'market'
    | 'limit'
    | 'stop-loss'
    | 'take-profit'
    | 'stop-loss-limit'
    | 'take-profit-limit';
  volume: string;
  price?: string; // required for limit/stop-loss/take-profit; trigger price for stop-loss-limit
  price2?: string; // limit price for stop-loss-limit and take-profit-limit
  validate?: boolean; // true => dry-run (paper trade)
  cancelAfter?: number; // seconds — auto-cancel if not filled (dead-man's switch)
}

function sign(path: string, body: string, nonce: string, secret: string): string {
  const sha256 = crypto
    .createHash('sha256')
    .update(nonce + body)
    .digest();
  const message = Buffer.concat([Buffer.from(path), sha256]);
  return crypto
    .createHmac('sha512', Buffer.from(secret, 'base64'))
    .update(message)
    .digest('base64');
}

async function privateRequest(
  endpoint: string,
  params: Record<string, string>,
  creds: KrakenCredentials,
): Promise<any> {
  const path = `/0/private/${endpoint}`;
  const nonce = Date.now().toString();
  const body = new URLSearchParams({ nonce, ...params }).toString();
  const signature = sign(path, body, nonce, creds.apiSecret);

  const res = await fetch(`${KRAKEN_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'User-Agent': 'LENITNES/0.1.0 (+https://lenitnes.persidian.com)',
      'API-Key': creds.apiKey,
      'API-Sign': signature,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { error: string[]; result: unknown };
  if (json.error && json.error.length) {
    throw new Error(`Kraken error: ${json.error.join(', ')}`);
  }
  return json.result;
}

async function cliAddOrder(
  order: AddOrderParams,
  creds: KrakenCredentials,
): Promise<{ krakenOrderId: string | null; raw: unknown }> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    KRAKEN_API_KEY: creds.apiKey,
    KRAKEN_API_SECRET: creds.apiSecret,
  };

  const args = [
    'trade',
    'add',
    '--pair',
    order.pair,
    '--type',
    order.type,
    '--ordertype',
    order.ordertype,
    '--volume',
    order.volume,
    ...(order.price ? ['--price', order.price] : []),
    ...(order.price2 ? ['--price2', order.price2] : []),
    ...(order.validate ? ['--validate'] : []),
    ...(order.cancelAfter ? ['--cancel-after', String(order.cancelAfter)] : []),
    '--json',
  ];

  const { stdout } = await execFileAsync('kraken', args, { env, timeout: 30000 });
  const parsed = JSON.parse(stdout) as { txid?: string[]; error?: string[] };
  if (parsed.error && parsed.error.length) {
    throw new Error(`Kraken CLI error: ${parsed.error.join(', ')}`);
  }
  return { krakenOrderId: parsed?.txid?.[0] ?? null, raw: parsed };
}

/**
 * Credential-less paper trade via the Kraken CLI built-in paper engine.
 * Uses simulated account with $10K USD — no API keys, no real money, live prices.
 */
export async function paperAddOrder(
  order: AddOrderParams,
): Promise<{ krakenOrderId: string | null; raw: unknown }> {
  const args = ['paper', order.type, order.pair, order.volume];
  const { stdout } = await execFileAsync('kraken', args, { timeout: 30000 });
  // The CLI output is a human-readable table; wrap it in a structured object.
  return { krakenOrderId: 'paper-' + Date.now(), raw: { mode: 'paper', output: stdout, ...order } };
}

export async function addOrder(
  order: AddOrderParams,
  creds: KrakenCredentials,
): Promise<{ krakenOrderId: string | null; raw: unknown }> {
  // Prefer Kraken CLI when available.
  try {
    return await cliAddOrder(order, creds);
  } catch (cliErr) {
    if ((cliErr as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.warn('Kraken CLI not found, falling back to REST API');
    } else {
      const msg = cliErr instanceof Error ? cliErr.message : String(cliErr);
      logger.warn({ msg }, 'Kraken CLI failed, falling back to REST API');
    }
  }

  const params: Record<string, string> = {
    pair: order.pair,
    type: order.type,
    ordertype: order.ordertype,
    volume: order.volume,
  };
  if (order.price) params.price = order.price;
  if (order.price2) params.price2 = order.price2;
  if (order.validate) params.validate = 'true';
  if (order.cancelAfter) params.cancelafter = String(order.cancelAfter);

  const result = (await withRetry(() => privateRequest('AddOrder', params, creds), {
    retries: 2,
    baseDelayMs: 500,
  })) as { txid?: string[] };
  return { krakenOrderId: result?.txid?.[0] ?? null, raw: result };
}

export async function getBalance(creds: KrakenCredentials): Promise<Record<string, string>> {
  return privateRequest('Balance', {}, creds);
}

export type KrakenOrderStatus = 'pending' | 'open' | 'closed' | 'canceled' | 'expired';

export interface KrakenOrderInfo {
  status: KrakenOrderStatus;
  vol: string;
  vol_exec: string;
  cost: string;
  price: string;
}

export async function queryOrders(
  txIds: string[],
  creds: KrakenCredentials,
): Promise<Record<string, KrakenOrderInfo>> {
  const result = (await withRetry(
    () => privateRequest('QueryOrders', { txid: txIds.join(',') }, creds),
    { retries: 2, baseDelayMs: 500 },
  )) as Record<string, KrakenOrderInfo>;
  return result;
}

export async function cancelOrder(txIds: string[], creds: KrakenCredentials): Promise<unknown> {
  return withRetry(() => privateRequest('CancelOrder', { txid: txIds.join(',') }, creds), {
    retries: 1,
    baseDelayMs: 300,
  });
}

export function mapKrakenStatus(kraken: KrakenOrderInfo): string {
  switch (kraken.status) {
    case 'closed':
      return Number(kraken.vol_exec) < Number(kraken.vol) ? 'partially_filled' : 'filled';
    case 'open':
      return 'placed';
    case 'canceled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'pending':
    default:
      return 'pending';
  }
}
