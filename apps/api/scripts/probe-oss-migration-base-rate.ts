#!/usr/bin/env node
/**
 * Migration base-rate probe — the decisive test before any changelog-anchored
 * corpus build.
 *
 * The dependency-churn surface has been tested to failure (5 corpus
 * constructions, all |r| ≤ 0.3). One remaining hypothesis: the *declared*
 * migration surface (release notes, changelogs, migration-announcement
 * commits) may contain strategic adoption events that package.json diffs
 * don't capture. This probe measures the actual base rate of such events
 * across TWO independent surfaces:
 *
 *   Surface A: Enriched commit messages from the pilot-v4 corpus (505 mapped
 *              events with commit messages, covering 29 churn-verified repos).
 *   Surface B: GitHub Releases API for the wide corpus (27 repos, 12-month
 *              window) — release note bodies scanned for migration/adoption
 *              language.
 *
 * Decision rule:
 *   Combined strategic events >= 20 → build changelog-anchored corpus
 *   Combined 16–19                  → borderline; review, weak case
 *   Combined < 16                   → stop OSS track (signal absent everywhere)
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx npx tsx scripts/probe-oss-migration-base-rate.ts \
 *     --enriched /tmp/oss-adoption-v4/oss-adoption-*.enriched.json \
 *     --out /tmp/migration-probe
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CorpusRepository, DependencyEvent } from '../src/services/oss-adoption/types.js';
import { dedupeWideCorpus } from './collect-oss-adoption-wide.js';

// ── Strategic migration detection ─────────────────────────────────────────

/** High-precision vendor migration/adoption patterns. */
const MIGRATION_PATTERNS: Array<RegExp> = [
  /migrat.*(aws|azure|gcp|google\.cloud|amazon|vertex|bedrock|sagemaker|lambda|s3)\b/i,
  /\b(switched|switching|switch)\s*to\b.*(aws|azure|gcp|google)\b/i,
  /(aws|azure|gcp|google\.cloud).*(adopt|migrat|integrat|new\s+sdk|client|provider)\b/i,
  /(added|implementing|adding).*(support|integration|compatibility).*(aws|azure|gcp|google)\b/i,
  /vendor.*(consolidation|migration|lock[- ]?in|switch)\b/i,
  /platform\s+migration.*(aws|azure|gcp)\b/i,
  /deprecat.*(sdk|client|library|service|api)\b.*(aws|azure|gcp)/i,
  /(move|migrat).*from.*(aws|azure|gcp).*to/i,
  /release\s+new\s+(sdk|client|library|integration)\b/i,
  /(announce|launch).*(sdk|integration|support).*(aws|azure|gcp|google)\b/i,
];

/** Medium-precision strategic-sounding language (no explicit vendor). */
const BROAD_STRATEGIC: Array<RegExp> = [
  /\b(migrat|adopt|transition|move\s+to|replace|switch)\b/i,
  /(breaking\s+change|backward\s+incompatible)\b.*(sdk|dep|package)/i,
  /rewrite.*(dependency|module|service|component)\b/i,
  /(architecture|new\s+arch|pkg\s+restructur)/i,
];

/** Routine noise — same families as agent-scoring. */
const ROUTINE: Array<RegExp> = [
  /\b(bump|pin|lock)\b/i,
  /\b(renovate|dependabot)\b/i,
  /chore[:\s]/i,
  /\brelease\s+(cut|prep)\b/i,
  /\b(cve|security)\b/i,
  /\brevert\b/i,
  /\brollback\b/i,
];

interface MigrationEvent {
  surface: 'commit-msg' | 'release-notes';
  source: string;
  date: string;
  text: string;
  vendorTags: string[];
  confidence: 'high' | 'medium';
}

interface ProbeReport {
  surfaceA: {
    eventsScanned: number;
    withMessage: number;
    strategic: number;
    broad: number;
    byRepo: Record<string, number>;
  };
  surfaceB: {
    reposScanned: number;
    releasesFetched: number;
    strategic: number;
    broad: number;
    byRepo: Record<string, number>;
  };
  combinedStrategic: number;
  monthsWithEvents: number;
  events: MigrationEvent[];
  recommendation: string;
}

