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
  buildWeightedCurves,
  curvesToCsv,
  fillWeeklyGaps,
  weekStartOf,
} from '../src/services/oss-adoption/curves.js';
import { scoreCurves } from '../src/services/oss-adoption/scoring.js';
import type { ScoreMetric } from '../src/services/oss-adoption/scoring.js';
import { heuristicScoreEvent } from '../src/services/oss-adoption/agent-scoring.js';
import { fetchPriceSeriesForEvents } from '../src/services/oss-adoption/prices.js';
import {
  buildOverlay,
  overlayToCsv,
  summarizeOverlay,
} from '../src/services/oss-adoption/analysis.js';
import type { AdoptionWeek } from '../src/services/oss-adoption/curves.js';
import type { DependencyEvent } from '../src/services/oss-adoption/types.js';

interface Args {
  input: string;
  out: string;
  metric: ScoreMetric;
  window: number;
  g2: boolean;
}

const VALID_METRICS: ScoreMetric[] = [
  'added',
  'removed',
  'upgraded',
  'downgraded',
  'changed',
  'netAdd',
  'activeRepos',
];

function parseArgs(argv: string[]): Args {
  let input = '';
  let out = 'overlay';
  let metric: ScoreMetric = 'netAdd';
  let window = 4;
  let g2 = false;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--input' && value) input = value;
    else if (key === '--out' && value) out = value;
    else if (key === '--metric' && value) {
      if (!(VALID_METRICS as readonly string[]).includes(value)) {
        console.error(`Invalid metric "${value}". Valid: ${VALID_METRICS.join(', ')}`);
        process.exit(1);
      }
      metric = value as ScoreMetric;
    } else if (key === '--window' && value) {
      window = Number(value);
      if (!Number.isFinite(window) || window < 2) {
        console.error('--window must be a number >= 2');
        process.exit(1);
      }
    } else if (key === '--g2') {
      g2 = true;
    } else if (key === '--help') {
      console.log(
        'Usage: npx tsx scripts/analyze-oss-adoption.ts --input <run.json> [--metric <name>] [--window <n>] [--g2] [--out <prefix>]',
      );
      console.log(
        '  --metric   Scored metric (default netAdd). Valid: ' + VALID_METRICS.join(', '),
      );
      console.log('  --window   Trailing window in weeks (default 4).');
      console.log(
        '  --g2       G2 comparison: also build score-weighted curves (event commitMessage + heuristic score) and compare correlations.',
      );
      console.log('  --out      Output prefix (default overlay).');
      process.exit(0);
    }
  }
  if (!input) {
    console.error('Provide --input <run.json> (a collector run manifest JSON).');
    process.exit(1);
  }
  return { input, out, metric, window, g2 };
}

/** Gap-fill a per-ticker curve set over the observation window. */
function gapFill(curves: AdoptionWeek[], fromWeek: string, toWeek: string): AdoptionWeek[] {
  const tickers = [...new Set(curves.map((c) => c.companyTicker))].sort();
  let filled: AdoptionWeek[] = [];
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
  return filled;
}

/** Weight for a heuristic-scored event: neutral 0.5 → 1.0, strategic ~1.8, noise ~0.2. */
function heuristicWeight(event: DependencyEvent): number {
  const { score } = heuristicScoreEvent(event);
  return 2 * score;
}

async function main(): Promise<void> {
  const { input, out, metric, window, g2 } = parseArgs(process.argv.slice(2));

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
  const filled = gapFill(curves, fromWeek, toWeek);

  // 1b) Phase 1: velocity/acceleration scoring over the gap-filled curves.
  console.log(`scoring curves: metric=${metric} window=${window}`);
  const scored = scoreCurves(filled, { metric, window });

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
        note: `Phase 0/1 overlay. Raw metrics correlate weakly (|r| <= 0.3). Velocity/acceleration = ${window}-window trailing slope of ${metric}.`,
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

  // ── G2 comparison: score-weighted curves vs raw curves ──────────────────
  if (g2) {
    const scoredEvents = events.filter((e) => e.companyTicker);
    const withMsg = scoredEvents.filter((e) => e.commitMessage);
    console.log(`\n[G2] weighted-curve comparison`);
    console.log(
      `  mapped events: ${scoredEvents.length} | with commit message: ${withMsg.length} (${((withMsg.length / Math.max(1, scoredEvents.length)) * 100).toFixed(0)}%)`,
    );
    console.log(
      `  mean heuristic score: ${(scoredEvents.reduce((s, e) => s + heuristicScoreEvent(e).score, 0) / Math.max(1, scoredEvents.length)).toFixed(3)}`,
    );

    const weighted = buildWeightedCurves(events, heuristicWeight);
    const weightedFilled = gapFill(weighted, fromWeek, toWeek);
    const weightedScored = scoreCurves(weightedFilled, { metric, window });
    const wRows = buildOverlay(weightedScored, priceByTicker);
    const wSummary = summarizeOverlay(wRows);

    fs.writeFileSync(`${out}.weighted.csv`, overlayToCsv(wRows));
    fs.writeFileSync(
      `${out}.g2.json`,
      JSON.stringify(
        {
          corpusVersion: runManifest.corpusVersion,
          method: 'heuristic: 2*score (neutral 0.5 → 1.0, strategic ~1.8, noise ~0.2)',
          meanHeuristicScore:
            scoredEvents.reduce((s, e) => s + heuristicScoreEvent(e).score, 0) /
            Math.max(1, scoredEvents.length),
          raw: summary,
          weighted: wSummary,
          note: 'G2 comparison: does weighting events by strategic importance improve forward-return correlation vs the raw curve?',
        },
        null,
        2,
      ) + '\n',
    );

    console.log(`  weighted overlay written → ${out}.weighted.csv`);
    console.log(`  comparison → ${out}.g2.json`);
    for (const w of wSummary) {
      const rawT = summary.find((s) => s.ticker === w.ticker);
      const r = (m: string, arr: typeof w.correlations.fwd1) => arr.find((c) => c.metric === m);
      const fwd1 = (s: typeof w) => r('velocity', s.correlations.fwd1);
      const rawR = rawT ? r('velocity', rawT.correlations.fwd1) : undefined;
      const wR = fwd1(w);
      console.log(
        `  ${w.ticker}: fwd1 velocity raw=${rawR ? rawR.r.toFixed(3) : '—'} weighted=${wR ? wR.r.toFixed(3) : '—'}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
