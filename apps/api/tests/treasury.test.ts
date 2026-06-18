import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  deriveActionFromAgent,
  getActiveWallet,
  recordTrade,
  signAndSend,
} from '../src/services/treasury.js';
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

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db/pool.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: vi.fn(),
  pool: { query: mockQuery, end: vi.fn() },
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
