// ─────────────────────────────────────────────────────────────
// Outcome metrics — single source of truth for directional hit
// logic shared by scorecard SQL, agent past_outcomes, replay
// summaries, and backtest stat refresh.
// ─────────────────────────────────────────────────────────────

export type RecommendedAction = 'long' | 'short' | 'none';
export type PriceDirection = 'up' | 'down' | 'flat';

/** True when price moved in the agent's predicted direction. */
export function isDirectionalHit(
  recommendedAction: RecommendedAction | string | null | undefined,
  priceDirection: PriceDirection | string | null | undefined,
): boolean {
  if (!recommendedAction || recommendedAction === 'none') return false;
  return (
    (recommendedAction === 'long' && priceDirection === 'up') ||
    (recommendedAction === 'short' && priceDirection === 'down')
  );
}

/** Sign-flip pct change so positive = the trade was right. */
export function directionalPctChange(
  pctChange: number | null | undefined,
  recommendedAction: RecommendedAction | string | null | undefined,
): number | null {
  if (pctChange == null || Number.isNaN(pctChange)) return null;
  if (recommendedAction === 'short') return -pctChange;
  return pctChange;
}

/**
 * SQL predicate for CTEs that expose `recommended_action` and
 * `direction` column aliases (T+1d window).
 */
export function sqlHitPredicate(): string {
  return `
    (
      (recommended_action = 'long' AND direction = 'up') OR
      (recommended_action = 'short' AND direction = 'down')
    )
  `;
}
