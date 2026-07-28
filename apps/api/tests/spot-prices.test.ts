import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getLatestUsdPrice,
  refreshSpotPrices,
  resetSpotHubForTests,
} from '../src/services/data-providers/spot-prices.js';
import { resetSpendGuardForTests } from '../src/services/spend-guard.js';
import { resetSharedRedisForTests } from '../src/services/redis-client.js';

// The hub must never throw — every consumer treats null as
// "defer / decline to paper". These tests pin that contract.
describe('spot price hub', () => {
  beforeEach(async () => {
    resetSpotHubForTests();
    await resetSpendGuardForTests();
    await resetSharedRedisForTests();
    vi.unstubAllEnvs();
    vi.stubEnv('CMC_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null (never throws) when no CMC key is configured', async () => {
    const price = await getLatestUsdPrice('bitcoin');
    expect(price).toBeNull();
  });

  it('batches every asset into a single CMC call', async () => {
    vi.stubEnv('CMC_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          BTC: { symbol: 'BTC', quote: { USD: { price: 67000 } } },
          ETH: { symbol: 'ETH', quote: { USD: { price: 3400 } } },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const prices = await refreshSpotPrices(['bitcoin', 'ethereum']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('symbol=BTC%2CETH');
    expect(prices.get('bitcoin')).toBe(67000);
    expect(prices.get('ethereum')).toBe(3400);

    vi.unstubAllGlobals();
  });

  it('maps coingecko slugs to CMC symbols', async () => {
    vi.stubEnv('CMC_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { ZEC: { symbol: 'ZEC', quote: { USD: { price: 512.5 } } } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const prices = await refreshSpotPrices(['zcash']);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('symbol=ZEC');
    expect(await getLatestUsdPrice('zcash')).toBe(512.5);

    vi.unstubAllGlobals();
  });

  it('single-flights concurrent refreshes', async () => {
    vi.stubEnv('CMC_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { BTC: { symbol: 'BTC', quote: { USD: { price: 1 } } } } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      refreshSpotPrices(['bitcoin']),
      refreshSpotPrices(['bitcoin']),
      refreshSpotPrices(['bitcoin']),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await getLatestUsdPrice('bitcoin')).toBe(1);

    vi.unstubAllGlobals();
  });

  it('swallows provider failures and returns empty prices', async () => {
    vi.stubEnv('CMC_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const prices = await refreshSpotPrices(['bitcoin']);
    expect(prices.size).toBe(0);
    expect(await getLatestUsdPrice('bitcoin')).toBeNull();

    vi.unstubAllGlobals();
  });
});
