import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentScore } from '@lenitnes/types';

// replay() now fetches real commit history; mock the GitHub layer so
// tests are deterministic and offline.
const fetchCommitsRangeMock = vi.fn();
vi.mock('../src/services/github.js', () => ({
  fetchCommitsRange: (...args: unknown[]) => fetchCommitsRangeMock(...args),
  fetchCommitsSince: vi.fn(),
}));
vi.mock('../src/services/data-providers/registry.js', () => ({
  priceData: {
    getPriceAtWindow: vi.fn().mockResolvedValue(null),
    getPriceAt: vi.fn().mockResolvedValue(null),
  },
  marketData: {},
}));

const { describeReplay, replay, HALO2_REPLAY, scoreCommit } =
  await import('../src/services/replay.js');

describe('replay — halo2 canonical example', () => {
  it('HALO2_REPLAY has the expected verdict shape', () => {
    // Updated 2026-06-26: replay now anchored on the 2026 Orchard
    // emergency response (Zebra 4.5.3 + NU6.2 hard fork) rather than
    // the pre-pivot 2022 fix. Agent goes SHORT on the emergency-
    // response pattern; ZEC then drops ~50% on the formal disclosure.
    expect(HALO2_REPLAY).toMatchObject({
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      message: expect.stringContaining('Orchard'),
      detectorClassifications: expect.arrayContaining([
        expect.objectContaining({
          detector_type: 'emergency_patch',
          score: expect.any(Number),
        }),
      ]),
      agentScore: {
        conviction: 95,
        recommended_action: 'short',
        confidence_band: 'high',
        rubric_version: 'v2',
      },
      wouldHaveTraded: {
        chain: 'bnb',
        side: 'short',
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

describe('replay.replay() — real engine', () => {
  beforeEach(() => {
    process.env.MOCK_AGENT = '1';
    fetchCommitsRangeMock.mockReset();
  });

  it('produces a verdict for a day-batch where detectors fire', async () => {
    fetchCommitsRangeMock.mockResolvedValueOnce([
      {
        sha: 'a'.repeat(40),
        message: 'fix: emergency patch for critical security vulnerability in consensus path',
        author: 'dev',
        date: '2026-06-02T02:00:00Z',
        url: 'https://github.com/zcash/zebra/commit/aaa',
        additions: 0,
        deletions: 0,
        total: 0,
      },
      {
        sha: 'b'.repeat(40),
        message: 'chore: bump version',
        author: 'dev',
        date: '2026-06-02T03:00:00Z',
        url: 'https://github.com/zcash/zebra/commit/bbb',
        additions: 0,
        deletions: 0,
        total: 0,
      },
    ]);

    const verdicts = await replay({
      repo: 'zcash/zebra',
      from: '2026-06-01T00:00:00Z',
      to: '2026-06-03T00:00:00Z',
      asset: 'zcash',
      mock: true,
    });
    expect(verdicts.length).toBeGreaterThanOrEqual(1);
    const v = verdicts[0];
    expect(v.commitCount).toBe(2);
    expect(v.detectorClassifications.length).toBeGreaterThan(0);
    expect(v.wouldHaveTraded.paper).toBe(true);
    expect(v.agentScore.conviction).toBeGreaterThan(0);
  });

  it('returns [] when no commits fire any detector', async () => {
    fetchCommitsRangeMock.mockResolvedValueOnce([
      {
        sha: 'c'.repeat(40),
        message: 'docs: fix typo in readme',
        author: 'dev',
        date: '2026-06-02T02:00:00Z',
        url: 'https://github.com/foo/bar/commit/ccc',
        additions: 0,
        deletions: 0,
        total: 0,
      },
    ]);
    const verdicts = await replay({
      repo: 'foo/bar',
      from: '2026-06-01T00:00:00Z',
      to: '2026-06-03T00:00:00Z',
      asset: 'foo',
      mock: true,
    });
    expect(verdicts).toEqual([]);
  });

  it('returns [] when the range has no commits', async () => {
    fetchCommitsRangeMock.mockResolvedValueOnce([]);
    const verdicts = await replay(describeReplay({ repo: 'foo/bar', asset: 'foo' }));
    expect(verdicts).toEqual([]);
  });
});

describe('replay.describeReplay()', () => {
  it('defaults to a 90-day ISO window when from/to omitted', () => {
    const input = describeReplay({ repo: 'zcash/halo2' });
    const from = new Date(input.from).getTime();
    const to = new Date(input.to).getTime();
    expect(Number.isNaN(from)).toBe(false);
    expect(Number.isNaN(to)).toBe(false);
    expect(to - from).toBeCloseTo(90 * 24 * 3600 * 1000, -5);
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
