// ─────────────────────────────────────────────────────────────
// Funding / open-interest anomaly detector — perps-native structure.
//
// The operation trades Hyperliquid perpetuals (via Propr), yet until
// now funding rate and open interest were only a line of prose in
// market_context for the LLM to read. This makes them a gated,
// scored signal with a clear directional read:
//
//   - Extreme POSITIVE funding → longs are paying heavily to stay
//     long → crowded long → mean-reversion short pressure.
//   - Extreme NEGATIVE funding → shorts are paying → crowded short →
//     mean-reversion long pressure.
//   - Open interest is the conviction multiplier: an extreme funding
//     reading on thin OI is noise; the same reading on heavy OI is a
//     positioning event.
//
// The detector is DIRECTIONAL (unlike velocity/PR, which are "both"):
// the funding sign maps to a recommended direction. It emits a
// classification whose metadata carries `suggestedDirection` so the
// agent has a strong prior — the rubric still arbitrates.
//
// Threshold: score ≥ 55 → signal.
// ─────────────────────────────────────────────────────────────

import { logger } from '../../logger.js';
import { getAllTradeablePerpContexts } from '../data-providers/hyperliquid/index.js';
import type { PerpAssetContext } from '../data-providers/hyperliquid/index.js';
import type { SignalClassification } from '@lenitnes/types';

/** Score threshold at which a funding/OI reading fires a signal. */
export const FUNDING_OI_SIGNAL_THRESHOLD = 55;

/**
 * Hourly funding magnitude (decimal) considered "extreme". Perps
 * funding of 0.01%/hr is the neutral baseline; ±0.03%/hr and beyond
 * indicates a strongly crowded side. 0.0003 = 0.03%/hr ≈ 26%/yr.
 */
export const EXTREME_FUNDING_HOURLY = 0.0003;

export interface FundingOiReading {
  coingeckoId: string;
  symbol: string;
  fundingRateHourly: number;
  fundingAnnualizedPct: number;
  openInterestUsd: number;
  volume24hUsd: number;
  /** long | short — the contrarian read of the funding sign. */
  suggestedDirection: 'long' | 'short';
  score: number;
  confidence: number;
  reasons: string[];
  /** True when score ≥ FUNDING_OI_SIGNAL_THRESHOLD. */
  triggered: boolean;
}

function scoreReading(ctx: PerpAssetContext): {
  score: number;
  confidence: number;
  suggestedDirection: 'long' | 'short';
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;
  let confidence = 35;

  // Crowded-long (positive funding) → contrarian short, and vice
  // versa. Near-zero funding has no edge.
  const suggestedDirection: 'long' | 'short' = ctx.fundingRate >= 0 ? 'short' : 'long';

  const extremeRatio = Math.abs(ctx.fundingRate) / EXTREME_FUNDING_HOURLY;
  if (extremeRatio < 1) {
    // Below the extreme bar — not a positioning signal.
    return { score: 0, confidence: 0, suggestedDirection, reasons: ['funding within normal band'] };
  }

  // Funding extremity: linear past the bar, capped. 1× bar → base,
  // 3× bar → near-max.
  const fundingScore = Math.min(70, Math.round((extremeRatio - 1) * 35 + 30));
  score += fundingScore;
  reasons.push(
    `${suggestedDirection === 'short' ? 'crowded long' : 'crowded short'}: ` +
      `${(ctx.fundingRate * 100).toFixed(4)}%/hr (${(ctx.fundingRateAnnualized * 100).toFixed(0)}%/yr)`,
  );
  confidence += Math.min(35, Math.round(extremeRatio * 10));

  // Open interest conviction multiplier. Heavy OI means the crowd is
  // large and the mean-reversion has teeth; thin OI means the extreme
  // rate is just a few whales and the signal is fragile.
  if (ctx.openInterestUsd >= 100_000_000) {
    score += 25;
    reasons.push(`heavy OI: $${(ctx.openInterestUsd / 1_000_000).toFixed(0)}M`);
    confidence += 15;
  } else if (ctx.openInterestUsd >= 20_000_000) {
    score += 12;
    reasons.push(`moderate OI: $${(ctx.openInterestUsd / 1_000_000).toFixed(0)}M`);
    confidence += 8;
  } else {
    score = Math.round(score * 0.7);
    reasons.push(`thin OI (discounted): $${(ctx.openInterestUsd / 1_000_000).toFixed(1)}M`);
    confidence = Math.max(20, confidence - 10);
  }

  // Volume sanity: an extreme rate with near-zero volume is a dead
  // market artifact, not a tradeable setup.
  if (ctx.volume24hUsd < 5_000_000) {
    score = Math.round(score * 0.6);
    reasons.push('low 24h volume (discounted)');
    confidence = Math.max(20, confidence - 10);
  }

  return {
    score: Math.min(100, score),
    confidence: Math.min(100, confidence),
    suggestedDirection,
    reasons,
  };
}

/**
 * Scan every asset we can trade on the perp venue and score its
 * funding/OI structure, including sub-threshold / near-miss readings
 * for the intelligence dashboard.
 */
export async function scanFundingOi(): Promise<FundingOiReading[]> {
  let contexts: Array<{ coingeckoId: string; ctx: PerpAssetContext }>;
  try {
    contexts = await getAllTradeablePerpContexts();
  } catch (err) {
    logger.warn({ err }, 'funding-oi: perp context fetch failed');
    return [];
  }

  const readings: FundingOiReading[] = [];
  for (const { coingeckoId, ctx } of contexts) {
    const { score, confidence, suggestedDirection, reasons } = scoreReading(ctx);
    readings.push({
      coingeckoId,
      symbol: ctx.symbol,
      fundingRateHourly: ctx.fundingRate,
      fundingAnnualizedPct: ctx.fundingRateAnnualized * 100,
      openInterestUsd: ctx.openInterestUsd,
      volume24hUsd: ctx.volume24hUsd,
      suggestedDirection,
      score,
      confidence,
      reasons,
      triggered: score >= FUNDING_OI_SIGNAL_THRESHOLD,
    });
  }

  // Most extreme first.
  readings.sort((a, b) => b.score - a.score);
  return readings;
}

/** Detect funding/OI anomalies (threshold-gated) for signal generation. */
export async function detectFundingOiAnomalies(): Promise<
  Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }>
> {
  const readings = await scanFundingOi();
  const results: Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }> = [];

  for (const r of readings) {
    if (!r.triggered) continue;
    results.push({
      // Funding/OI is asset-scoped, not monitor-scoped — the synthetic
      // proactive monitor row is used for persistence (url drives
      // classification, not hit.monitorId).
      monitorId: '',
      url: `hyperliquid:perp:${r.symbol}`,
      asset: r.coingeckoId,
      classification: {
        type: 'funding_oi_anomaly',
        score: r.score,
        confidence: r.confidence,
        label: `${r.symbol} ${r.suggestedDirection}: ${(r.fundingRateHourly * 100).toFixed(4)}%/hr funding`,
        metadata: {
          symbol: r.symbol,
          suggestedDirection: r.suggestedDirection,
          fundingRateHourly: r.fundingRateHourly,
          fundingAnnualizedPct: r.fundingAnnualizedPct,
          openInterestUsd: r.openInterestUsd,
          volume24hUsd: r.volume24hUsd,
          reasons: r.reasons,
        },
      },
    });
  }

  return results;
}