/** Extract vendor tags + confidence from a text snippet. */
function scanText(
  text: string,
  source: string,
  date: string,
  surface: 'commit-msg' | 'release-notes',
): MigrationEvent[] {
  if (!text || ROUTINE.some((p) => p.test(text))) return [];

  const vendorTags: string[] = [];
  if (/\baws\b/i.test(text)) vendorTags.push('AMZN');
  if (/(azure|microsoft)/i.test(text)) vendorTags.push('MSFT');
  if (/\b(gcp|google\.cloud)\b/i.test(text)) vendorTags.push('GOOGL');

  if (MIGRATION_PATTERNS.some((p) => p.test(text))) {
    return [{ surface, source, date, text: text.slice(0, 300), vendorTags, confidence: 'high' }];
  }
  if (BROAD_STRATEGIC.some((p) => p.test(text))) {
    return [{ surface, source, date, text: text.slice(0, 300), vendorTags, confidence: 'medium' }];
  }
  return [];
}

// ── Surface A: enriched commit messages ───────────────────────────────────

function scanEnrichedEvents(events: DependencyEvent[]) {
  const byRepo: Record<string, number> = {};
  const found: MigrationEvent[] = [];
  let strategic = 0;
  let broad = 0;
  let withMessage = 0;

  for (const e of events) {
    const msg = (e as unknown as { commitMessage?: string | null }).commitMessage;
    if (!msg) continue;
    withMessage++;
    for (const m of scanText(msg, e.repository, e.committedAt, 'commit-msg')) {
      found.push(m);
      if (m.confidence === 'high') {
        strategic++;
        byRepo[e.repository] = (byRepo[e.repository] ?? 0) + 1;
      } else {
        broad++;
      }
    }
  }

  return { strategic, broad, withMessage, byRepo, events: found };
}

// ── Surface B: GitHub Releases ────────────────────────────────────────────

