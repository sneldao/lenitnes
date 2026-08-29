import { describe, it, expect } from 'vitest';
import {
  weekEndDate,
  lastPriceInWeek,
  weeklyCloses,
  weeklyReturns,
  cumulativeForwardReturn,
  buildOverlay,
  pearson,
  summarizeOverlay,
  overlayToCsv,
} from '../src/services/oss-adoption/analysis.js';
import type { AdoptionWeek } from '../src/services/oss-adoption/curves.js';
import type { PricePoint } from '../src/services/oss-adoption/prices.js';

/** Synthetic daily points, Mon–Sun, for two consecutive weeks. */
function twoWeekPrices(): PricePoint[] {
  const points: PricePoint[] = [];
  const start = new Date('2026-04-20T00:00:00Z'); // Monday
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    points.push({ date: d.toISOString().slice(0, 10), price: 100 + i });
  }
  return points;
}

describe('weekEndDate', () => {
  it('returns the Sunday that ends the ISO week', () => {
    expect(weekEndDate('2026-04-20')).toBe('2026-04-26');
    expect(weekEndDate('2026-08-24')).toBe('2026-08-30');
  });
});

describe('lastPriceInWeek', () => {
  it('returns the last point inside the week bucket', () => {
    const points = twoWeekPrices();
    expect(lastPriceInWeek(points, '2026-04-20')).toBe(106); // Sunday 04-26
    expect(lastPriceInWeek(points, '2026-04-27')).toBe(113); // Sunday 05-03
  });

  it('returns null when no point falls in the bucket', () => {
    expect(lastPriceInWeek([{ date: '2026-04-20', price: 100 }], '2026-05-04')).toBeNull();
  });
});

describe('weeklyCloses / weeklyReturns', () => {
  it('gap-fills weeks without points using the previous close', () => {
    const points = [
      { date: '2026-04-20', price: 100 },
      { date: '2026-04-21', price: 101 },
      { date: '2026-05-11', price: 110 },
    ];
    const closes = weeklyCloses(points, '2026-04-20', '2026-05-11');
    expect(closes.get('2026-04-20')).toBe(101);
    expect(closes.get('2026-04-27')).toBe(101); // carried
    expect(closes.get('2026-05-04')).toBe(101); // carried
    expect(closes.get('2026-05-11')).toBe(110);
  });

  it('computes week-over-week returns', () => {
    const closes = new Map([
      ['2026-04-20', 106],
      ['2026-04-27', 113],
      ['2026-05-04', 120],
    ]);
    const returns = weeklyReturns(closes);
    expect(returns.get('2026-04-27')).toBeCloseTo(113 / 106 - 1);
    expect(returns.get('2026-05-04')).toBeCloseTo(120 / 113 - 1);
    expect(returns.has('2026-04-20')).toBe(false);
  });
});

describe('cumulativeForwardReturn', () => {
  it('compounds close-to-close over the next N weeks', () => {
    const closes = new Map([
      ['2026-04-20', 100],
      ['2026-04-27', 110],
      ['2026-05-04', 121],
    ]);
    expect(cumulativeForwardReturn(closes, '2026-04-20', 1)).toBeCloseTo(0.1);
    expect(cumulativeForwardReturn(closes, '2026-04-20', 2)).toBeCloseTo(0.21);
  });

  it('returns null when the forward window runs past available data', () => {
    const closes = new Map([['2026-04-20', 100]]);
    expect(cumulativeForwardReturn(closes, '2026-04-20', 1)).toBeNull();
  });
});

