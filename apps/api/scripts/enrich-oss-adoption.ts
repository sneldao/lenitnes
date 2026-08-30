#!/usr/bin/env node
/**
 * OSS adoption — G2 enrichment: fetch commit messages for every mapped event.
 *
 * The collector records package-level change events but not *why* the change
 * happened. G2 agent scoring needs the commit message (and ideally the commit
 * diff stat) to judge whether a dependency change is strategic adoption
 * (migrating to a new SDK, adopting a new service) or routine maintenance
 * (security bump, version pin, Renovate noise).
 *
 * This script reads a collected run JSON, finds every unique (repository,
 * commitSha) pair among MAPPED events, fetches the commit message + author
 * date via the GitHub commits API, and writes an enriched run JSON:
 *   <out>/<runId>.enriched.json
 *
 * The enriched JSON has the same shape as the collector output, except each
 * mapped event additionally carries:
 *   commitMessage: string
 *   commitDate:    string (ISO)
 *   commitAuthor:  string | null
 *   commitStats:   { additions, deletions, total } | null
 *
 * Rate limiting: one GET per unique commit (~217 for pilot-v4). Uses
 * GITHUB_TOKEN from the environment. Missing commits are recorded as nulls
 * and left in the output (they simply score as neutral later).
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx npx tsx scripts/enrich-oss-adoption.ts \
 *     --input /tmp/oss-adoption-v4/oss-adoption-*.json \
 *     --out /tmp/oss-adoption-v4
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DependencyEvent } from '../src/services/oss-adoption/types.js';

interface Args {
  input: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let input = '';
  let out = '';
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--input' && value) input = value;
    else if (key === '--out' && value) out = value;
    else if (key === '--help') {
      console.log('Usage: npx tsx scripts/enrich-oss-adoption.ts --input <run.json> [--out <dir>]');
      process.exit(0);
    }
  }
  if (!input) {
    console.error('Provide --input <run.json> (a collector run manifest JSON).');
    process.exit(1);
  }
  return { input, out: out || path.dirname(path.resolve(input)) };
}

async function fetchCommit(
  token: string,
  repo: string,
  sha: string,
): Promise<{
  message: string;
  date: string;
  author: string | null;
  stats: { additions: number; deletions: number; total: number } | null;
}> {
  const url = `https://api.github.com/repos/${repo}/commits/${sha}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'lenitnes/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) return { message: '', date: '', author: null, stats: null };
  const d = (await res.json()) as {
    commit?: { message?: string; committer?: { date?: string }; author?: { name?: string } };
    author?: { login?: string } | null;
    stats?: { additions?: number; deletions?: number; total?: number };
  };
  const stats = d.stats
    ? {
        additions: d.stats.additions ?? 0,
        deletions: d.stats.deletions ?? 0,
        total: d.stats.total ?? 0,
      }
    : null;
  return {
    message: d.commit?.message ?? '',
    date: d.commit?.committer?.date ?? '',
    author: d.author?.login ?? d.commit?.author?.name ?? null,
    stats,
  };
}

async function main(): Promise<void> {
  const { input, out } = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN ?? '';

  const run = JSON.parse(fs.readFileSync(input, 'utf8')) as {
    runManifest: {
      corpusVersion: string;
      observationWindow: { sinceIso: string; untilIso: string };
    };
    events: DependencyEvent[];
    qualityReport: unknown;
  };

  const mapped = run.events.filter((e) => e.companyTicker);
  const keys = [...new Set(mapped.map((e) => `${e.repository}@${e.commitSha}`))];
  console.log(`enriching ${keys.length} unique commits (${mapped.length} mapped events)`);
  if (!token) console.warn('WARNING: no GITHUB_TOKEN — commits will be skipped as null');

  const cache = new Map<
    string,
    {
      message: string;
      date: string;
      author: string | null;
      stats: { additions: number; deletions: number; total: number } | null;
    }
  >();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const [repo, sha] = key.split('@');
    const c = await fetchCommit(token, repo, sha!);
    cache.set(key, c);
    if ((i + 1) % 25 === 0 || i === keys.length - 1) {
      console.log(`  ${i + 1}/${keys.length}`);
    }
    await new Promise((r) => setTimeout(r, 60)); // gentle pacing; ~6 requests/s max
  }

  const enriched: DependencyEvent[] = run.events.map((e) => {
    if (!e.companyTicker) return e;
    const key = `${e.repository}@${e.commitSha}`;
    const c = cache.get(key);
    return {
      ...e,
      commitMessage: c?.message ?? null,
      commitDate: c?.date ?? null,
      commitAuthor: c?.author ?? null,
    };
  });

  const runId = (run.runManifest as Record<string, unknown>).runId ?? 'enriched';
  fs.mkdirSync(path.resolve(out), { recursive: true });
  const outFile = path.join(path.resolve(out), `${runId}.enriched.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        runManifest: {
          ...run.runManifest,
          enrichedAt: new Date().toISOString(),
          enrichedCommits: keys.length,
        },
        events: enriched,
        qualityReport: run.qualityReport,
      },
      null,
      2,
    ) + '\n',
  );
  const missing = enriched.filter((e) => e.companyTicker && !e.commitMessage).length;
  console.log(`\n✓ enriched run written → ${outFile}`);
  console.log(
    `  mapped events: ${mapped.length} | enriched (with message): ${mapped.length - missing} | missing: ${missing}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
