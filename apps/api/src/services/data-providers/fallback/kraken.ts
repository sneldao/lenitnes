// Kraken public OHLC oracle — keyless, well rate-limited, USD pairs
// for every watchlist asset. 1h candles for a month back, daily
// candles for the long sweeps.

import { coingeckoToKrakenPair } from '../asset-map.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../circuit.js';
import { logger } from '../../../logger.js';
import type { PricePoint } from '../types.js';

const KRAKEN_OHLC_URL = 'https://api.kraken.com/0/public/OHLC';
const TIMEOUT_MS = 10_000;
const CIRCUIT = { name: 'pf:kraken', threshold: 3, windowMs: 60_000, cooldownMs: 300_000 };

export async function fetchKrakenSeries(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
): Promise<PricePoint[] | null> {
  const pair = coingeckoToKrakenPair(coingeckoId);
  if (!pair) return null;
  if (isCircuitOpen(CIRCUIT)) return null;

  const spanS = toUnix - fromUnix;
  const intervalMinutes = spanS <= 2 * 86400 ? 60 : 1440;
  const params = new URLSearchParams({
    pair,
    interval: String(intervalMinutes),
    since: String(Math.max(0, fromUnix - intervalMinutes * 60)),
  });

  try {
    const res = await fetch(`${KRAKEN_OHLC_URL}?${params}`, {
      headers: { 'User-Agent': 'lenitnes/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`kraken ${res.status}`);
    const json = (await res.json()) as {
      error?: string[];
      result?: Record<string, unknown>;
    };
    if (json.error && json.error.length > 0) throw new Error(`kraken: ${json.error[0]}`);

    const series = (json.result?.[pair] ?? json.result?.[Object.keys(json.result ?? {})[0]!]) as
      | Array<[number, string, string, string, string, string, string, number]>
      | undefined;
    if (!Array.isArray(series) || series.length === 0) {
      throw new Error('kraken: empty ohlc set');
    }
    recordSuccess(CIRCUIT);
    return series
      .map((row) => ({ timestamp: Number(row[0]), price: Number(row[4]) }))
      .filter((p) => p.timestamp >= fromUnix - intervalMinutes * 60 && p.timestamp <= toUnix);
  } catch (err) {
    recordFailure(CIRCUIT);
    logger.debug({ err, coingeckoId }, 'price fallback: kraken failed');
    return null;
  }
}
