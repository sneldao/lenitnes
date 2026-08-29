import { describe, expect, it } from 'vitest';
import { collectAdoptionHistory, GITHUB_API_BASE } from '../src/services/oss-adoption/collector.js';
import type { CorpusRepository, PackageCompanyMapping } from '../src/services/oss-adoption/types.js';

// ── Mock fetch helpers ────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '9999999999', ...headers },
  });
}

function textResponse(text: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(text, {
    status,
    headers: { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '9999999999', ...headers },
  });
}

interface RouteEntry {
  test: (url: URL) => boolean;
  handler: (url: URL) => Response;
}

function makeFetch(routes: RouteEntry[]): typeof fetch {
  const fn: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? new URL(input) : new URL((input as Request).url);
    for (const route of routes) {
      if (route.test(url)) return route.handler(url);
    }
    return jsonResponse({ message: `unexpected: ${url.pathname}` }, 500);
  };
  return fn;
}

function repoInfoRoute(owner: string, repo: string, overrides?: Partial<{ defaultBranch: string; archived: boolean }>): RouteEntry {
  return {
    test: (url) => url.pathname === `/repos/${owner}/${repo}` && url.searchParams.size === 0,
    handler: () => jsonResponse({ default_branch: overrides?.defaultBranch ?? 'main', archived: overrides?.archived ?? false, license: { spdx_id: 'MIT' } }),
  };
}

function commitsRoute(
  owner: string,
  repo: string,
  path: string,
  commits: Array<{ sha: string; date: string }>,
  overrides?: { failOnPage?: number; status?: number },
): RouteEntry {
  return {
    test: (url) => {
      if (url.pathname !== `/repos/${owner}/${repo}/commits`) return false;
      return url.searchParams.get('path') === path;
    },
    handler: (url) => {
      const page = Number(url.searchParams.get('page') ?? '1');
      if (overrides?.failOnPage === page) {
        return jsonResponse({ message: 'rate limited' }, overrides.status ?? 403, { 'x-ratelimit-remaining': '0', 'retry-after': '0' });
      }
      const perPage = Number(url.searchParams.get('per_page') ?? '100');
      const pageStart = (page - 1) * perPage;
      const pageEnd = pageStart + perPage;
      const pageCommits = commits.slice(pageStart, pageEnd);
      return jsonResponse(
        pageCommits.map((c) => ({
          sha: c.sha,
          commit: { author: { name: 'Test', date: c.date } },
          html_url: `https://github.com/${owner}/${repo}/commit/${c.sha}`,
        })),
      );
    },
  };
}

function contentsRoute(owner: string, repo: string, path: string, contentBySha: Record<string, string | null>): RouteEntry {
  return {
    test: (url) => url.pathname === `/repos/${owner}/${repo}/contents/${path}`,
    handler: (url) => {
      const ref = url.searchParams.get('ref') ?? '';
      const content = contentBySha[ref];
      if (content === undefined) return jsonResponse({ message: 'sha not found' }, 404);
      if (content === null) return jsonResponse({ message: 'not found' }, 404);
      return textResponse(content);
    },
  };
}

// ── Sample corpus helpers ─────────────────────────────────────────────

function sampleRepo(overrides: Partial<CorpusRepository> & { slug: string }): CorpusRepository {
  return {
    companyTargets: [],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Test',
    sourceUrl: `https://github.com/${overrides.slug}`,
    defaultBranch: 'main',
    mappingRefs: [],
    ...overrides,
  };
}

const sampleMappings: PackageCompanyMapping[] = [
  {
    ref: 'azure-sdk-js',
    ecosystem: 'npm',
    packageName: '@azure/*',
    companyName: 'Microsoft',
    ticker: 'MSFT',
    mappingConfidence: 'high',
    materiality: 'supporting',
    tradable: true,
    rationale: 'Test mapping',
    sourceUrl: 'https://github.com/Azure/azure-sdk-for-js',
  },
  {
    ref: 'azure-sdk-python',
    ecosystem: 'python',
    packageName: 'azure-storage-blob',
    companyName: 'Microsoft',
    ticker: 'MSFT',
    mappingConfidence: 'high',
    materiality: 'supporting',
    tradable: true,
    rationale: 'Test mapping (python Azure SDK)',
    sourceUrl: 'https://github.com/Azure/azure-sdk-for-python',
  },
];

