// ─────────────────────────────────────────────────────────────
// Price fallback chain — the answer to "our CandleExhaustion
// quotient is CoinGecko's 429 page".
//
// One entrypoint for all NON-live price-at-time lookups:
//   fetchSeriesThroughChain(asset, from, to, { coingecko })
//
// Order is span-dependent (intraday windows want perp-venue
// precision; 90d sweeps want cheap single-shot series):
//
//   ≤ 3d span:  Hyperliquid candles → Kraken OHLC → DefiLlama → Binance → CoinGecko
//   > 3d span:  DefiLlama chart → Kraken daily → Binance daily → CoinGecko
//
// Every source is keyless except the last (budget-guarded demo key).
// Each carries its own circuit breaker (3 failures/60s → 5min cool-
// down; Binance gets 6h — its failure mode is a sticky geo-block).
// Results land in the SAME memory + Redis caches CoinGecko always
// populated, so whichever source filled the range, repeat lookups are
// free — and the sweep that grades tiers works even while CoinGecko's
// quota debt is still ageing out.
// ─────────────────────────────────────────────────────────────

import { logger } from '../../../logger.js';
import type { PricePoint } from '../types.js';
import { fetchHlCandleSeries } from './hl-candles.js';
import { fetchKrakenSeries } from './kraken.js';
import { fetchDefiLlamaSeries } from './defillama.js';
import { fetchBinanceSeries } from './binance.js';

export interface PriceSource {
  name: string;
  fetch: (coingeckoId: string, fromUnix: number, toUnix: number) => Promise<PricePoint[] | null>;
}

export interface SeriesResult {
  points: PricePoint[];
  source: string;
}

const INTRADAY_SOURCES: PriceSource[] = [
  { name: 'hyperliquid', fetch: fetchHlCandleSeries },
  { name: 'kraken', fetch: fetchKrakenSeries },
  { name: 'defillama', fetch: fetchDefiLlamaSeries },
  { name: 'binance', fetch: fetchBinanceSeries },
];

const LONG_SPAN_SOURCES: PriceSource[] = [
  { name: 'defillama', fetch: fetchDefiLlamaSeries },
  { name: 'kraken', fetch: fetchKrakenSeries },
  { name: 'binance', fetch: fetchBinanceSeries },
];

/**
 * Walk the chain in order; return the first non-empty series.
 * Throws when every source fails — callers treat that as "price
 * unavailable" (defer/decline), same as a CoinGecko miss today.
 */
export async function fetchSeriesThroughChain(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
  tailSource: PriceSource,
): Promise<SeriesResult> {
  const spanS = toUnix - fromUnix;
  const candidates = [...(spanS <= 3 * 86400 ? INTRADAY_SOURCES : LONG_SPAN_SOURCES), tailSource];

  let attempts = 0;
  for (const source of candidates) {
    attempts++;
    try {
      const points = await source.fetch(coingeckoId, fromUnix, toUnix);
      if (points && points.length > 0) {
        if (source.name !== tailSource.name) {
          logger.info(
            { coingeckoId, source: source.name, points: points.length },
            'price fallback: served by alternative oracle',
          );
        }
        return { points, source: source.name };
      }
    } catch (err) {
      logger.debug({ err, coingeckoId, source: source.name }, 'price fallback: source failed');
    }
  }

  throw new Error(`all ${attempts} price sources failed for ${coingeckoId}`);
}
