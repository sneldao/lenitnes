// ─────────────────────────────────────────────────────────────
// Trade risk gating — the safety layer between the agent's
// recommendation and an actual swap.
//
// Two responsibilities:
//   1. The kill switch (`TRADING_ENABLED`). When false, every
//      live trade is forced to paper mode regardless of
//      TREASURY_MODE. The signal still ships; no on-chain
//      action happens. Default: false — production must opt in
//      explicitly via env.
//   2. Pre-trade gates: position-count limits, per-asset
//      concentration, asset-registry membership. These run
//      before the swap is signed; failure forces paper mode and
//      logs the reason.
//
// The output is a `tradeMode` that the treasury executes. A
// 'paper' decision is never an error — it's the safe default
// when any gate trips.
// ─────────────────────────────────────────────────────────────

import { ethers } from 'ethers';
import type { Chain } from '@lenitnes/types';
import { query } from '../../db/pool.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { isTradeable, resolveTradeableToken } from './asset-registry.js';
import { marketData } from '../data-providers/registry.js';
import { pancakeswapVenue } from '../venues/pancakeswap/index.js';
import { getProvider, getWallet } from '../evm/client.js';
import type { TradeMode } from '../treasury.js';

// BSC mainnet chain ID. The asset registry's token addresses are
// mainnet-only by design (testnet has no real liquidity for the
// bridged assets we trade). If the operator points BNB_RPC_URL +
// BNB_CHAIN_ID at testnet, live trades must NOT fire — the swap
// would either revert against non-existent contracts or land in
// a junk pool.
const BSC_MAINNET_CHAIN_ID = 56;

// Safety buffer for swap gas on top of amountIn, in BNB. PancakeSwap
// V2 swaps typically use ~150k gas; at 3 gwei that's ~0.00045 BNB.
// 0.005 gives ~10x headroom for fee spikes.
const BSC_GAS_BUFFER_BNB = '0.005';

// Map our coingecko_id to the CMC symbol used by getQuotes. CMC's
// /quotes/latest endpoint takes symbols (BTC/ETH/etc.), not their
// coingecko slugs.
const COINGECKO_TO_CMC_SYMBOL: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  zcash: 'ZEC',
  solana: 'SOL',
  sui: 'SUI',
  arbitrum: 'ARB',
};

/**
 * Check CMC's 24h trading volume for the asset against the
 * registry's minDailyVolumeUsd floor. A stale pool can have deep
 * TVL but zero recent volume — that's a sign the market has
 * abandoned the pair and our slippage estimate is unreliable.
 * Returns true if the gate passes (or no floor configured).
 */
async function passesVolumeFloor(
  coingeckoId: string,
  minDailyVolumeUsd: number,
): Promise<{ ok: boolean; reason: string }> {
  if (!process.env.CMC_API_KEY) {
    // No CMC key configured — skip the check rather than failing
    // closed. The TVL floor is the primary gate; volume is the
    // secondary signal.
    return { ok: true, reason: 'CMC not configured (volume gate skipped)' };
  }
  const symbol = COINGECKO_TO_CMC_SYMBOL[coingeckoId];
  if (!symbol) {
    return { ok: true, reason: `no CMC symbol mapping for ${coingeckoId}` };
  }
  try {
    const quotes = await marketData.getQuotes([symbol]);
    const quote = quotes.find((q) => q.symbol === symbol);
    const volume24h = quote?.quote?.USD?.volume_24h;
    if (volume24h == null) {
      return { ok: false, reason: `CMC: no 24h volume returned for ${symbol}` };
    }
    if (volume24h < minDailyVolumeUsd) {
      return {
        ok: false,
        reason: `24h volume $${volume24h.toFixed(0)} < min $${minDailyVolumeUsd.toFixed(0)}`,
      };
    }
    return { ok: true, reason: 'ok' };
  } catch (err) {
    logger.warn({ err, coingeckoId }, 'volume floor: CMC quote failed');
    // Failing closed is safer than failing open — we'd rather
    // skip a trade than execute one without confirmation.
    return { ok: false, reason: 'CMC quote failed (treating as below floor)' };
  }
}

export interface RiskGateInput {
  coingeckoId: string | undefined;
  chain: Chain;
  side: 'long' | 'short';
  signalId: string;
  /** What the operator configured (TREASURY_MODE). */
  intendedMode: TradeMode;
  /** Trade size in native chain units (e.g. BNB), required for the balance preflight. */
  amountIn: string;
}

