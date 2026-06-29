import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  score,
  scoreAndPersist,
  saveAgentScore,
  fetchAgentScore,
  precedentCount,
  buildAgentEnvFromConfig,
  AgentBudgetExceededError,
  _internalResetForTests,
} from '../src/services/agent.js';
import type { AgentInput, AgentScore } from '@lenitnes/types';

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
  asset_mapping: { coingeckoId: 'zcash', direction: 'long' },
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
    // Rubric bumped 2026-06-30 — v3 added narrative_context so the
    // agent can string commits across repos and weigh corroboration.
    expect(result.rubric_version).toBe('v3');
    expect(result.thesis).toContain('MOCK');
    expect(result.hcs_dispatch).toContain('MOCK');
    expect(result.proof_action).toBe('standard');
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
    expect(result.recommended_action).toBe('long');
  });

  it('rejects an empty detector list', async () => {
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

  // Budget cap only fires on the live path; MOCK mode short-circuits
  // before the budget check (Day 13) so seed:demo and local backtests
  // don't need DAILY_AGENT_BUDGET_USD just to exercise the pipeline.
  it('throws AgentBudgetExceededError when daily budget is set below the estimate (live path)', async () => {
    const liveTinyEnv = { ...mockEnv, mock: false, dailyBudgetUsd: 0.0001 };
    await expect(score(baseInput, liveTinyEnv)).rejects.toThrow(AgentBudgetExceededError);
  });

  it('does not throw on the MOCK path regardless of daily budget', async () => {
    const mockTinyEnv = { ...mockEnv, dailyBudgetUsd: 0.0001 };
    await expect(score(baseInput, mockTinyEnv)).resolves.toBeDefined();
  });
});

// ── Day 4: persistence + env helpers (DB-mocked) ────────────────

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db/pool.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: vi.fn(),
  pool: { query: mockQuery, end: vi.fn() },
}));

describe('agent.saveAgentScore', () => {
  beforeEach(() => {
    _internalResetForTests();
    mockQuery.mockReset();
  });

  it('inserts a row into agent_scores with all fields', async () => {
    const score_: AgentScore = {
      id: 'agent-score-id',
      signal_id: baseInput.signal_id,
      rubric_version: 'v1',
      conviction: 85,
      thesis: 'Critical soundness fix landed.',
      recommended_action: 'long',
      confidence_band: 'high',
      raw_response: { model: 'mock' },
      created_at: '2026-06-17T20:00:00Z',
    };
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await saveAgentScore(baseInput.signal_id, score_);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agent_scores'),
      expect.arrayContaining([
        baseInput.signal_id,
        'v1',
        85,
        'Critical soundness fix landed.',
        'long',
        'high',
      ]),
    );
  });
});

describe('agent.scoreAndPersist', () => {
  beforeEach(() => {
    _internalResetForTests();
    mockQuery.mockReset();
  });

  it('calls score and writes the result to agent_scores', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await scoreAndPersist(baseInput, mockEnv);

    expect(result.conviction).toBe(85);
    expect(result.signal_id).toBe(baseInput.signal_id);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agent_scores'),
      expect.any(Array),
    );
  });
});

describe('agent.fetchAgentScore', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns null when no row is found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await fetchAgentScore('sig-x');
    expect(result).toBeNull();
  });

  it('returns the most recent AgentScore for a signal', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'agent-score-id',
          signal_id: 'sig-1',
          rubric_version: 'v1',
          conviction: 72,
          thesis: 'Solid signal.',
          recommended_action: 'long',
          confidence_band: 'mid',
          raw_response: { model: 'mock' },
          created_at: '2026-06-17T20:00:00Z',
        },
      ],
      rowCount: 1,
    });
    const result = await fetchAgentScore('sig-1');
    expect(result).toMatchObject({
      signal_id: 'sig-1',
      conviction: 72,
      recommended_action: 'long',
      confidence_band: 'mid',
    });
  });
});

describe('agent.precedentCount', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 0 when no detector types are given', async () => {
    expect(await precedentCount('m-1', [])).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('queries signal_classifications for similar past signals', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 });
    const count = await precedentCount('m-1', ['emergency_patch', 'security_critical_patch']);
    expect(count).toBe(7);
    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('signal_classifications');
    expect(sql).toContain('monitor_id = $1');
    expect(sql).toContain('detector_type = ANY($2)');
  });
});

describe('agent.buildAgentEnvFromConfig', () => {
  beforeEach(() => {
    delete process.env.VIRTUALS_API_KEY;
    delete process.env.VIRTUALS_BASE_URL;
    delete process.env.AGENT_MODEL;
    delete process.env.MOCK_AGENT;
    delete process.env.DAILY_AGENT_BUDGET_USD;
    delete process.env.AGENT_INPUT_COST_PER_1M_USD;
    delete process.env.AGENT_OUTPUT_COST_PER_1M_USD;
  });

  it('uses the Virtuals defaults when no env is set', () => {
    const env = buildAgentEnvFromConfig();
    expect(env.baseUrl).toBe('https://compute.virtuals.io/v1');
    expect(env.model).toBe('moonshotai/kimi-k2-0905');
    expect(env.mock).toBe(false);
    expect(env.dailyBudgetUsd).toBe(20);
  });

  it('respects MOCK_AGENT=1', () => {
    process.env.MOCK_AGENT = '1';
    expect(buildAgentEnvFromConfig().mock).toBe(true);
  });

  it('respects custom cost overrides', () => {
    process.env.AGENT_INPUT_COST_PER_1M_USD = '0.30';
    process.env.AGENT_OUTPUT_COST_PER_1M_USD = '1.20';
    const env = buildAgentEnvFromConfig();
    expect(env.inputCostPer1M).toBe(0.3);
    expect(env.outputCostPer1M).toBe(1.2);
  });
});
