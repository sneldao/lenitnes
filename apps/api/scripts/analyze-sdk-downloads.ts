#!/usr/bin/env node
/**
 * SDK download-count analysis — overlay download curves vs tokenized-stock
 * prices, reusing the Phase 0/1 overlay machinery.
 *
 * Weekly per-ticker download totals are mapped into AdoptionWeek-shaped rows
 * so the existing buildOverlay / summarizeOverlay / scoreCurves pipeline can
 * be reused unchanged:
 *   added / changed / netAdd  = weekly download total (the level)
 *   activeRepos               = packages with downloads that week
 *   velocity / acceleration   = trailing-window slope of the scored metric
 *                               (download *growth*, the acceleration thesis)
 *
 * Metrics reported per ticker: weekly total downloads (added), velocity
 * (slope), acceleration, vs same-week / fwd1 / fwd2 / fwd4 price returns.
 *
 * Usage:
 *   npx tsx scripts/analyze-sdk-downloads.ts --input /tmp/sdk-downloads/sdk-downloads-*.json \
 *     --out /tmp/sdk-downloads/overlay [--metric added] [--window 4]
 */
import fs from 'node:fs';
import path from 'node:path';
import { weekStartOf, fillWeeklyGaps } from '../src/services/oss-adoption/curves.js';
import type { AdoptionWeek } from '../src/services/oss-adoption/curves.js';
import { scoreCurves } from '../src/services/oss-adoption/scoring.js';
import type { ScoreMetric } from '../src/services/oss-adoption/scoring.js';
import {
  fetchTokenizedStockPrices,
  TOKENIZED_STOCK_IDS,
} from '../src/services/oss-adoption/prices.js';
import {
  buildOverlay,
  overlayToCsv,
  summarizeOverlay,
} from '../src/services/oss-adoption/analysis.js';
import { SDK_DOWNLOAD_PACKAGES } from './collect-sdk-downloads.js';
import type { DailyDownloads } from './collect-sdk-downloads.js';

const VALID_METRICS: ScoreMetric[] = [
  'added',
  'removed',
  'upgraded',
  'downgraded',
  'changed',
  'netAdd',
  'activeRepos',
];

interface Args {
  input: string;
  out: string;
  metric: ScoreMetric;
  window: number;
}

function parseArgs(argv: string[]): Args {
  let input = '';
  let out = 'overlay';
  let metric: ScoreMetric = 'added';
  let window = 4;
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
    } else if (key === '--help') {
      console.log(
        'Usage: npx tsx scripts/analyze-sdk-downloads.ts --input <run.json> [--metric added] [--window 4] [--out prefix]',
      );
      process.exit(0);
    }
  }
  if (!input) {
    console.error('Provide --input <run.json>');
    process.exit(1);
  }
  return { input, out, metric, window };
}

