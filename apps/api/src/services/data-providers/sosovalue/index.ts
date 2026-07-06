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

const BASE_URL = 'https://openapi.sosovalue.com/openapi/v1/';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

function apiKey(): string {
  const key = process.env.SOSO_VALUE_API_KEY ?? '';
  if (!key) {
    throw new Error('SOSO_VALUE_API_KEY not configured');
  }
  return key;
}

// Auth circuit breaker: an invalid/revoked key returns 401 on every
// call forever. Without this latch, the pipeline retried the dead key
// every 2h for days, spamming logs while the operator saw nothing.
// After AUTH_FAILURE_LIMIT consecutive 401/403s the provider disables
// itself for the process lifetime; fixing the key requires a restart
// anyway, so a runtime re-enable adds nothing.
const AUTH_FAILURE_LIMIT = 3;
let consecutiveAuthFailures = 0;
let authDisabled = false;

function isConfigured(): boolean {
  return !!process.env.SOSO_VALUE_API_KEY && !authDisabled;
}

function recordAuthFailure(): void {
  consecutiveAuthFailures++;
  if (consecutiveAuthFailures >= AUTH_FAILURE_LIMIT && !authDisabled) {
    authDisabled = true;
    logger.error(
      { consecutiveAuthFailures },
      'sosovalue: API key rejected repeatedly — provider DISABLED for process lifetime. Fix SOSO_VALUE_API_KEY and restart.',
    );
  }
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
    if (res.status === 401 || res.status === 403) recordAuthFailure();
    const body = await res.text().catch(() => '');
    throw new Error(`SoSoValue API error ${res.status}: ${body.slice(0, 200)}`);
  }
  consecutiveAuthFailures = 0;
  const json = (await res.json()) as ApiEnvelope<T>;
  if (json.code !== 0) {
    throw new Error(`SoSoValue API error: ${json.message}`);
  }
  return json.data;
}

export async function getCurrencyList(): Promise<SosovalueCurrency[]> {
  if (!isConfigured()) return [];
  return withRetry(() => get<SosovalueCurrency[]>('currencies'), { retries: 1 });
}

export async function getMarketSnapshot(currencyId: string): Promise<MarketSnapshot | null> {
  if (!isConfigured()) return null;
  try {
    return await withRetry(() => get<MarketSnapshot>(`currencies/${currencyId}/market-snapshot`), {
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
    return await withRetry(() => get<NewsFeedResponse>('news', q), { retries: 1 });
  } catch (err) {
    logger.warn({ err }, 'sosovalue: news feed failed');
    return null;
  }
}

export async function searchNews(keyword: string): Promise<NewsItem[]> {
  if (!isConfigured()) return [];
  try {
    const resp = await withRetry(
      () => get<NewsSearchResponse>('news/search', { keyword, page_size: 20 }),
      { retries: 1 },
    );
    return resp.list ?? [];
  } catch (err) {
    logger.warn({ err, keyword }, 'sosovalue: news search failed');
    return [];
  }
}

export async function getMacroEvents(): Promise<MacroEventDay[]> {
  if (!isConfigured()) return [];
  try {
    return await withRetry(() => get<MacroEventDay[]>('macro/events'), { retries: 1 });
  } catch (err) {
    logger.warn({ err }, 'sosovalue: macro events failed');
    return [];
  }
}

export async function getIndexList(): Promise<string[]> {
  if (!isConfigured()) return [];
  try {
    return await withRetry(() => get<string[]>('indices'), { retries: 1 });
  } catch (err) {
    logger.warn({ err }, 'sosovalue: index list failed');
    return [];
  }
}

export async function getIndexSnapshot(indexTicker: string): Promise<IndexSnapshot | null> {
  if (!isConfigured()) return null;
  try {
    return await withRetry(() => get<IndexSnapshot>(`indices/${indexTicker}/market-snapshot`), {
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
          `24h: ${(snap.change_pct_24h * 100).toFixed(2)}% | ` +
          `7d: ${(snap.roi_7d * 100).toFixed(2)}%`,
      );
    }
  }
  return lines.join('\n');
}
