import { describe, it, expect } from 'vitest';
import { reposForTier } from '../src/services/domain/sweep-repos.js';

const WATCHLIST = [
  { repo: 'ZcashFoundation/zebra', asset: 'zcash' },
  { repo: 'anza-xyz/agave', asset: 'solana' },
  { repo: 'bitcoin/bitcoin', asset: 'bitcoin' },
] as const;

describe('reposForTier', () => {
  it('returns repos matching the requested tier', () => {
    const profiles = [
      { repo: 'ZcashFoundation/zebra', tier: 'A' as const },
      { repo: 'anza-xyz/agave', tier: 'A' as const },
      { repo: 'bitcoin/bitcoin', tier: 'C' as const },
    ];
    const repos = reposForTier('A', profiles, WATCHLIST);
    expect(repos.map((r) => r.repo)).toEqual(['ZcashFoundation/zebra', 'anza-xyz/agave']);
  });

  it('returns empty when no repos match', () => {
    expect(reposForTier('A', [{ repo: 'bitcoin/bitcoin', tier: 'C' }], WATCHLIST)).toEqual([]);
  });
});
