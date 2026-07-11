import pLimit from 'p-limit';
import { cacheGet, cacheSet } from '../../../middleware/cache.js';
import { withRetry } from '../../retry.js';
import { logger } from '../../../logger.js';
import { config } from '../../../config.js';
import type { PricePoint, PriceDataProvider } from '../types.js';
import { getCachedPriceSeries, setCachedPriceSeries } from './redis-cache.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
/** Free tier ≈ 10–30 req/min; pro key allows faster pacing. */
const REQUEST_GAP_MS = config.coingecko.apiKey ? 1_200 : 4_500;
const PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let lastRequestAt = 0;
const coinGeckoLimit = pLimit(1);

async function paceCoinGecko(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < REQUEST_GAP_MS) {
    await new Promise((r) => setTimeout(r, REQUEST_GAP_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

function coingeckoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'LENITNES/0.1.0 (+https://lenitnes.persidian.com)',
  };
  if (config.coingecko.apiKey) {
    headers['x-cg-demo-api-key'] = config.coingecko.apiKey;
  }
  return headers;
}

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

async function fetchCoinGeckoRange(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
): Promise<PricePoint[]> {
  const cacheKey = `price:cg:${coingeckoId}:${fromUnix}:${toUnix}`;
  const cached = cacheGet<PricePoint[]>(cacheKey);
  if (cached) return cached;

  const redisCached = await getCachedPriceSeries(coingeckoId, fromUnix, toUnix);
  if (redisCached) {
    cacheSet(cacheKey, redisCached, PRICE_CACHE_TTL_MS);
    return redisCached;
  }

  const url =
    `${COINGECKO_BASE}/coins/${encodeURIComponent(coingeckoId)}/market_chart/range` +
    `?vs_currency=usd&from=${fromUnix}&to=${toUnix}`;

  await paceCoinGecko();

  const res = await fetch(url, {
    headers: coingeckoHeaders(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const retryMs = res.status === 429 ? retryAfterMs(res) : null;
    const err = new Error(`CoinGecko ${res.status}: ${res.statusText}`) as Error & {
      retryAfterMs?: number;
    };
    if (retryMs != null) err.retryAfterMs = retryMs;
    throw err;
  }

  const json = (await res.json()) as { prices?: Array<[number, number]> };
  const points = (json.prices ?? []).map(([ts, price]) => ({
    timestamp: Math.floor(ts / 1000),
    price,
  }));

  cacheSet(cacheKey, points, PRICE_CACHE_TTL_MS);
  void setCachedPriceSeries(coingeckoId, fromUnix, toUnix, points);
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

async function fetchRangeWithRetry(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
): Promise<PricePoint[]> {
  return withRetry(() => fetchCoinGeckoRange(coingeckoId, fromUnix, toUnix), {
    retries: 4,
    baseDelayMs: 10_000,
    maxDelayMs: 120_000,
    retryIf: (err) => {
      const retryMs = (err as Error & { retryAfterMs?: number }).retryAfterMs;
      if (retryMs != null) return true;
      const msg = (err as Error).message ?? '';
      return msg.includes('429') || msg.includes('502') || msg.includes('503');
    },
    delayForAttempt: (attempt, err) => {
      const retryMs = (err as Error & { retryAfterMs?: number }).retryAfterMs;
      if (retryMs != null) return retryMs;
      return Math.min(10_000 * 2 ** attempt, 120_000);
    },
  });
}

/** One range fetch for replay/backtest sweeps — avoids N×2 point lookups. */
export async function prefetchPriceSeries(
  coingeckoId: string,
  from: Date,
  to: Date,
): Promise<PricePoint[]> {
  const fromUnix = Math.floor(from.getTime() / 1000);
  const toUnix = Math.floor(to.getTime() / 1000);
  return coinGeckoLimit(() => fetchRangeWithRetry(coingeckoId, fromUnix, toUnix));
}

/** Prefetch price series for multiple assets (watchlist sweep). */
export async function prefetchPriceSeriesForAssets(
  assetIds: string[],
  from: Date,
  to: Date,
): Promise<Map<string, PricePoint[]>> {
  const unique = Array.from(new Set(assetIds));
  const map = new Map<string, PricePoint[]>();
  for (const assetId of unique) {
    try {
      map.set(assetId, await prefetchPriceSeries(assetId, from, to));
      logger.debug({ assetId, points: map.get(assetId)?.length }, 'coingecko: prefetched asset');
    } catch (err) {
      logger.warn({ err, assetId }, 'coingecko: asset prefetch failed');
      map.set(assetId, []);
    }
  }
  return map;
}

export function priceAtFromSeries(points: PricePoint[], timestamp: Date): number | null {
  if (points.length === 0) return null;
  return nearestPrice(points, Math.floor(timestamp.getTime() / 1000));
}

async function fetchPriceAt(coingeckoId: string, timestamp: Date): Promise<number | null> {
  const ts = Math.floor(timestamp.getTime() / 1000);
  const from = ts - 3600;
  const to = ts + 3600;

  try {
    const points = await coinGeckoLimit(() => fetchRangeWithRetry(coingeckoId, from, to));
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