async function fetchReleases(
  fetchImpl: typeof fetch,
  owner: string,
  repo: string,
  sinceIso: string,
): Promise<Array<{ name: string; body: string; publishedAt: string }>> {
  const releases: Array<{ name: string; body: string; publishedAt: string }> = [];
  const since = new Date(sinceIso).getTime();

  for (let page = 1; page <= 10; page++) {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100&page=${page}`;
    const res = await fetchImpl(url);
    if (!res || !res.ok) break;
    const data = (await res.json()) as Array<{
      name: string | null;
      body: string | null;
      published_at: string | null;
    }>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const r of data) {
      const at = (r.published_at ?? '').slice(0, 10);
      if (at && new Date(`${at}T00:00:00Z`).getTime() < since) return releases; // past window
      const text = [r.name ?? '', r.body ?? ''].join('\n');
      if (text.trim()) {
        releases.push({
          name: (r.name ?? '').slice(0, 200),
          body: (r.body ?? '').slice(0, 5000),
          publishedAt: at,
        });
      }
    }
    if (data.length < 100) break;
  }
  return releases;
}

async function scanReleases(fetchImpl: typeof fetch, corpus: CorpusRepository[], sinceIso: string) {
  const byRepo: Record<string, number> = {};
  const found: MigrationEvent[] = [];
  let strategic = 0;
  let broad = 0;
  let releasesFetched = 0;
  let reposScanned = 0;

  for (const repo of corpus) {
    const parts = repo.slug.split('/');
    if (parts.length !== 2) continue;
    reposScanned++;
    const releases = await fetchReleases(fetchImpl, parts[0], parts[1], sinceIso);
    releasesFetched += releases.length;
    for (const r of releases) {
      const text = [r.name, r.body].join('\n');
      for (const m of scanText(text, repo.slug, r.publishedAt, 'release-notes')) {
        found.push(m);
        if (m.confidence === 'high') {
          strategic++;
          byRepo[repo.slug] = (byRepo[repo.slug] ?? 0) + 1;
        } else {
          broad++;
        }
      }
    }
  }

  return { reposScanned, releasesFetched, strategic, broad, byRepo, events: found };
}

// ── Auth fetch wrapper ────────────────────────────────────────────────────

function authFetch(token: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('User-Agent', 'lenitnes/1.0');
    headers.set('Accept', 'application/vnd.github+json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let enrichedPath = '';
  let outDir = '/tmp/migration-probe';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--enriched' && args[i + 1]) {
      enrichedPath = args[i + 1];
      i++;
    } else if (args[i] === '--out' && args[i + 1]) {
      outDir = args[i + 1];
      i++;
    } else if (args[i] === '--help') {
      console.log(
        'Usage: GITHUB_TOKEN=xxx npx tsx scripts/probe-oss-migration-base-rate.ts --enriched <run.json> [--out dir]',
      );
      process.exit(0);
    }
  }

  const token = process.env.GITHUB_TOKEN ?? '';
  const fetchImpl = authFetch(token);
  const sinceIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const corpus = dedupeWideCorpus();

  const report: ProbeReport = {
    surfaceA: { eventsScanned: 0, withMessage: 0, strategic: 0, broad: 0, byRepo: {} },
    surfaceB: { reposScanned: 0, releasesFetched: 0, strategic: 0, broad: 0, byRepo: {} },
    combinedStrategic: 0,
    monthsWithEvents: 0,
    events: [],
    recommendation: '',
  };

  // Surface A
  if (enrichedPath) {
    const raw = fs.readFileSync(enrichedPath, 'utf8');
    const run = JSON.parse(raw) as { events: DependencyEvent[] };
    const events: DependencyEvent[] = run.events ?? [];
    report.surfaceA.eventsScanned = events.length;
    const a = scanEnrichedEvents(events);
    report.surfaceA.withMessage = a.withMessage;
    report.surfaceA.strategic = a.strategic;
    report.surfaceA.broad = a.broad;
    report.surfaceA.byRepo = a.byRepo;
    report.events.push(...a.events);

    console.log('Surface A (enriched commit messages, pilot-v4):');
    console.log(`  events scanned: ${events.length} (${a.withMessage} with commit message)`);
    console.log(`  high-confidence strategic: ${a.strategic}`);
    console.log(`  medium-confidence: ${a.broad}`);
    const sorted = Object.entries(a.byRepo).sort((x, y) => y[1] - x[1]);
    if (sorted.length) {
      console.log('  by repo:');
      for (const [r, c] of sorted) console.log(`    ${r}: ${c}`);
    } else {
      console.log('  by repo: (none)');
    }
  } else {
    console.log('Surface A skipped (no --enriched path)');
  }

  // Surface B
  console.log('\nSurface B (GitHub releases, wide corpus):');
  const b = await scanReleases(fetchImpl, corpus, sinceIso);
  report.surfaceB = {
    reposScanned: b.reposScanned,
    releasesFetched: b.releasesFetched,
    strategic: b.strategic,
    broad: b.broad,
    byRepo: b.byRepo,
  };
  report.events.push(...b.events);
  console.log(`  repos scanned: ${b.reposScanned}`);
  console.log(`  releases fetched: ${b.releasesFetched}`);
  console.log(`  high-confidence strategic: ${b.strategic}`);
  console.log(`  medium-confidence: ${b.broad}`);
  const sortedB = Object.entries(b.byRepo).sort((x, y) => y[1] - x[1]);
  if (sortedB.length) {
    console.log('  by repo:');
    for (const [r, c] of sortedB) console.log(`    ${r}: ${c}`);
  } else {
    console.log('  by repo: (none)');
  }

  // Combined + decision
  report.combinedStrategic = report.surfaceA.strategic + report.surfaceB.strategic;
  const months = new Set<string>();
  for (const ev of report.events) {
    if (ev.confidence === 'high' && ev.date) months.add(ev.date.slice(0, 7));
  }
  report.monthsWithEvents = months.size;
  report.recommendation =
    report.combinedStrategic >= 20
      ? 'GO — sufficient strategic events; build changelog-anchored corpus'
      : report.combinedStrategic >= 16
        ? 'BORDERLINE — review data; weak case for continued investment'
        : 'STOP — strategic events too rare across ALL measured surfaces';

  console.log('\n=== Decision ===');
  console.log(`  Combined high-confidence strategic events: ${report.combinedStrategic}`);
  console.log(`  Months with events: ${report.monthsWithEvents}`);
  console.log(`  Recommendation: ${report.recommendation}`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'migration-probe.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(`\n  report saved → ${outDir}/migration-probe.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
