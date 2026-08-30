#!/usr/bin/env node
/**
 * adoption_rate analysis — the deferred metric from the original proposal.
 *
 * The original proposal's canonical signal is
 *
 *     adoption_rate = net_change / total_tracking
 *
 * where total_tracking = repos currently tracking a company's packages.
 * Prior experiments scored raw netAdd because the snapshot-corpus pipeline
 * did not maintain cumulative tracking state. This script reconstructs that
 * state from the collected event stream and tests whether the normalized
 * rate carries any forward signal that raw netAdd does not.
 *
 * Reconstruction of total_tracking:
 *   - Baseline: repos whose corpus entry declares companyTargets for the
 *     ticker (the churn-verified consumer set).
 *   - Then walk events chronologically: an `added` mapped event enters a
 *     repo into tracking; a `removed` event exits it. total_tracking(week)
 *     is the running count at that week (floored at 1).
 *   - netAdd(week) = added − removed mapped events that week.
 *   - adoption_rate(week) = netAdd / max(1, total_tracking).
 *
 * Because Pearson is scale-invariant, IF total_tracking were constant the
 * rate would be a no-op vs netAdd. This script reports total_tracking's
 * range per ticker so that degeneracy is visible, and it scores BOTH
 * netAdd and adoption_rate so any difference in forward signal is shown.
 *
 * Usage:
 *   npx tsx scripts/analyze-adoption-rate.ts --input <run.json> --out DIR
 */
import fs from 'node:fs';
import path from 'node:path';
import { weekStartOf } from '../src/services/oss-adoption/curves.js';
import {
  fetchTokenizedStockPrices,
  TOKENIZED_STOCK_IDS,
} from '../src/services/oss-adoption/prices.js';
import {
  weeklyCloses,
  weeklyReturns,
  cumulativeForwardReturn,
  pearson,
} from '../src/services/oss-adoption/analysis.js';
import type { DependencyEvent } from '../src/services/oss-adoption/types.js';
import { OSS_CORPUS } from '../src/services/oss-adoption/corpus.js';

interface Args {
  input: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let input = '';
  let out = 'adoption-rate';
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--input' && value) input = value;
    else if (key === '--out' && value) out = value;
    else if (key === '--help') {
      console.log('Usage: npx tsx scripts/analyze-adoption-rate.ts --input <run.json> [--out DIR]');
      process.exit(0);
    }
  }
  if (!input) {
    console.error('Provide --input <run.json>');
    process.exit(1);
  }
  return { input, out };
}

interface WeekRow {
  weekStart: string;
  companyTicker: string;
  netAdd: number;
  totalTracking: number;
  adoptionRate: number;
  weekClose: number | null;
  weekReturn: number | null;
  fwd1Return: number | null;
  fwd2Return: number | null;
  fwd4Return: number | null;
}

function pearsonSafe(xs: number[], ys: number[]): { r: number; n: number } {
  const p = pearson(xs, ys);
  return p ?? { r: 0, n: 0 };
}