/** Aggregate daily downloads → weekly totals per ticker. */
function downloadsToWeekly(daily: Record<string, DailyDownloads[]>): AdoptionWeek[] {
  const tickerForPkg = new Map<string, string>();
  for (const ticker of Object.keys(SDK_DOWNLOAD_PACKAGES)) {
    for (const pkg of SDK_DOWNLOAD_PACKAGES[ticker]) tickerForPkg.set(pkg, ticker);
  }

  // weekly totals + package counts per (ticker, week)
  const totals = new Map<string, { total: number; packages: Set<string> }>();
  for (const [pkg, rows] of Object.entries(daily)) {
    const ticker = tickerForPkg.get(pkg);
    if (!ticker) continue;
    for (const row of rows) {
      const week = weekStartOf(row.day);
      if (!week) continue;
      const key = `${ticker}|${week}`;
      const bucket = totals.get(key) ?? { total: 0, packages: new Set<string>() };
      bucket.total += row.downloads;
      bucket.packages.add(pkg);
      totals.set(key, bucket);
    }
  }

  const weeks: AdoptionWeek[] = [];
  const prevByTicker = new Map<string, number>();
  const sortedKeys = [...totals.keys()].sort((a, b) => {
    const [ta, wa] = a.split('|');
    const [tb, wb] = b.split('|');
    return ta.localeCompare(tb) || wa.localeCompare(wb);
  });
  for (const key of sortedKeys) {
    const [ticker, weekStart] = key.split('|');
    const bucket = totals.get(key)!;
    const prev = prevByTicker.get(ticker) ?? null;
    // netAdd = week-over-week change in downloads (the "signal in change"
    // hypothesis: growth, not level); null for the first week of a ticker.
    const delta = prev == null ? null : bucket.total - prev;
    prevByTicker.set(ticker, bucket.total);
    weeks.push({
      weekStart,
      companyTicker: ticker,
      added: bucket.total,
      removed: 0,
      upgraded: 0,
      downgraded: 0,
      changed: bucket.total,
      netAdd: delta ?? 0,
      activeRepos: bucket.packages.size,
    });
  }
  return weeks.sort(
    (a, b) =>
      a.companyTicker.localeCompare(b.companyTicker) || a.weekStart.localeCompare(b.weekStart),
  );
}

async function main(): Promise<void> {
  const { input, out, metric, window } = parseArgs(process.argv.slice(2));
  const raw = fs.readFileSync(input, 'utf8');
  const run = JSON.parse(raw) as {
    runManifest: {
      runId: string;
      window: { start: string; end: string };
      packagesFailed: string[];
    };
    daily: Record<string, DailyDownloads[]>;
  };

  const { start, end } = run.runManifest.window;
  console.log(`run: ${run.runManifest.runId} | window ${start} → ${end}`);
  console.log(
    `packages: ${Object.keys(run.daily).length} with data (failed: ${run.runManifest.packagesFailed.join(', ') || 'none'})`,
  );

  // 1) Weekly download curves per ticker.
  const weekly = downloadsToWeekly(run.daily);
  const fromWeek = weekStartOf(start) || start;
  const toWeek = weekStartOf(end) || end;
  const tickers = [...new Set(weekly.map((w) => w.companyTicker))].sort();
  let filled: AdoptionWeek[] = [];
  for (const ticker of tickers) {
    filled = filled.concat(
      fillWeeklyGaps(
        weekly.filter((w) => w.companyTicker === ticker),
        ticker,
        fromWeek,
        toWeek,
      ),
    );
  }

  // 2) Score velocity/acceleration of the download level.
  console.log(`scoring curves: metric=${metric} window=${window}`);
  const scored = scoreCurves(filled, { metric, window });

  // 3) Prices (CoinGecko tokenized stocks).
  console.log('fetching tokenized-stock price series (CoinGecko)...');
  const priceByTicker = new Map<
    string,
    Awaited<ReturnType<typeof fetchTokenizedStockPrices>>['points']
  >();
  for (const ticker of tickers) {
    if (!(ticker in TOKENIZED_STOCK_IDS)) continue;
    try {
      const s = await fetchTokenizedStockPrices(ticker, fromWeek, toWeek);
      priceByTicker.set(ticker, s.points);
      console.log(`  ${ticker.padEnd(5)} ${s.coingeckoId.padEnd(22)} points=${s.points.length}`);
    } catch (err) {
      console.log(
        `  ${ticker}: price fetch failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 4) Overlay + correlations.
  const rows = buildOverlay(scored, priceByTicker);
  const summary = summarizeOverlay(rows);

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(`${out}.csv`, overlayToCsv(rows));
  fs.writeFileSync(
    `${out}.summary.json`,
    JSON.stringify(
      {
        runId: run.runManifest.runId,
        source: 'npm-registry-public-api',
        window: { start, end },
        note: `SDK download-count overlay. added/netAdd/changed = weekly download total; velocity = ${window}-window trailing slope of ${metric}; acceleration = slope of velocity. Tests whether SDK adoption demand (downloads) leads price.`,
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
