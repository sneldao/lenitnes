import { describe, it, expect } from 'vitest';
import {
  snippetThesis,
  formatPriceMoveNarrative,
  formatSingleVerdictMessage,
  formatVerdictDigestMessage,
  type VerdictBroadcastItem,
} from '../src/services/telegram-messages.js';

const baseItem: VerdictBroadcastItem = {
  signalId: 'sig-1',
  asset: 'zcash',
  windowSeconds: 604800,
  pctChange: 9.15,
  conviction: 82,
  recommendedAction: 'short',
  thesis:
    'Emergency Orchard fork suggests market has not priced the disclosure lag — expect drawdown as details surface.',
  detectedAt: '2026-07-04T12:00:00.000Z',
  repo: 'ZcashFoundation/zebra',
  primaryDetector: 'emergency_patch',
  tierPolicy: 'A-tier — full live agent',
  tradeMode: 'paper',
};

describe('formatPriceMoveNarrative', () => {
  it('explains SHORT loss when price rose', () => {
    const r = formatPriceMoveNarrative('short', 9.15);
    expect(r.correct).toBe(false);
    expect(r.headline).toContain('rose');
    expect(r.headline).toContain('WRONG');
  });

  it('marks LONG correct when price rose', () => {
    const r = formatPriceMoveNarrative('long', 5.2);
    expect(r.correct).toBe(true);
    expect(r.headline).toContain('CORRECT');
  });
});

describe('formatSingleVerdictMessage', () => {
  it('includes repo, date, thesis, and cohort footer', () => {
    const msg = formatSingleVerdictMessage(baseItem, {
      hits: 2,
      total: 12,
      hitPct: '17',
      avgDirPct: '-3%',
    });
    expect(msg).toContain('ZcashFoundation/zebra');
    expect(msg).toContain('emergency_patch');
    expect(msg).toContain('4 Jul');
    expect(msg).toContain('PAPER');
    expect(msg).toContain('Price rose');
    expect(msg).toContain('Emergency Orchard');
    expect(msg).toContain('2/12 correct');
    expect(msg).toContain('/calibration');
  });
});

describe('formatVerdictDigestMessage', () => {
  it('digests multiple same-asset verdicts', () => {
    const items = [baseItem, { ...baseItem, signalId: 'sig-2', conviction: 88, pctChange: 8.61 }];
    const msg = formatVerdictDigestMessage(items);
    expect(msg).toContain('verdict digest');
    expect(msg).toContain('2 calls matured');
    expect(msg).toContain('①');
    expect(msg).toContain('②');
  });
});

describe('snippetThesis', () => {
  it('truncates long thesis', () => {
    const long = 'word '.repeat(40);
    expect(snippetThesis(long, 50).length).toBeLessThanOrEqual(51);
  });
});
