/**
 * Canonical CoinGecko id → CMC symbol map.
 *
 * The system addresses assets internally by CoinGecko id (`zcash`,
 * `ethereum`) but CMC's /quotes/latest endpoint takes ticker symbols
 * (ZEC/ETH). Several call sites (risk gates, agent market context) used
 * to maintain their own copies of this map — or worse, passed the
 * coingecko slug straight into CMC as a "symbol", which returns empty
 * quotes. Keep the map here so there is exactly one source of truth.
 */
export const COINGECKO_TO_CMC_SYMBOL: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  zcash: 'ZEC',
  solana: 'SOL',
  sui: 'SUI',
  arbitrum: 'ARB',
};

/** Reverse map (CMC symbol → coingecko id) for hub cache writes. */
export const CMC_SYMBOL_TO_COINGECKO: Record<string, string> = Object.fromEntries(
  Object.entries(COINGECKO_TO_CMC_SYMBOL).map(([cg, cmc]) => [cmc, cg]),
);

/** Map a coingecko id to its CMC symbol; null when not listed. */
export function coingeckoToCmcSymbol(coingeckoId: string): string | null {
  return COINGECKO_TO_CMC_SYMBOL[coingeckoId.toLowerCase()] ?? null;
}

/**
 * Normalize whatever a caller hands us (coingecko slug or CMC symbol)
 * into a CMC symbol. Pass-through for anything unknown so custom
 * treasury assets keep working.
 */
export function toCmcSymbol(idOrSymbol: string): string {
  const mapped = COINGECKO_TO_CMC_SYMBOL[idOrSymbol.toLowerCase()];
  return mapped ?? idOrSymbol.toUpperCase();
}
