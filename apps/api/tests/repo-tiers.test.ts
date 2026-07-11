import { describe, it, expect } from 'vitest';
import { assignRepoTier, tierProfiles } from '../src/services/domain/repo-tiers.js';
import type { ReplayResponsiveness } from '../src/services/replay.js';

function profile(overrides: Partial<ReplayResponsiveness>): ReplayResponsiveness {
  return {
    repo: 'test/repo',
    asset: 'test',
    from: '2026-01-01',
    to: '2026-04-01',
    flaggedBatches: 10,
    scoredBatches: 5,
    tradeGradeCalls: 5,
    hitRateT1d: 0.5,
    hitRateT7d: 0.5,
    avgDirectionalT1d: 1,
    avgDirectionalT7d: 2,
    ...overrides,
  };
}

describe('repo-tiers', () => {
  it('assigns C when trade-grade sample is too small', () => {
    const t = assignRepoTier(profile({ tradeGradeCalls: 2 }));
    expect(t.tier).toBe('C');
  });

  it('assigns A on strong T+7d hit rate', () => {
    const t = assignRepoTier(profile({ hitRateT7d: 0.6, hitRateT1d: 0.4 }));
    expect(t.tier).toBe('A');
  });

  it('assigns C on weak T+1d and T+7d', () => {
    const t = assignRepoTier(profile({ hitRateT1d: 0.2, hitRateT7d: 0.1 }));
    expect(t.tier).toBe('C');
  });

  it('assigns B for moderate profiles', () => {
    const t = assignRepoTier(profile({ hitRateT1d: 0.45, hitRateT7d: 0.4 }));
    expect(t.tier).toBe('B');
  });

  it('tierProfiles maps all entries', () => {
    expect(tierProfiles([profile({}), profile({ repo: 'b' })])).toHaveLength(2);
  });
});
