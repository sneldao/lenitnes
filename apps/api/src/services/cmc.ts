import { logger } from '../logger.js';

const CMC_PRO_BASE = 'https://pro-api.coinmarketcap.com';

function apiKey(): string {
  const key = process.env.CMC_API_KEY ?? '';
  if (!key) {
    throw new Error('CMC_API_KEY not configured. Get one at https://pro.coinmarketcap.com');
  }
  return key;
}

function preferX402(): boolean {
  return process.env.X402_ENABLED === 'true' && !!process.env.X402_PRIVATE_KEY;
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, CMC_PRO_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
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

export interface GlobalMetrics {
  total_market_cap: number;
  total_volume_24h: number;
  btc_dominance: number;
  eth_dominance: number;
  defi_market_cap: number;
  derivatives_volume_24h: number;
  total_futures_open_interest: number;
  average_funding_rate: number;
  altcoin_season_index: number | null;
  fear_greed_value: number | null;
  fear_greed_classification: string | null;
}

export interface CmcQuote {
  id: number;
  name: string;
  symbol: string;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
      percent_change_1h: number;
      percent_change_24h: number;
      percent_change_7d: number;
      market_cap: number;
    };
  };
}

export async function getGlobalMetrics(): Promise<GlobalMetrics | null> {
  if (preferX402()) {
    try {
      const { getGlobalMetricsX402 } = await import('./cmc-x402.js');
      const x = await getGlobalMetricsX402();
      return {
        total_market_cap: x.total_market_cap,
        total_volume_24h: x.total_volume_24h,
        btc_dominance: x.btc_dominance,
        eth_dominance: x.eth_dominance,
        total_futures_open_interest: 0,
        average_funding_rate: 0,
        altcoin_season_index: null,
        defi_market_cap: 0,
        derivatives_volume_24h: 0,
        fear_greed_value: x.fear_greed_value,
        fear_greed_classification: x.fear_greed_classification,
      };
    } catch (err) {
      logger.error({ err }, 'cmc: x402 global metrics failed, falling back to API key');
    }
  }
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
      // fear/greed is optional — non-critical
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
      // derivatives data is optional
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
      // altcoin season is optional
    }

    return {
      total_market_cap: latest.total_market_cap,
      total_volume_24h: latest.total_volume_24h,
      btc_dominance: latest.btc_dominance,
      eth_dominance: latest.eth_dominance,
      defi_market_cap: latest.defi_market_cap,
      derivatives_volume_24h: derivatives?.total_volume_24h ?? 0,
      total_futures_open_interest: derivatives?.total_futures_open_interest ?? 0,
      average_funding_rate: derivatives?.average_funding_rate ?? 0,
      altcoin_season_index: altcoinSeason,
      fear_greed_value: fearGreed?.value ?? null,
      fear_greed_classification: fearGreed?.value_classification ?? null,
    };
  } catch (err) {
    logger.error({ err }, 'cmc: failed to fetch global metrics');
    return null;
  }
}

export async function getQuotes(symbols: string[]): Promise<CmcQuote[]> {
  if (symbols.length === 0) return [];
  if (preferX402()) {
    try {
      const { getQuotesX402 } = await import('./cmc-x402.js');
      const x = await getQuotesX402(symbols);
      return x.data as CmcQuote[];
    } catch (err) {
      logger.error({ err, symbols }, 'cmc: x402 quotes failed, falling back to API key');
    }
  }
  try {
    const map = await get<Record<string, unknown>>('/v1/cryptocurrency/quotes/latest', {
      symbol: symbols.join(','),
      convert: 'USD',
    });
    return Object.values(map) as CmcQuote[];
  } catch (err) {
    logger.error({ err, symbols }, 'cmc: failed to fetch quotes');
    return [];
  }
}

export function formatMarketContext(metrics: GlobalMetrics | null, quotes: CmcQuote[]): string {
  if (!metrics) return 'Market data unavailable.';

  const lines: string[] = [];
  lines.push(`Market Cap: $${fmtB(metrics.total_market_cap)}`);
  lines.push(`24h Volume: $${fmtB(metrics.total_volume_24h)}`);
  lines.push(`BTC Dominance: ${metrics.btc_dominance.toFixed(1)}%`);
  lines.push(`ETH Dominance: ${metrics.eth_dominance.toFixed(1)}%`);

  if (metrics.fear_greed_value !== null) {
    lines.push(
      `Fear & Greed: ${metrics.fear_greed_value}/100 (${metrics.fear_greed_classification ?? 'N/A'})`,
    );
  }
  if (metrics.altcoin_season_index !== null) {
    lines.push(`Altcoin Season Index: ${metrics.altcoin_season_index}`);
  }
  if (metrics.average_funding_rate !== 0) {
    lines.push(`Avg Funding Rate: ${(metrics.average_funding_rate * 100).toFixed(4)}%`);
  }
  if (metrics.total_futures_open_interest > 0) {
    lines.push(`Futures OI: $${fmtB(metrics.total_futures_open_interest)}`);
  }

  if (quotes.length > 0) {
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
  }

  return lines.join('\n');
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
