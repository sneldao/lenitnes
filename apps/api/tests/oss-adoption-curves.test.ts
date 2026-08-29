import { describe, expect, it } from 'vitest';
import { buildWeeklyCurves, curvesToCsv, fillWeeklyGaps, weekStartOf } from '../src/services/oss-adoption/curves.js';
import type { DependencyEvent } from '../src/services/oss-adoption/types.js';

function makeEvent(partial: Partial<DependencyEvent>): DependencyEvent {
  return {
    repository: 'example/app',
    commitSha: 'abc',
    committedAt: '2026-08-24T00:00:00Z',
    manifestPath: 'package.json',
    ecosystem: 'npm',
    packageName: '@azure/identity',
    change: 'added',
    versionBefore: null,
    versionAfter: '1.0.0',
    companyTicker: 'MSFT',
    mappingRef: 'azure-sdk-js',
    mappingConfidence: 'high',
    sourceUrl: 'https://github.com/example/app/commit/abc',
    ...partial,
  };
}

describe('OSS adoption weekly curves', () => {
  it('computes the Monday start of an ISO week (UTC)', () => {
    expect(weekStartOf('2026-08-24T00:00:00Z')).toBe('2026-08-24'); // Monday
    expect(weekStartOf('2026-08-27T12:00:00Z')).toBe('2026-08-24'); // Thursday
    expect(weekStartOf('2026-08-30T23:59:59Z')).toBe('2026-08-24'); // Sunday → same week
    expect(weekStartOf('2026-08-31T00:00:00Z')).toBe('2026-08-31'); // next Monday
    expect(weekStartOf('not-a-date')).toBe('');
  });

  it('buckets mapped events by ticker and ISO week, counting change types', () => {
    const events = [
      makeEvent({ committedAt: '2026-08-25T00:00:00Z', change: 'added' }),
      makeEvent({ committedAt: '2026-08-26T00:00:00Z', change: 'upgraded' }),
      makeEvent({ committedAt: '2026-08-27T00:00:00Z', change: 'added' }),
      makeEvent({ committedAt: '2026-09-01T00:00:00Z', change: 'removed', companyTicker: 'AMZN' }),
      makeEvent({ committedAt: '2026-09-02T00:00:00Z', change: 'removed' }),
      // Unmapped event must not contribute
      makeEvent({ companyTicker: null, change: 'added' }),
    ];

    const curves = buildWeeklyCurves(events);
    expect(curves).toHaveLength(3); // MSFT wk1, AMZN wk1, MSFT wk2

    const msftWk1 = curves.find((c) => c.companyTicker === 'MSFT' && c.weekStart === '2026-08-24')!;
    expect(msftWk1.added).toBe(2);
    expect(msftWk1.upgraded).toBe(1);
    expect(msftWk1.removed).toBe(0);
    expect(msftWk1.netAdd).toBe(2);
    expect(msftWk1.activeRepos).toBe(1); // same repo, same week

    const msftWk2 = curves.find((c) => c.companyTicker === 'MSFT' && c.weekStart === '2026-08-31')!;
    expect(msftWk2.removed).toBe(1);
    expect(msftWk2.netAdd).toBe(-1);

    const amzn = curves.find((c) => c.companyTicker === 'AMZN')!;
    expect(amzn.weekStart).toBe('2026-08-31');
    expect(amzn.removed).toBe(1);
  });

  it('counts distinct active repos per week (not per event)', () => {
    const events = [
      makeEvent({ committedAt: '2026-08-25T00:00:00Z', repository: 'repo/a', change: 'added' }),
      makeEvent({ committedAt: '2026-08-26T00:00:00Z', repository: 'repo/a', change: 'upgraded' }),
      makeEvent({ committedAt: '2026-08-27T00:00:00Z', repository: 'repo/b', change: 'added' }),
    ];
    const curves = buildWeeklyCurves(events);
    expect(curves[0].activeRepos).toBe(2);
    expect(curves[0].added).toBe(2);
  });

  it('supports filtering to specific tickers', () => {
    const events = [
      makeEvent({ companyTicker: 'MSFT', change: 'added' }),
      makeEvent({ companyTicker: 'AMZN', change: 'removed' }),
    ];
    const curves = buildWeeklyCurves(events, { companyTickers: ['MSFT'] });
    expect(curves).toHaveLength(1);
    expect(curves[0].companyTicker).toBe('MSFT');
  });

  it('fills missing weeks with zero-count buckets', () => {
    const curves = buildWeeklyCurves([makeEvent({ committedAt: '2026-08-25T00:00:00Z', change: 'added' })]);
    const filled = fillWeeklyGaps(curves, 'MSFT', '2026-08-24', '2026-09-07');
    expect(filled).toHaveLength(3); // 2026-08-24, 2026-08-31, 2026-09-07
    expect(filled[0].added).toBe(1); // real bucket
    expect(filled[1].added).toBe(0); // filled gap
    expect(filled[2].added).toBe(0);
    expect(filled.map((w) => w.weekStart)).toEqual(['2026-08-24', '2026-08-31', '2026-09-07']);
  });

  it('serializes curves to CSV', () => {
    const curves = buildWeeklyCurves([makeEvent({ committedAt: '2026-08-25T00:00:00Z', change: 'added' })]);
    const csv = curvesToCsv(curves);
    expect(csv.split('\n')[0]).toBe('weekStart,companyTicker,added,removed,upgraded,downgraded,changed,netAdd,activeRepos');
    expect(csv).toContain('2026-08-24,MSFT,1,0,0,0,0,1,1');
  });
});
