/**
 * OSS adoption — Phase 0 overlay: adoption curves vs tokenized-stock prices.
 *
 * Joins weekly adoption curves with weekly price returns and quantifies
 * the lead/lag relationship: does a week's adoption activity (netAdd,
 * upgrades, active repos) predict the following weeks' price return?
 *
 * Design notes:
 *  - "Week close" is the last available daily price within the ISO week
 *    bucket (tokenized stocks trade ~24/7, so the Sunday boundary is
 *    usually populated; missing weeks carry the previous close forward).
 *  - Contemporaneous return (same week) is reported as a sanity check,
 *    but the tradable hypothesis is the forward return: adoption is
 *    observed, then price reacts. Forward returns are cumulative over
 *    the next N weeks.
 *  - Pearson r is computed per ticker per metric. With 53 weeks per ticker
 *    but only a handful of active adoption weeks, this is an exploratory
 *    signal, not a statistically powerful backtest — the summary says so,
 *    and the gate keeps it honest.
 */
import type { AdoptionWeek } from './curves.js';
import type { PricePoint } from './prices.js';

/** Date `weekStart` + 6 days (Sunday) — end of the ISO week bucket. */
export function weekEndDate(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** Last daily price whose date falls inside the week bucket. */
export function lastPriceInWeek(points: PricePoint[], weekStart: string): number | null {
  const end = weekEndDate(weekStart);
  let last: PricePoint | null = null;
  for (const p of points) {
    if (p.date >= weekStart && p.date <= end) last = p;
    if (p.date > end) break; // points sorted ascending
  }
  return last ? last.price : null;
}

/**
 * Weekly close map for [fromWeek, toWeek], carrying the previous close
 * forward for weeks with no price point. Returns null for a week when
 * no price has been seen yet (start-of-series gap).
 */
export function weeklyCloses(
  points: PricePoint[],
  fromWeek: string,
  toWeek: string,
): Map<string, number> {
  const closes = new Map<string, number>();
  let carry: number | null = null;
  const cursor = new Date(`${fromWeek}T00:00:00Z`);
  const end = new Date(`${toWeek}T00:00:00Z`);
  while (cursor <= end) {
    const week = cursor.toISOString().slice(0, 10);
    const close: number | null = lastPriceInWeek(points, week) ?? carry;
    if (close != null) closes.set(week, close);
    carry = close ?? carry;
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return closes;
}

/** Simple return: close(W) / close(W−1) − 1. First week has no return. */
export function weeklyReturns(closes: Map<string, number>): Map<string, number> {
  const returns = new Map<string, number>();
  const weeks = [...closes.keys()].sort();
  for (let i = 1; i < weeks.length; i++) {
    const prev = closes.get(weeks[i - 1]);
    const cur = closes.get(weeks[i]);
    if (prev != null && cur != null && prev > 0) {
      returns.set(weeks[i], cur / prev - 1);
    }
  }
  return returns;
}

/** Cumulative return over the next `forwardWeeks` weeks after `week`. */
export function cumulativeForwardReturn(
  closes: Map<string, number>,
  week: string,
  forwardWeeks: number,
): number | null {
  const start = closes.get(week);
  if (start == null || start <= 0) return null;
  const cursor = new Date(`${week}T00:00:00Z`);
  let last: number | null = null;
  for (let i = 1; i <= forwardWeeks; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    const w = cursor.toISOString().slice(0, 10);
    const c = closes.get(w);
    if (c != null) last = c;
  }
  return last == null ? null : last / start - 1;
}

export interface OverlayRow {
  weekStart: string;
  companyTicker: string;
  added: number;
  removed: number;
  upgraded: number;
  downgraded: number;
  changed: number;
  netAdd: number;
  activeRepos: number;
  /** Trailing-window slope of the scored metric (Phase 1); null when unscored. */
  velocity: number | null;
  /** Trailing-window slope of velocity; null when unscored or not enough history. */
  acceleration: number | null;
  weekClose: number | null;
  weekReturn: number | null;
  fwd1Return: number | null;
  fwd2Return: number | null;
  fwd4Return: number | null;
}

export interface OverlayOptions {
  forwardWeeks?: number[];
}

/**
 * Align gap-filled adoption curves with weekly closes/returns into one
 * table. The curves are expected to be already gap-filled (one row per
 * ticker per week).
 */
export function buildOverlay(
  curves: AdoptionWeek[],
  priceByTicker: Map<string, PricePoint[]>,
  options: OverlayOptions = {},
): OverlayRow[] {
  const forwardWeeks = options.forwardWeeks ?? [1, 2, 4];
  const rows: OverlayRow[] = [];

  const tickers = [...new Set(curves.map((c) => c.companyTicker))].sort();
  for (const ticker of tickers) {
    const points = priceByTicker.get(ticker) ?? [];
    const tickerCurves = curves.filter((c) => c.companyTicker === ticker);
    const firstWeek = tickerCurves[0]?.weekStart;
    const lastWeek = tickerCurves[tickerCurves.length - 1]?.weekStart;
    if (!firstWeek || !lastWeek) continue;

    const closes = weeklyCloses(points, firstWeek, lastWeek);
    const returns = weeklyReturns(closes);

    for (const c of tickerCurves) {
      const weekReturn = returns.get(c.weekStart) ?? null;
      // Scored curves carry optional velocity/acceleration (Phase 1).
      const cv = c as { velocity?: number | null; acceleration?: number | null };
      rows.push({
        weekStart: c.weekStart,
        companyTicker: c.companyTicker,
        added: c.added,
        removed: c.removed,
        upgraded: c.upgraded,
        downgraded: c.downgraded,
        changed: c.changed,
        netAdd: c.netAdd,
        activeRepos: c.activeRepos,
        velocity: cv.velocity ?? null,
        acceleration: cv.acceleration ?? null,
        weekClose: closes.get(c.weekStart) ?? null,
        weekReturn,
        fwd1Return: cumulativeForwardReturn(closes, c.weekStart, forwardWeeks[0] ?? 1),
        fwd2Return: forwardWeeks.includes(2)
          ? cumulativeForwardReturn(closes, c.weekStart, 2)
          : null,
        fwd4Return: forwardWeeks.includes(4)
          ? cumulativeForwardReturn(closes, c.weekStart, 4)
          : null,
      });
    }
  }

  return rows;
}

/** Pearson correlation coefficient; null when fewer than 2 pairs. */
export function pearson(xs: number[], ys: number[]): { r: number; n: number } | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return { r: num / Math.sqrt(dx2 * dy2), n };
}

export interface CorrResult {
  metric: string;
  n: number;
  r: number;
}

export interface OverlaySummary {
  ticker: string;
  weeks: number;
  activeWeeks: number;
  correlations: {
    weekReturn: CorrResult[];
    fwd1: CorrResult[];
    fwd2: CorrResult[];
    fwd4: CorrResult[];
  };
}

/** Per-ticker correlations of each adoption metric vs each return column. */
export function summarizeOverlay(rows: OverlayRow[]): OverlaySummary[] {
  const METRICS: ReadonlyArray<string> = [
    'added',
    'removed',
    'upgraded',
    'changed',
    'netAdd',
    'activeRepos',
    'velocity',
    'acceleration',
  ];

  const tickers = [...new Set(rows.map((r) => r.companyTicker))].sort();
  return tickers.map((ticker) => {
    const tickerRows = rows.filter((r) => r.companyTicker === ticker);
    const corr = (col: (r: OverlayRow) => number | null): CorrResult[] =>
      METRICS.map((metric) => {
        const xs: number[] = [];
        const ys: number[] = [];
        for (const r of tickerRows) {
          const x = (r as any)[metric];
          const y = col(r);
          if (typeof x === 'number' && y != null && Number.isFinite(y)) {
            xs.push(x);
            ys.push(y);
          }
        }
        const p = pearson(xs, ys);
        return p ? { metric, n: p.n, r: p.r } : { metric, n: 0, r: 0 };
      }).filter((c) => c.n >= 2);

    return {
      ticker,
      weeks: tickerRows.length,
      activeWeeks: tickerRows.filter(
        (r) => r.added + r.removed + r.upgraded + r.downgraded + r.changed > 0,
      ).length,
      correlations: {
        weekReturn: corr((r) => r.weekReturn),
        fwd1: corr((r) => r.fwd1Return),
        fwd2: corr((r) => r.fwd2Return),
        fwd4: corr((r) => r.fwd4Return),
      },
    };
  });
}

/** Serialize the overlay table to CSV. */
export function overlayToCsv(rows: OverlayRow[]): string {
  const header = [
    'weekStart',
    'companyTicker',
    'added',
    'removed',
    'upgraded',
    'downgraded',
    'changed',
    'netAdd',
    'activeRepos',
    'velocity',
    'acceleration',
    'weekClose',
    'weekReturn',
    'fwd1Return',
    'fwd2Return',
    'fwd4Return',
  ];
  const fmt = (v: number | null): string => (v == null ? '' : v.toFixed(6));
  const lines = rows.map((r) =>
    [
      r.weekStart,
      r.companyTicker,
      r.added,
      r.removed,
      r.upgraded,
      r.downgraded,
      r.changed,
      r.netAdd,
      r.activeRepos,
      fmt(r.velocity),
      fmt(r.acceleration),
      r.weekClose == null ? '' : Number(r.weekClose.toFixed(2)),
      fmt(r.weekReturn),
      fmt(r.fwd1Return),
      fmt(r.fwd2Return),
      fmt(r.fwd4Return),
    ].join(','),
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}