describe('buildOverlay', () => {
  it('aligns adoption weeks with price returns per ticker', () => {
    const curves: AdoptionWeek[] = [
      {
        weekStart: '2026-04-20',
        companyTicker: 'AMZN',
        added: 1,
        removed: 0,
        upgraded: 2,
        downgraded: 0,
        changed: 0,
        netAdd: 1,
        activeRepos: 1,
      },
      {
        weekStart: '2026-04-27',
        companyTicker: 'AMZN',
        added: 0,
        removed: 0,
        upgraded: 0,
        downgraded: 0,
        changed: 0,
        netAdd: 0,
        activeRepos: 0,
      },
    ];
    const priceByTicker = new Map<string, PricePoint[]>([['AMZN', twoWeekPrices()]]);

    const rows = buildOverlay(curves, priceByTicker);
    expect(rows).toHaveLength(2);

    const [w1, w2] = rows;
    expect(w1.weekClose).toBe(106);
    expect(w1.weekReturn).toBeNull(); // first week has no prior close
    expect(w1.fwd1Return).toBeCloseTo(113 / 106 - 1);

    expect(w2.weekReturn).toBeCloseTo(113 / 106 - 1);
    expect(w2.fwd1Return).toBeNull(); // no week after 04-27 in this series
  });
});

describe('pearson / summarizeOverlay', () => {
  it('computes Pearson r and drops degenerate columns', () => {
    const xs = [1, 2, 3, 4];
    const ys = [2, 4, 6, 8];
    const p = pearson(xs, ys);
    expect(p).not.toBeNull();
    expect(p!.r).toBeCloseTo(1);
    expect(p!.n).toBe(4);

    expect(pearson([1], [1])).toBeNull();
    expect(pearson([1, 1, 1], [2, 3, 4])).toBeNull(); // zero variance
  });

  it('produces a per-ticker correlation summary', () => {
    // Build 6 weeks of adoption curves where netAdd increases monotonically.
    const curves: AdoptionWeek[] = [];
    const start = new Date('2026-04-20T00:00:00Z');
    for (let i = 0; i < 6; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i * 7);
      const week = d.toISOString().slice(0, 10);
      curves.push({
        weekStart: week,
        companyTicker: 'MSFT',
        added: i,
        removed: 0,
        upgraded: 0,
        downgraded: 0,
        changed: 0,
        netAdd: i,
        activeRepos: i > 0 ? 1 : 0,
      });
    }
    // Price points: Sunday closes at [100, 102, 105.06, 109.26, 114.72, 120.46, 126.48]
    // so weekly returns are [2%, 3%, 4%, 5%, 5%] — increasing → positive r with netAdd.
    const sundayCloses = [100, 102, 105.06, 109.26, 114.72, 120.46, 126.48];
    const points: PricePoint[] = sundayCloses.map((price, i) => {
      const d = new Date('2026-04-26T00:00:00Z'); // first Sunday
      d.setUTCDate(d.getUTCDate() + i * 7);
      return { date: d.toISOString().slice(0, 10), price };
    });

    const priceByTicker = new Map<string, PricePoint[]>([['MSFT', points]]);
    const rows = buildOverlay(curves, priceByTicker);
    const summary = summarizeOverlay(rows);
    expect(summary).toHaveLength(1);
    const msft = summary[0];
    expect(msft.ticker).toBe('MSFT');
    expect(msft.weeks).toBe(6);

    const netAddFwd1 = msft.correlations.fwd1.find((c) => c.metric === 'netAdd');
    expect(netAddFwd1).toBeDefined();
    expect(netAddFwd1!.n).toBeGreaterThanOrEqual(5);
    expect(netAddFwd1!.r).toBeGreaterThan(0.5);
  });

  it('serializes the overlay to CSV with headers', () => {
    const rows = buildOverlay(
      [
        {
          weekStart: '2026-04-20',
          companyTicker: 'AMZN',
          added: 1,
          removed: 0,
          upgraded: 0,
          downgraded: 0,
          changed: 0,
          netAdd: 1,
          activeRepos: 1,
        },
      ],
      new Map<string, PricePoint[]>([['AMZN', twoWeekPrices()]]),
    );
    const csv = overlayToCsv(rows);
    expect(csv.split('\n')[0]).toContain('weekStart,companyTicker');
    expect(csv).toContain('2026-04-20,AMZN,1,0,0,0,0,1,1,106');
  });
});
