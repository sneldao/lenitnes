import { describe, it, expect } from 'vitest';
import { applyChainConvictionBoost } from '../src/services/domain/chain-conviction.js';

describe('chain-conviction', () => {
  it('applyChainConvictionBoost caps at 100', () => {
    expect(applyChainConvictionBoost(95, 10)).toBe(100);
    expect(applyChainConvictionBoost(70, 10)).toBe(80);
    expect(applyChainConvictionBoost(70, 0)).toBe(70);
  });
});
