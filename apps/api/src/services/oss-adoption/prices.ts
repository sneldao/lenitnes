/**
 * OSS adoption — tokenized-stock price series for the Phase 0 overlay.
 *
 * Adoption curves (GOOGL/MSFT/AMZN) need a price series to compare
 * against. The repo's production price providers (CMC/CoinGecko) are
 * crypto-oriented; here we fetch the SAME CoinGecko API but for the
 * tokenized-stock assets that track the underlying equities:
 *
 *   AMZN  → amazon-xstock
 *   GOOGL → alphabet-xstock
 *   MSFT  → microsoft-xstock
 *
 * These are Backed/Ondo/xStock tokenized equities listed on CoinGecko;
 * their price tracks the underlying NASDAQ-listed company (daily points,
 * no gaps in practice). No API key is required on the free tier, but
 * calls are paced to respect the shared rate limit. A real-stock feed
 * (Alpha Vantage / Polygon) can be swapped in later behind this same
 * interface — the overlay math only consumes {date, price} points.
 */
import type { DependencyEvent } from './types.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
/** Free tier ≈ 10–30 req/min; keep a conservative gap between calls. */
const REQUEST_GAP_MS = 4_500;

export interface PricePoint {
  /** ISO date (YYYY-MM-DD) of the daily close. */
  date: string;
  price: number;
}

export interface PriceSeries {
  companyTicker: string;
  coingeckoId: string;
  points: PricePoint[];
}

/** Company ticker → CoinGecko tokenized-stock asset id. */
export const TOKENIZED_STOCK_IDS: Record<string, string> = {
  AMZN: 'amazon-xstock',
  GOOGL: 'alphabet-xstock',
  MSFT: 'microsoft-xstock',
};

/** All tickers the overlay knows how to price. */
export const SUPPORTED_TICKERS: readonly string[] = Object.keys(TOKENIZED_STOCK_IDS);

function unixOf(dateIso: string): number {
  return Math.floor(new Date(`${dateIso}T00:00:00Z`).getTime() / 1000);
}

export interface FetchPricesOptions {
  /** Injectable fetch for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Override the inter-request gap (ms). Tests set this to 0. */
  requestGapMs?: number;
}

/**
 * Fetch daily price points for a tokenized stock over [fromDate, toDate].
 * The range is inclusive on both ends; CoinGecko returns daily closes.
 */
export async function fetchTokenizedStockPrices(
  companyTicker: string,
  fromDate: string,
  toDate: string,
  options: FetchPricesOptions = {},
): Promise<PriceSeries> {
  const coingeckoId = TOKENIZED_STOCK_IDS[companyTicker];
  if (!coingeckoId) {
    return { companyTicker, coingeckoId: '', points: [] };
  }

  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const gapMs = options.requestGapMs ?? REQUEST_GAP_MS;

  const url =
    `${COINGECKO_BASE}/coins/${coingeckoId}/market_chart/range` +
    `?vs_currency=usd&from=${unixOf(fromDate)}&to=${unixOf(toDate)}`;

  await new Promise((r) => setTimeout(r, gapMs));

  const res = await doFetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'lenitnes-research/0.1' },
  });
  if (!res.ok) {
    throw new Error(
      `CoinGecko ${res.status} for ${companyTicker} (${coingeckoId}): ${res.statusText}`,
    );
  }

  const json = (await res.json()) as { prices?: Array<[number, number]> };
  const points: PricePoint[] = (json.prices ?? [])
    .filter(([ts, p]) => Number.isFinite(ts) && Number.isFinite(p))
    .map(([ts, p]) => ({ date: new Date(ts).toISOString().slice(0, 10), price: p }));

  return { companyTicker, coingeckoId, points };
}

/**
 * Fetch price series for every supported ticker present in the events.
 * Tickers without an asset mapping are skipped. Failures on one ticker
 * are isolated (returned as empty series) so a single provider hiccup
 * doesn't kill the overlay for the others.
 */
export async function fetchPriceSeriesForEvents(
  events: DependencyEvent[],
  fromDate: string,
  toDate: string,
  options: FetchPricesOptions = {},
): Promise<PriceSeries[]> {
  const tickers = [
    ...new Set(
      events
        .map((e) => e.companyTicker)
        .filter((t): t is string => !!t && t in TOKENIZED_STOCK_IDS),
    ),
  ].sort();
  const series: PriceSeries[] = [];
  for (const ticker of tickers) {
    try {
      series.push(await fetchTokenizedStockPrices(ticker, fromDate, toDate, options));
    } catch {
      series.push({ companyTicker: ticker, coingeckoId: TOKENIZED_STOCK_IDS[ticker], points: [] });
    }
  }
  return series;
}
