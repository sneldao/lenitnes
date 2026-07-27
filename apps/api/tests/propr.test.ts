import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoisted mutable mocks (survive vi.resetModules so we can vary
//    config per test and reset the adapter's singleton client) ──

const { mockConfig, mockProprClient, mockPriceData, mockProof, mockTpSl } = vi.hoisted(() => {
  const mockConfig = {
    treasury: {
      tradingEnabled: false,
      defaultSlippageBps: 50,
      takeProfitBps: 1500,
      stopLossBps: 700,
    },
    propr: {
      enabled: false,
      apiKey: '',
      apiUrl: 'https://api.propr.xyz/v1',
      wsUrl: 'wss://api.propr.xyz/ws',
      accountId: '',
      minNotionalUsd: 20,
      maxNotionalUsd: 500,
      leverage: 1,
      slTpEnabled: true,
      notarize: false,
    },
  };
  const mockProprClient = {
    accountId: 'urn:prp-account:test',
    setup: vi.fn(),
    findTradeableAccountId: vi.fn(),
    createOrder: vi.fn(),
    getOpenPositions: vi.fn(),
    setLeverage: vi.fn(),
    closePosition: vi.fn(),
    getLeverageLimits: vi.fn(),
    getCompetitionParticipations: vi.fn(),
  };
  const mockPriceData = { getPriceAt: vi.fn() };
  const mockProof = { writeHcsMessage: vi.fn() };
  const mockTpSl = vi.fn();
  return { mockConfig, mockProprClient, mockPriceData, mockProof, mockTpSl };
});

vi.mock('../src/config.js', () => ({ config: mockConfig }));
vi.mock('../src/services/data-providers/registry.js', () => ({ priceData: mockPriceData }));
vi.mock('../src/services/proof.js', () => ({ getProofService: () => mockProof }));
vi.mock('../src/services/treasury/risk.js', () => ({ computeTpSlLevels: mockTpSl }));
vi.mock('../src/services/venues/propr/propr-sdk.js', () => ({
  // Regular function (not arrow) so `new ProprClient(...)` returns
  // mockProprClient — arrow functions can't be constructors.
  ProprClient: vi.fn().mockImplementation(function () {
    return mockProprClient;
  }),
  ProprAPIError: class ProprAPIError extends Error {},
}));

let propr: typeof import('../src/services/venues/propr/index.js');

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();

  // Default: both kill switches OFF.
  mockConfig.treasury.tradingEnabled = false;
  mockConfig.propr.enabled = false;
  mockConfig.propr.apiKey = '';
  mockConfig.propr.notarize = false;

  // SDK client defaults.
  mockProprClient.setup.mockResolvedValue('urn:prp-account:test');
  mockProprClient.setLeverage.mockResolvedValue({});
  mockProprClient.getOpenPositions.mockResolvedValue([]);
  mockProprClient.closePosition.mockResolvedValue([]);
  mockProprClient.getCompetitionParticipations.mockResolvedValue([
    {
      accountId: 'urn:prp-account:test',
      competitionId: 'urn:prp-competition:test',
      status: 'active',
    },
  ]);

  // Proof (HCS notarize) default — returns a plausible tx id so a test
  // that flips propr.notarize=true doesn't crash on `await`.
  mockProof.writeHcsMessage.mockResolvedValue({
    hederaTxId: '0.0.test@1700000000-000000000',
    topicId: '0.0.topic',
  });
  mockProprClient.createOrder.mockResolvedValue([
    {
      orderId: 'urn:prp-order:entry1',
      positionId: null,
      averageFillPrice: '200.00',
      price: null,
      status: 'filled',
    },
  ]);

  // Price: zcash $200, bitcoin $95000 by default.
  mockPriceData.getPriceAt.mockImplementation((id: string) =>
    Promise.resolve(id === 'zcash' ? 200 : id === 'bitcoin' ? 95000 : null),
  );

  // TP/SL: deterministic, symmetric around entry.
  mockTpSl.mockImplementation((entry: number, _conv: number, side: 'long' | 'short') => ({
    takeProfitUsd: side === 'long' ? entry * 1.15 : entry * 0.85,
    stopLossUsd: side === 'long' ? entry * 0.93 : entry * 1.07,
  }));

  propr = await import('../src/services/venues/propr/index.js');
});

