/**
 * OSS adoption — weekly adoption curves (Phase 0 of the backtest plan).
 *
 * Aggregates normalized dependency events into per-company weekly curves:
 * for each ISO week (Monday UTC) and company ticker, counts events by
 * change type, the distinct repositories that touched mapped packages,
 * and the net change (added − removed). These curves are the raw input
 * for velocity/acceleration scoring and the stock-price overlay.
 *
 * Only events with a mapped company ticker contribute to the curves;
 * unmapped events remain visible in the quality report but cannot form
 * an adoption curve for a tradable company.
 */
import type { DependencyChange, DependencyEvent } from './types.js';

export interface AdoptionWeek {
  /** ISO week start (Monday) in UTC, e.g. "2026-08-24". */
  weekStart: string;
  companyTicker: string;
  added: number;
  removed: number;
  upgraded: number;
  downgraded: number;
  changed: number;
  /** added − removed */
  netAdd: number;
  /** Distinct repositories with ≥1 mapped event in this week. */
  activeRepos: number;
}

export interface WeeklyCurvesOptions {
  /** Restrict to these tickers (default: all mapped tickers present). */
  companyTickers?: string[];
}

/** Monday of the ISO week containing `date`, as a UTC date string. */
export function weekStartOf(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getUTCDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

const CHANGE_COUNTS: ReadonlyArray<DependencyChange> = ['added', 'removed', 'upgraded', 'downgraded', 'changed'];

/**
 * Build weekly adoption curves from normalized events. Events without a
 * company ticker are ignored (they cannot form a company curve). The
 * result is sorted by company ticker then week start.
 */
export function buildWeeklyCurves(events: DependencyEvent[], options: WeeklyCurvesOptions = {}): AdoptionWeek[] {
  const tickers = options.companyTickers ? new Set(options.companyTickers) : null;
  const buckets = new Map<string, AdoptionWeek>();
  const weekRepos = new Map<string, Set<string>>();

  for (const event of events) {
    if (!event.companyTicker) continue;
    if (tickers && !tickers.has(event.companyTicker)) continue;
    const weekStart = weekStartOf(event.committedAt);
    if (!weekStart) continue;

    const key = `${event.companyTicker}|${weekStart}`;
    const repoKey = `${event.companyTicker}|${weekStart}|${event.repository}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { weekStart, companyTicker: event.companyTicker, added: 0, removed: 0, upgraded: 0, downgraded: 0, changed: 0, netAdd: 0, activeRepos: 0 };
      buckets.set(key, bucket);
    }
    const countKey = event.change;
    bucket[countKey] += 1;
    if (!weekRepos.has(repoKey)) {
      weekRepos.set(repoKey, new Set());
      bucket.activeRepos += 1;
    }
    bucket.netAdd = bucket.added - bucket.removed;
  }

  return [...buckets.values()].sort(
    (a, b) => a.companyTicker.localeCompare(b.companyTicker) || a.weekStart.localeCompare(b.weekStart),
  );
}

/** Fill missing weeks with zero-count buckets so the series is continuous. */
export function fillWeeklyGaps(curves: AdoptionWeek[], ticker: string, fromWeek: string, toWeek: string): AdoptionWeek[] {
  const byWeek = new Map(curves.filter((c) => c.companyTicker === ticker).map((c) => [c.weekStart, c]));
  const output: AdoptionWeek[] = [];
  let cursor = new Date(`${fromWeek}T00:00:00Z`);
  const end = new Date(`${toWeek}T00:00:00Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    output.push(byWeek.get(key) ?? { weekStart: key, companyTicker: ticker, added: 0, removed: 0, upgraded: 0, downgraded: 0, changed: 0, netAdd: 0, activeRepos: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return output;
}

/** Serialize curves to the CSV shape used by the research artifacts. */
export function curvesToCsv(curves: AdoptionWeek[]): string {
  const header = ['weekStart', 'companyTicker', 'added', 'removed', 'upgraded', 'downgraded', 'changed', 'netAdd', 'activeRepos'];
  const rows = curves.map((c) =>
    [c.weekStart, c.companyTicker, c.added, c.removed, c.upgraded, c.downgraded, c.changed, c.netAdd, c.activeRepos].join(','),
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}

export { CHANGE_COUNTS };
