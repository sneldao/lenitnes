import { describe, it, expect } from 'vitest';
import {
  resolveTierAgentPolicy,
  resolveEffectiveTierPolicy,
  applyTierToAgentEnv,
  B_TIER_TRADE_THRESHOLD,
  monitorRepoFromUrl,
  computeTierDrift,
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

  it('mock A without live confirmation uses B floor', () => {
    const p = resolveEffectiveTierPolicy('A', null);
    expect(p.tradeThreshold).toBe(B_TIER_TRADE_THRESHOLD);
    expect(p.liveConfirmed).toBe(false);
    expect(p.mockTier).toBe('A');
  });

  it('mock A with live B downgrades to elevated floor (Agave pattern)', () => {
    const p = resolveEffectiveTierPolicy('A', 'B');
    expect(p.tradeThreshold).toBe(B_TIER_TRADE_THRESHOLD);
    expect(p.label).toContain('mock A / live B');
  });

  it('mock A with live A unlocks full spend', () => {
    const p = resolveEffectiveTierPolicy('A', 'A');
    expect(p.tradeThreshold).toBe(70);
    expect(p.liveConfirmed).toBe(true);
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

  it('computeTierDrift flags mock/live mismatch', () => {
    const drift = computeTierDrift(
      [{ repo: 'anza-xyz/agave', tier: 'A' }],
      [{ repo: 'anza-xyz/agave', tier: 'B' }],
    );
    expect(drift[0]?.diverged).toBe(true);
  });
});
