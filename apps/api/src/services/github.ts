import { logger } from '../logger.js';
import { config } from '../config.js';

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  additions: number;
  deletions: number;
  total: number;
}

const GITHUB_API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 10_000;

/** Parse owner/repo from a GitHub repo URL. */
function parseRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/.*)?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

/** Fetch commits since a given SHA (or all recent if sinceHash is null). */
export async function fetchCommitsSince(
  repoUrl: string,
  sinceHash?: string | null,
): Promise<GitHubCommit[] | null> {
  const repo = parseRepo(repoUrl);
  if (!repo) return null; // Not a GitHub URL — caller falls back to scraping.

  const url = new URL(`/repos/${repo.owner}/${repo.repo}/commits`, GITHUB_API_BASE);
  if (sinceHash) url.searchParams.set('since', '1970-01-01T00:00:00Z'); // Hack: GitHub API doesn't filter by SHA directly, we'll fetch and filter client-side

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'lenitnes/1.0',
  };
  if (config.github.token) {
    headers.Authorization = `Bearer ${config.github.token}`;
  }

  try {
    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      logger.warn({ status: res.status, repoUrl }, 'GitHub API request failed');
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data)) return null;

    const commits: GitHubCommit[] = data.map((c: Record<string, unknown>) => {
      const commit = c.commit as Record<string, unknown>;
      const stats = (c.stats ?? {}) as { additions?: number; deletions?: number; total?: number };
      return {
        sha: String(c.sha ?? ''),
        message: String((commit as Record<string, unknown>)?.message ?? ''),
        author: String(
          ((commit as Record<string, unknown>)?.author as Record<string, unknown>)?.name ?? '',
        ),
        date: String(
          ((commit as Record<string, unknown>)?.author as Record<string, unknown>)?.date ?? '',
        ),
        url: String(c.html_url ?? ''),
        additions: stats.additions ?? 0,
        deletions: stats.deletions ?? 0,
        total: stats.total ?? 0,
      };
    });

    if (sinceHash) {
      const idx = commits.findIndex((c) => c.sha === sinceHash);
      return idx >= 0 ? commits.slice(0, idx) : commits;
    }
    return commits;
  } catch (err) {
    logger.error({ err, repoUrl }, 'GitHub API error');
    return null;
  }
}