export interface RiskGateDecision {
  /** What the treasury should actually execute as. */
  effectiveMode: TradeMode;
  /** Human-readable reason the mode was downgraded (or 'ok'). */
  reason: string;
  /** True iff the intended mode is being downgraded to paper. */
  downgraded: boolean;
}

const PAPER: TradeMode = 'paper';

/**
 * Apply every safety gate in order. Returns the effective trade
 * mode plus a one-line reason. Always succeeds — a denied trade
 * is just a paper-mode decision.
 */
export async function evaluateTradeRisk(input: RiskGateInput): Promise<RiskGateDecision> {
  // Closes can always go through — TP/SL exits must not be blocked
  // by the kill switch or position-count limits.
  if (input.side === 'short') {
    return { effectiveMode: input.intendedMode, reason: 'close path', downgraded: false };
  }

  // Already paper? Nothing to downgrade.
  if (input.intendedMode === PAPER) {
    return { effectiveMode: PAPER, reason: 'configured paper', downgraded: false };
  }

  // 1) Master kill switch.
  if (!config.treasury.tradingEnabled) {
    return {
      effectiveMode: PAPER,
      reason: 'TRADING_ENABLED=false (kill switch)',
      downgraded: true,
    };
  }

  // 2) Asset must be in the verified registry for this chain.
  if (!isTradeable(input.coingeckoId, input.chain)) {
    return {
      effectiveMode: PAPER,
      reason: `asset ${input.coingeckoId ?? '<unknown>'} not in tradeable registry for ${input.chain}`,
      downgraded: true,
    };
  }

  // 2b) Chain-ID guard. The registry's addresses are mainnet-only;
  //     a swap built against them but submitted to a testnet RPC
  //     reverts with cryptic errors. Refuse early with a clear
  //     reason so operators see "wrong network" instead of
  //     "execution reverted" in the logs.
  if (input.chain === 'bnb' && config.chains.bnb.chainId !== BSC_MAINNET_CHAIN_ID) {
    return {
      effectiveMode: PAPER,
      reason: `BSC chainId ${config.chains.bnb.chainId} ≠ mainnet (${BSC_MAINNET_CHAIN_ID}); registry addresses won't resolve`,
      downgraded: true,
    };
  }

  // 2c) Treasury balance preflight. The native BNB balance must
  //     cover amountIn + gas, otherwise the swap reverts on
  //     transfer. Catching this here turns a generic "execution
  //     reverted" into a "fund the wallet" alert.
  if (input.chain === 'bnb') {
    try {
      const wallet = getWallet(input.chain);
      const provider = getProvider(input.chain);
      const balance = await provider.getBalance(wallet.address);
      const required = ethers.parseEther(input.amountIn) + ethers.parseEther(BSC_GAS_BUFFER_BNB);
      if (balance < required) {
        return {
          effectiveMode: PAPER,
          reason: `treasury balance ${ethers.formatEther(balance)} BNB < required ${ethers.formatEther(required)} BNB (amount + gas)`,
          downgraded: true,
        };
      }
    } catch (err) {
      // Provider/wallet unavailable — treat as not safe to trade.
      // The bare wallet-not-configured case is most likely a
      // missing TREASURY_PRIVATE_KEY; operator should see this.
      return {
        effectiveMode: PAPER,
        reason: `treasury balance check failed: ${err instanceof Error ? err.message : String(err)}`,
        downgraded: true,
      };
    }
  }

  // 3) Concurrent-position cap. Stops the agent from opening 50
  //    positions if signals cluster.
  const { rows: openRows } = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM positions WHERE status = 'open'",
  );
  const openCount = parseInt(openRows[0]?.c ?? '0', 10);
  if (openCount >= config.treasury.maxConcurrentPositions) {
    return {
      effectiveMode: PAPER,
      reason: `open positions ${openCount} ≥ max ${config.treasury.maxConcurrentPositions}`,
      downgraded: true,
    };
  }

  // 4) Per-asset concentration cap. One open position per asset
  //    by default — the agent can re-enter after a close, but
  //    can't pile on the same thesis.
  const { rows: assetRows } = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM positions WHERE status = 'open' AND asset = $1",
    [input.coingeckoId ?? ''],
  );
  const assetCount = parseInt(assetRows[0]?.c ?? '0', 10);
  if (assetCount >= config.treasury.maxPerAssetPositions) {
    return {
      effectiveMode: PAPER,
      reason: `${input.coingeckoId}: ${assetCount} open ≥ max ${config.treasury.maxPerAssetPositions} per asset`,
      downgraded: true,
    };
  }

  // 5) On-chain liquidity floor. Even though the registry already
  //    filters to known assets, pool liquidity can dry up — e.g.
  //    during a bridge incident. Query the actual LP reserves and
  //    refuse the trade if TVL is below the registry's floor.
  //    Skipped if no floor is configured for this asset.
  const tradeableEntry = resolveTradeableToken(input.coingeckoId, input.chain);
  if (tradeableEntry?.minPoolTvlUsd != null && input.coingeckoId) {
    const tvl = await pancakeswapVenue.getPoolTvlUsd(
      input.chain,
      tradeableEntry.tokenAddress,
      input.coingeckoId,
    );
    if (tvl == null) {
      return {
        effectiveMode: PAPER,
        reason: `liquidity check: TVL query failed for ${input.coingeckoId} (treating as below floor)`,
        downgraded: true,
      };
    }
    if (tvl < tradeableEntry.minPoolTvlUsd) {
      return {
        effectiveMode: PAPER,
        reason: `liquidity floor: TVL $${tvl.toFixed(0)} < min $${tradeableEntry.minPoolTvlUsd.toFixed(0)}`,
        downgraded: true,
      };
    }
  }

  // 6) Market-level 24h volume floor. TVL can be deep while the
  //    pair is dead (stale liquidity from a market-maker that's
  //    given up). CMC's volume is the orthogonal signal: real
  //    flow vs. parked liquidity.
  if (tradeableEntry?.minDailyVolumeUsd != null && input.coingeckoId) {
    const volumeCheck = await passesVolumeFloor(
      input.coingeckoId,
      tradeableEntry.minDailyVolumeUsd,
    );
    if (!volumeCheck.ok) {
      return {
        effectiveMode: PAPER,
        reason: `volume floor (${input.coingeckoId}): ${volumeCheck.reason}`,
        downgraded: true,
      };
    }
  }

  return { effectiveMode: 'live', reason: 'ok', downgraded: false };
}