describe('propr asset registry', () => {
  it('resolves zcash -> ZEC perp', () => {
    expect(propr.resolveProprAsset('zcash')).toEqual({
      symbol: 'ZEC',
      szDecimals: 2,
      maxLeverage: 2,
    });
  });

  it('resolves bitcoin -> BTC perp with 5x cap', () => {
    expect(propr.resolveProprAsset('bitcoin')?.maxLeverage).toBe(5);
  });

  it('returns null for an unlisted asset', () => {
    expect(propr.resolveProprAsset('dogecoin')).toBeNull();
    expect(propr.resolveProprAsset(undefined)).toBeNull();
  });
});

describe('propr.isProprEnabled', () => {
  it('is false when either kill switch is off', () => {
    mockConfig.treasury.tradingEnabled = true;
    mockConfig.propr.enabled = false;
    expect(propr.isProprEnabled()).toBe(false);
    mockConfig.treasury.tradingEnabled = false;
    mockConfig.propr.enabled = true;
    expect(propr.isProprEnabled()).toBe(false);
  });

  it('is true only when both switches are on', () => {
    mockConfig.treasury.tradingEnabled = true;
    mockConfig.propr.enabled = true;
    expect(propr.isProprEnabled()).toBe(true);
  });
});

describe('propr.preflightPropr', () => {
  it('confirms that the selected account is an active competition entry and can read positions', async () => {
    mockConfig.propr.apiKey = 'pk_test';
    mockProprClient.getCompetitionParticipations.mockResolvedValue([
      {
        accountId: 'urn:prp-account:test',
        competitionId: 'urn:prp-competition:active',
        status: 'active',
      },
    ]);

    await expect(propr.preflightPropr()).resolves.toEqual({
      accountId: 'urn:prp-account:test',
      competitionActive: true,
      competitionId: 'urn:prp-competition:active',
      canReadPositions: true,
    });
    expect(mockProprClient.getOpenPositions).toHaveBeenCalled();
    expect(mockProprClient.createOrder).not.toHaveBeenCalled();
  });
});

describe('propr.openProprPosition guards', () => {
  it('declines (null) when the kill switch is off', async () => {
    const r = await propr.openProprPosition({
      signalId: 's1',
      coingeckoId: 'zcash',
      side: 'short',
      conviction: 90,
    });
    expect(r).toBeNull();
    expect(mockProprClient.createOrder).not.toHaveBeenCalled();
  });

  it('declines when the asset is not listed on Propr', async () => {
    mockConfig.treasury.tradingEnabled = true;
    mockConfig.propr.enabled = true;
    mockConfig.propr.apiKey = 'pk_test';
    const r = await propr.openProprPosition({
      signalId: 's1',
      coingeckoId: 'dogecoin',
      side: 'short',
      conviction: 90,
    });
    expect(r).toBeNull();
    expect(mockProprClient.createOrder).not.toHaveBeenCalled();
  });

  it('declines when no mark price is available (cannot size)', async () => {
    mockConfig.treasury.tradingEnabled = true;
    mockConfig.propr.enabled = true;
    mockConfig.propr.apiKey = 'pk_test';
    mockPriceData.getPriceAt.mockResolvedValue(null);
    const r = await propr.openProprPosition({
      signalId: 's1',
      coingeckoId: 'zcash',
      side: 'short',
      conviction: 90,
    });
    expect(r).toBeNull();
    expect(mockProprClient.createOrder).not.toHaveBeenCalled();
  });
});

