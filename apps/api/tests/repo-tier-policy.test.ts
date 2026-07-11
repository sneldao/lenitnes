import { describe, it, expect } from 'vitest';
import {
  resolveTierAgentPolicy,
  applyTierToAgentEnv,
  B_TIER_TRADE_THRESHOLD,
  monitorRepoFromUrl,
} from '../src/services/domain/repo-tier-policy.js';

describe('repo-tier-policy', () => {
  it('C-tier forces mock agent', () => {
    const p = resolveTierAgentPolicy('C');
    expect(p.forceMock).toBe(true);
  });

  it('A-tier uses base trade threshold', () => {
    const p = resolveTierAgentPolicy('A');
    expect(p.forceMock).toBe(false);
    expect(p.tradeThreshold).toBe(70);
  });

  it('B-tier and unknown use elevated trade floor', () => {
    expect(resolveTierAgentPolicy('B').tradeThreshold).toBe(B_TIER_TRADE_THRESHOLD);
    expect(resolveTierAgentPolicy(null).tradeThreshold).toBe(B_TIER_TRADE_THRESHOLD);
  });

  it('applyTierToAgentEnv forces mock for C-tier', () => {
    const env = {
      apiKey: 'k',
      baseUrl: 'u',
      model: 'm',
      mock: false,
      dailyBudgetUsd: 20,
      inputCostPer1M: 1,
      outputCostPer1M: 1,
    };
    const out = applyTierToAgentEnv(env, resolveTierAgentPolicy('C'));
    expect(out.mock).toBe(true);
  });

  it('monitorRepoFromUrl normalizes github URLs', () => {
    expect(monitorRepoFromUrl('https://github.com/zcash/halo2/commits')).toBe('zcash/halo2');
  });
});
