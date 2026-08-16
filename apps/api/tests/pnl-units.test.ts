// Regression tests for venue-aware PnL units (season-1 accounting bug).
//
// positions.entry_amount is venue-specific: spot/paper store asset
// QUANTITY, propr perps store USD NOTIONAL. The old close path applied
// price-delta x entry_amount to every venue, inflating propr losses by
// the asset's price multiple (reported -$283k where truth was ~-$607).

import { describe, it, expect } from 'vitest';
import { computePositionPnl, isNotionalVenue } from '../src/services/treasury/pnl.js';

describe('treasury/pnl.computePositionPnl', () => {
  it('spot long: quantity book uses price delta x quantity', () => {
    // 0.01 BTC bought at 60,000, sold at 63,000 -> +$30, +5%.
    const r = computePositionPnl('spot', 'long', 0.01, 60_000, 63_000);
    expect(r.pnlUsd).toBeCloseTo(30, 6);
    expect(r.pnlPct).toBeCloseTo(5, 6);
  });

  it('spot short: sign flips (price rise loses)', () => {
    const r = computePositionPnl('spot', 'short', 0.01, 60_000, 63_000);
    expect(r.pnlUsd).toBeCloseTo(-30, 6);
    expect(r.pnlPct).toBeCloseTo(-5, 6);
  });

  it('paper behaves like spot (quantity book)', () => {
    const r = computePositionPnl('paper', 'long', 2, 100, 110);
    expect(r.pnlUsd).toBeCloseTo(20, 6);
    expect(r.pnlPct).toBeCloseTo(10, 6);
  });

  it('propr short: notional book uses percent x notional — NOT delta x notional', () => {
    // The real season-1 zcash trade: $3,400 notional short entered at
    // 464.30, exited at 506.76. Old formula: (506.76-464.30)*3400 =
    // -$144,375 (bogus). True figure: 3400 x -9.1457% = -$310.95.
    const r = computePositionPnl('propr', 'short', 3_400, 464.2957, 506.7588);
    expect(r.pnlPct).toBeCloseTo(-9.1457, 2);
    expect(r.pnlUsd).toBeCloseTo(-310.95, 0);
    // Guard against regression to the inflated figure.
    expect(Math.abs(r.pnlUsd)).toBeLessThan(1_000);
  });

  it('propr long: notional book, price rise profits', () => {
    const r = computePositionPnl('propr', 'long', 2_600, 460.57, 464.296);
    expect(r.pnlPct).toBeCloseTo(0.8088, 2);
    expect(r.pnlUsd).toBeCloseTo(21.03, 0);
  });

  it('isNotionalVenue: only propr is notional-based', () => {
    expect(isNotionalVenue('propr')).toBe(true);
    expect(isNotionalVenue('spot')).toBe(false);
    expect(isNotionalVenue('paper')).toBe(false);
  });
});
