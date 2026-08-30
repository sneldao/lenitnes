/**
 * OSS adoption — reproducible GitHub history collection (G1).
 *
 * Walks each curated corpus repository over an explicit UTC observation
 * window, fetches the commit history for each expected manifest path,
 * parses the manifest at each commit, and diffs consecutive snapshots to
 * emit normalized DependencyEvents.
 *
 * Contract (docs/oss-adoption-corpus.md):
 *  - A failed fetch is a missing observation, never silent zero adoption.
 *  - Truncated history and rate limits are recorded as warnings.
 *  - The first in-window snapshot is a baseline (no events from it), so
 *    packages added before the window are not mislabeled as added.
 *
 * The collector is pure logic over an injected `fetch`; auth headers are
 * the caller's responsibility (see scripts/collect-oss-adoption.ts), which
 * keeps the unit tests free of network calls and token handling.
 */
import type {
  CorpusRepository,
  DependencyEvent,
  OssQualityReport,
  PackageCompanyMapping,
} from './types.js';
import { OSS_CORPUS, OSS_CORPUS_VERSION, OSS_PACKAGE_MAPPINGS } from './corpus.js';
import { diffDependencySnapshots, parseDependencyManifest } from './manifests.js';
import {
  buildQualityReport,
  normalizeDependencyEvents,
  type RawDependencyChange,
} from './normalize.js';

export const GITHUB_API_BASE = 'https://api.github.com';
const DEFAULT_MAX_PAGES = 3; // 3 × 100 commits per manifest path, mirroring github.ts
const MAX_RETRIES = 2;

export interface CollectAdoptionOptions {
  /** Defaults to OSS_CORPUS. */
  corpus?: CorpusRepository[];
  /** Run label written to the manifest/quality report. Defaults to OSS_CORPUS_VERSION. */
  corpusVersion?: string;
  /** Defaults to OSS_PACKAGE_MAPPINGS. */
  mappings?: PackageCompanyMapping[];
  /** UTC start of the observation window. Default: now − 12 months. */
  sinceIso?: string;
  /** UTC end of the observation window. Default: now. */
  untilIso?: string;
  /** Max pages of 100 commits per manifest path. Default 3. */
  maxPages?: number;
  /** Injectable fetch (auth-wrapped by the caller, or mocked in tests). */
  fetchImpl?: typeof fetch;
  /** Optional progress sink; defaults to a no-op. */
  onProgress?: (message: string) => void;
}

export interface OssRateLimitSnapshot {
  limit: number;
  remaining: number;
  resetAt: string;
}

export interface RunRepositoryRecord {
  slug: string;
  status: 'completed' | 'failed';
  defaultBranch: string | null;
  manifestsFound: string[];
  manifestsExamined: number;
  commitsExamined: number;
  eventsExtracted: number;
  error: string | null;
}

export interface OssAdoptionRunManifest {
  runId: string;
  corpusVersion: string;
  observationWindow: { sinceIso: string; untilIso: string };
  runStartedAt: string;
  runFinishedAt: string;
  githubTokenConfigured: boolean;
  rateLimit: OssRateLimitSnapshot | null;
  repositories: RunRepositoryRecord[];
  warnings: string[];
}

export interface OssAdoptionRunResult {
  runManifest: OssAdoptionRunManifest;
  events: DependencyEvent[];
  qualityReport: OssQualityReport;
}

/** Parse owner/repo from a bare "owner/repo" slug (corpus entries use this form). */
function parseSlug(slug: string): { owner: string; repo: string } | null {
  const match = slug.match(/^([\w.-]+)\/([\w.-]+)$/);
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/, '') } : null;
}

interface ManifestHistoryEntry {
  sha: string;
  committedAt: string;
  content: string | null; // null = manifest absent at this commit (deletion or rename)
  error: string | null;
}

/** Mutable rate-limit state shared across all fetches in a run. */
interface RateLimitTracker {
  snapshot: OssRateLimitSnapshot | null;
}

