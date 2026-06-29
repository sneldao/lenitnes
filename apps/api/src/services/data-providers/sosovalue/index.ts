import { logger } from '../../../logger.js';
import { withRetry } from '../../retry.js';
import type {
  SosovalueCurrency,
  MarketSnapshot,
  NewsItem,
  NewsFeedResponse,
  NewsSearchResponse,
  MacroEventDay,
  IndexSnapshot,
} from './types.js';

const BASE_URL = 'https://openapi.sosovalue.com/openapi/v1';

function apiKey(): string {
  const key = process.env.SOSO_VALUE_API_KEY ?? '';
  if (!key) {
    throw new Error('SOSO_VALUE_API_KEY not configured');
  }
  return key;
}

function isConfigured(): boolean {
  return !!process.env.SOSO_VALUE_API_KEY;
}

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { 'x-soso-api-key': apiKey(), Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SoSoValue API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function getCurrencyList(): Promise<SosovalueCurrency[]> {
  if (!isConfigured()) return [];
  return withRetry(() => get<SosovalueCurrency[]>('/currencies'), { retries: 1 });
}

export async function getMarketSnapshot(currencyId: string): Promise<MarketSnapshot | null> {
  if (!isConfigured()) return null;
  try {
    return await withRetry(() => get<MarketSnapshot>(`/currencies/${currencyId}/market-snapshot`), {
      retries: 1,
    });
  } catch (err) {
    logger.warn({ err, currencyId }, 'sosovalue: market snapshot failed');
    return null;
  }
}

export async function getNewsFeed(params?: {
  category?: number;
  currencyId?: string;
  page?: number;
  pageSize?: number;
}): Promise<NewsFeedResponse | null> {
  if (!isConfigured()) return null;
  try {
    const q: Record<string, string | number> = {};
    if (params?.category != null) q.category = params.category;
    if (params?.currencyId) q.currency_id = params.currencyId;
    if (params?.page != null) q.page = params.page;
    if (params?.pageSize != null) q.page_size = params.pageSize;
    return await withRetry(() => get<NewsFeedResponse>('/news', q), { retries: 1 });
  } catch (err) {
    logger.warn({ err }, 'sosovalue: news feed failed');
    return null;
  }
}

export async function searchNews(keyword: string): Promise<NewsItem[]> {
  if (!isConfigured()) return [];
  try {
    const resp = await withRetry(
      () => get<NewsSearchResponse>('/news/search', { keyword, page_size: 20 }),
      { retries: 1 },
    );
    return resp.data?.list ?? [];
  } catch (err) {
    logger.warn({ err, keyword }, 'sosovalue: news search failed');
    return [];
  }
}

export async function getMacroEvents(): Promise<MacroEventDay[]> {
  if (!isConfigured()) return [];
  try {
    return await withRetry(() => get<MacroEventDay[]>('/macro/events'), { retries: 1 });
  } catch (err) {
    logger.warn({ err }, 'sosovalue: macro events failed');
    return [];
  }
}

export async function getIndexList(): Promise<string[]> {
  if (!isConfigured()) return [];
  try {
    return await withRetry(() => get<string[]>('/indices'), { retries: 1 });
  } catch (err) {
    logger.warn({ err }, 'sosovalue: index list failed');
    return [];
  }
}

export async function getIndexSnapshot(indexTicker: string): Promise<IndexSnapshot | null> {
  if (!isConfigured()) return null;
  try {
    return await withRetry(() => get<IndexSnapshot>(`/indices/${indexTicker}/market-snapshot`), {
      retries: 1,
    });
  } catch (err) {
    logger.warn({ err, indexTicker }, 'sosovalue: index snapshot failed');
    return null;
  }
}

export async function buildMacroContext(): Promise<string> {
  if (!isConfigured()) return '';

  const events = await getMacroEvents();
  if (events.length === 0) return '';

  const lines: string[] = ['--- Macro Events ---'];
  for (const day of events.slice(0, 5)) {
    lines.push(`  ${day.date}: ${day.events.join(', ')}`);
  }
  return lines.join('\n');
}

export async function buildIndexContext(): Promise<string> {
  if (!isConfigured()) return '';

  const list = await getIndexList();
  if (list.length === 0) return '';

  const lines: string[] = ['--- SoSoValue Indices ---'];
  const snapshots = await Promise.all(
    list.slice(0, 5).map(async (ticker) => {
      const snap = await getIndexSnapshot(ticker);
      return { ticker, snap };
    }),
  );
  for (const { ticker, snap } of snapshots) {
    if (snap) {
      lines.push(
        `  ${ticker}: $${snap.price.toFixed(2)} | ` +
          `24h: ${(snap['24h_change_pct'] * 100).toFixed(2)}% | ` +
          `7d: ${(snap['7day_roi'] * 100).toFixed(2)}%`,
      );
    }
  }
  return lines.join('\n');
}