/**
 * Convenience wrapper that applies the decision + emits a single
 * structured log line. Used by the execution loop so call sites
 * stay tidy.
 */
export async function applyRiskGate(input: RiskGateInput): Promise<RiskGateDecision> {
  const decision = await evaluateTradeRisk(input);
  if (decision.downgraded) {
    logger.warn(
      {
        signalId: input.signalId,
        asset: input.coingeckoId,
        chain: input.chain,
        intended: input.intendedMode,
        effective: decision.effectiveMode,
        reason: decision.reason,
      },
      'risk gate: trade downgraded to paper',
    );
  }
  return decision;
}

/**
 * Compute TP/SL prices given an entry price + the agent's
 * conviction. Higher conviction → wider take-profit (more room
 * for the thesis to play out); fixed stop-loss.
 */
export function computeTpSlLevels(
  entryPriceUsd: number,
  conviction: number,
  side: 'long' | 'short',
): { takeProfitUsd: number; stopLossUsd: number } {
  // Base TP +15%, scaled by (conviction-70) up to ±10pp at the
  // edges. Conviction 70 → +15%, conviction 100 → +25%, conviction
  // 50 → +5%. Floor at +3% to keep TP meaningful.
  const baseTpBps = config.treasury.takeProfitBps;
  const baseSlBps = config.treasury.stopLossBps;
  const tilt = Math.max(-1200, Math.min(1000, (conviction - 70) * 33));
  const tpBps = Math.max(300, baseTpBps + tilt);
  const slBps = baseSlBps;

  if (side === 'long') {
    return {
      takeProfitUsd: entryPriceUsd * (1 + tpBps / 10_000),
      stopLossUsd: entryPriceUsd * (1 - slBps / 10_000),
    };
  }
  // Short: TP is below entry, SL is above.
  return {
    takeProfitUsd: entryPriceUsd * (1 - tpBps / 10_000),
    stopLossUsd: entryPriceUsd * (1 + slBps / 10_000),
  };
}
