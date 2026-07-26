import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockQuery, mockFetchAdvisories, mockFetchReleases } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockFetchAdvisories: vi.fn(),
  mockFetchReleases: vi.fn(),
}));

vi.mock('../src/db/pool.js', () => ({ query: mockQuery }));
vi.mock('../src/services/github.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/github.js')>();
  return {
    ...actual,
    fetchSecurityAdvisories: mockFetchAdvisories,
    fetchReleases: mockFetchReleases,
  };
});

const { scanSecurityAdvisories, detectSecurityAdvisories, ADVISORY_SIGNAL_THRESHOLD } =
  await import('../src/services/detectors/security-advisory.js');
const { scanReleases, detectProtocolReleases, RELEASE_SIGNAL_THRESHOLD } =
  await import('../src/services/detectors/protocol-release.js');

const REPO = 'https://github.com/zcash/halo2';
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3_600_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [{ id: 'm1', url: REPO, asset: 'zcash' }] });
});

describe('security-advisory detector', () => {
  it('fires a signal on a recent critical advisory with a CVE', async () => {
    mockFetchAdvisories.mockResolvedValue([
      {
        ghsaId: 'GHSA-xxxx-yyyy',
        cveId: 'CVE-2026-1234',
        summary: 'Soundness bug in the constraint system',
        severity: 'critical',
        cvssScore: 9.3,
        publishedAt: daysAgo(1),
        updatedAt: daysAgo(1),
        url: `${REPO}/security/advisories/GHSA-xxxx-yyyy`,
        packages: ['cargo:halo2'],
      },
    ]);

    const hits = await detectSecurityAdvisories();
    expect(hits).toHaveLength(1);
    expect(hits[0].classification.type).toBe('security_advisory');
    expect(hits[0].asset).toBe('zcash');
    expect(hits[0].classification.score).toBeGreaterThanOrEqual(ADVISORY_SIGNAL_THRESHOLD);
    expect(hits[0].classification.metadata.cveId).toBe('CVE-2026-1234');
  });

  it('does not fire on a low-severity advisory with no CVE', async () => {
    mockFetchAdvisories.mockResolvedValue([
      {
        ghsaId: 'GHSA-low-low',
        cveId: null,
        summary: 'Minor doc issue',
        severity: 'low',
        cvssScore: 2.0,
        publishedAt: daysAgo(1),
        updatedAt: daysAgo(1),
        url: '',
        packages: [],
      },
    ]);

    const hits = await detectSecurityAdvisories();
    expect(hits).toHaveLength(0);
  });

  it('ignores advisories older than the recency window', async () => {
    mockFetchAdvisories.mockResolvedValue([
      {
        ghsaId: 'GHSA-old-old',
        cveId: 'CVE-2026-0001',
        summary: 'Old critical',
        severity: 'critical',
        cvssScore: 9.8,
        publishedAt: daysAgo(30),
        updatedAt: daysAgo(30),
        url: '',
        packages: [],
      },
    ]);

    const readings = await scanSecurityAdvisories();
    expect(readings).toHaveLength(0);
  });
});

describe('protocol-release detector', () => {
  it('fires on a recent security-tagged release', async () => {
    mockFetchReleases.mockResolvedValue([
      {
        tagName: 'v2.1.1',
        name: 'v2.1.1 — emergency consensus hotfix',
        body: 'Fixes a critical vulnerability (CVE-2026-1234). Upgrade immediately.',
        draft: false,
        prerelease: false,
        author: 'release-bot',
        createdAt: daysAgo(1),
        publishedAt: daysAgo(1),
        url: `${REPO}/releases/tag/v2.1.1`,
      },
    ]);

    const hits = await detectProtocolReleases();
    expect(hits).toHaveLength(1);
    expect(hits[0].classification.type).toBe('protocol_release');
    expect(hits[0].classification.score).toBeGreaterThanOrEqual(RELEASE_SIGNAL_THRESHOLD);
    expect(hits[0].classification.metadata.tagName).toBe('v2.1.1');
  });

  it('does not fire on a plain bugfix release', async () => {
    mockFetchReleases.mockResolvedValue([
      {
        tagName: 'v2.0.3',
        name: 'v2.0.3',
        body: 'Assorted bugfixes and performance improvements.',
        draft: false,
        prerelease: false,
        author: 'release-bot',
        createdAt: daysAgo(1),
        publishedAt: daysAgo(1),
        url: '',
      },
    ]);

    const hits = await detectProtocolReleases();
    expect(hits).toHaveLength(0);
  });

  it('skips draft releases', async () => {
    mockFetchReleases.mockResolvedValue([
      {
        tagName: 'v3.0.0',
        name: 'v3.0.0 breaking hard fork',
        body: 'breaking consensus change',
        draft: true,
        prerelease: false,
        author: 'dev',
        createdAt: daysAgo(1),
        publishedAt: daysAgo(1),
        url: '',
      },
    ]);

    const readings = await scanReleases();
    expect(readings).toHaveLength(0);
  });
});
