import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  deriveActionFromAgent,
  executeAgentTrade,
  getActiveWallet,
  recordTrade,
  signAndSend,
} from '../src/services/treasury.js';
import { config } from '../src/config.js';
import type { AgentScore } from '@lenitnes/types';

const baseAgentScore: Pick<AgentScore, 'recommended_action' | 'signal_id' | 'thesis'> = {
  signal_id: 'sig-1',
  recommended_action: 'long',
  thesis: 'Critical soundness fix',
};

const baseAssetMapping = { coingeckoId: 'zcash', direction: 'long' as const };

const baseTradeConfig = {
  chain: 'arbitrum' as const,
  mode: 'paper' as const,
  amountIn: '0.01',
  slippageBps: 50,
  tokenIn: '0xUSDC',
  tokenOut: '0xUNDERLYING',
};

const { mockQuery, mockOpenProprPosition, mockResolveProprAsset } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockOpenProprPosition: vi.fn(),
  mockResolveProprAsset: vi.fn(),
}));

vi.mock('../src/db/pool.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: vi.fn(),
  pool: { query: mockQuery, end: vi.fn() },
}));

// The treasury calls priceData.getPriceAt() at trade time to capture
// entry_price_usd. The real implementation hits CoinGecko over
// HTTP; mock the provider registry so unit tests don't make network calls.
vi.mock('../src/services/data-providers/registry.js', () => ({
  priceData: {
    getPriceAt: vi.fn().mockResolvedValue(null),
    getPriceAtWindow: vi.fn().mockResolvedValue(null),
  },
  marketData: {},
}));

vi.mock('../src/services/agent/detector-track-record.js', () => ({
  anyDetectorChronicallyLosing: vi.fn().mockResolvedValue({ losing: false, losingDetectors: [] }),
}));

vi.mock('../src/services/venues/propr/index.js', () => ({
  openProprPosition: mockOpenProprPosition,
  resolveProprAsset: mockResolveProprAsset,
  closeProprPosition: vi.fn(),
}));

describe('treasury.deriveActionFromAgent', () => {
  it('returns a long trade when agent says long and asset is tradeable long', () => {
    const result = deriveActionFromAgent(baseAgentScore, baseAssetMapping, baseTradeConfig);
    expect(result.action).toBe('long');
    expect(result.trade?.side).toBe('long');
    expect(result.trade?.pair).toBe('zcash');
    expect(result.trade?.chain).toBe('arbitrum');
    expect(result.trade?.amountIn).toBe('0.01');
    expect(result.trade?.mode).toBe('paper');
  });

  it('returns a short trade when agent says short and asset is tradeable short', () => {
    const result = deriveActionFromAgent(
      { ...baseAgentScore, recommended_action: 'short' },
      { ...baseAssetMapping, direction: 'short' },
      baseTradeConfig,
    );
    expect(result.action).toBe('short');
    expect(result.trade?.side).toBe('short');
  });

  it('returns none when agent says none', () => {
    const result = deriveActionFromAgent(
      { ...baseAgentScore, recommended_action: 'none' },
      baseAssetMapping,
      baseTradeConfig,
    );
    expect(result.action).toBe('none');
    expect(result.trade).toBeUndefined();
  });

  it('returns none when direction conflicts (agent long, asset short only)', () => {
    const result = deriveActionFromAgent(
      baseAgentScore,
      { ...baseAssetMapping, direction: 'short' },
      baseTradeConfig,
    );
    expect(result.action).toBe('none');
  });

  it('allows long when asset is tradeable both ways', () => {
    const result = deriveActionFromAgent(
      baseAgentScore,
      { ...baseAssetMapping, direction: 'both' },
      baseTradeConfig,
    );
    expect(result.action).toBe('long');
  });

  it('uses coingeckoId as the trade pair identifier', () => {
    const result = deriveActionFromAgent(
      baseAgentScore,
      { coingeckoId: 'zcash', direction: 'long' },
      baseTradeConfig,
    );
    expect(result.trade?.pair).toBe('zcash');
  });
});

describe('treasury.getActiveWallet', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns the wallet address for a chain', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ address: '0xSYSTEM_WALLET' }],
      rowCount: 1,
    });
    const wallet = await getActiveWallet('arbitrum');
    expect(wallet.address).toBe('0xSYSTEM_WALLET');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM treasury_wallets'), [
      'arbitrum',
    ]);
  });

  it('throws when no active wallet for the chain', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(getActiveWallet('hedera')).rejects.toThrow(/No active treasury wallet/);
  });
});

