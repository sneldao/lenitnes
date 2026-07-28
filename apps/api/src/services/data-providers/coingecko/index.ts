import pLimit from 'p-limit';
import { cacheGet, cacheSet } from '../../../middleware/cache.js';
import { withRetry } from '../../retry.js';
import { logger } from '../../../logger.js';
import { config } from '../../../config.js';
import type { PricePoint, PriceDataProvider } from '../types.js';
import { getCachedPriceSeries, setCachedPriceSeries } from './redis-cache.js';
import { getLatestUsdPrice } from '../spot-prices.js';
import { tryConsume, SpendGuardError } from '../../spend-guard.js';
import { fetchSeriesThroughChain } from '../fallback/index.js';

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

// Timestamp grid for cache keys: two lookups for "price at 13:47:12"
// and "price at 13:52:58" map to the same 15-minute bucket, so repeated
// outcome snapshots / TP/SL backfills / sweep prefetch for the same
// signal actually HIT the cache instead of each minting a new range call.
const BUCKET_SEC = 15 * 60;

function bucketUnix(ts: number): number {
  return Math.floor(ts / BUCKET_SEC) * BUCKET_SEC;
}

// Shared-cooldown bookkeeping: when CoinGecko answers 429 we park ALL
// further calls for retry-after (or 60s). Without this, the retry loop
// in fetchRangeWithRetry keeps the lane busy hammering a rate limit
// that is clearly account-wide, and every consumer pays the latency.
let cooldownUntilMs = 0;

function cooldownActive(): boolean {
  return Date.now() < cooldownUntilMs;
}

function enterCooldown(retryAfterMs: number | null): void {
  cooldownUntilMs = Math.max(cooldownUntilMs, Date.now() + (retryAfterMs ?? 60_000));
}

/**
 * Raw CoinGecko range fetch — NO caching. Caching lives one level up
 * (fetchSeriesCachedThroughChain) so alternative oracles populate the
 * same caches.
 */
async function fetchCoinGeckoRange(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
): Promise<PricePoint[]> {
  if (cooldownActive()) {
    throw new SpendGuardError('coingecko', 'coingecko: cooling down after 429 (shared brake)');
  }
  // Daily hard stop — the spend guard's error is NOT retried, so call
  // sites see it as an ordinary miss (null price → defer/decline).
  await tryConsume('coingecko');

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
    if (res.status === 429) enterCooldown(retryMs);
    const err = new Error(`CoinGecko ${res.status}: ${res.statusText}`) as Error & {
      retryAfterMs?: number;
    };
    if (retryMs != null) err.retryAfterMs = retryMs;
    throw err;
  }

  const json = (await res.json()) as { prices?: Array<[number, number]> };
  return (json.prices ?? []).map(([ts, price]) => ({
    timestamp: Math.floor(ts / 1000),
    price,
  }));
}

/**
 * Series fetch through the fallback chain, with the two cache layers
 * in front. Whichever oracle answers (hyperliquid, kraken, defillama,
 * binance, or coingecko itself) the result is cached under the same
 * key — so repeat lookups are always free regardless of provider.
 */
async function fetchSeriesCachedThroughChain(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
): Promise<PricePoint[]> {
  const bFrom = bucketUnix(fromUnix);
  const bTo = bucketUnix(toUnix);
  const cacheKey = `price:cg:${coingeckoId}:${bFrom}:${bTo}`;

  const cached = cacheGet<PricePoint[]>(cacheKey);
  if (cached) return cached;

  const redisCached = await getCachedPriceSeries(coingeckoId, bFrom, bTo);
  if (redisCached) {
    cacheSet(cacheKey, redisCached, PRICE_CACHE_TTL_MS);
    return redisCached;
  }

  const cgSource = {
    name: 'coingecko',
    fetch: (id: string, f: number, t: number) =>
      coinGeckoLimit(() => fetchRangeWithRetry(id, f, t)),
  };

  const series = config.pricing.fallbacksEnabled
    ? await fetchSeriesThroughChain(coingeckoId, bFrom, bTo, cgSource)
    : { points: await cgSource.fetch(coingeckoId, bFrom, bTo), source: 'coingecko' };

  cacheSet(cacheKey, series.points, PRICE_CACHE_TTL_MS);
  void setCachedPriceSeries(coingeckoId, bFrom, bTo, series.points);
  return series.points;
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
      // A 429 without a Retry-After hint = the account quota is spent.
      // Retrying just burns the shared cooldown while pages hang —
      // fail fast and let the next cycle try after the brake expires.
      const retryMs = (err as Error & { retryAfterMs?: number }).retryAfterMs;
      if (retryMs != null) return true;
      const msg = (err as Error).message ?? '';
      return msg.includes('502') || msg.includes('503');
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
  return fetchSeriesCachedThroughChain(coingeckoId, fromUnix, toUnix);
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

  // Near-now fast path: "price right now" (TP/SL ticks, Propr sizing,
  // entry prices, just-matured outcome windows) is served by the spot
  // hub — one batched CMC call for ALL assets every refresh cycle,
  // cached in Redis. This is what stops the CoinGecko 429 death spiral.
  const nowS = Math.floor(Date.now() / 1000);
  if (Math.abs(nowS - ts) <= config.pricing.freshSlopSeconds) {
    const hubPrice = await getLatestUsdPrice(coingeckoId).catch(() => null);
    if (hubPrice != null && hubPrice > 0) return hubPrice;
    // Hub miss (CMC down/budgeted/new asset) — fall through to CoinGecko.
  }

  const from = ts - 3600;
  const to = ts + 3600;

  try {
    const points = await fetchSeriesCachedThroughChain(coingeckoId, from, to);
    return nearestPrice(points, ts);
  } catch (err) {
    if (!(err instanceof SpendGuardError)) {
      logger.warn(
        { err, coingeckoId, ts: timestamp.toISOString() },
        'coingecko: price fetch failed (all sources)',
      );
    }
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
