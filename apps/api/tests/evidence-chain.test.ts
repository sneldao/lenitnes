import { describe, it, expect } from 'vitest';
import {
  buildPathFromContext,
  computePathHash,
  extractCommitShas,
  type PathContextInput,
} from '../src/services/domain/evidence-chain.js';

function ctx(over: Partial<PathContextInput> = {}): PathContextInput {
  return {
    self: {
      signalId: 'self-1',
      repo: 'ZcashFoundation/zebra',
      domain: 'code',
      detectorTypes: ['protocol_release'],
      detectedAt: '2026-08-10T12:00:00.000Z',
      commitShas: ['abc1234'],
    },
    peers: [],
    ...over,
  };
}

describe('evidence-chain · extractCommitShas', () => {
  it('extracts deduped 7-char SHAs from evidence text', () => {
    expect(extractCommitShas('abc1234: fix\n def5678: bump')).toEqual(['abc1234', 'def5678']);
    expect(extractCommitShas(null)).toEqual([]);
    expect(extractCommitShas('no hex here')).toEqual([]);
  });
});

describe('evidence-chain · buildPathFromContext', () => {
  it('no peers → self node only, zero edges, non-empty hash', () => {
    const path = buildPathFromContext(ctx());
    expect(path.nodes).toHaveLength(1);
    expect(path.nodes[0]!.nodeType).toBe('signal');
    expect(path.nodes[0]!.sourceRef).toBe('self-1');
    expect(path.edges).toHaveLength(0);
    expect(path.pathHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('corroborates: same repo within the temporal window', () => {
    const path = buildPathFromContext(
      ctx({
        peers: [
          {
            signalId: 'peer-1',
            repo: 'ZcashFoundation/zebra',
            domain: 'code',
            detectorTypes: ['security_advisory'],
            detectedAt: '2026-08-10T11:00:00.000Z', // 1h before self
            commitShas: [],
          },
        ],
      }),
    );
    const edge = path.edges.find((e) => e.kind === 'corroborates');
    expect(edge).toBeDefined();
    expect(edge!.provenance).toBe('auto');
    expect(edge!.from.sourceRef).toBe('peer-1');
    expect(edge!.to.sourceRef).toBe('self-1');
  });

  it('corroborates: same repo outside the window is not linked', () => {
    const path = buildPathFromContext(
      ctx({
        peers: [
          {
            signalId: 'peer-old',
            repo: 'ZcashFoundation/zebra',
            domain: 'code',
            detectorTypes: ['security_advisory'],
            detectedAt: '2026-08-08T11:00:00.000Z', // 49h before self (outside 48h window)
            commitShas: [],
          },
        ],
      }),
    );
    expect(path.edges.some((e) => e.kind === 'corroborates')).toBe(false);
  });

  it('sector_upstream: upstream security signal before self (halo2 → zebra)', () => {
    const path = buildPathFromContext(
      ctx({
        peers: [
          {
            signalId: 'halo2-sig',
            repo: 'zcash/halo2',
            domain: 'code',
            detectorTypes: ['emergency_patch'],
            detectedAt: '2026-08-09T12:00:00.000Z', // 1 day before self
            commitShas: [],
          },
        ],
      }),
    );
    const edge = path.edges.find((e) => e.kind === 'sector_upstream');
    expect(edge).toBeDefined();
    expect(edge!.payload).toMatchObject({ sectorId: 'privacy-l1', upstreamRepo: 'zcash/halo2' });
  });

  it('sector_upstream: peer AFTER self is not linked (pre-registration order)', () => {
    const path = buildPathFromContext(
      ctx({
        peers: [
          {
            signalId: 'halo2-late',
            repo: 'zcash/halo2',
            domain: 'code',
            detectorTypes: ['emergency_patch'],
            detectedAt: '2026-08-11T12:00:00.000Z', // after self
            commitShas: [],
          },
        ],
      }),
    );
    expect(path.edges.some((e) => e.kind === 'sector_upstream')).toBe(false);
  });

  it('sector_upstream: peer without a security detector is not linked', () => {
    const path = buildPathFromContext(
      ctx({
        peers: [
          {
            signalId: 'halo2-quiet',
            repo: 'zcash/halo2',
            domain: 'code',
            detectorTypes: ['method_fix'],
            detectedAt: '2026-08-09T12:00:00.000Z',
            commitShas: [],
          },
        ],
      }),
    );
    expect(path.edges.some((e) => e.kind === 'sector_upstream')).toBe(false);
  });

  it('sector_upstream: DOWNSTREAM peer is not linked', () => {
    // self is zebra (idx 1); zcash/zcash (idx 2) is downstream.
    const path = buildPathFromContext(
      ctx({
        peers: [
          {
            signalId: 'zcash-sig',
            repo: 'zcash/zcash',
            domain: 'code',
            detectorTypes: ['emergency_patch'],
            detectedAt: '2026-08-09T12:00:00.000Z',
            commitShas: [],
          },
        ],
      }),
    );
    expect(path.edges.some((e) => e.kind === 'sector_upstream')).toBe(false);
  });

  it('same_sha: shared commit across repos links commit nodes', () => {
    const path = buildPathFromContext(
      ctx({
        self: {
          signalId: 'self-1',
          repo: 'ZcashFoundation/zebra',
          domain: 'code',
          detectorTypes: ['protocol_release'],
          detectedAt: '2026-08-10T12:00:00.000Z',
          commitShas: ['abc1234'],
        },
        peers: [
          {
            signalId: 'peer-shared',
            repo: 'zcash/halo2',
            domain: 'code',
            detectorTypes: ['silent_merge'],
            detectedAt: '2026-08-10T10:00:00.000Z',
            commitShas: ['abc1234'],
          },
        ],
      }),
    );
    const edge = path.edges.find((e) => e.kind === 'same_sha');
    expect(edge).toBeDefined();
    expect(edge!.provenance).toBe('auto');
    expect(path.nodes.some((n) => n.nodeType === 'commit' && n.sourceRef === 'abc1234')).toBe(true);
  });

  it('path hash is deterministic and order-insensitive', () => {
    const a = buildPathFromContext(
      ctx({
        peers: [
          {
            signalId: 'peer-1',
            repo: 'ZcashFoundation/zebra',
            domain: 'code',
            detectorTypes: ['security_advisory'],
            detectedAt: '2026-08-10T11:00:00.000Z',
            commitShas: [],
          },
          {
            signalId: 'halo2-sig',
            repo: 'zcash/halo2',
            domain: 'code',
            detectorTypes: ['emergency_patch'],
            detectedAt: '2026-08-09T12:00:00.000Z',
            commitShas: [],
          },
        ],
      }),
    );
    const b = buildPathFromContext(
      ctx({
        peers: [
          {
            signalId: 'halo2-sig',
            repo: 'zcash/halo2',
            domain: 'code',
            detectorTypes: ['emergency_patch'],
            detectedAt: '2026-08-09T12:00:00.000Z',
            commitShas: [],
          },
          {
            signalId: 'peer-1',
            repo: 'ZcashFoundation/zebra',
            domain: 'code',
            detectorTypes: ['security_advisory'],
            detectedAt: '2026-08-10T11:00:00.000Z',
            commitShas: [],
          },
        ],
      }),
    );
    expect(b.pathHash).toBe(a.pathHash);
  });

  it('path hash is sensitive to a different peer', () => {
    const base = buildPathFromContext(ctx());
    const other = buildPathFromContext(
      ctx({
        peers: [
          {
            signalId: 'peer-x',
            repo: 'zcash/halo2',
            domain: 'code',
            detectorTypes: ['emergency_patch'],
            detectedAt: '2026-08-09T12:00:00.000Z',
            commitShas: [],
          },
        ],
      }),
    );
    expect(other.pathHash).not.toBe(base.pathHash);
  });
});

describe('evidence-chain · computePathHash', () => {
  it('empty path hashes deterministically', () => {
    const h1 = computePathHash([], []);
    const h2 = computePathHash([], []);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});
