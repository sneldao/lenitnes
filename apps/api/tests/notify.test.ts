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

// The broadcast voice is editorial: verdict-forward header, thesis
// lead, evidence collapsed into a compact proof block. Tests below
// assert the parts that matter for the public channel (verdict +
// proof links survive); the chrome that used to be there (pair label,
// "Mode:" prefix, T+ timestamps in-message) is intentionally gone.
describe('formatSignalBroadcastMessage', () => {
  it('leads with asset, action, and conviction in the header', () => {
    const msg = formatSignalBroadcastMessage(baseInput);
    expect(msg).toContain('🛡️ LENITNES · ZECUSD LONG · 85/100 (high)');
    expect(msg).toContain('Critical soundness fix merged');
  });

  it('shows trade mode + chain inline on a single line', () => {
    const msg = formatSignalBroadcastMessage(baseInput);
    // Paper tx hash has no explorer URL, so it appears verbatim.
    expect(msg).toContain('📈 PAPER (tracked call, no on-chain swap) · arbitrum');
    // Don't link a paper tx to an explorer (that would 404).
    expect(msg).not.toContain('https://sepolia.arbiscan.io/tx/0xpap');
  });

  it('links the explorer for live trades', () => {
    const msg = formatSignalBroadcastMessage({
      ...baseInput,
      tradeReceipt: { ...baseInput.tradeReceipt!, txHash: '0xREAL_TX_HASH', mode: 'live' },
    });
    expect(msg).toContain('📈 LIVE · arbitrum · https://sepolia.arbiscan.io/tx/0xREAL_TX_HASH');
  });

  it('includes Hedera HCS explorer link when hederaTxId is set', () => {
    const msg = formatSignalBroadcastMessage(baseInput);
    expect(msg).toContain(
      '⛓ HashScan: https://hashscan.io/testnet/transaction/0.0.12345%401717700000.000',
    );
  });

  it('falls back to "pending" when proof fields are null', () => {
    const msg = formatSignalBroadcastMessage({
      ...baseInput,
      proofs: { ipfsCid: null, hederaTxId: null, arbitrumTxHash: null },
    });
    expect(msg).toContain('⛓ HashScan: pending');
    expect(msg).toContain('📦 Grove: pending');
    // Arbitrum line is only added when the hash exists.
    expect(msg).not.toContain('🔗 Arbitrum:');
  });

  it('includes IPFS CID via grove gateway link', () => {
    const msg = formatSignalBroadcastMessage(baseInput);
    expect(msg).toContain('📦 Grove: https://grove.lens.xyz/ipfs/bafkreihello');
  });

  it('surfaces the outcome-window schedule (T+1h/1d/7d)', () => {
    const msg = formatSignalBroadcastMessage(baseInput);
    expect(msg).toContain('T+1h · T+1d · T+7d');
  });

  it('omits the trade line when no receipt', () => {
    const msg = formatSignalBroadcastMessage({ ...baseInput, tradeReceipt: null });
    expect(msg).not.toContain('📈');
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
