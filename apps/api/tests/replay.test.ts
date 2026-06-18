import { describe, it, expect, vi, beforeEach } from 'vitest';
import { describeReplay, replay, HALO2_REPLAY, scoreCommit } from '../src/services/replay.js';
import type { AgentScore } from '@lenitnes/types';

describe('replay — halo2 canonical example', () => {
  it('HALO2_REPLAY has the expected verdict shape', () => {
    expect(HALO2_REPLAY).toMatchObject({
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      message: expect.stringContaining('soundness'),
      detectorClassifications: expect.arrayContaining([
        expect.objectContaining({
          detector_type: 'emergency_patch',
          score: expect.any(Number),
        }),
      ]),
      agentScore: {
        conviction: 92,
        recommended_action: 'long',
        confidence_band: 'high',
        rubric_version: 'v1',
      },
      wouldHaveTraded: {
        chain: 'arbitrum',
        side: 'long',
        pair: 'ZECUSD',
        paper: true,
      },
    });
  });

  it('agentScore.thesis is short enough for Telegram (≤280 chars)', () => {
    expect(HALO2_REPLAY.agentScore.thesis.length).toBeLessThanOrEqual(280);
  });

  it('wouldHaveTraded.paper is true (replays are paper-only)', () => {
    expect(HALO2_REPLAY.wouldHaveTraded.paper).toBe(true);
  });
});

describe('replay.replay()', () => {
  beforeEach(() => {
    // Ensure no stray env from .env leaks into the MOCK path
    process.env.MOCK_AGENT = '1';
  });

  it('returns the halo2 example for zcash/halo2', async () => {
    const verdicts = await replay(
      describeReplay({ repo: 'zcash/halo2', from: 'a', to: 'b', asset: 'zcash' }),
    );
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.hash).toBe(HALO2_REPLAY.hash);
  });

  it('returns [] for an unknown repo', async () => {
    const verdicts = await replay(describeReplay({ repo: 'foo/bar', asset: 'foo' }));
    expect(verdicts).toEqual([]);
  });
});

describe('replay.describeReplay()', () => {
  it('defaults from/to/asset when omitted', () => {
    const input = describeReplay({ repo: 'zcash/halo2' });
    expect(input.from).toBe('HEAD~10');
    expect(input.to).toBe('HEAD');
    expect(input.asset).toBe('zcash');
  });

  it('respects explicit from/to/asset', () => {
    const input = describeReplay({
      repo: 'zcash/halo2',
      from: 'abc123',
      to: 'def456',
      asset: 'ZEC',
    });
    expect(input.from).toBe('abc123');
    expect(input.to).toBe('def456');
    expect(input.asset).toBe('ZEC');
  });
});

describe('replay.scoreCommit()', () => {
  beforeEach(() => {
    process.env.MOCK_AGENT = '1';
  });

  it('scores a commit via the MOCK agent path', async () => {
    const score = await scoreCommit({
      hash: 'abc123def4567890',
      message: 'fix critical soundness issue',
      detectorSeeds: [
        {
          detectorType: 'emergency_patch',
          score: 95,
          confidence: 90,
          label: 'Critical fix',
        },
      ],
    });
    expect(score).toMatchObject({
      conviction: 95,
      recommended_action: 'long',
      confidence_band: 'high',
    });
  });
});
