// ─────────────────────────────────────────────────────────────
// Propr perp asset registry — coingecko_id → Hyperliquid perp
// symbol. The complement of treasury/asset-registry.ts (which is
// spot-only on BSC and deliberately omits zcash/solana/sui/arbitrum
// for lack of BSC liquidity). Propr trades these as Hyperliquid
// perpetuals, so this is the surface that finally lets a SHORT on
// ZEC (and longs on the omitted assets) go live.
//
// `szDecimals` is the per-asset lot size from Hyperliquid's public
// `metaAndAssetCtxs` universe (queried 2026-07-25). `maxLeverage` is
// the per-asset cap from Propr's live /leverage-limits/effective
// (BTC/ETH 5x; all other crypto 2x). Both are used to size and
// guard orders in propr/index.ts.
// ─────────────────────────────────────────────────────────────

export interface ProprPerpAsset {
  /** Hyperliquid perp symbol, e.g. "ZEC" (no pair suffix). */
  symbol: string;
  /** Lot size (decimal places) from Hyperliquid meta `szDecimals`. */
  szDecimals: number;
  /** Max leverage allowed by Propr for this asset. */
  maxLeverage: number;
}

// Keys are coingecko_ids (the same identifier the rest of the system
// uses for price resolution + the orders/positions `asset` column).
export const PROPR_ASSET_REGISTRY: Record<string, ProprPerpAsset> = {
  zcash: { symbol: 'ZEC', szDecimals: 2, maxLeverage: 2 },
  bitcoin: { symbol: 'BTC', szDecimals: 5, maxLeverage: 5 },
  ethereum: { symbol: 'ETH', szDecimals: 4, maxLeverage: 5 },
  solana: { symbol: 'SOL', szDecimals: 2, maxLeverage: 2 },
  sui: { symbol: 'SUI', szDecimals: 1, maxLeverage: 2 },
  arbitrum: { symbol: 'ARB', szDecimals: 1, maxLeverage: 2 },
};

/**
 * Resolve a coingecko_id to a Propr-tradable perp, or null if the
 * asset isn't listed on Propr/Hyperliquid. The adapter refuses to
 * trade anything that returns null here.
 */
export function resolveProprAsset(coingeckoId: string | undefined): ProprPerpAsset | null {
  if (!coingeckoId) return null;
  return PROPR_ASSET_REGISTRY[coingeckoId] ?? null;
}

/** Round a numeric quantity to the asset's lot size as a string. */
export function formatPerpQuantity(quantity: number, szDecimals: number): string {
  if (quantity <= 0) return '0';
  return quantity.toFixed(szDecimals);
}