async function main(): Promise<void> {
  const { input, out } = parseArgs(process.argv.slice(2));
  const run = JSON.parse(fs.readFileSync(input, 'utf8')) as {
    runManifest: {
      runId: string;
      corpusVersion: string;
      observationWindow?: { sinceIso?: string; untilIso?: string; start?: string; end?: string };
    };
    events: DependencyEvent[];
  };
  console.log(`run: ${run.runManifest.runId} (corpus ${run.runManifest.corpusVersion})`);

  // Baseline tracking from corpus companyTargets (churn-verified consumers).
  const baseByTicker = new Map<string, Set<string>>();
  for (const repo of OSS_CORPUS) {
    for (const tk of repo.companyTargets) {
      const set = baseByTicker.get(tk) ?? new Set<string>();
      set.add(repo.slug);
      baseByTicker.set(tk, set);
    }
  }

  // Walk mapped events chronologically, maintaining per-ticker tracking state.
  const mapped = run.events.filter((e) => e.companyTicker);
  const netAddWk = new Map<string, Map<string, number>>(); // ticker -> week -> net change
  const trackingNow = new Map<string, Set<string>>();
  for (const [tk, repos] of baseByTicker) trackingNow.set(tk, new Set(repos));

  const eventsSorted = [...mapped].sort((a, b) => a.committedAt.localeCompare(b.committedAt));
  for (const e of eventsSorted) {
    const tk = e.companyTicker!;
    const week = weekStartOf(e.committedAt);
    if (!week) continue;
    if (!netAddWk.has(tk)) netAddWk.set(tk, new Map());
    const repoSet = trackingNow.get(tk) ?? new Set<string>();
    if (e.change === 'added' && !repoSet.has(e.repository)) {
      repoSet.add(e.repository);
      netAddWk.get(tk)!.set(week, (netAddWk.get(tk)!.get(week) ?? 0) + 1);
    } else if (e.change === 'removed' && repoSet.has(e.repository)) {
      repoSet.delete(e.repository);
      netAddWk.get(tk)!.set(week, (netAddWk.get(tk)!.get(week) ?? 0) - 1);
    }
  }

  // Contiguous weekly range from observation window.
  const obsWin = run.runManifest.observationWindow;
  const firstDate = obsWin?.sinceIso ?? obsWin?.start ?? mapped[0]?.committedAt ?? '';
  const lastDate = obsWin?.untilIso ?? obsWin?.end ?? mapped[mapped.length - 1]?.committedAt ?? '';
  const fromWeek = weekStartOf(firstDate) || firstDate.slice(0, 10);
  const toWeek = weekStartOf(lastDate) || lastDate.slice(0, 10);

  const allWeeks: string[] = [];
  {
    const cursor = new Date(`${fromWeek}T00:00:00Z`);
    const end = new Date(`${toWeek}T00:00:00Z`);
    while (cursor <= end) {
      allWeeks.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  // Pre-fetch prices per ticker (async, isolated failures).
  const tickers = [...new Set(mapped.map((e) => e.companyTicker))]
    .filter((t): t is string => !!t)
    .sort();
  const priceByTicker = new Map<
    string,
    Awaited<ReturnType<typeof fetchTokenizedStockPrices>>['points']
  >();
  for (const tk of tickers) {
    if (!(tk in TOKENIZED_STOCK_IDS)) continue;
    try {
      const s = await fetchTokenizedStockPrices(tk, fromWeek, toWeek);
      priceByTicker.set(tk, s.points);
      console.log(`  ${tk.padEnd(5)} price points=${s.points.length}`);
    } catch (err) {
      console.log(
        `  ${tk}: price fetch failed — ${err instanceof Error ? err.message : String(err)}`,
      );
      priceByTicker.set(tk, []);
    }
  }

  // Build contiguous weekly series per ticker with running totalTracking.
  console.log('\nper-ticker series:');
  const series: WeekRow[] = [];
  const rangeByTicker = new Map<string, { min: number; max: number }>();
  for (const tk of tickers) {
    const baseN = baseByTicker.get(tk)?.size ?? 0;
    let tracking = Math.max(1, baseN);
    const closes = weeklyCloses(priceByTicker.get(tk) ?? [], fromWeek, toWeek);
    const returns = weeklyReturns(closes);
    for (const week of allWeeks) {
      const d = netAddWk.get(tk)?.get(week) ?? 0;
      tracking = Math.max(1, tracking + d);
      series.push({
        weekStart: week,
        companyTicker: tk,
        netAdd: d,
        totalTracking: tracking,
        adoptionRate: d / Math.max(1, tracking),
        weekClose: closes.get(week) ?? null,
        weekReturn: returns.get(week) ?? null,
        fwd1Return: cumulativeForwardReturn(closes, week, 1),
        fwd2Return: cumulativeForwardReturn(closes, week, 2),
        fwd4Return: cumulativeForwardReturn(closes, week, 4),
      });
    }
    const trackVals = series.filter((r) => r.companyTicker === tk).map((r) => r.totalTracking);
    rangeByTicker.set(tk, { min: Math.min(...trackVals), max: Math.max(...trackVals) });
    console.log(
      `  ${tk.padEnd(5)} base=${baseN}  totalTracking range ${Math.min(...trackVals)}..${Math.max(...trackVals)}`,
    );
  }

  // Correlations per ticker: netAdd vs adoptionRate across horizons.
  console.log('\ncorrelations (r):');
  const summary: Array<Record<string, unknown>> = [];
  for (const tk of tickers) {
    const rows = series.filter((r) => r.companyTicker === tk);
    const corr = (metric: 'netAdd' | 'adoptionRate', col: (r: WeekRow) => number | null) => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const r of rows) {
        const x = metric === 'netAdd' ? r.netAdd : r.adoptionRate;
        const y = col(r);
        if (y != null && Number.isFinite(y)) {
          xs.push(x);
          ys.push(y);
        }
      }
      return pearsonSafe(xs, ys);
    };
    const block: Record<string, unknown> = {
      ticker: tk,
      weeks: rows.length,
      trackingRange: rangeByTicker.get(tk),
    };
    console.log(
      `\n${tk} (weeks=${rows.length}, tracking ${rangeByTicker.get(tk)?.min}..${rangeByTicker.get(tk)?.max}):`,
    );
    for (const [label, col] of [
      ['weekReturn', (r: WeekRow) => r.weekReturn],
      ['fwd1', (r: WeekRow) => r.fwd1Return],
      ['fwd2', (r: WeekRow) => r.fwd2Return],
      ['fwd4', (r: WeekRow) => r.fwd4Return],
    ] as Array<[string, (r: WeekRow) => number | null]>) {
      const na = corr('netAdd', col);
      const ar = corr('adoptionRate', col);
      block[label] = {
        netAdd: { r: Number(na.r.toFixed(3)), n: na.n },
        adoptionRate: { r: Number(ar.r.toFixed(3)), n: ar.n },
      };
      console.log(
        `  ${label.padEnd(10)} netAdd=${na.r.toFixed(3)}(n=${na.n})  adoption_rate=${ar.r.toFixed(3)}(n=${ar.n})`,
      );
    }
    summary.push(block);
  }

  // CSV + summary output.
  fs.mkdirSync(path.resolve(out), { recursive: true });
  const prefix = path.join(path.resolve(out), 'adoption-rate');
  const header = [
    'weekStart',
    'companyTicker',
    'netAdd',
    'totalTracking',
    'adoptionRate',
    'weekClose',
    'weekReturn',
    'fwd1Return',
    'fwd2Return',
    'fwd4Return',
  ];
  const lines = series.map((r) =>
    [
      r.weekStart,
      r.companyTicker,
      r.netAdd,
      r.totalTracking,
      r.adoptionRate.toFixed(6),
      r.weekClose == null ? '' : Number(r.weekClose.toFixed(2)),
      r.weekReturn == null ? '' : r.weekReturn.toFixed(6),
      r.fwd1Return == null ? '' : r.fwd1Return.toFixed(6),
      r.fwd2Return == null ? '' : r.fwd2Return.toFixed(6),
      r.fwd4Return == null ? '' : r.fwd4Return.toFixed(6),
    ].join(','),
  );
  fs.writeFileSync(`${prefix}.csv`, [header.join(','), ...lines].join('\n') + '\n');
  fs.writeFileSync(
    `${prefix}.summary.json`,
    JSON.stringify(
      {
        runId: run.runManifest.runId,
        corpusVersion: run.runManifest.corpusVersion,
        note: 'adoption_rate = netAdd / max(1, totalTracking). totalTracking reconstructed from corpus companyTargets baseline + chronological added/removed events. Pearson is scale-invariant, so if totalTracking were constant this would be a no-op vs netAdd; the per-ticker tracking range shows whether the rate has independent information.',
        summary,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`\n✓ written → ${prefix}.csv + .summary.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
