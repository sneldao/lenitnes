// Binance USDT-perp kline oracle — excellent when reachable, but
// api.binance.com 451-blocks restricted locations (confirmed from the
// production box). First failure opens a LONG cooldown (6h): this is
// a conditional source, kept for deployments in allowed regions.

import { coingeckoToBinanceSymbol } from '../asset-map.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../circuit.js';
import { logger } from '../../../logger.js';
import type { PricePoint } from '../types.js';

const BINANCE_KLINES_URL = 'https://api.binance.com/api/v3/klines';
const TIMEOUT_MS = 10_000;
// Geo-block is sticky — cooldown in hours, not minutes.
const CIRCUIT = { name: 'pf:binance', threshold: 1, windowMs: 60_000, cooldownMs: 6 * 3_600_000 };

function intervalForSpan(spanS: number): string {
  if (spanS <= 6 * 3600) return '15m';
  if (spanS <= 35 * 86400) return '1h';
  return '1d';
}

export async function fetchBinanceSeries(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
): Promise<PricePoint[] | null> {
  const symbol = coingeckoToBinanceSymbol(coingeckoId);
  if (!symbol) return null;
  if (isCircuitOpen(CIRCUIT)) return null;

  const spanS = toUnix - fromUnix;
  const params = new URLSearchParams({
    symbol,
    interval: intervalForSpan(spanS),
    startTime: String(fromUnix * 1000),
    endTime: String(toUnix * 1000),
    limit: '1000',
  });

  try {
    const res = await fetch(`${BINANCE_KLINES_URL}?${params}`, {
      headers: { 'User-Agent': 'lenitnes/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 451) throw new Error('binance: geo-restricted (451)');
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const rows = (await res.json()) as Array<unknown[]>;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('binance: empty kline set');
    }
    recordSuccess(CIRCUIT);
    // kline row: [openTimeMs, open, high, low, close, ...]
    return rows.map((row) => ({
      timestamp: Math.floor(Number(row[0]) / 1000),
      price: Number(row[4]),
    }));
  } catch (err) {
    recordFailure(CIRCUIT);
    logger.debug({ err, coingeckoId }, 'price fallback: binance failed');
    return null;
  }
}
