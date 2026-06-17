import { describe, it, expect } from 'vitest';
import { buildOutcomeWindows, formatSignalBroadcastMessage } from '../src/services/notify.js';
import type { BroadcastSignalInput } from '../src/services/notify.js';

const baseInput: BroadcastSignalInput = {
  signalId: 'sig-1',
  summary: 'Critical soundness bug landed in halo2',
  monitorUrl: 'https://github.com/zcash/halo2/commits/main',
  detectedAt: '2026-06-17T20:00:00.000Z',
  agentScore: {
    conviction: 85,
    thesis: 'Critical soundness fix merged — high confidence based on multi-detector consensus.',
    recommended_action: 'long',
    confidence_band: 'high',
  },
  tradeReceipt: {
    chain: 'arbitrum',
    txHash: '0xpapabc123def456',
    pair: 'ZECUSD',
    mode: 'paper',
  },
  proofs: {
    ipfsCid: 'bafkreihello',
    hederaTxId: '0.0.12345@1717700000.000',
    arbitrumTxHash: '0xREAL_ARB_TX',
  },
  outcomeWindows: {
    t1h: '2026-06-17T21:00:00.000Z',
    t1d: '2026-06-18T20:00:00.000Z',
    t7d: '2026-06-24T20:00:00.000Z',
  },
};

describe('formatSignalBroadcastMessage', () => {
  it('includes the thesis, conviction, action, and trade', () => {
    const msg = formatSignalBroadcastMessage(baseInput);
    expect(msg).toContain('🚨 LENITNES signal — ZECUSD');
    expect(msg).toContain('Conviction 85/100 (high) → LONG');
    expect(msg).toContain('Critical soundness fix merged');
    expect(msg).toContain('Pair: ZECUSD');
    expect(msg).toContain('Chain: arbitrum');
    expect(msg).toContain('Mode: paper');
  });

  it('marks paper trades as paper (no explorer link)', () => {
    const msg = formatSignalBroadcastMessage(baseInput);
    expect(msg).toContain('(paper)');
    expect(msg).not.toContain('https://sepolia.arbiscan.io/tx/0xpap');
  });

  it('includes explorer links for live trades', () => {
    const msg = formatSignalBroadcastMessage({
      ...baseInput,
      tradeReceipt: { ...baseInput.tradeReceipt, txHash: '0xREAL_TX_HASH', mode: 'live' },
    });
    expect(msg).toContain('https://sepolia.arbiscan.io/tx/0xREAL_TX_HASH');
  });

  it('includes Hedera HCS explorer link when hederaTxId is set', () => {
    const msg = formatSignalBroadcastMessage(baseInput);
    expect(msg).toContain('Hedera HCS: 0.0.12345@1717700000.000');
    expect(msg).toContain('https://hashscan.io/testnet/transaction/0.0.12345%401717700000.000');
  });

  it('falls back to "pending" when proof fields are null', () => {
    const msg = formatSignalBroadcastMessage({
      ...baseInput,
      proofs: { ipfsCid: null, hederaTxId: null, arbitrumTxHash: null },
    });
    expect(msg).toContain('Hedera HCS: pending');
    expect(msg).toContain('IPFS: pending');
    expect(msg).not.toContain('Arbitrum:');
  });

  it('includes IPFS CID with grove gateway link', () => {
    const msg = formatSignalBroadcastMessage(baseInput);
    expect(msg).toContain('bafkreihello');
    expect(msg).toContain('https://grove.lens.xyz/ipfs/bafkreihello');
  });

  it('includes outcome window timestamps', () => {
    const msg = formatSignalBroadcastMessage(baseInput);
    expect(msg).toContain('T+1h: 2026-06-17T21:00:00.000Z');
    expect(msg).toContain('T+1d: 2026-06-18T20:00:00.000Z');
    expect(msg).toContain('T+7d: 2026-06-24T20:00:00.000Z');
  });

  it('omits the trade section when no receipt', () => {
    const msg = formatSignalBroadcastMessage({ ...baseInput, tradeReceipt: null });
    expect(msg).not.toContain('🔗 Trade');
    expect(msg).not.toContain('Pair:');
  });
});

describe('buildOutcomeWindows', () => {
  it('returns T+1h, T+1d, T+7d from a given timestamp', () => {
    const w = buildOutcomeWindows('2026-06-17T20:00:00.000Z');
    expect(w.t1h).toBe('2026-06-17T21:00:00.000Z');
    expect(w.t1d).toBe('2026-06-18T20:00:00.000Z');
    expect(w.t7d).toBe('2026-06-24T20:00:00.000Z');
  });

  it('handles invalid input by anchoring to "now"', () => {
    const before = Date.now();
    const w = buildOutcomeWindows('not-a-date');
    const t1h = new Date(w.t1h).getTime();
    expect(t1h).toBeGreaterThanOrEqual(before + 60 * 60 * 1000 - 1000);
    expect(t1h).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000 + 1000);
  });
});
