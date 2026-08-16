// ─────────────────────────────────────────────────────────────
// Venue-aware position PnL — the single source of truth for how
// a position's entry_amount converts to dollars.
//
// positions.entry_amount is venue-specific:
//   • spot / paper → asset QUANTITY (units of the asset)
//   • propr perps  → USD NOTIONAL (dollars of exposure)
//
// Applying price-delta × entry_amount is only correct for quantity
// books; on a notional book it inflates the result by the asset's
// price multiple — the season-1 accounting bug that reported
// −$283k where the true figure was ≈ −$607. These helpers centralize
// the rule so the realized path (closePositionById) and unrealized
// path (portfolio) cannot drift apart again.
// ─────────────────────────────────────────────────────────────

export type PnlDirection = 'long' | 'short';

export interface PositionPnl {
  pnlUsd: number;
  pnlPct: number;
}

/** True for venues whose entry_amount is USD notional, not quantity. */
export function isNotionalVenue(venue: string): boolean {
  return venue === 'propr';
}

/**
 * Compute realized/unrealized PnL for one position.
 *
 * @param venue         positions.venue ('spot' | 'paper' | 'propr')
 * @param direction     'long' | 'short' — shorts profit when price falls
 * @param entryAmount   quantity (spot/paper) or USD notional (propr)
 * @param entryPriceUsd price at open
 * @param exitPriceUsd  price at close (or current price when unrealized)
 */
export function computePositionPnl(
  venue: string,
  direction: PnlDirection,
  entryAmount: number,
  entryPriceUsd: number,
  exitPriceUsd: number,
): PositionPnl {
  const sign = direction === 'short' ? -1 : 1;
  const pnlPct = sign * ((exitPriceUsd - entryPriceUsd) / entryPriceUsd) * 100;
  const pnlUsd = isNotionalVenue(venue)
    ? entryAmount * (pnlPct / 100)
    : sign * (exitPriceUsd - entryPriceUsd) * entryAmount;
  return { pnlUsd, pnlPct };
}
