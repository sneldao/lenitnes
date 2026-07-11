import pLimit from 'p-limit';
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
/** Default cap on per-commit detail fetches per call — bounds API cost. */
const DEFAULT_STATS_ENRICH_LIMIT = 40;
const DEFAULT_STATS_CONCURRENCY = 5;

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'lenitnes/1.0',
  };
  if (config.github.token) {
    headers.Authorization = `Bearer ${config.github.token}`;
  }
  return headers;
}

/** Parse owner/repo from a GitHub repo URL or bare "owner/repo" slug. */
export function parseRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/.*)?$/i);
  if (match) return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  const slug = url.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (slug) return { owner: slug[1], repo: slug[2].replace(/\.git$/, '') };
  return null;
}

function mapListCommit(c: Record<string, unknown>): GitHubCommit {
  const commit = c.commit as Record<string, unknown> | undefined;
  const author = commit?.author as Record<string, unknown> | undefined;
  return {
    sha: String(c.sha ?? ''),
    message: String(commit?.message ?? ''),
    author: String(author?.name ?? ''),
    date: String(author?.date ?? ''),
    url: String(c.html_url ?? ''),
    additions: 0,
    deletions: 0,
    total: 0,
  };
}

async function fetchCommitStats(
  owner: string,
  repo: string,
  sha: string,
): Promise<{ additions: number; deletions: number; total: number } | null> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${sha}`;
  try {
    const res = await fetch(url, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const stats = (data.stats ?? {}) as { additions?: number; deletions?: number; total?: number };
    return {
      additions: stats.additions ?? 0,
      deletions: stats.deletions ?? 0,
      total: stats.total ?? (stats.additions ?? 0) + (stats.deletions ?? 0),
    };
  } catch (err) {
    logger.debug({ err, owner, repo, sha: sha.slice(0, 7) }, 'GitHub commit stats fetch failed');
    return null;
  }
}

export interface EnrichCommitStatsOptions {
  /** Max commits to enrich (newest-first). Default 40. */
  maxEnrich?: number;
  /** Parallel detail requests. Default 5. */
  concurrency?: number;
}

/**
 * Fill additions/deletions/total via the single-commit API. The list
 * endpoint omits stats — size-based detectors depend on this enrichment.
 * Mutates commits in place; skips rows that already have stats.
 */
export async function enrichCommitStats(
  repoUrl: string,
  commits: GitHubCommit[],
  options: EnrichCommitStatsOptions = {},
): Promise<void> {
  const parsed = parseRepo(repoUrl);
  if (!parsed || commits.length === 0) return;

  const maxEnrich = options.maxEnrich ?? DEFAULT_STATS_ENRICH_LIMIT;
  const limit = pLimit(options.concurrency ?? DEFAULT_STATS_CONCURRENCY);

  const needsStats = commits.filter((c) => c.total === 0 && c.additions + c.deletions === 0);
  const toEnrich = needsStats.slice(0, maxEnrich);

  await Promise.all(
    toEnrich.map((commit) =>
      limit(async () => {
        const stats = await fetchCommitStats(parsed.owner, parsed.repo, commit.sha);
        if (!stats) return;
        commit.additions = stats.additions;
        commit.deletions = stats.deletions;
        commit.total = stats.total;
      }),
    ),
  );
}

/** Agent-ready evidence block: SHA, first line, optional diff stats. */
export function formatCommitEvidence(commits: GitHubCommit[], max = 6): string {
  return commits
    .slice(0, max)
    .map((c) => {
      const sizes = c.additions + c.deletions > 0 ? ` (+${c.additions}/-${c.deletions})` : '';
      return `${c.sha.slice(0, 7)}: ${c.message.split('\n')[0]}${sizes}`;
    })
    .join('\n');
}

/**
 * Fetch commits in a date range (ISO timestamps), paginated.
 * Used by the replay engine to scan an arbitrary historical window.
 * Caps at `maxPages` × 100 commits to bound API cost; the caller is
 * told nothing was truncated only implicitly (result.length < cap).
 */
export async function fetchCommitsRange(
  repoUrl: string,
  sinceIso: string,
  untilIso: string,
  maxPages = 3,
): Promise<GitHubCommit[] | null> {
  const repo = parseRepo(repoUrl);
  if (!repo) return null;

  const all: GitHubCommit[] = [];
  try {
    for (let page = 1; page <= maxPages; page++) {
      const url = new URL(`/repos/${repo.owner}/${repo.repo}/commits`, GITHUB_API_BASE);
      url.searchParams.set('since', sinceIso);
      url.searchParams.set('until', untilIso);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));

      const res = await fetch(url.toString(), {
        headers: githubHeaders(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        logger.warn({ status: res.status, repoUrl, page }, 'GitHub range request failed');
        return all.length > 0 ? all : null;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      for (const c of data as Array<Record<string, unknown>>) {
        all.push(mapListCommit(c));
      }
      if (data.length < 100) break;
    }
    return all;
  } catch (err) {
    logger.error({ err, repoUrl }, 'GitHub range API error');
    return all.length > 0 ? all : null;
  }
}

/** Fetch commits since a given SHA (or all recent if sinceHash is null). */
export async function fetchCommitsSince(
  repoUrl: string,
  sinceHash?: string | null,
): Promise<GitHubCommit[] | null> {
  const repo = parseRepo(repoUrl);
  if (!repo) return null;

  const url = new URL(`/repos/${repo.owner}/${repo.repo}/commits`, GITHUB_API_BASE);
  url.searchParams.set('per_page', '30');
  if (sinceHash) url.searchParams.set('since', '1970-01-01T00:00:00Z');

  try {
    const res = await fetch(url.toString(), {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, repoUrl }, 'GitHub API request failed');
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data)) return null;

    let commits: GitHubCommit[] = data.map((c: Record<string, unknown>) => mapListCommit(c));

    if (sinceHash) {
      const idx = commits.findIndex((c) => c.sha === sinceHash);
      commits = idx >= 0 ? commits.slice(0, idx) : commits;
    }

    await enrichCommitStats(repoUrl, commits, { maxEnrich: commits.length });
    return commits;
  } catch (err) {
    logger.error({ err, repoUrl }, 'GitHub API error');
    return null;
  }
}
