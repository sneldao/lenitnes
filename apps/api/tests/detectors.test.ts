import { describe, it, expect } from 'vitest';
import type { DetectorInput } from '../src/services/detectors/types.js';
import type { GitHubCommit } from '../src/services/github.js';
import { emergencyPatchDetector } from '../src/services/detectors/emergency-patch.js';
import { securityCriticalDetector } from '../src/services/detectors/security-critical.js';
import { dependencyRotationDetector } from '../src/services/detectors/dependency-rotation.js';
import { governanceShiftDetector } from '../src/services/detectors/governance-shift.js';
import { maintainerDepartureDetector } from '../src/services/detectors/maintainer-departure.js';
import { silentMergeDetector } from '../src/services/detectors/silent-merge.js';
import { protocolUpgradeDetector } from '../src/services/detectors/protocol-upgrade.js';
import { supplyChainRiskDetector } from '../src/services/detectors/supply-chain-risk.js';
import { runDetectors } from '../src/services/detectors/registry.js';
import { detectAssetMapping } from '../src/services/detectors/asset-lookup.js';

function makeInput(overrides: Partial<DetectorInput> = {}): DetectorInput {
  return {
    result: { conditionMet: true, confidence: 80, evidence: '', summary: '' },
    commits: [],
    monitorUrl: 'https://github.com/zcash/zcash',
    monitorCondition: 'security fix',
    ...overrides,
  };
}

function makeCommit(overrides: Partial<GitHubCommit> = {}): GitHubCommit {
  return {
    sha: 'abc123',
    message: 'routine update',
    author: 'dev',
    date: '2026-06-12T10:00:00Z',
    url: 'https://github.com/test/repo/commit/abc123',
    additions: 10,
    deletions: 5,
    total: 15,
    ...overrides,
  };
}

