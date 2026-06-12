import pLimit from 'p-limit';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { withRetry } from './retry.js';
import { logger } from '../logger.js';

// ── Price data service ──────────────────────────────────────────
// Two backends: CoinGecko (broad coverage, free) and Kraken (crypto pairs).
// Historical price data is immutable, so cache TTLs are long.

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const KRAKEN_PUBLIC = 'https://api.kraken.com/0/public';

// CoinGecko free tier: 10-30 req/min — serialize to stay well under.
const coinGeckoLimit = pLimit(1);

const PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — past prices don't change

export interface PricePoint {
  timestamp: number;
  price: number;
}

export type PriceSource = 'coingecko' | 'kraken';

// ── CoinGecko ────────────────────────────────────────────────────

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

async function getCoinGeckoPriceAt(coingeckoId: string, timestamp: Date): Promise<number | null> {
  const ts = Math.floor(timestamp.getTime() / 1000);
  // Fetch ±1h around the target to ensure at least one data point.
  const from = ts - 3600;
  const to = ts + 3600;

  const points = await coinGeckoLimit(() =>
    withRetry(() => fetchCoinGeckoRange(coingeckoId, from, to), {
      retries: 2,
      baseDelayMs: 2_000, // CoinGecko rate limits need longer backoff
    }),
  );

  return nearestPrice(points, ts);
}

// ── Kraken ───────────────────────────────────────────────────────

async function fetchKrakenOHLC(
  pair: string,
  sinceUnix: number,
  intervalMinutes = 60,
): Promise<PricePoint[]> {
  const cacheKey = `price:kr:${pair}:${sinceUnix}:${intervalMinutes}`;
  const cached = cacheGet<PricePoint[]>(cacheKey);
  if (cached) return cached;

  const url =
    `${KRAKEN_PUBLIC}/OHLC?pair=${encodeURIComponent(pair)}` +
    `&interval=${intervalMinutes}&since=${sinceUnix}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'LENITNES/0.1.0 (+https://lenitnes.persidian.com)' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Kraken ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as {
    error: string[];
    result: Record<string, Array<[number, string, string, string, string, string, number, number]>>;
  };
  if (json.error && json.error.length) {
    throw new Error(`Kraken OHLC error: ${json.error.join(', ')}`);
  }

  // Result is keyed by pair name (may differ from input); take first key that isn't "last".
  const entries = Object.entries(json.result ?? {}).filter(([k]) => k !== 'last');
  const candles = entries[0]?.[1] ?? [];
  // Each candle: [time, open, high, low, close, vwap, volume, count]
  const points: PricePoint[] = candles.map(([time, , , , close]) => ({
    timestamp: time,
    price: parseFloat(close),
  }));

  cacheSet(cacheKey, points, PRICE_CACHE_TTL_MS);
  return points;
}

async function getKrakenPriceAt(pair: string, timestamp: Date): Promise<number | null> {
  const ts = Math.floor(timestamp.getTime() / 1000);
  // Fetch 2h window with 60-min candles → at least 2 candles covering the target.
  const since = ts - 7200;

  const points = await withRetry(() => fetchKrakenOHLC(pair, since, 60), {
    retries: 2,
    baseDelayMs: 1_000,
  });

  return nearestPrice(points, ts);
}

// ── Public API ───────────────────────────────────────────────────

export async function getPriceAt(
  assetId: string,
  timestamp: Date,
  source: PriceSource = 'coingecko',
): Promise<number | null> {
  try {
    if (source === 'kraken') {
      return await getKrakenPriceAt(assetId, timestamp);
    }
    return await getCoinGeckoPriceAt(assetId, timestamp);
  } catch (err) {
    logger.warn({ err, assetId, source, ts: timestamp.toISOString() }, 'price fetch failed');
    return null;
  }
}

export async function getPriceAtWindow(
  assetId: string,
  signalTime: Date,
  windowSeconds: number,
  source: PriceSource = 'coingecko',
): Promise<{ atSignal: number; afterWindow: number } | null> {
  const endTime = new Date(signalTime.getTime() + windowSeconds * 1000);

  const [atSignal, afterWindow] = await Promise.all([
    getPriceAt(assetId, signalTime, source),
    getPriceAt(assetId, endTime, source),
  ]);

  if (atSignal == null || afterWindow == null) return null;
  return { atSignal, afterWindow };
}

// ── Helpers ──────────────────────────────────────────────────────

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
