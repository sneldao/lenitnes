// ─────────────────────────────────────────────────────────────
// Hyperliquid public market-data provider.
//
// The Propr SDK is a brokerage layer with no market-data endpoints,
// but Hyperliquid exposes a public, auth-free info API that returns
// per-asset funding rate, open interest, mark price, and volume for
// exactly the perpetuals we trade (via the Propr registry). This is
// the perp-native structure data that makes funding/OI a first-class
// signal instead of a line of prose in market_context.
//
// Endpoint: POST https://api.hyperliquid.xyz/info {"type":"metaAndAssetCtxs"}
// Returns [meta, assetCtxs] aligned by index across meta.universe.
// ─────────────────────────────────────────────────────────────

import { logger } from '../../../logger.js';
import { PROPR_ASSET_REGISTRY } from '../../venues/propr/asset-registry.js';

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const TIMEOUT_MS = 10_000;

export interface PerpAssetContext {
  /** Hyperliquid perp symbol, e.g. "ZEC". */
  symbol: string;
  /** Hourly funding rate as a decimal (0.0001 = 0.01%/hr). Positive = longs pay. */
  fundingRate: number;
  /** Annualized funding (hourly × 24 × 365), for human-readable context. */
  fundingRateAnnualized: number;
  /** Open interest in USD (openInterest base units × mark price). */
  openInterestUsd: number;
  /** Mark price in USD. */
  markPriceUsd: number;
  /** 24h notional volume in USD. */
  volume24hUsd: number;
}

interface RawAssetCtx {
  funding?: string;
  openInterest?: string;
  markPx?: string;
  dayNtlVlm?: string;
}

interface RawMeta {
  universe?: Array<{ name?: string }>;
}

let cache: { at: number; ctxs: Map<string, PerpAssetContext> } | null = null;
const CACHE_TTL_MS = 60_000;

/**
 * Fetch the full universe of asset contexts once and cache for 60s.
 * The proactive scan reads several assets per cycle; batching avoids
 * one HTTP round-trip per asset.
 */
async function fetchUniverseContexts(): Promise<Map<string, PerpAssetContext> | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.ctxs;

  try {
    const res = await fetch(HL_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'hyperliquid info: request failed');
      return null;
    }
    const data = (await res.json()) as [RawMeta, RawAssetCtx[]];
    const meta = data?.[0];
    const ctxs = data?.[1];
    if (!Array.isArray(meta?.universe) || !Array.isArray(ctxs)) return null;

    const bySymbol = new Map<string, PerpAssetContext>();
    for (let i = 0; i < meta.universe.length && i < ctxs.length; i++) {
      const name = meta.universe[i]?.name;
      const raw = ctxs[i];
      if (!name || !raw) continue;

      const fundingRate = parseFloat(raw.funding ?? '0');
      const openInterestBase = parseFloat(raw.openInterest ?? '0');
      const markPriceUsd = parseFloat(raw.markPx ?? '0');
      const volume24hUsd = parseFloat(raw.dayNtlVlm ?? '0');

      bySymbol.set(name.toUpperCase(), {
        symbol: name.toUpperCase(),
        fundingRate,
        fundingRateAnnualized: fundingRate * 24 * 365,
        openInterestUsd: openInterestBase * markPriceUsd,
        markPriceUsd,
        volume24hUsd,
      });
    }

    cache = { at: Date.now(), ctxs: bySymbol };
    return bySymbol;
  } catch (err) {
    logger.error({ err }, 'hyperliquid info: fetch failed');
    return null;
  }
}

/**
 * Resolve perp market context for a coingecko asset we trade, via
 * the Propr registry's symbol mapping. Returns null if the asset
 * isn't tradeable on our perp venue or HL has no data for it.
 */
export async function getPerpAssetContext(coingeckoId: string): Promise<PerpAssetContext | null> {
  const asset = PROPR_ASSET_REGISTRY[coingeckoId];
  if (!asset) return null;
  const ctxs = await fetchUniverseContexts();
  return ctxs?.get(asset.symbol) ?? null;
}

/**
 * Context for every asset in the Propr perp registry, in one batch.
 * Used by the funding/OI detector to scan the whole tradeable set.
 */
export async function getAllTradeablePerpContexts(): Promise<
  Array<{ coingeckoId: string; ctx: PerpAssetContext }>
> {
  const ctxs = await fetchUniverseContexts();
  if (!ctxs) return [];
  const out: Array<{ coingeckoId: string; ctx: PerpAssetContext }> = [];
  for (const [coingeckoId, asset] of Object.entries(PROPR_ASSET_REGISTRY)) {
    const ctx = ctxs.get(asset.symbol);
    if (ctx) out.push({ coingeckoId, ctx });
  }
  return out;
}

// Test helper — drop the cache between tests.
export function _internalResetHlCache(): void {
  cache = null;
}
