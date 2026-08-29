import { describe, it, expect } from 'vitest';
import {
  linearSlope,
  trailingSlopes,
  scoreCurves,
  scoredCurvesToCsv,
} from '../src/services/oss-adoption/scoring.js';
import type { AdoptionWeek } from '../src/services/oss-adoption/curves.js';

describe('linearSlope', () => {
  it('returns null for <2 points', () => {
    expect(linearSlope([])).toBeNull();
    expect(linearSlope([10])).toBeNull();
  });

  it('returns 0 for flat series', () => {
    const s = linearSlope([5, 5, 5, 5]);
    expect(s).toBeCloseTo(0, 6);
  });

  it('returns positive slope for increasing series', () => {
    const s = linearSlope([10, 20, 30, 40]);
    expect(s).toBeCloseTo(10, 6);
  });

  it('returns negative slope for decreasing series', () => {
    const s = linearSlope([40, 30, 20, 10]);
    expect(s).toBeCloseTo(-10, 6);
  });
});

describe('trailingSlopes', () => {
  it('returns null for the first entry (single point), slopes after', () => {
    const s = trailingSlopes([10, 20, 30, 40], 4);
    expect(s[0]).toBeNull(); // [10] → <2 points
    expect(s[1]).toBeCloseTo(10, 6); // [10,20]
    expect(s[2]).toBeCloseTo(10, 6); // [10,20,30]
    expect(s[3]).toBeCloseTo(10, 6); // [10,20,30,40]
  });

  it('handles window=2', () => {
    const s = trailingSlopes([10, 20, 30, 40], 2);
    expect(s[0]).toBeNull();
    expect(s[1]).toBeCloseTo(10, 6);
    expect(s[2]).toBeCloseTo(10, 6);
    expect(s[3]).toBeCloseTo(10, 6);
  });
});

describe('scoreCurves', () => {
  function makeWeek(ws: string, netAdd: number): AdoptionWeek {
    return {
      weekStart: ws,
      companyTicker: 'AMZN',
      added: netAdd > 0 ? netAdd : 0,
      removed: 0,
      upgraded: 0,
      downgraded: 0,
      changed: 0,
      netAdd,
      activeRepos: netAdd > 0 ? 1 : 0,
    };
  }

  it('annotates gap-filled curves with velocity/acceleration', () => {
    const curves = [
      makeWeek('2026-01-05', 0),
      makeWeek('2026-01-12', 0),
      makeWeek('2026-01-19', 0),
      makeWeek('2026-01-26', 0),
      makeWeek('2026-02-02', 1),
      makeWeek('2026-02-09', 2),
      makeWeek('2026-02-16', 3),
      makeWeek('2026-02-23', 4),
    ];
    const scored = scoreCurves(curves, { metric: 'netAdd', window: 4 });
    // First week: no velocity (<2 points)
    expect(scored[0].velocity).toBeNull();
    // Week 2 (index 1): [0,0] → slope 0
    expect(scored[1].velocity).toBeCloseTo(0, 6);
    // Week 3 (index 2): [0,0,0] → slope 0
    expect(scored[2].velocity).toBeCloseTo(0, 6);
    // Week 4 (index 3): velocities [null,0,0,0] → accel 0 (not null)
    expect(scored[3].acceleration).toBeCloseTo(0, 6);
    // Week 5 (index 4): [0,0,0,1] → slope ~0.3
    expect(scored[4].velocity).toBeGreaterThan(0.2);
    // Week 6 (index 5): [0,0,1,2] → slope ~0.4
    expect(scored[5].velocity).toBeGreaterThan(0.3);
    // Week 7 (index 6): [0,1,2,3] → slope ~0.6
    expect(scored[6].velocity).toBeGreaterThan(0.5);
    // Week 8 (index 7): [1,2,3,4] → slope 1.0
    expect(scored[7].velocity).toBeCloseTo(1, 5);
    // Acceleration should be non-null for weeks where velocity changed
    expect(scored[7].acceleration).not.toBeNull();
  });

  it('handles multiple tickers independently', () => {
    const curves: AdoptionWeek[] = [
      {
        weekStart: '2026-01-26',
        companyTicker: 'AMZN',
        added: 0,
        removed: 0,
        upgraded: 0,
        downgraded: 0,
        changed: 0,
        netAdd: 0,
        activeRepos: 0,
      },
      {
        weekStart: '2026-02-02',
        companyTicker: 'AMZN',
        added: 1,
        removed: 0,
        upgraded: 0,
        downgraded: 0,
        changed: 0,
        netAdd: 1,
        activeRepos: 1,
      },
      {
        weekStart: '2026-01-26',
        companyTicker: 'MSFT',
        added: 0,
        removed: 0,
        upgraded: 0,
        downgraded: 0,
        changed: 0,
        netAdd: 0,
        activeRepos: 0,
      },
      {
        weekStart: '2026-02-02',
        companyTicker: 'MSFT',
        added: 0,
        removed: 0,
        upgraded: 0,
        downgraded: 0,
        changed: 0,
        netAdd: 0,
        activeRepos: 0,
      },
    ];
    const scored = scoreCurves(curves, { metric: 'netAdd', window: 2 });
    const amznScored = scored.filter((s) => s.companyTicker === 'AMZN');
    const msftScored = scored.filter((s) => s.companyTicker === 'MSFT');
    expect(amznScored[1].velocity).toBeCloseTo(1, 5);
    expect(msftScored[1].velocity).toBeCloseTo(0, 5);
  });
});

describe('scoredCurvesToCsv', () => {
  it('includes velocity/acceleration columns', () => {
    const curves = [
      {
        weekStart: '2026-01-01',
        companyTicker: 'AMZN',
        added: 0,
        removed: 0,
        upgraded: 0,
        downgraded: 0,
        changed: 0,
        netAdd: 0,
        activeRepos: 0,
        velocity: 0.5,
        acceleration: 0.1,
      },
    ];
    const csv = scoredCurvesToCsv(curves);
    expect(csv.split('\n')[0]).toContain('velocity,acceleration');
    expect(csv).toContain('0.500000');
    expect(csv).toContain('0.100000');
  });
});
