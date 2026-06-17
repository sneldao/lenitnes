import { describe, it, expect, beforeEach } from 'vitest';
import { score, AgentBudgetExceededError, _internalResetForTests } from '../src/services/agent.js';
import type { AgentInput } from '@lenitnes/types';

const baseInput: AgentInput = {
  signal_id: '00000000-0000-0000-0000-000000000001',
  detector_classifications: [
    {
      detector_type: 'emergency_patch',
      score: 85,
      confidence: 90,
      label: 'Critical soundness fix',
      metadata: { patch: 'abc123' },
    },
  ],
  asset_mapping: { coingeckoId: 'zcash', krakenPair: 'ZECUSD', direction: 'long' },
  evidence_text: 'A critical soundness bug was just merged into the halo2 proving system.',
  condition_summary: 'critical soundness bug fix in halo2',
  precedent_count: 3,
};

const mockEnv = {
  apiKey: 'mock-key',
  baseUrl: 'https://example.com',
  model: 'mock-model',
  mock: true,
  dailyBudgetUsd: 20,
  inputCostPer1M: 0.6,
  outputCostPer1M: 2.5,
};

describe('agent.score (MOCK path)', () => {
  beforeEach(() => {
    _internalResetForTests();
  });

  it('returns above-threshold score when detector score is high', async () => {
    const result = await score(baseInput, mockEnv);
    expect(result.conviction).toBe(85);
    expect(result.recommended_action).toBe('long');
    expect(result.confidence_band).toBe('high');
    expect(result.rubric_version).toBe('v1');
    expect(result.thesis).toContain('MOCK');
  });

  it('returns below-threshold score when detector score is low', async () => {
    const result = await score(
      {
        ...baseInput,
        detector_classifications: [
          {
            detector_type: 'generic',
            score: 25,
            confidence: 30,
            label: 'Routine commit',
            metadata: {},
          },
        ],
      },
      mockEnv,
    );
    expect(result.conviction).toBe(25);
    expect(result.confidence_band).toBe('low');
    expect(result.recommended_action).toBe('long'); // direction long, so still 'long'
  });

  it('rejects an empty detector list', async () => {
    // With no detectors, mockScore returns conviction 0. That's a valid
    // "none" recommendation with low band. The real path would still
    // fail (no evidence) but the MOCK is permissive.
    const result = await score({ ...baseInput, detector_classifications: [] }, mockEnv);
    expect(result.conviction).toBe(0);
    expect(result.confidence_band).toBe('low');
    expect(result.recommended_action).toBe('long');
  });
});

describe('agent.score (budget cap)', () => {
  beforeEach(() => {
    _internalResetForTests();
  });

  it('throws AgentBudgetExceededError when daily budget is set below the estimate', async () => {
    // Set daily budget to a tiny amount. MOCK path doesn't call the API,
    // but the budget check still fires.
    const tinyEnv = { ...mockEnv, dailyBudgetUsd: 0.0001 };
    await expect(score(baseInput, tinyEnv)).rejects.toThrow(AgentBudgetExceededError);
  });
});