function captureRateLimit(tracker: RateLimitTracker, res: Response): void {
  const limit = res.headers.get('x-ratelimit-limit');
  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  if (!limit || !remaining || !reset) return;
  tracker.snapshot = {
    limit: Number(limit),
    remaining: Number(remaining),
    resetAt: new Date(Number(reset) * 1000).toISOString(),
  };
}

/**
 * Fetch a URL with a bounded retry on 429 (secondary rate limit) and 403
 * rate-limit responses. Uses the Retry-After header when present, else a
 * short backoff. Always returns the raw Response (even on persistent
 * failure) so callers can read status + headers; returns null only on
 * network error. `init` is forwarded to the underlying fetch.
 */
async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  maxRetries: number,
  tracker?: RateLimitTracker,
  init?: RequestInit,
): Promise<Response | null> {
  let response: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, init);
    } catch {
      return null; // network-level failure; caller records the error
    }
    response = res;
    if (tracker) captureRateLimit(tracker, res);
    const retryable =
      res.status === 429 ||
      (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
    if (!retryable || attempt === maxRetries) return res;
    // When the hourly bucket is exhausted, wait for the actual reset instead
    // of the short backoff — otherwise every request fails until the window
    // rolls over and the run grinds through thousands of doomed attempts.
    const remaining = res.headers.get('x-ratelimit-remaining');
    const resetUnix = Number(res.headers.get('x-ratelimit-reset') ?? '');
    const retryAfter = Number(res.headers.get('retry-after') ?? '');
    const waitMs =
      remaining === '0' && resetUnix > 0 && resetUnix < Date.now() / 1000 + 7200
        ? Math.min(3600_000, Math.max(0, resetUnix * 1000 - Date.now()) + 1000)
        : Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : (attempt + 1) * 1000;
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, waitMs)));
  }
  return response;
}

/** Fetch repo metadata to resolve/verify the default branch. */
async function fetchRepoInfo(
  fetchImpl: typeof fetch,
  owner: string,
  repo: string,
  tracker: RateLimitTracker,
): Promise<{ defaultBranch: string; archived: boolean; error: string | null }> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
  const res = await fetchWithRetry(fetchImpl, url, MAX_RETRIES, tracker);
  if (!res) return { defaultBranch: '', archived: false, error: 'network error' };
  if (!res.ok) return { defaultBranch: '', archived: false, error: `repo info HTTP ${res.status}` };
  const data = (await res.json()) as { default_branch?: string; archived?: boolean };
  return {
    defaultBranch: data.default_branch ?? '',
    archived: Boolean(data.archived),
    error: null,
  };
}

/** Fetch commits that touched a manifest path, newest-first, paginated. */
async function fetchPathCommits(
  fetchImpl: typeof fetch,
  owner: string,
  repo: string,
  path: string,
  sinceIso: string,
  untilIso: string,
  maxPages: number,
  tracker: RateLimitTracker,
): Promise<{
  commits: Array<{ sha: string; date: string }>;
  truncated: boolean;
  error: string | null;
}> {
  const commits: Array<{ sha: string; date: string }> = [];
  let truncated = false;
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`/repos/${owner}/${repo}/commits`, GITHUB_API_BASE);
    url.searchParams.set('path', path);
    url.searchParams.set('since', sinceIso);
    url.searchParams.set('until', untilIso);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    const res = await fetchWithRetry(fetchImpl, url.toString(), MAX_RETRIES, tracker);
    if (!res) return { commits, truncated, error: 'network error' };
    if (!res.ok) return { commits, truncated, error: `commits HTTP ${res.status}` };
    const data = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const c of data) {
      const author = (c.commit as Record<string, unknown> | undefined)?.author as
        | Record<string, unknown>
        | undefined;
      commits.push({ sha: String(c.sha ?? ''), date: String(author?.date ?? '') });
    }
    if (data.length < 100) break;
    if (page === maxPages) truncated = true;
  }
  return { commits, truncated, error: null };
}

