import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockGetAll } = vi.hoisted(() => ({ mockGetAll: vi.fn() }));

vi.mock('../src/services/data-providers/hyperliquid/index.js', () => ({
  getAllTradeablePerpContexts: mockGetAll,
}));

const {
  scanFundingOi,
  detectFundingOiAnomalies,
  FUNDING_OI_SIGNAL_THRESHOLD,
  EXTREME_FUNDING_HOURLY,
} = await import('../src/services/detectors/funding-oi.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('funding-oi detector', () => {
  it('fires a short-biased signal on extreme positive funding with heavy OI', async () => {
    mockGetAll.mockResolvedValue([
      {
        coingeckoId: 'zcash',
        ctx: {
          symbol: 'ZEC',
          fundingRate: EXTREME_FUNDING_HOURLY * 3,
          fundingRateAnnualized: EXTREME_FUNDING_HOURLY * 3 * 24 * 365,
          openInterestUsd: 150_000_000,
          markPriceUsd: 40,
          volume24hUsd: 200_000_000,
        },
      },
    ]);

    const hits = await detectFundingOiAnomalies();
    expect(hits).toHaveLength(1);
    expect(hits[0].classification.type).toBe('funding_oi_anomaly');
    expect(hits[0].asset).toBe('zcash');
    expect(hits[0].classification.metadata.suggestedDirection).toBe('short');
    expect(hits[0].classification.score).toBeGreaterThanOrEqual(FUNDING_OI_SIGNAL_THRESHOLD);
  });

  it('suggests long on extreme negative funding', async () => {
    mockGetAll.mockResolvedValue([
      {
        coingeckoId: 'solana',
        ctx: {
          symbol: 'SOL',
          fundingRate: -EXTREME_FUNDING_HOURLY * 4,
          fundingRateAnnualized: -EXTREME_FUNDING_HOURLY * 4 * 24 * 365,
          openInterestUsd: 500_000_000,
          markPriceUsd: 150,
          volume24hUsd: 1_000_000_000,
        },
      },
    ]);

    const readings = await scanFundingOi();
    expect(readings[0].suggestedDirection).toBe('long');
    expect(readings[0].triggered).toBe(true);
  });

  it('does not fire when funding is within the normal band', async () => {
    mockGetAll.mockResolvedValue([
      {
        coingeckoId: 'ethereum',
        ctx: {
          symbol: 'ETH',
          fundingRate: 0.00005,
          fundingRateAnnualized: 0.00005 * 24 * 365,
          openInterestUsd: 5_000_000_000,
          markPriceUsd: 3000,
          volume24hUsd: 20_000_000_000,
        },
      },
    ]);

    const readings = await scanFundingOi();
    expect(readings[0].triggered).toBe(false);
    expect(readings[0].score).toBe(0);
  });

  it('discounts thin open interest below the threshold', async () => {
    mockGetAll.mockResolvedValue([
      {
        coingeckoId: 'sui',
        ctx: {
          symbol: 'SUI',
          fundingRate: EXTREME_FUNDING_HOURLY * 2,
          fundingRateAnnualized: EXTREME_FUNDING_HOURLY * 2 * 24 * 365,
          openInterestUsd: 1_000_000,
          markPriceUsd: 1,
          volume24hUsd: 2_000_000,
        },
      },
    ]);

    const hits = await detectFundingOiAnomalies();
    expect(hits).toHaveLength(0);
  });
});
