#!/usr/bin/env node
/**
 * OSS adoption — build weekly adoption curves from a collected run.
 *
 * Usage:
 *   # From an existing collector run JSON:
 *   npx tsx scripts/build-oss-adoption-curves.ts --input /tmp/oss-adoption/oss-adoption-*.json
 *
 *   # Run the collector first, then build curves (needs GITHUB_TOKEN):
 *   GITHUB_TOKEN=ghp_xxx npx tsx scripts/build-oss-adoption-curves.ts --collect \
 *     --since 2025-08-29T00:00:00Z --until 2026-08-29T00:00:00Z
 *
 * Output:
 *   - A CSV of weekly curves (per company × ISO week) to stdout / --out file
 *   - A JSON artifact with the curves + a per-company summary
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildWeeklyCurves,
  curvesToCsv,
  fillWeeklyGaps,
  weekStartOf,
} from '../src/services/oss-adoption/curves.js';
import { collectAdoptionHistory } from '../src/services/oss-adoption/collector.js';
import type { DependencyEvent } from '../src/services/oss-adoption/types.js';

interface Args {
  input?: string;
  collect?: boolean;
  since?: string;
  until?: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--input' && value) args.input = value;
    else if (key === '--collect') args.collect = true;
    else if (key === '--since' && value) args.since = value;
    else if (key === '--until' && value) args.until = value;
    else if (key === '--out' && value) args.out = value;
    else if (key === '--help') {
      console.log(
        'Usage: npx tsx scripts/build-oss-adoption-curves.ts [--input FILE | --collect] [--since ISO] [--until ISO] [--out FILE]',
      );
      process.exit(0);
    }
  }
  return args;
}

function authFetch(token: string): typeof fetch {
  const wrapped: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/vnd.github+json');
    headers.set('User-Agent', 'lenitnes/1.0');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  return wrapped;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input && !args.collect) {
    console.error('Provide --input <run.json> or --collect to run the collector first.');
    process.exit(1);
  }

  let events: DependencyEvent[];
  let windowSince: string;
  let windowUntil: string;
  let corpusVersion: string;

  if (args.input) {
    const raw = fs.readFileSync(args.input, 'utf8');
    const run = JSON.parse(raw) as {
      events?: DependencyEvent[];
      runManifest?: {
        observationWindow?: { sinceIso: string; untilIso: string };
        corpusVersion?: string;
      };
    };
    if (!Array.isArray(run.events)) {
      console.error(`No events array in ${args.input}`);
      process.exit(1);
    }
    events = run.events;
    windowSince = run.runManifest?.observationWindow?.sinceIso ?? '';
    windowUntil = run.runManifest?.observationWindow?.untilIso ?? '';
    corpusVersion = run.runManifest?.corpusVersion ?? 'unknown';
  } else {
    const token = process.env.GITHUB_TOKEN ?? '';
    const result = await collectAdoptionHistory({
      sinceIso: args.since,
      untilIso: args.until,
      fetchImpl: authFetch(token),
      onProgress: (msg) => console.log(`  ${msg}`),
    });
    events = result.events;
    windowSince = result.runManifest.observationWindow.sinceIso;
    windowUntil = result.runManifest.observationWindow.untilIso;
    corpusVersion = result.runManifest.corpusVersion;
  }

  const curves = buildWeeklyCurves(events);
  const tickers = [...new Set(curves.map((c) => c.companyTicker))].sort();
  let filled: typeof curves = [];
  if (windowSince && windowUntil) {
    // Curve weeks are ISO-Monday aligned; normalize the window edges so
    // gap-filling emits whole weeks and lines up with real curve buckets.
    const fromWeek = weekStartOf(windowSince.slice(0, 10)) || windowSince.slice(0, 10);
    const toWeek = weekStartOf(windowUntil.slice(0, 10)) || windowUntil.slice(0, 10);
    for (const ticker of tickers) {
      filled = filled.concat(
        fillWeeklyGaps(
          curves.filter((c) => c.companyTicker === ticker),
          ticker,
          fromWeek,
          toWeek,
        ),
      );
    }
  } else {
    filled = curves;
  }

  const csv = curvesToCsv(filled);
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, csv);
    const summaryPath = args.out.replace(/\.csv$/, '.summary.json');
    const summary = tickers.map((t) => {
      const rows = filled.filter((c) => c.companyTicker === t);
      const total = rows.reduce((s, r) => s + r.added + r.removed, 0);
      const net = rows.reduce((s, r) => s + r.netAdd, 0);
      const first = rows.find((r) => r.added + r.removed > 0);
      const last = [...rows].reverse().find((r) => r.added + r.removed > 0);
      return {
        companyTicker: t,
        weeks: rows.length,
        totalEvents: total,
        netAdd: net,
        firstActiveWeek: first?.weekStart ?? null,
        lastActiveWeek: last?.weekStart ?? null,
      };
    });
    fs.writeFileSync(
      summaryPath,
      JSON.stringify(
        {
          corpusVersion,
          window: { sinceIso: windowSince, untilIso: windowUntil },
          curves: summary,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`\n✓ curves written → ${args.out}`);
    console.log(`  summary → ${summaryPath}`);
  } else {
    console.log(csv);
  }

  console.log(`\ncorpus: ${corpusVersion} | window: ${windowSince} → ${windowUntil}`);
  console.log('per-company summary:');
  for (const t of tickers) {
    const rows = filled.filter((c) => c.companyTicker === t);
    const added = rows.reduce((s, r) => s + r.added, 0);
    const removed = rows.reduce((s, r) => s + r.removed, 0);
    const upgraded = rows.reduce((s, r) => s + r.upgraded, 0);
    const activeWeeks = rows.filter((r) => r.added + r.removed + r.upgraded > 0).length;
    console.log(
      `  ${t.padEnd(5)} added=${String(added).padStart(3)} removed=${String(removed).padStart(3)} upgraded=${String(upgraded).padStart(4)} activeWeeks=${String(activeWeeks).padStart(3)}/${rows.length}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
