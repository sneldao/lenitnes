import { logger } from '../../../logger.js';
import type { GlobalMarketMetrics, AssetQuote, MarketDataProvider } from '../types.js';

const CMC_PRO_BASE = 'https://pro-api.coinmarketcap.com';

function apiKey(): string {
  const key = process.env.CMC_API_KEY ?? '';
  if (!key) {
    throw new Error('CMC_API_KEY not configured');
  }
  return key;
}

function preferX402(): boolean {
  return process.env.X402_ENABLED === 'true' && !!process.env.X402_PRIVATE_KEY;
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, CMC_PRO_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { 'X-CMC_PRO_API_KEY': apiKey(), Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CMC API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: T; status?: { error_message?: string } };
  if (json.status?.error_message) {
    throw new Error(`CMC API error: ${json.status.error_message}`);
  }
  return json.data as T;
}

async function getGlobalMetricsApiKey(): Promise<GlobalMarketMetrics | null> {
  try {
    const latest = await get<{
      total_market_cap: number;
      total_volume_24h: number;
      btc_dominance: number;
      eth_dominance: number;
      defi_market_cap: number;
    }>('/v1/global-metrics/quotes/latest');

    let fearGreed: { value: number; value_classification: string } | null = null;
    try {
      const fg = await get<{ value: number; value_classification: string }>(
        '/v3/fear-and-greed/latest',
      );
      fearGreed = fg;
    } catch {
      // non-critical
    }

    let derivatives: {
      total_volume_24h: number;
      total_futures_open_interest: number;
      average_funding_rate: number;
      total_open_interest: number;
    } | null = null;
    try {
      const d = await get<{
        total_volume_24h: number;
        total_futures_open_interest: number;
        average_funding_rate: number;
        total_open_interest: number;
      }>('/v1/global-metrics/quotes/latest', { convert: 'USD' });
      derivatives = d;
    } catch {
      // optional
    }

    let altcoinSeason: number | null = null;
    try {
      const raw = await get<{
        altcoin_season_index?: number;
        data?: { altcoin_season_index?: number };
      }>('/v1/global-metrics/quotes/latest');
      altcoinSeason =
        (raw as { altcoin_season_index?: number }).altcoin_season_index ??
        (raw as { data?: { altcoin_season_index?: number } }).data?.altcoin_season_index ??
        null;
    } catch {
      // optional
    }

    return {
      totalMarketCap: latest.total_market_cap,
      totalVolume24h: latest.total_volume_24h,
      btcDominance: latest.btc_dominance,
      ethDominance: latest.eth_dominance,
      defiMarketCap: latest.defi_market_cap,
      derivativesVolume24h: derivatives?.total_volume_24h ?? 0,
      totalFuturesOpenInterest: derivatives?.total_futures_open_interest ?? 0,
      averageFundingRate: derivatives?.average_funding_rate ?? 0,
      altcoinSeasonIndex: altcoinSeason,
      fearGreedValue: fearGreed?.value ?? null,
      fearGreedClassification: fearGreed?.value_classification ?? null,
    };
  } catch (err) {
    logger.error({ err }, 'cmc: failed to fetch global metrics');
    return null;
  }
}

async function getGlobalMetricsX402(): Promise<GlobalMarketMetrics | null> {
  const { getGlobalMetricsX402 } = await import('./x402.js');
  const x = await getGlobalMetricsX402();
  return {
    totalMarketCap: x.total_market_cap,
    totalVolume24h: x.total_volume_24h,
    btcDominance: x.btc_dominance,
    ethDominance: x.eth_dominance,
    defiMarketCap: 0,
    derivativesVolume24h: 0,
    totalFuturesOpenInterest: 0,
    averageFundingRate: 0,
    altcoinSeasonIndex: null,
    fearGreedValue: x.fear_greed_value,
    fearGreedClassification: x.fear_greed_classification,
  };
}

async function getQuotesApiKey(symbols: string[]): Promise<AssetQuote[]> {
  if (symbols.length === 0) return [];
  try {
    const map = await get<Record<string, unknown>>('/v1/cryptocurrency/quotes/latest', {
      symbol: symbols.join(','),
      convert: 'USD',
    });
    return Object.values(map) as AssetQuote[];
  } catch (err) {
    logger.error({ err, symbols }, 'cmc: failed to fetch quotes');
    return [];
  }
}

async function getQuotesX402(symbols: string[]): Promise<AssetQuote[]> {
  const { getQuotesX402 } = await import('./x402.js');
  const x = await getQuotesX402(symbols);
  return x.data as AssetQuote[];
}

function fmtB(n: number): string {
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + 'T';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  return n.toFixed(0);
}

function fmtUsd(n: number): string {
  if (n >= 1000)
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

export const cmcProvider: MarketDataProvider = {
  name: 'coinmarketcap',

  async getGlobalMetrics(): Promise<GlobalMarketMetrics | null> {
    if (preferX402()) {
      try {
        return await getGlobalMetricsX402();
      } catch (err) {
        logger.error({ err }, 'cmc: x402 global metrics failed, falling back to API key');
      }
    }
    return getGlobalMetricsApiKey();
  },

  async getQuotes(symbols: string[]): Promise<AssetQuote[]> {
    if (symbols.length === 0) return [];
    if (preferX402()) {
      try {
        return await getQuotesX402(symbols);
      } catch (err) {
        logger.error({ err, symbols }, 'cmc: x402 quotes failed, falling back to API key');
      }
    }
    return getQuotesApiKey(symbols);
  },

  formatMarketContext(metrics: GlobalMarketMetrics | null, quotes: AssetQuote[]): string {
    if (!metrics) return 'Market data unavailable.';

    const lines: string[] = [];
    lines.push(`Market Cap: $${fmtB(metrics.totalMarketCap)}`);
    lines.push(`24h Volume: $${fmtB(metrics.totalVolume24h)}`);
    lines.push(`BTC Dominance: ${metrics.btcDominance.toFixed(1)}%`);
    lines.push(`ETH Dominance: ${metrics.ethDominance.toFixed(1)}%`);

    if (metrics.fearGreedValue !== null) {
      lines.push(
        `Fear & Greed: ${metrics.fearGreedValue}/100 (${metrics.fearGreedClassification ?? 'N/A'})`,
      );
    }
    if (metrics.altcoinSeasonIndex !== null) {
      lines.push(`Altcoin Season Index: ${metrics.altcoinSeasonIndex}`);
    }
    if (metrics.averageFundingRate !== 0) {
      lines.push(`Avg Funding Rate: ${(metrics.averageFundingRate * 100).toFixed(4)}%`);
    }
    if (metrics.totalFuturesOpenInterest > 0) {
      lines.push(`Futures OI: $${fmtB(metrics.totalFuturesOpenInterest)}`);
    }

    for (const q of quotes) {
      const usd = q.quote?.USD;
      if (!usd) continue;
      lines.push(
        `${q.symbol}: $${fmtUsd(usd.price)} | ` +
          `1h: ${usd.percent_change_1h?.toFixed(2) ?? '?'}% | ` +
          `24h: ${usd.percent_change_24h?.toFixed(2) ?? '?'}% | ` +
          `7d: ${usd.percent_change_7d?.toFixed(2) ?? '?'}%`,
      );
    }

    return lines.join('\n');
  },
};
