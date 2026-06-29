import pLimit from 'p-limit';
import { cacheGet, cacheSet } from '../../../middleware/cache.js';
import { withRetry } from '../../retry.js';
import { logger } from '../../../logger.js';
import type { PricePoint, PriceDataProvider } from '../types.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const coinGeckoLimit = pLimit(1);
const PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchCoinGeckoRange(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
): Promise<PricePoint[]> {
  const cacheKey = `price:cg:${coingeckoId}:${fromUnix}:${toUnix}`;
  const cached = cacheGet<PricePoint[]>(cacheKey);
  if (cached) return cached;

  const url =
    `${COINGECKO_BASE}/coins/${encodeURIComponent(coingeckoId)}/market_chart/range` +
    `?vs_currency=usd&from=${fromUnix}&to=${toUnix}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'LENITNES/0.1.0 (+https://lenitnes.persidian.com)' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`CoinGecko ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as { prices?: Array<[number, number]> };
  const points = (json.prices ?? []).map(([ts, price]) => ({
    timestamp: Math.floor(ts / 1000),
    price,
  }));

  cacheSet(cacheKey, points, PRICE_CACHE_TTL_MS);
  return points;
}

function nearestPrice(points: PricePoint[], targetUnix: number): number | null {
  if (points.length === 0) return null;
  let best = points[0];
  let bestDist = Math.abs(best.timestamp - targetUnix);
  for (let i = 1; i < points.length; i++) {
    const dist = Math.abs(points[i].timestamp - targetUnix);
    if (dist < bestDist) {
      best = points[i];
      bestDist = dist;
    }
  }
  return best.price;
}

async function fetchPriceAt(coingeckoId: string, timestamp: Date): Promise<number | null> {
  const ts = Math.floor(timestamp.getTime() / 1000);
  const from = ts - 3600;
  const to = ts + 3600;

  try {
    const points = await coinGeckoLimit(() =>
      withRetry(() => fetchCoinGeckoRange(coingeckoId, from, to), {
        retries: 2,
        baseDelayMs: 2_000,
      }),
    );
    return nearestPrice(points, ts);
  } catch (err) {
    logger.warn({ err, coingeckoId, ts: timestamp.toISOString() }, 'coingecko: price fetch failed');
    return null;
  }
}

async function fetchPriceAtWindow(
  coingeckoId: string,
  signalTime: Date,
  windowSeconds: number,
): Promise<{ atSignal: number; afterWindow: number } | null> {
  const endTime = new Date(signalTime.getTime() + windowSeconds * 1000);

  const [atSignal, afterWindow] = await Promise.all([
    fetchPriceAt(coingeckoId, signalTime),
    fetchPriceAt(coingeckoId, endTime),
  ]);

  if (atSignal == null || afterWindow == null) return null;
  return { atSignal, afterWindow };
}

export const coinGeckoProvider: PriceDataProvider = {
  name: 'coingecko',

  getPriceAt(assetId: string, timestamp: Date): Promise<number | null> {
    return fetchPriceAt(assetId, timestamp);
  },

  getPriceAtWindow(
    assetId: string,
    signalTime: Date,
    windowSeconds: number,
  ): Promise<{ atSignal: number; afterWindow: number } | null> {
    return fetchPriceAtWindow(assetId, signalTime, windowSeconds);
  },
};