describe('treasury.signAndSend (paper mode)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns a deterministic mock receipt without contacting the chain', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ address: '0xWALLET' }], rowCount: 1 });
    const action = {
      signalId: 'sig-1',
      chain: 'arbitrum' as const,
      side: 'long' as const,
      pair: 'ZECUSD',
      amountIn: '0.01',
      tokenIn: '0xUSDC',
      tokenOut: '0xZEC',
      slippageBps: 50,
      mode: 'paper' as const,
    };
    const receipt = await signAndSend(action);
    expect(receipt.mode).toBe('paper');
    expect(receipt.txHash).toMatch(/^0xpap/);
    expect(receipt.txHash).toHaveLength(5 + 64); // '0xpap' + 64 hex chars
    expect(receipt.pair).toBe('ZECUSD');
    expect(receipt.amountIn).toBe('0.01');
    expect(receipt.amountOut).toBeNull();
  });

  it('is deterministic: same inputs produce the same hash', async () => {
    mockQuery.mockResolvedValue({ rows: [{ address: '0xWALLET' }], rowCount: 1 });
    const action = {
      signalId: 'sig-det',
      chain: 'arbitrum' as const,
      side: 'long' as const,
      pair: 'BTCUSD',
      amountIn: '0.05',
      tokenIn: '0xUSDC',
      tokenOut: '0xWBTC',
      slippageBps: 50,
      mode: 'paper' as const,
    };
    const a = await signAndSend(action);
    const b = await signAndSend(action);
    expect(a.txHash).toBe(b.txHash);
  });

  it('treats hedera as paper even when mode is live (no swap router in v1)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ address: '0.0.HEDERA_WALLET' }],
      rowCount: 1,
    });
    const receipt = await signAndSend({
      signalId: 'sig-2',
      chain: 'hedera',
      side: 'long',
      pair: 'ZECUSD',
      amountIn: '0.01',
      tokenIn: '0xUSDC',
      tokenOut: '0xZEC',
      slippageBps: 50,
      mode: 'live',
    });
    expect(receipt.mode).toBe('live'); // recorded as live, but txHash is paper-form
    expect(receipt.txHash).toMatch(/^0xpap/);
  });
});

describe('treasury.recordTrade', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('inserts a row with the receipt tx hash in chain_tx_hash', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'order-1' }], rowCount: 1 });
    const id = await recordTrade(
      'sig-1',
      {
        signalId: 'sig-1',
        chain: 'arbitrum',
        side: 'long',
        pair: 'ZECUSD',
        amountIn: '0.01',
        tokenIn: '0xUSDC',
        tokenOut: '0xZEC',
        slippageBps: 50,
        mode: 'paper',
      },
      {
        chain: 'arbitrum',
        txHash: '0xpapabc...',
        pair: 'ZECUSD',
        amountIn: '0.01',
        amountOut: null,
        mode: 'paper',
        timestamp: '2026-06-17T20:00:00Z',
      },
      'filled',
    );
    expect(id).toBe('order-1');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO orders'),
      expect.arrayContaining(['sig-1', expect.any(String), 'filled', 'arbitrum', '0xpapabc...']),
    );
  });
});

describe('treasury.executeAgentTrade Propr competition routing', () => {
  const mutableConfig = config as unknown as {
    treasury: { tradingEnabled: boolean };
    propr: { enabled: boolean };
  };

  beforeEach(() => {
    mockQuery.mockReset();
    mockOpenProprPosition.mockReset();
    mockResolveProprAsset.mockReset();
    mutableConfig.treasury.tradingEnabled = true;
    mutableConfig.propr.enabled = true;
    mockResolveProprAsset.mockReturnValue({ symbol: 'BTC', szDecimals: 5, maxLeverage: 5 });
  });

  it('routes a BTC long to Propr and ignores legacy paper positions', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, direction, conviction_at_open FROM positions')) {
        // The production ledger contains a paper BTC long. The SQL must
        // filter it out when the target venue is Propr.
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (sql.includes('INSERT INTO orders')) {
        return Promise.resolve({ rows: [{ id: 'order-propr-1' }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    mockOpenProprPosition.mockResolvedValue({
      accountId: 'urn:prp-account:competition',
      orderId: 'urn:prp-order:entry',
      positionId: 'urn:prp-position:entry',
      base: 'BTC',
      side: 'long',
      positionSide: 'long',
      orderType: 'market',
      quantity: '0.001',
      entryPrice: '100000',
      averageFillPrice: '100000',
      status: 'filled',
      slOrderId: null,
      tpOrderId: null,
      hederaTxId: null,
      notionalUsd: 100,
      leverage: 1,
      mode: 'live',
      timestamp: '2026-07-27T00:00:00.000Z',
    });

    const result = await executeAgentTrade(
      'signal-btc-long',
      {
        signal_id: 'signal-btc-long',
        recommended_action: 'long',
        thesis: 'Competition route regression test',
        conviction: 85,
      },
      { coingeckoId: 'bitcoin', direction: 'both' },
    );

    expect(mockOpenProprPosition).toHaveBeenCalledWith({
      signalId: 'signal-btc-long',
      coingeckoId: 'bitcoin',
      side: 'long',
      conviction: 85,
    });
    expect(result.tradeReceipt?.txHash).toBe('0xpropr:urn:prp-order:entry');
    const bookQuery = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('SELECT id, direction, conviction_at_open FROM positions'),
    );
    expect(bookQuery?.[0]).toContain("venue = 'propr'");
    expect(bookQuery?.[1]).toEqual(['bitcoin', true]);
  });

  it('still suppresses a duplicate position already open on Propr', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, direction, conviction_at_open FROM positions')) {
        return Promise.resolve({
          rows: [{ id: 'existing-propr', direction: 'long', conviction_at_open: 82 }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const result = await executeAgentTrade(
      'signal-btc-duplicate',
      {
        signal_id: 'signal-btc-duplicate',
        recommended_action: 'long',
        thesis: 'Duplicate route regression test',
        conviction: 90,
      },
      { coingeckoId: 'bitcoin', direction: 'both' },
    );

    expect(result).toEqual({ tradeReceipt: null, orderId: null });
    expect(mockOpenProprPosition).not.toHaveBeenCalled();
  });
});
