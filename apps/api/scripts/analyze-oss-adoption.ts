#!/usr/bin/env node
/**
 * OSS adoption — Phase 0/1 overlay: adoption curves + velocity/acceleration
 * vs tokenized-stock prices.
 *
 * Reads a collected run JSON, builds weekly adoption curves, scores them
 * (velocity/acceleration, Phase 1), fetches CoinGecko tokenized-stock prices
 * for the mapped tickers, aligns everything, and writes:
 *   <out>/overlay.csv            — weekly adoption + velocity + price return table
 *   <out>/overlay.summary.json   — per-ticker Pearson correlations
 *
 * Usage:
 *   npx tsx scripts/analyze-oss-adoption.ts --input /tmp/oss-adoption/oss-adoption-*.json --out /tmp/oss-adoption-final/overlay
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildWeeklyCurves,
  curvesToCsv,
  fillWeeklyGaps,
  weekStartOf,
} from '../src/services/oss-adoption/curves.js';
import { scoreCurves } from '../src/services/oss-adoption/scoring.js';
import { fetchPriceSeriesForEvents } from '../src/services/oss-adoption/prices.js';
import {
  buildOverlay,
  overlayToCsv,
  summarizeOverlay,
} from '../src/services/oss-adoption/analysis.js';
import type { DependencyEvent } from '../src/services/oss-adoption/types.js';

interface Args {
  input: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let input = '';
  let out = 'overlay';
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--input' && value) input = value;
    else if (key === '--out' && value) out = value;
    else if (key === '--help') {
      console.log(
        'Usage: npx tsx scripts/analyze-oss-adoption.ts --input <run.json> [--out <prefix>]',
      );
      process.exit(0);
    }
  }
  if (!input) {
    console.error('Provide --input <run.json> (a collector run manifest JSON).');
    process.exit(1);
  }
  return { input, out };
}

async function main(): Promise<void> {
  const { input, out } = parseArgs(process.argv.slice(2));

  const raw = fs.readFileSync(input, 'utf8');
  const run = JSON.parse(raw) as {
    events: DependencyEvent[];
    runManifest: {
      corpusVersion: string;
      observationWindow: { sinceIso: string; untilIso: string };
      repositories: Array<{ slug: string; status: string; eventsExtracted: number }>;
    };
  };

  const { events, runManifest } = run;
  const { sinceIso, untilIso } = runManifest.observationWindow;
  const fromDate = sinceIso.slice(0, 10);
  const toDate = untilIso.slice(0, 10);

  console.log(`run: ${runManifest.corpusVersion} | window ${fromDate} → ${toDate}`);
  console.log(`events: ${events.length} | repos: ${runManifest.repositories.length}`);

  // 1) Weekly adoption curves (gap-filled over the observation window).
  //    Curve weeks are ISO-Monday aligned; normalize the window edges so
  //    gap-filled weeks line up with the buckets buildWeeklyCurves emits.
  const fromWeek = weekStartOf(fromDate) || fromDate;
  const toWeek = weekStartOf(toDate) || toDate;
  const curves = buildWeeklyCurves(events);
  const tickers = [...new Set(curves.map((c) => c.companyTicker))].sort();
  let filled: typeof curves = [];
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

  // 1b) Phase 1: velocity/acceleration scoring over the gap-filled curves.
  const scored = scoreCurves(filled, { metric: 'netAdd', window: 4 });

  // 2) Tokenized-stock price series per ticker.
  console.log('fetching tokenized-stock price series (CoinGecko)...');
  const priceSeries = await fetchPriceSeriesForEvents(events, fromDate, toDate);
  const priceByTicker = new Map(priceSeries.map((s) => [s.companyTicker, s.points]));
  for (const s of priceSeries) {
    console.log(
      `  ${s.companyTicker.padEnd(5)} ${s.coingeckoId.padEnd(22)} points=${s.points.length}`,
    );
  }

  // 3) Overlay + correlations (Phase 0 raw metrics + Phase 1 velocity/acceleration).
  const rows = buildOverlay(scored, priceByTicker);
  const summary = summarizeOverlay(rows);

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(`${out}.csv`, overlayToCsv(rows));
  fs.writeFileSync(
    `${out}.summary.json`,
    JSON.stringify(
      {
        corpusVersion: runManifest.corpusVersion,
        window: { sinceIso, untilIso },
        priceSource:
          'coingecko-tokenized-stocks (amazon-xstock / alphabet-xstock / microsoft-xstock)',
        note: 'Phase 0/1 overlay. Raw metrics correlate weakly (|r| <= 0.3); Phase 1 velocity/acceleration (4-window trailing slope of netAdd) may strengthen the signal.',
        summary,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`\n✓ overlay written → ${out}.csv`);
  console.log(`  summary → ${out}.summary.json`);
  console.log('\nper-ticker correlations (r):');
  for (const s of summary) {
    const row = (label: string, arr: typeof s.correlations.fwd1) =>
      arr.length
        ? arr.map((c) => `  ${c.metric}=${c.r.toFixed(3)}(n=${c.n})`).join('\n')
        : '  (no pairs)';
    console.log(`\n${s.ticker} (${s.activeWeeks}/${s.weeks} active weeks)`);
    console.log(`  same-week return:\n${row('weekReturn', s.correlations.weekReturn)}`);
    console.log(`  next-week return (fwd1):\n${row('fwd1', s.correlations.fwd1)}`);
    console.log(`  2-week return (fwd2):\n${row('fwd2', s.correlations.fwd2)}`);
    console.log(`  4-week return (fwd4):\n${row('fwd4', s.correlations.fwd4)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
