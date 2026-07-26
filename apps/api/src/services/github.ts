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

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  url: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  comments: number;
  reviewComments: number;
  labels: string[];
}

export interface GitHubRelease {
  tagName: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  author: string;
  createdAt: string;
  publishedAt: string;
  url: string;
}

/**
 * Fetch recent published releases (tagged versions). Version tags
 * like v2.1.0 are high-signal protocol events — a security or
 * breaking release maps directly onto our upgrade detectors.
 */
export async function fetchReleases(
  repoUrl: string,
  maxResults = 10,
): Promise<GitHubRelease[] | null> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) return null;

  const url = new URL(`/repos/${parsed.owner}/${parsed.repo}/releases`, GITHUB_API_BASE);
  url.searchParams.set('per_page', String(maxResults));

  try {
    const res = await fetch(url.toString(), {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, repoUrl }, 'GitHub releases API request failed');
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data.map((r: Record<string, unknown>) => {
      const author = r.author as Record<string, unknown> | undefined;
      return {
        tagName: String(r.tag_name ?? ''),
        name: String(r.name ?? ''),
        body: String(r.body ?? ''),
        draft: Boolean(r.draft),
        prerelease: Boolean(r.prerelease),
        author: String(author?.login ?? ''),
        createdAt: String(r.created_at ?? ''),
        publishedAt: String(r.published_at ?? ''),
        url: String(r.html_url ?? ''),
      };
    });
  } catch (err) {
    logger.error({ err, repoUrl }, 'GitHub releases API error');
    return null;
  }
}

export interface GitHubSecurityAdvisory {
  ghsaId: string;
  cveId: string | null;
  summary: string;
  severity: string;
  cvssScore: number | null;
  publishedAt: string;
  updatedAt: string;
  url: string;
  /** Affected package ecosystems/names, best-effort. */
  packages: string[];
}

/**
 * Fetch repo-level security advisories (published GHSAs). These are
 * the canonical "soundness fix / vulnerability disclosed" events and
 * are among the strongest commit-adjacent signals for a short thesis.
 * Requires the repo to have advisories enabled; degrades to null on
 * 403/404 (most public repos without advisories configured).
 */
export async function fetchSecurityAdvisories(
  repoUrl: string,
  maxResults = 10,
): Promise<GitHubSecurityAdvisory[] | null> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) return null;

  const url = new URL(`/repos/${parsed.owner}/${parsed.repo}/security-advisories`, GITHUB_API_BASE);
  url.searchParams.set('per_page', String(maxResults));
  url.searchParams.set('state', 'published');
  url.searchParams.set('sort', 'published');
  url.searchParams.set('direction', 'desc');

  try {
    const headers = githubHeaders();
    // The security-advisories endpoint wants the repository-advisories
    // media type for full fields; the default is tolerant but explicit
    // is safer against API evolution.
    headers.Accept = 'application/vnd.github.repository-advisories+json';
    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // 403/404 is the common case (repo doesn't publish advisories) —
      // not an error worth surfacing loudly.
      logger.debug({ status: res.status, repoUrl }, 'GitHub advisories API unavailable');
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data.map((a: Record<string, unknown>) => {
      const cvss = (a.cvss ?? {}) as { score?: number };
      const vulnerabilities = (a.vulnerabilities as Array<Record<string, unknown>>) ?? [];
      const cve = (a.identifiers as Array<Record<string, unknown>> | undefined)?.find(
        (i) => i.type === 'CVE',
      );
      return {
        ghsaId: String(a.ghsa_id ?? ''),
        cveId: cve ? String(cve.value) : a.cve_id ? String(a.cve_id) : null,
        summary: String(a.summary ?? ''),
        severity: String(a.severity ?? 'unknown'),
        cvssScore: typeof cvss.score === 'number' ? cvss.score : null,
        publishedAt: String(a.published_at ?? ''),
        updatedAt: String(a.updated_at ?? ''),
        url: String(a.html_url ?? ''),
        packages: vulnerabilities
          .map((v) => {
            const pkg = v.package as Record<string, unknown> | undefined;
            return pkg ? `${String(pkg.ecosystem ?? '')}:${String(pkg.name ?? '')}` : '';
          })
          .filter(Boolean),
      };
    });
  } catch (err) {
    logger.error({ err, repoUrl }, 'GitHub advisories API error');
    return null;
  }
}

export async function fetchOpenPullRequests(
  repoUrl: string,
  maxResults = 20,
): Promise<GitHubPullRequest[] | null> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) return null;

  const url = new URL(`/repos/${parsed.owner}/${parsed.repo}/pulls`, GITHUB_API_BASE);
  url.searchParams.set('state', 'open');
  url.searchParams.set('per_page', String(maxResults));
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('direction', 'desc');

  try {
    const res = await fetch(url.toString(), {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, repoUrl }, 'GitHub PRs API request failed');
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data)) return null;

    return data.map((pr: Record<string, unknown>) => {
      const user = pr.user as Record<string, unknown> | undefined;
      const labels = (pr.labels as Array<Record<string, unknown>> | undefined) ?? [];
      return {
        number: Number(pr.number ?? 0),
        title: String(pr.title ?? ''),
        state: String(pr.state ?? 'open'),
        author: String(user?.login ?? ''),
        createdAt: String(pr.created_at ?? ''),
        updatedAt: String(pr.updated_at ?? ''),
        mergedAt: pr.merged_at ? String(pr.merged_at) : null,
        url: String(pr.html_url ?? ''),
        additions: Number(pr.additions ?? 0),
        deletions: Number(pr.deletions ?? 0),
        changedFiles: Number(pr.changed_files ?? 0),
        comments: Number(pr.comments ?? 0),
        reviewComments: Number(pr.review_comments ?? 0),
        labels: labels.map((l) => String(l.name ?? '')),
      };
    });
  } catch (err) {
    logger.error({ err, repoUrl }, 'GitHub PRs API error');
    return null;
  }
}