/** Fetch the raw manifest content at a specific commit ref. */
async function fetchManifestAt(
  fetchImpl: typeof fetch,
  owner: string,
  repo: string,
  path: string,
  sha: string,
  tracker: RateLimitTracker,
): Promise<{ content: string | null; error: string | null }> {
  const url = new URL(`/repos/${owner}/${repo}/contents/${path}`, GITHUB_API_BASE);
  url.searchParams.set('ref', sha);
  // The contents endpoint returns the base64 JSON wrapper by default; the
  // raw media type returns the file bytes, which is what the manifest
  // parsers consume. Callers must preserve this Accept header.
  const res = await fetchWithRetry(fetchImpl, url.toString(), MAX_RETRIES, tracker, {
    headers: { Accept: 'application/vnd.github.raw' },
  });
  if (!res) return { content: null, error: 'network error' };
  if (res.status === 404) return { content: null, error: null }; // absent at this ref — a deletion
  if (!res.ok) return { content: null, error: `contents HTTP ${res.status}` };
  return { content: await res.text(), error: null };
}

interface RepoCollection {
  record: RunRepositoryRecord;
  rawEvents: RawDependencyChange[];
  warnings: string[];
}

/**
 * Collect history for a single corpus repository. Failures are captured in
 * the returned record rather than thrown, so one bad repo cannot abort the
 * run. Snapshot diffs only compare consecutive in-window commits, so a
 * package added before the window is not reported as added.
 */
async function collectRepository(
  repo: CorpusRepository,
  opts: Required<Pick<CollectAdoptionOptions, 'fetchImpl' | 'sinceIso' | 'untilIso' | 'maxPages'>>,
  tracker: RateLimitTracker,
): Promise<RepoCollection> {
  const parsed = parseSlug(repo.slug);
  const record: RunRepositoryRecord = {
    slug: repo.slug,
    status: 'completed',
    defaultBranch: repo.defaultBranch ?? null,
    manifestsFound: [],
    manifestsExamined: 0,
    commitsExamined: 0,
    eventsExtracted: 0,
    error: null,
  };
  const warnings: string[] = [];
  if (!parsed) {
    record.status = 'failed';
    record.error = `invalid repository slug: ${repo.slug}`;
    return { record, rawEvents: [], warnings };
  }

  const info = await fetchRepoInfo(opts.fetchImpl, parsed.owner, parsed.repo, tracker);
  if (info.error) {
    record.status = 'failed';
    record.error = info.error;
    warnings.push(`repo info fetch failed for ${repo.slug}: ${info.error}`);
    return { record, rawEvents: [], warnings };
  }
  if (info.defaultBranch && record.defaultBranch !== info.defaultBranch) {
    warnings.push(
      `default branch for ${repo.slug} is '${info.defaultBranch}' (corpus records '${record.defaultBranch}')`,
    );
    record.defaultBranch = info.defaultBranch;
  }
  if (info.archived) warnings.push(`repository archived: ${repo.slug}`);

  const rawEvents: RawDependencyChange[] = [];

  for (const manifestPath of repo.expectedManifests) {
    const { commits, truncated, error } = await fetchPathCommits(
      opts.fetchImpl,
      parsed.owner,
      parsed.repo,
      manifestPath,
      opts.sinceIso,
      opts.untilIso,
      opts.maxPages,
      tracker,
    );
    if (error) {
      record.status = 'failed';
      record.error = `manifest history (${manifestPath}): ${error}`;
      warnings.push(`manifest history fetch failed for ${repo.slug}:${manifestPath}: ${error}`);
      continue;
    }
    if (truncated) {
      warnings.push(
        `truncated history for ${repo.slug}:${manifestPath} (capped at ${opts.maxPages} pages)`,
      );
    }
    record.commitsExamined += commits.length;
    if (commits.length === 0) continue;
    record.manifestsFound.push(manifestPath);

    // Chronological order; first snapshot is a baseline (no events from it).
    const chrono = [...commits].reverse();
    const entries: ManifestHistoryEntry[] = [];
    for (const commit of chrono) {
      const { content, error: fetchError } = await fetchManifestAt(
        opts.fetchImpl,
        parsed.owner,
        parsed.repo,
        manifestPath,
        commit.sha,
        tracker,
      );
      if (fetchError) {
        record.status = 'failed';
        record.error = `manifest blob (${manifestPath}@${commit.sha.slice(0, 7)}): ${fetchError}`;
        warnings.push(
          `manifest blob fetch failed for ${repo.slug}:${manifestPath}@${commit.sha.slice(0, 7)}: ${fetchError}`,
        );
        continue;
      }
      record.manifestsExamined += 1;
      entries.push({ sha: commit.sha, committedAt: commit.date, content, error: null });
    }
    if (entries.length === 0) continue;

    const snapshots = entries.map((entry) => ({
      commitSha: entry.sha,
      committedAt: entry.committedAt,
      snapshot: entry.content ? parseDependencyManifest(manifestPath, entry.content) : [],
    }));

    for (let i = 1; i < snapshots.length; i++) {
      const before = snapshots[i - 1].snapshot;
      const after = snapshots[i].snapshot;
      if (before.length === 0 && after.length === 0) continue;
      for (const change of diffDependencySnapshots(before, after)) {
        rawEvents.push({
          repository: repo.slug,
          commitSha: snapshots[i].commitSha,
          committedAt: snapshots[i].committedAt,
          manifestPath,
          ecosystem: change.ecosystem,
          packageName: change.packageName,
          change: change.change,
          versionBefore: change.versionBefore,
          versionAfter: change.versionAfter,
          sourceUrl: `https://github.com/${parsed.owner}/${parsed.repo}/commit/${snapshots[i].commitSha}`,
        });
      }
    }
  }

  record.eventsExtracted = rawEvents.length;
  return { record, rawEvents, warnings };
}

