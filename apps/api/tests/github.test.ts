import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const github = await import('../src/services/github.js');
const { enrichCommitStats, formatCommitEvidence, fetchCommitsSince } = github;
type GitHubCommit = github.GitHubCommit;

function makeCommit(sha: string, overrides: Partial<GitHubCommit> = {}): GitHubCommit {
  return {
    sha,
    message: 'fix: security patch',
    author: 'dev',
    date: '2026-06-02T02:00:00Z',
    url: `https://github.com/zcash/halo2/commit/${sha}`,
    additions: 0,
    deletions: 0,
    total: 0,
    ...overrides,
  };
}

describe('github.formatCommitEvidence', () => {
  it('includes diff stats when present', () => {
    const text = formatCommitEvidence([
      makeCommit('a'.repeat(40), {
        message: 'fix circuit',
        additions: 120,
        deletions: 30,
        total: 150,
      }),
    ]);
    expect(text).toContain('fix circuit');
    expect(text).toContain('(+120/-30)');
  });

  it('omits size suffix when stats are zero', () => {
    const text = formatCommitEvidence([makeCommit('b'.repeat(40))]);
    expect(text).not.toContain('(+');
  });
});

describe('github.enrichCommitStats', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('fills stats from the single-commit API', async () => {
    const sha = 'c'.repeat(40);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stats: { additions: 50, deletions: 10, total: 60 } }),
    });

    const commits = [makeCommit(sha)];
    await enrichCommitStats('zcash/halo2', commits, { maxEnrich: 1, concurrency: 1 });

    expect(commits[0].additions).toBe(50);
    expect(commits[0].deletions).toBe(10);
    expect(commits[0].total).toBe(60);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/repos/zcash/halo2/commits/${sha}`),
      expect.any(Object),
    );
  });

  it('skips commits that already have stats', async () => {
    const commits = [makeCommit('d'.repeat(40), { total: 99, additions: 80, deletions: 19 })];
    await enrichCommitStats('zcash/halo2', commits);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('github.fetchCommitsSince', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('enriches commits after list fetch', async () => {
    const sha = 'e'.repeat(40);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            sha,
            html_url: `https://github.com/zcash/halo2/commit/${sha}`,
            commit: {
              message: 'fix: emergency',
              author: { name: 'dev', date: '2026-06-02T02:00:00Z' },
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stats: { additions: 10, deletions: 2, total: 12 } }),
      });

    const commits = await fetchCommitsSince('https://github.com/zcash/halo2/commits/main');
    expect(commits).toHaveLength(1);
    expect(commits![0].total).toBe(12);
  });
});