// ── Tests ─────────────────────────────────────────────────────────────

describe('OSS adoption collector', () => {
  it('collects additions and upgrades, mapping known packages to companies', async () => {
    const repo = sampleRepo({ slug: 'Azure/azure-sdk-for-js', expectedManifests: ['package.json'] });
    const fetch = makeFetch([
      repoInfoRoute('Azure', 'azure-sdk-for-js'),
      commitsRoute('Azure', 'azure-sdk-for-js', 'package.json', [
        { sha: 'bbb', date: '2026-02-01T00:00:00Z' },
        { sha: 'aaa', date: '2026-01-01T00:00:00Z' },
      ]),
      contentsRoute('Azure', 'azure-sdk-for-js', 'package.json', {
        aaa: JSON.stringify({ dependencies: { lodash: '4.0.0' } }),
        bbb: JSON.stringify({ dependencies: { lodash: '4.17.0', '@azure/identity': '4.0.0' } }),
      }),
    ]);

    const result = await collectAdoptionHistory({ corpus: [repo], mappings: sampleMappings, fetchImpl: fetch, maxPages: 1 });
    const q = result.qualityReport;

    expect(q.eventsExtracted).toBe(2);
    expect(q.repositoriesCompleted).toBe(1);
    expect(q.repositoriesFailed).toBe(0);
    expect(q.repositories[0].commitsExamined).toBe(2);
    expect(q.repositories[0].manifestsExamined).toBe(2);
    expect(q.repositories[0].manifestsFound).toEqual(['package.json']);
    expect(q.mappedEvents).toBe(1); // only @azure/identity maps to MSFT
    expect(q.unmappedEvents).toBe(1); // lodash is unmapped

    // Check specific events
    const events = result.events;
    const added = events.find((e) => e.change === 'added');
    expect(added).toBeDefined();
    expect(added!.packageName).toBe('@azure/identity');
    expect(added!.companyTicker).toBe('MSFT');
    expect(added!.mappingConfidence).toBe('high');

    const upgraded = events.find((e) => e.change === 'upgraded');
    expect(upgraded).toBeDefined();
    expect(upgraded!.packageName).toBe('lodash');
    expect(upgraded!.companyTicker).toBeNull();
    expect(upgraded!.versionBefore).toBe('4.0.0');
    expect(upgraded!.versionAfter).toBe('4.17.0');
  });

  it('emits no events when the manifest is unchanged (baseline only)', async () => {
    const repo = sampleRepo({ slug: 'test/onecommits', expectedManifests: ['package.json'] });
    const fetch = makeFetch([
      repoInfoRoute('test', 'onecommits'),
      commitsRoute('test', 'onecommits', 'package.json', [
        { sha: 'aaa', date: '2026-01-01T00:00:00Z' },
      ]),
      contentsRoute('test', 'onecommits', 'package.json', {
        aaa: JSON.stringify({ dependencies: { lodash: '4.0.0' } }),
      }),
    ]);

    const result = await collectAdoptionHistory({ corpus: [repo], mappings: sampleMappings, fetchImpl: fetch, maxPages: 1 });
    expect(result.events).toHaveLength(0);
    expect(result.qualityReport.eventsExtracted).toBe(0);
    expect(result.qualityReport.repositories[0].commitsExamined).toBe(1);
    expect(result.qualityReport.repositories[0].manifestsExamined).toBe(1);
  });

  it('records truncated-history warnings when the page cap is reached', async () => {
    const repo = sampleRepo({ slug: 'high/activity', expectedManifests: ['package.json'] });
    // Generate 150 commits (exceeds 1 page of 100)
    const commits = Array.from({ length: 150 }, (_, i) => ({
      sha: `sha-${String(i).padStart(3, '0')}`,
      date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }));
    const contentBySha: Record<string, string> = {};
    for (const c of commits) {
      contentBySha[c.sha] = JSON.stringify({ dependencies: { lodash: '4.0.0' } });
    }
    const fetch = makeFetch([
      repoInfoRoute('high', 'activity'),
      commitsRoute('high', 'activity', 'package.json', commits),
      contentsRoute('high', 'activity', 'package.json', contentBySha),
    ]);

    const result = await collectAdoptionHistory({ corpus: [repo], mappings: sampleMappings, fetchImpl: fetch, maxPages: 1 });
    expect(result.qualityReport.warnings.some((w) => w.includes('truncated history'))).toBe(true);
    expect(result.qualityReport.repositories[0].commitsExamined).toBe(100);
  });

  it('records a failed repo and does not crash the run', async () => {
    const repo = sampleRepo({ slug: 'ghost/notfound', expectedManifests: ['package.json'] });
    const fetch = makeFetch([
      {
        test: (url) => url.pathname === '/repos/ghost/notfound' && url.searchParams.size === 0,
        handler: () => jsonResponse({ message: 'not found' }, 404),
      },
    ]);

    const result = await collectAdoptionHistory({ corpus: [repo], mappings: sampleMappings, fetchImpl: fetch, maxPages: 1 });
    const q = result.qualityReport;
    expect(q.repositoriesFailed).toBe(1);
    expect(q.repositoriesCompleted).toBe(0);
    expect(q.repositories[0].status).toBe('failed');
    expect(q.repositories[0].error).toContain('HTTP 404');
    expect(q.warnings.some((w) => w.includes('repo info fetch failed'))).toBe(true);
    expect(result.events).toHaveLength(0);
  });

  it('retries on rate-limit (403) and succeeds', async () => {
    const repo = sampleRepo({ slug: 'try/again', expectedManifests: ['package.json'] });
    let callCount = 0;
    const fetch = makeFetch([
      repoInfoRoute('try', 'again'),
      {
        test: (url) => url.pathname === `/repos/try/again/commits` && url.searchParams.get('path') === 'package.json',
        handler: () => {
          callCount++;
          if (callCount === 1) {
            return jsonResponse({ message: 'rate limited' }, 403, { 'x-ratelimit-remaining': '0', 'retry-after': '0', 'x-ratelimit-limit': '60', 'x-ratelimit-reset': '9999999999' });
          }
          return jsonResponse([
            { sha: 'aaa', commit: { author: { name: 'Test', date: '2026-01-01T00:00:00Z' } }, html_url: 'https://github.com/try/again/commit/aaa' },
          ]);
        },
      },
      contentsRoute('try', 'again', 'package.json', {
        aaa: JSON.stringify({ dependencies: { lodash: '4.0.0' } }),
      }),
    ]);

    const result = await collectAdoptionHistory({ corpus: [repo], mappings: sampleMappings, fetchImpl: fetch, maxPages: 1 });
    expect(result.qualityReport.repositoriesCompleted).toBe(1);
    expect(result.qualityReport.repositories[0].commitsExamined).toBe(1);
    expect(callCount).toBe(2); // retried once
    // Rate-limit snapshot should be captured from the successful response
    expect(result.runManifest.rateLimit).toBeTruthy();
    expect(result.runManifest.rateLimit!.remaining).toBe(4999);
  });

  it('detects manifest deletions (404 contents)', async () => {
    const repo = sampleRepo({ slug: 'del/eted', expectedManifests: ['package.json'] });
    const fetch = makeFetch([
      repoInfoRoute('del', 'eted'),
      commitsRoute('del', 'eted', 'package.json', [
        { sha: 'bbb', date: '2026-02-01T00:00:00Z' },
        { sha: 'aaa', date: '2026-01-01T00:00:00Z' },
      ]),
      contentsRoute('del', 'eted', 'package.json', {
        aaa: JSON.stringify({ dependencies: { lodash: '4.0.0' } }),
        bbb: null, // file deleted at this commit
      }),
    ]);

    const result = await collectAdoptionHistory({ corpus: [repo], mappings: sampleMappings, fetchImpl: fetch, maxPages: 1 });
    const events = result.events;
    expect(events.length).toBeGreaterThan(0);
    const removed = events.find((e) => e.change === 'removed');
    expect(removed).toBeDefined();
    expect(removed!.packageName).toBe('lodash');
    // The manifest deletion at bbb means snapshot is empty → diff from aaa→bbb shows lodash removed
  });

  it('supports multiple expected manifests per repo', async () => {
    const repo = sampleRepo({
      slug: 'multi/manifest',
      expectedManifests: ['package.json', 'requirements.txt'],
    });
    const fetch = makeFetch([
      repoInfoRoute('multi', 'manifest'),
      // package.json: 1 commit, no changes
      commitsRoute('multi', 'manifest', 'package.json', [
        { sha: 'pkg', date: '2026-01-01T00:00:00Z' },
      ]),
      contentsRoute('multi', 'manifest', 'package.json', {
        pkg: JSON.stringify({ dependencies: { lodash: '4.0.0' } }),
      }),
      // requirements.txt: 2 commits, adding a mapped package
      commitsRoute('multi', 'manifest', 'requirements.txt', [
        { sha: 'req2', date: '2026-02-01T00:00:00Z' },
        { sha: 'req1', date: '2026-01-01T00:00:00Z' },
      ]),
      contentsRoute('multi', 'manifest', 'requirements.txt', {
        req1: 'numpy==1.0.0\n',
        req2: 'numpy==1.0.0\nazure-storage-blob==12.0.0\n',
      }),
    ]);

    const result = await collectAdoptionHistory({ corpus: [repo], mappings: sampleMappings, fetchImpl: fetch, maxPages: 1 });
    const q = result.qualityReport;
    expect(q.repositories[0].manifestsFound).toEqual(['package.json', 'requirements.txt']);
    expect(q.repositories[0].manifestsExamined).toBe(3); // 1 pkg + 2 req
    expect(q.repositories[0].commitsExamined).toBe(3);
    // The requirements.txt diff adds azure-storage-blob → mapped to MSFT
    const added = result.events.find((e) => e.change === 'added' && e.packageName === 'azure-storage-blob');
    expect(added).toBeDefined();
    expect(added!.companyTicker).toBe('MSFT');
  });

  it('emits run manifest with observation window and run metadata', async () => {
    const repo = sampleRepo({ slug: 'meta/data', expectedManifests: ['package.json'] });
    const fetch = makeFetch([
      repoInfoRoute('meta', 'data'),
      commitsRoute('meta', 'data', 'package.json', [
        { sha: 'aaa', date: '2026-01-01T00:00:00Z' },
      ]),
      contentsRoute('meta', 'data', 'package.json', {
        aaa: JSON.stringify({ dependencies: {} }),
      }),
    ]);

    const since = '2026-01-01T00:00:00Z';
    const until = '2026-07-01T00:00:00Z';
    const result = await collectAdoptionHistory({
      corpus: [repo],
      mappings: sampleMappings,
      fetchImpl: fetch,
      maxPages: 1,
      sinceIso: since,
      untilIso: until,
    });

    expect(result.runManifest.runId).toMatch(/^oss-adoption-/);
    expect(result.runManifest.corpusVersion).toBe('2026-08-29-pilot-v2');
    expect(result.runManifest.observationWindow.sinceIso).toBe(since);
    expect(result.runManifest.observationWindow.untilIso).toBe(until);
    expect(result.runManifest.githubTokenConfigured).toBe(false);
    expect(result.runManifest.repositories).toHaveLength(1);
    expect(result.runManifest.rateLimit).toBeTruthy();
  });
});
