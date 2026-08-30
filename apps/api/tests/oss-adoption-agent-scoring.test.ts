import { describe, it, expect } from 'vitest';
import {
  heuristicScoreEvent,
  scoredCurveMultiplier,
  scoreEvents,
} from '../src/services/oss-adoption/agent-scoring.js';
import { buildWeightedCurves } from '../src/services/oss-adoption/curves.js';
import type { DependencyEvent } from '../src/services/oss-adoption/types.js';

function makeEvent(
  partial: Partial<DependencyEvent> & { commitMessage?: string },
): DependencyEvent {
  return {
    repository: 'example/app',
    commitSha: 'abc123',
    committedAt: '2026-02-02T12:00:00Z',
    manifestPath: 'package.json',
    ecosystem: 'npm',
    packageName: '@aws-sdk/client-s3',
    change: 'upgraded',
    versionBefore: '3.100.0',
    versionAfter: '3.120.0',
    companyTicker: 'AMZN',
    mappingRef: 'aws-sdk-js-v3',
    mappingConfidence: 'high',
    sourceUrl: 'https://github.com/example/app/commit/abc123',
    ...partial,
  };
}

describe('heuristicScoreEvent', () => {
  it('scores strategic migration language high', () => {
    const e = makeEvent({
      commitMessage: 'migrate storage to @aws-sdk/client-s3 and drop legacy S3 lib',
    });
    const s = heuristicScoreEvent(e);
    expect(s.score).toBeGreaterThan(0.7);
    expect(s.source).toBe('heuristic');
  });

  it('scores routine bot bumps low', () => {
    const e = makeEvent({
      commitMessage: 'chore(deps): bump @aws-sdk/client-s3 from 3.100.0 to 3.101.1',
    });
    const s = heuristicScoreEvent(e);
    expect(s.score).toBeLessThan(0.4);
  });

  it('scores neutral events near 0.5', () => {
    const e = makeEvent({ change: 'changed', commitMessage: 'package.json' });
    const s = heuristicScoreEvent(e);
    expect(s.score).toBeGreaterThanOrEqual(0.3);
    expect(s.score).toBeLessThanOrEqual(0.6);
  });

  it('treats missing commit message as neutral', () => {
    const e = makeEvent({ commitMessage: '' });
    const s = heuristicScoreEvent(e);
    expect(s.score).toBeGreaterThanOrEqual(0.4);
    expect(s.score).toBeLessThanOrEqual(0.7);
  });
});

describe('scoredCurveMultiplier', () => {
  it('returns 1 for empty scores', () => {
    expect(scoredCurveMultiplier([])).toBe(1);
  });

  it('boosts weeks full of strategic events', () => {
    const strategic = makeEvent({ commitMessage: 'migrate to new aws sdk' });
    const m = scoredCurveMultiplier([
      heuristicScoreEvent(strategic),
      heuristicScoreEvent(strategic),
    ]);
    expect(m).toBeGreaterThan(1);
  });

  it('damps weeks full of routine events', () => {
    const routine = makeEvent({ commitMessage: 'chore(deps): bump' });
    const m = scoredCurveMultiplier([heuristicScoreEvent(routine), heuristicScoreEvent(routine)]);
    expect(m).toBeLessThan(1);
  });
});

describe('scoreEvents', () => {
  it('scores only mapped events', () => {
    const mapped = makeEvent({ commitMessage: 'migrate' });
    const unmapped = makeEvent({ companyTicker: null, commitMessage: 'chore bump' });
    const scored = scoreEvents([mapped, unmapped]);
    expect(scored).toHaveLength(1);
    expect(scored[0].event.companyTicker).toBe('AMZN');
  });
});

describe('buildWeightedCurves', () => {
  it('weights counts by the score-derived multiplier', () => {
    const strategic = makeEvent({
      repository: 'example/app-a',
      change: 'added',
      commitMessage: 'migrate to aws sdk v3',
      committedAt: '2026-02-02T12:00:00Z',
    });
    const routine = makeEvent({
      repository: 'example/app-b',
      change: 'added',
      commitMessage: 'chore(deps): bump',
      committedAt: '2026-02-02T12:00:00Z',
    });
    const weight = (e: DependencyEvent) => 2 * heuristicScoreEvent(e).score;
    const raw = buildWeightedCurves([strategic, routine], () => 1);
    const weighted = buildWeightedCurves([strategic, routine], weight);
    const rawWeek = raw[0];
    const weightedWeek = weighted[0];
    // Strategic event scores > 0.5 (weight > 1), routine < 0.5 (weight < 1).
    // Two added events: raw=2; weighted = 2*(s_strategic + s_routine) which
    // lands above 2 because the strategic boost exceeds the routine discount.
    expect(weightedWeek.added).toBeGreaterThan(rawWeek.added);
    expect(weightedWeek.added).toBeGreaterThan(2);
    // And the strategic event alone outweighs the routine event.
    const strategicOnly = buildWeightedCurves([strategic], weight)[0].added;
    const routineOnly = buildWeightedCurves([routine], weight)[0].added;
    expect(strategicOnly).toBeGreaterThan(routineOnly);
    expect(weightedWeek.activeRepos).toBe(2);
  });
});
