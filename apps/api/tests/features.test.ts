import { describe, it, expect } from 'vitest';
import { FEATURES, requireFeature } from '../src/features.js';

describe('FEATURES', () => {
  it('exposes expected feature flags', () => {
    expect(FEATURES).toHaveProperty('hederaProof');
    expect(FEATURES).toHaveProperty('telegram');
    expect(FEATURES).toHaveProperty('email');
    expect(FEATURES).toHaveProperty('tinyfish');
    expect(FEATURES).toHaveProperty('githubApi');
    expect(FEATURES).toHaveProperty('arbitrumTrading');
    expect(FEATURES).toHaveProperty('robinhoodChain');
    expect(FEATURES).toHaveProperty('evmProof');
  });

  it('does not expose the dead per-user flags', () => {
    // Removed in Day 10 dead-code sweep:
    //   krakenTrading (always true, never read)
    //   publicProofs (always true, never read)
    expect(FEATURES).not.toHaveProperty('krakenTrading');
    expect(FEATURES).not.toHaveProperty('publicProofs');
  });
});

describe('requireFeature', () => {
  it('passes silently for an enabled feature', () => {
    expect(() => requireFeature('hederaProof')).not.toThrow();
  });

  it('throws for a feature name that is not on the type', () => {
    // @ts-expect-error — intentional: checking the runtime contract
    expect(() => requireFeature('krakenTrading')).toThrow();
  });
});
