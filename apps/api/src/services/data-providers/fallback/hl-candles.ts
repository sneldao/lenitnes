// Hyperliquid candle oracle — the perp venue our live fills execute
// on, exposed via the auth-free /info endpoint. 1m/5m/15m/1h/1d
// candles, generous limits. Best precision for intraday windows
// (T+1h / T+4h / entry marks) and the most "correct" price for the
// trades we actually place.

import { coingeckoToHyperliquidCoin } from '../asset-map.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../circuit.js';
import { logger } from '../../../logger.js';
import type { PricePoint } from '../types.js';

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const TIMEOUT_MS = 10_000;
const CIRCUIT = { name: 'pf:hyperliquid', threshold: 3, windowMs: 60_000, cooldownMs: 300_000 };

function intervalForSpan(spanS: number): string {
  if (spanS <= 6 * 3600) return '15m';
  if (spanS <= 14 * 86400) return '1h';
  return '1d';
}

interface RawCandle {
  /** candle open time (ms) */
  t: number;
  /** close price (string float, USD) */
  c: string;
}

export async function fetchHlCandleSeries(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
): Promise<PricePoint[] | null> {
  const coin = coingeckoToHyperliquidCoin(coingeckoId);
  if (!coin) return null;
  if (isCircuitOpen(CIRCUIT)) return null;

  try {
    const res = await fetch(HL_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: {
          coin,
          interval: intervalForSpan(toUnix - fromUnix),
          startTime: fromUnix * 1000,
          endTime: toUnix * 1000,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`hyperliquid ${res.status}:`);
    const rows = (await res.json()) as RawCandle[];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('hyperliquid: empty candle set (asset not listed?)');
    }
    recordSuccess(CIRCUIT);
    return rows.map((r) => ({ timestamp: Math.floor(r.t / 1000), price: Number(r.c) }));
  } catch (err) {
    recordFailure(CIRCUIT);
    logger.debug({ err, coingeckoId }, 'price fallback: hyperliquid candles failed');
    return null;
  }
}
