import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchSeriesThroughChain } from '../src/services/data-providers/fallback/index.js';

// The chain must (a) skip a 451 geo-blocked Binance without touching it
// again for hours, (b) prefer Hyperliquid candles intraday and
// DefiLlama charts for long spans, (c) land on the tail provider only
// when everything else failed.
describe('price fallback chain', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cgTail = {
    name: 'coingecko',
    fetch: vi.fn().mockResolvedValue([{ timestamp: 0, price: 1 }]),
  };

  it('serves intraday spans from hyperliquid candles (no other calls)', async () => {
    const nowS = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn().mockImplementation(async (url: any) => {
      if (String(url).includes('hyperliquid')) {
        return {
          ok: true,
          json: async () => [{ t: nowS * 1000, c: '123.45' }],
        };
      }
      throw new Error('unexpected call: ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchSeriesThroughChain('zcash', nowS - 7200, nowS, cgTail);
    expect(res.source).toBe('hyperliquid');
    expect(res.points[0]!.price).toBe(123.45);
    expect(cgTail.fetch).not.toHaveBeenCalled();
  });

  it('serves long spans from defillama before touching coingecko', async () => {
    const nowS = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn().mockImplementation(async (url: any) => {
      if (String(url).includes('coins.llama.fi/chart')) {
        return {
          ok: true,
          json: async () => ({
            coins: { 'coingecko:bitcoin': { prices: [{ timestamp: nowS - 86400, price: 60000 }] } },
          }),
        };
      }
      throw new Error('unexpected call: ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchSeriesThroughChain('bitcoin', nowS - 90 * 86400, nowS, cgTail);
    expect(res.source).toBe('defillama');
    expect(res.points).toHaveLength(1);
    expect(cgTail.fetch).not.toHaveBeenCalled();
  });

  it('falls through a binance 451 (geo-block) to the next source', async () => {
    const nowS = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn().mockImplementation(async (_url: any) => {
      // Every non-blacklisted oracle fails in this test: binance 451
      // opens its 6h circuit; defillama 500s; kraken 500s.
      return {
        ok: false,
        status: 451,
        json: async () => ({}),
        text: async () => '',
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const tail = {
      name: 'coingecko',
      fetch: vi.fn().mockResolvedValue([{ timestamp: nowS - 86400, price: 99 }]),
    };
    const res = await fetchSeriesThroughChain('bitcoin', nowS - 10 * 86400, nowS, tail);
    expect(res.source).toBe('coingecko');
    expect(res.points[0]!.price).toBe(99);
  });

  it('throws when every source fails (caller treats as price-unavailable)', async () => {
    const nowS = Math.floor(Date.now() / 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    const tail = { name: 'coingecko', fetch: vi.fn().mockResolvedValue([]) };
    await expect(fetchSeriesThroughChain('zcash', nowS - 3600, nowS, tail)).rejects.toThrow(
      /all \d+ price sources failed/,
    );
  });
});
