import { describe, it, expect } from 'vitest';
import {
  buildSequenceContextFromEvents,
  type SequenceEvent,
} from '../src/services/domain/sequence-context.js';
import { sortReposBySectorSequence } from '../src/services/domain/sector-graph.js';

describe('sequence-context', () => {
  const events: SequenceEvent[] = [
    {
      repo: 'zcash/halo2',
      asset: 'zcash',
      day: '2026-06-01',
      detectors: ['emergency_patch'],
      summary: 'circuit fix',
    },
    {
      repo: 'ZcashFoundation/zebra',
      asset: 'zcash',
      day: '2026-06-02',
      detectors: ['emergency_patch'],
      summary: 'node emergency fork',
    },
  ];

  it('includes upstream sector events within lookback', () => {
    const ctx = buildSequenceContextFromEvents('ZcashFoundation/zebra', '2026-06-03', events);
    expect(ctx).toContain('zcash/halo2');
    expect(ctx).toContain('Sector chain');
  });

  it('excludes same-day and future events', () => {
    const ctx = buildSequenceContextFromEvents('zcash/halo2', '2026-06-01', events);
    expect(ctx).toBe('');
  });
});

describe('sector-graph', () => {
  it('orders watchlist repos by sector sequence', () => {
    const sorted = sortReposBySectorSequence([
      { repo: 'bitcoin/bitcoin', asset: 'bitcoin' },
      { repo: 'zcash/halo2', asset: 'zcash' },
      { repo: 'ZcashFoundation/zebra', asset: 'zcash' },
    ]);
    expect(sorted[0].repo).toBe('zcash/halo2');
    expect(sorted[1].repo).toBe('ZcashFoundation/zebra');
  });
});