describe('emergency_patch detector', () => {
  it('fires on large security-critical commit with urgent keywords', () => {
    const result = emergencyPatchDetector.detect(
      makeInput({
        commits: [
          makeCommit({
            message: 'fix: critical vulnerability in signature verification',
            additions: 450,
            deletions: 120,
            total: 570,
          }),
        ],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('emergency_patch');
    expect(result!.score).toBeGreaterThan(50);
  });

  it('does not fire on routine documentation changes', () => {
    const result = emergencyPatchDetector.detect(
      makeInput({
        commits: [
          makeCommit({ message: 'docs: update README', total: 5, additions: 3, deletions: 2 }),
        ],
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when no commits', () => {
    expect(emergencyPatchDetector.detect(makeInput())).toBeNull();
  });
});

describe('security_critical detector', () => {
  it('fires on cryptographic code changes', () => {
    const result = securityCriticalDetector.detect(
      makeInput({
        commits: [makeCommit({ message: 'refactor elliptic curve scalar multiplication' })],
        result: {
          conditionMet: true,
          confidence: 75,
          evidence: 'changes to halo2 proof circuit',
          summary: '',
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('security_critical_patch');
  });

  it('does not fire on UI changes', () => {
    const result = securityCriticalDetector.detect(
      makeInput({
        commits: [makeCommit({ message: 'update button styles and layout' })],
        result: {
          conditionMet: true,
          confidence: 50,
          evidence: 'changed CSS classes',
          summary: '',
        },
      }),
    );
    expect(result).toBeNull();
  });
});

describe('dependency_rotation detector', () => {
  it('fires on dependency version bumps', () => {
    const result = dependencyRotationDetector.detect(
      makeInput({
        commits: [
          makeCommit({ message: 'bump openssl from 1.1.1 to 3.0.0' }),
          makeCommit({ message: 'update lockfile after dependency upgrade' }),
        ],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('dependency_rotation');
  });

  it('does not fire on code refactors', () => {
    const result = dependencyRotationDetector.detect(
      makeInput({
        commits: [makeCommit({ message: 'refactor authentication module' })],
      }),
    );
    expect(result).toBeNull();
  });
});

describe('governance_shift detector', () => {
  it('fires on governance parameter changes', () => {
    const result = governanceShiftDetector.detect(
      makeInput({
        commits: [makeCommit({ message: 'update quorum threshold and timelock period' })],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('governance_shift');
  });
});

describe('maintainer_departure detector', () => {
  it('fires on single-author dominance with many commits', () => {
    const commits = Array.from({ length: 6 }, (_, i) =>
      makeCommit({ sha: `sha-${i}`, author: 'lone-dev', message: `commit ${i}` }),
    );
    const result = maintainerDepartureDetector.detect(makeInput({ commits }));
    expect(result).not.toBeNull();
    expect(result!.type).toBe('maintainer_departure');
  });

  it('fires on roster change keywords', () => {
    const result = maintainerDepartureDetector.detect(
      makeInput({
        commits: [makeCommit({ message: 'update CODEOWNERS: remove retiring maintainer' })],
      }),
    );
    expect(result).not.toBeNull();
  });
});

describe('silent_merge detector', () => {
  it('fires on large merges without PR references', () => {
    const result = silentMergeDetector.detect(
      makeInput({
        commits: [makeCommit({ message: 'Merge branch main into feature', total: 500 })],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('silent_merge');
  });

  it('does not fire on PR-referenced merges', () => {
    const result = silentMergeDetector.detect(
      makeInput({
        commits: [
          makeCommit({
            message: 'Merge pull request #42 from feature',
            total: 50,
            url: 'https://github.com/test/repo/pull/42',
          }),
        ],
      }),
    );
    expect(result).toBeNull();
  });
});

describe('protocol_upgrade detector', () => {
  it('fires on breaking changes and version bumps', () => {
    const result = protocolUpgradeDetector.detect(
      makeInput({
        commits: [makeCommit({ message: 'breaking: migrate to v3 protocol consensus' })],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('protocol_upgrade');
  });
});

describe('supply_chain_risk detector', () => {
  it('fires on CI/CD and build changes', () => {
    const result = supplyChainRiskDetector.detect(
      makeInput({
        commits: [makeCommit({ message: 'add postinstall script and update github workflow' })],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('supply_chain_risk');
  });
});

describe('runDetectors registry', () => {
  it('collects multiple classifications from a single commit set', () => {
    const input = makeInput({
      commits: [
        makeCommit({
          message: 'fix: critical vulnerability in consensus validation, bump openssl dependency',
          additions: 400,
          deletions: 100,
          total: 500,
        }),
      ],
      result: {
        conditionMet: true,
        confidence: 90,
        evidence: 'security fix in crypto module',
        summary: '',
      },
    });
    const results = runDetectors(input);
    expect(results.length).toBeGreaterThan(1);
    const types = results.map((r) => r.type);
    expect(types).toContain('emergency_patch');
    expect(types).toContain('security_critical_patch');
  });

  it('returns empty array when no detectors match', () => {
    const input = makeInput({
      commits: [
        makeCommit({
          message: 'update README with new logo',
          total: 2,
          additions: 1,
          deletions: 1,
        }),
      ],
    });
    expect(runDetectors(input)).toEqual([]);
  });
});

describe('detectAssetMapping', () => {
  it('maps zcash repo to ZEC', () => {
    const mapping = detectAssetMapping('https://github.com/zcash/zcash');
    expect(mapping).not.toBeNull();
    expect(mapping!.coingeckoId).toBe('zcash');
    expect(mapping!.krakenPair).toBe('ZECUSD');
  });

  it('maps ethereum repo to ETH', () => {
    const mapping = detectAssetMapping('https://github.com/ethereum/go-ethereum');
    expect(mapping).not.toBeNull();
    expect(mapping!.coingeckoId).toBe('ethereum');
  });

  it('maps NVIDIA repo to tokenized stock', () => {
    const mapping = detectAssetMapping('https://github.com/NVIDIA/cuda-samples');
    expect(mapping).not.toBeNull();
    expect(mapping!.tokenizedStock).toBe('NVDA');
    expect(mapping!.direction).toBe('long');
  });

  it('falls back to org-level match', () => {
    const mapping = detectAssetMapping('https://github.com/bitcoin/bitcoin-core');
    // org match should find bitcoin/bitcoin
    expect(mapping).not.toBeNull();
    expect(mapping!.coingeckoId).toBe('bitcoin');
  });

  it('returns null for unknown repos', () => {
    expect(detectAssetMapping('https://github.com/random/unknown-repo')).toBeNull();
  });
});
