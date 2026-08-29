import { describe, it, expect } from 'vitest';
import {
  fetchTokenizedStockPrices,
  fetchPriceSeriesForEvents,
  TOKENIZED_STOCK_IDS,
  SUPPORTED_TICKERS,
} from '../src/services/oss-adoption/prices.js';

/** Build a fake fetch that serves CoinGecko range responses. */
function makeFetch(records: Array<[number, number]>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/market_chart/range')) {
      return new Response('{}', { status: 404 });
    }
    return new Response(JSON.stringify({ prices: records }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('fetchTokenizedStockPrices', () => {
  it('maps AMZN to the amazon-xstock asset and parses daily points', async () => {
    const day = 1756512000; // 2025-08-30T00:00:00Z
    const series = await fetchTokenizedStockPrices('AMZN', '2025-08-29', '2025-09-05', {
      fetchImpl: makeFetch([
        [day * 1000, 228.82],
        [(day + 86400) * 1000, 229.1],
      ]),
      requestGapMs: 0,
    });

    expect(series.companyTicker).toBe('AMZN');
    expect(series.coingeckoId).toBe('amazon-xstock');
    expect(series.points).toEqual([
      { date: '2025-08-30', price: 228.82 },
      { date: '2025-08-31', price: 229.1 },
    ]);
  });

  it('returns an empty series for an unsupported ticker without calling fetch', async () => {
    let called = false;
    const series = await fetchTokenizedStockPrices('FAKE', '2025-08-29', '2025-09-05', {
      fetchImpl: (async () => {
        called = true;
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
      requestGapMs: 0,
    });
    expect(series.points).toEqual([]);
    expect(called).toBe(false);
  });

  it('throws on non-200 responses', async () => {
    const fetchImpl = (async () => new Response('rate limited', { status: 429 })) as typeof fetch;
    await expect(
      fetchTokenizedStockPrices('GOOGL', '2025-08-29', '2025-09-05', {
        fetchImpl,
        requestGapMs: 0,
      }),
    ).rejects.toThrow(/429/);
  });
});

describe('fetchPriceSeriesForEvents', () => {
  it('fetches only tickers present in the events and isolates failures', async () => {
    const events = [
      { companyTicker: 'AMZN', committedAt: '2026-04-20T02:18:17Z' },
      { companyTicker: 'MSFT', committedAt: '2026-04-20T02:18:17Z' },
    ] as never[];

    let amznOk = true;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('microsoft'))
        return new Response('{"prices":[[1784617200000,400]]}', { status: 200 });
      if (url.includes('amazon')) {
        if (!amznOk) return new Response('boom', { status: 500 });
        return new Response('{"prices":[[1784617200000,300]]}', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const series = await fetchPriceSeriesForEvents(events as never[], '2026-04-20', '2026-04-27', {
      fetchImpl,
      requestGapMs: 0,
    });
    expect(series.map((s) => s.companyTicker).sort()).toEqual(['AMZN', 'MSFT']);

    // Now make AMZN fail — it should be returned as an empty series, not throw.
    amznOk = false;
    const series2 = await fetchPriceSeriesForEvents(events as never[], '2026-04-20', '2026-04-27', {
      fetchImpl,
      requestGapMs: 0,
    });
    const amzn = series2.find((s) => s.companyTicker === 'AMZN');
    expect(amzn?.points).toEqual([]);
    const msft = series2.find((s) => s.companyTicker === 'MSFT');
    expect(msft?.points.length).toBe(1);
  });
});

describe('tokenized stock mapping', () => {
  it('covers all three mapped companies', () => {
    expect(SUPPORTED_TICKERS).toEqual(['AMZN', 'GOOGL', 'MSFT']);
    expect(TOKENIZED_STOCK_IDS).toEqual({
      AMZN: 'amazon-xstock',
      GOOGL: 'alphabet-xstock',
      MSFT: 'microsoft-xstock',
    });
  });
});
