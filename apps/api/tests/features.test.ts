import { describe, it, expect } from 'vitest';
import { FEATURES, requireFeature } from '../src/features.js';

describe('FEATURES', () => {
  it('exposes expected feature flags', () => {
    expect(FEATURES).toHaveProperty('hederaProof');
    expect(FEATURES).toHaveProperty('telegram');
    expect(FEATURES).toHaveProperty('email');
    expect(FEATURES).toHaveProperty('tinyfish');
    expect(FEATURES).toHaveProperty('krakenTrading');
    expect(FEATURES).toHaveProperty('publicProofs');
  });

  it('krakenTrading and publicProofs are always true', () => {
    expect(FEATURES.krakenTrading).toBe(true);
    expect(FEATURES.publicProofs).toBe(true);
  });
});

describe('requireFeature', () => {
  it('passes silently for enabled features', () => {
    expect(() => requireFeature('krakenTrading')).not.toThrow();
  });
});