/**
 * Collect normalized OSS-adoption dependency events across the curated
 * corpus over an explicit UTC window, and emit the run manifest + quality
 * report. Never throws for per-repo failures — they are recorded.
 */
export async function collectAdoptionHistory(
  options: CollectAdoptionOptions = {},
): Promise<OssAdoptionRunResult> {
  const corpus = options.corpus ?? OSS_CORPUS;
  const corpusVersion = options.corpusVersion ?? OSS_CORPUS_VERSION;
  const mappings = options.mappings ?? OSS_PACKAGE_MAPPINGS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const untilIso = options.untilIso ?? new Date().toISOString();
  const sinceIso =
    options.sinceIso ??
    new Date(Date.parse(untilIso) - 12 * 30 * 24 * 60 * 60 * 1000).toISOString();
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const onProgress = options.onProgress ?? (() => {});
  const runStartedAt = new Date().toISOString();
  const runId = `oss-adoption-${Date.now()}`;
  const tracker: RateLimitTracker = { snapshot: null };

  const opts = { fetchImpl, sinceIso, untilIso, maxPages };
  const allRaw: RawDependencyChange[] = [];
  const records: RunRepositoryRecord[] = [];
  const warnings: string[] = [];

  for (const repo of corpus) {
    onProgress(`collecting ${repo.slug}…`);
    const result = await collectRepository(repo, opts, tracker);
    records.push(result.record);
    warnings.push(...result.warnings);
    allRaw.push(...result.rawEvents);
  }

  const { events, duplicateEventsRemoved } = normalizeDependencyEvents(allRaw, mappings);
  const repositories = records.map((r) => ({
    slug: r.slug,
    status: r.status,
    defaultBranch: r.defaultBranch,
    manifestsFound: r.manifestsFound,
    commitsExamined: r.commitsExamined,
    manifestsExamined: r.manifestsExamined,
    eventsExtracted: r.eventsExtracted,
    error: r.error,
  }));

  const qualityReport: OssQualityReport = buildQualityReport({
    corpusVersion,
    runStartedAt,
    runFinishedAt: new Date().toISOString(),
    repositories,
    events,
    duplicateEventsRemoved,
    warnings,
  });

  const runManifest: OssAdoptionRunManifest = {
    runId,
    corpusVersion,
    observationWindow: { sinceIso, untilIso },
    runStartedAt,
    runFinishedAt: qualityReport.runFinishedAt,
    githubTokenConfigured: false, // set by the CLI after wrapping auth
    rateLimit: tracker.snapshot,
    repositories: records,
    warnings,
  };

  return { runManifest, events, qualityReport };
}
