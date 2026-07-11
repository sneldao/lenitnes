import { describe, it, expect } from 'vitest';
import {
  directionalPctChange,
  isDirectionalHit,
  sqlHitPredicate,
} from '../src/services/domain/outcome-metrics.js';

describe('outcome-metrics', () => {
  it('isDirectionalHit matches long/up and short/down', () => {
    expect(isDirectionalHit('long', 'up')).toBe(true);
    expect(isDirectionalHit('long', 'down')).toBe(false);
    expect(isDirectionalHit('short', 'down')).toBe(true);
    expect(isDirectionalHit('short', 'up')).toBe(false);
    expect(isDirectionalHit('none', 'up')).toBe(false);
  });

  it('directionalPctChange sign-flips for shorts', () => {
    expect(directionalPctChange(5, 'long')).toBe(5);
    expect(directionalPctChange(5, 'short')).toBe(-5);
    expect(directionalPctChange(-3, 'short')).toBe(3);
    expect(directionalPctChange(null, 'long')).toBe(null);
  });

  it('sqlHitPredicate references recommended_action and direction', () => {
    const sql = sqlHitPredicate();
    expect(sql).toContain("recommended_action = 'long'");
    expect(sql).toContain("recommended_action = 'short'");
    expect(sql).toContain('direction');
  });
});