describe('propr.openProprPosition live short (the flagship case)', () => {
  beforeEach(() => {
    mockConfig.treasury.tradingEnabled = true;
    mockConfig.propr.enabled = true;
    mockConfig.propr.apiKey = 'pk_test';
    mockProprClient.getOpenPositions.mockResolvedValue([
      {
        positionId: 'urn:prp-position:p1',
        positionSide: 'short',
        entryPrice: '200.00',
        quantity: '2.50',
      },
    ]);
    mockProprClient.createOrder
      .mockResolvedValueOnce([
        {
          orderId: 'urn:prp-order:entry1',
          positionId: null,
          averageFillPrice: '200.00',
          status: 'filled',
        },
      ])
      .mockResolvedValueOnce([{ orderId: 'urn:prp-order:sl1' }])
      .mockResolvedValueOnce([{ orderId: 'urn:prp-order:tp1' }]);
  });

  it('places a short entry (sell/short, reduceOnly=false) and attaches SL+TP (buy, reduceOnly=true)', async () => {
    const r = await propr.openProprPosition({
      signalId: 'sig-zec-short',
      coingeckoId: 'zcash',
      side: 'short',
      conviction: 95,
    });

    expect(r).not.toBeNull();
    expect(r!.side).toBe('short');
    expect(r!.base).toBe('ZEC');
    expect(r!.orderId).toBe('urn:prp-order:entry1');
    expect(r!.positionId).toBe('urn:prp-position:p1');
    expect(r!.slOrderId).toBe('urn:prp-order:sl1');
    expect(r!.tpOrderId).toBe('urn:prp-order:tp1');
    // Conviction-scaled: $20 + (95-70)/30 * ($500-$20) = $420 notional
    // $420 / $200 = 2.1 ZEC -> 2 decimals -> "2.10"
    expect(r!.quantity).toBe('2.10');
    expect(r!.notionalUsd).toBe(420);
    expect(r!.leverage).toBe(1);

    // Three createOrder calls: entry, SL, TP.
    expect(mockProprClient.createOrder).toHaveBeenCalledTimes(3);

    const entryCall = mockProprClient.createOrder.mock.calls[0][0];
    expect(entryCall).toMatchObject({
      side: 'sell',
      positionSide: 'short',
      orderType: 'market',
      asset: 'ZEC',
      reduceOnly: false,
    });

    // SL: close side for a short is BUY, reduceOnly true, stop_market.
    expect(mockProprClient.createOrder.mock.calls[1][0]).toMatchObject({
      side: 'buy',
      positionSide: 'short',
      orderType: 'stop_market',
      reduceOnly: true,
    });

    // TP: take_profit_market, reduceOnly true.
    expect(mockProprClient.createOrder.mock.calls[2][0]).toMatchObject({
      side: 'buy',
      orderType: 'take_profit_market',
      reduceOnly: true,
    });

    expect(mockProprClient.setLeverage).toHaveBeenCalledWith('ZEC', 1, 'cross');
  });

  it('clamps notional above the configured max down to max', async () => {
    mockProprClient.createOrder
      .mockResolvedValueOnce([
        {
          orderId: 'urn:prp-order:e',
          positionId: 'urn:prp-position:p',
          averageFillPrice: '200.00',
          status: 'filled',
        },
      ])
      .mockResolvedValue([{ orderId: 'urn:prp-order:sl' }]);

    const r = await propr.openProprPosition({
      signalId: 's',
      coingeckoId: 'zcash',
      side: 'short',
      conviction: 80,
      notionalUsd: 100_000,
    });
    expect(r!.notionalUsd).toBe(500);
  });
});

describe('propr.openProprPosition live long', () => {
  it('places a long entry (buy/long) with SL/TP close side = sell', async () => {
    mockConfig.treasury.tradingEnabled = true;
    mockConfig.propr.enabled = true;
    mockConfig.propr.apiKey = 'pk_test';
    mockProprClient.getOpenPositions.mockResolvedValue([
      {
        positionId: 'urn:prp-position:lp',
        positionSide: 'long',
        entryPrice: '95000.0',
        quantity: '0.00526',
      },
    ]);
    mockProprClient.createOrder
      .mockResolvedValueOnce([
        {
          orderId: 'urn:prp-order:le',
          positionId: null,
          averageFillPrice: '95000.0',
          status: 'filled',
        },
      ])
      .mockResolvedValueOnce([{ orderId: 'urn:prp-order:lsl' }])
      .mockResolvedValueOnce([{ orderId: 'urn:prp-order:ltp' }]);

    const r = await propr.openProprPosition({
      signalId: 'sig-btc-long',
      coingeckoId: 'bitcoin',
      side: 'long',
      conviction: 72,
    });
    expect(r!.side).toBe('long');
    expect(mockProprClient.createOrder.mock.calls[0][0]).toMatchObject({
      side: 'buy',
      positionSide: 'long',
      reduceOnly: false,
    });
    expect(mockProprClient.createOrder.mock.calls[1][0]).toMatchObject({
      side: 'sell',
      reduceOnly: true,
    });
  });
});

describe('propr.closeProprPosition', () => {
  it('returns a 0xpropr: close tx hash', async () => {
    mockConfig.treasury.tradingEnabled = true;
    mockConfig.propr.enabled = true;
    mockConfig.propr.apiKey = 'pk_test';
    mockProprClient.closePosition.mockResolvedValue([{ orderId: 'urn:prp-order:close1' }]);
    const r = await propr.closeProprPosition('zcash', 'take_profit');
    expect(r.txHash).toBe('0xpropr:urn:prp-order:close1');
  });

  it('returns null when disabled', async () => {
    mockConfig.treasury.tradingEnabled = false;
    const r = await propr.closeProprPosition('zcash', 'manual');
    expect(r.txHash).toBeNull();
    expect(mockProprClient.closePosition).not.toHaveBeenCalled();
  });
});
