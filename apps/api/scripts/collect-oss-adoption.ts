#!/usr/bin/env node
/**
 * OSS adoption — run the G1 history collector over the curated corpus.
 *
 * Usage:
 *   npx tsx scripts/collect-oss-adoption.ts
 *   npx tsx scripts/collect-oss-adoption.ts --since 2025-08-28T00:00:00Z --until 2026-08-28T00:00:00Z
 *   npx tsx scripts/collect-oss-adoption.ts --max-pages 5 --out /tmp/oss-adoption
 *
 * The observation window defaults to the trailing 12 months (UTC). A
 * GITHUB_TOKEN is strongly recommended: unauthenticated GitHub API access
 * is capped at 60 req/h, which will truncate the run. Failures are recorded
 * as missing observations in the quality report, never as zero adoption.
 *
 * Output: one JSON file per run at <out>/<runId>.json containing the run
 * manifest, the normalized events, and the quality report. The manifest +
 * quality report are the auditable artifact for the corpus docs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { collectAdoptionHistory, GITHUB_API_BASE } from '../src/services/oss-adoption/collector.js';
import { OSS_CORPUS } from '../src/services/oss-adoption/corpus.js';

interface CliArgs {
  since?: string;
  until?: string;
  maxPages?: number;
  out?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--since' && value) args.since = value;
    else if (key === '--until' && value) args.until = value;
    else if (key === '--max-pages' && value) args.maxPages = Number(value);
    else if (key === '--out' && value) args.out = value;
    else if (key === '--help') {
      console.log('Usage: npx tsx scripts/collect-oss-adoption.ts [--since ISO] [--until ISO] [--max-pages N] [--out DIR]');
      process.exit(0);
    }
  }
  return args;
}

function authFetch(token: string): typeof fetch {
  const wrapped: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    // Default to the standard JSON media type, but never clobber a
    // caller-provided Accept (e.g. the collector requests the raw
    // contents media type for manifest blobs).
    if (!headers.has('Accept')) headers.set('Accept', 'application/vnd.github+json');
    headers.set('User-Agent', 'lenitnes/1.0');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  return wrapped;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN ?? '';
  const outDir = path.resolve(args.out ?? 'data/oss-adoption');

  console.log(`OSS adoption collection (G1)`);
  console.log(`  corpus: ${OSS_CORPUS.length} repositories (${OSS_CORPUS.map((r) => r.slug).join(', ')})`);
  console.log(`  window: ${args.since ?? 'now−12mo'} → ${args.until ?? 'now'}`);
  console.log(`  max pages/manifest: ${args.maxPages ?? 3}`);
  console.log(`  github token: ${token ? 'configured' : 'NOT configured (60 req/h cap → likely truncation)'}`);

  const result = await collectAdoptionHistory({
    sinceIso: args.since,
    untilIso: args.until,
    maxPages: args.maxPages,
    fetchImpl: authFetch(token),
    onProgress: (msg) => console.log(`  ${msg}`),
  });

  result.runManifest.githubTokenConfigured = Boolean(token);

  fs.mkdirSync(outDir, { recursive: true });
  const runId = result.runManifest.runId;
  const outFile = path.join(outDir, `${runId}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ runManifest: result.runManifest, events: result.events, qualityReport: result.qualityReport }, null, 2) + '\n', {
    mode: 0o644,
  });

  const q = result.qualityReport;
  console.log(`\n✓ run ${runId} complete`);
  console.log(`  file: ${outFile}`);
  console.log(`  repositories: ${q.repositoriesCompleted}/${q.repositoriesRequested} completed, ${q.repositoriesFailed} failed`);
  console.log(`  commits examined: ${q.commitsExamined}`);
  console.log(`  events: ${q.eventsExtracted} (${q.mappedEvents} mapped, ${q.unmappedEvents} unmapped, ${q.duplicateEventsRemoved} dupes removed)`);
  console.log(`  confidence: ${JSON.stringify(q.mappingConfidence)}`);
  if (q.warnings.length > 0) {
    console.log(`  warnings (${q.warnings.length}):`);
    for (const warning of q.warnings) console.log(`    - ${warning}`);
  }
  if (result.runManifest.rateLimit) {
    const rl = result.runManifest.rateLimit;
    console.log(`  rate limit: ${rl.remaining}/${rl.limit} remaining, resets ${rl.resetAt}`);
  }
  console.log(`  api base: ${GITHUB_API_BASE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
