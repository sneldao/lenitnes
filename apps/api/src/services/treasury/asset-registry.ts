// ─────────────────────────────────────────────────────────────
// Tradeable asset registry — single source of truth for which
// coingecko_id → on-chain token address mapping is safe to swap.
//
// Background: the execution loop used to pass `tokenOut =
// '0xUNDERLYING_PLACEHOLDER'` to every live swap, meaning a
// signal on `solana` would try to swap WBNB for a non-existent
// address on BSC. This file centralizes the only safe path:
// asset → chain → real verified token address.
//
// Rule: if `resolveTradeableToken(asset, chain)` returns null,
// no live swap can fire. The kill switch / risk layer routes the
// trade to paper mode instead — the signal still ships to
// Telegram but no on-chain action happens.
// ─────────────────────────────────────────────────────────────

import type { Chain } from '@lenitnes/types';

export interface TradeableChainEntry {
  /** On-chain BEP-20 / ERC-20 token address. */
  tokenAddress: string;
  /** Optional minimum 24h volume (USD) before we'll swap. */
  minDailyVolumeUsd?: number;
  /** Optional pool TVL floor (USD). */
  minPoolTvlUsd?: number;
}

export interface TradeableAsset {
  coingeckoId: string;
  symbol: string;
  /** Chains where this asset has a verified live-tradeable token. */
  chains: Partial<Record<Chain, TradeableChainEntry>>;
}

// BSC mainnet addresses verified against the official BSC token list
// (https://github.com/trustwallet/assets/tree/master/blockchains/smartchain).
// These are the canonical wrapped/bridged forms with deep PancakeSwap
// liquidity. Testnet (chainId 97) intentionally has NO entries — the
// testnet doesn't carry real liquidity for these assets and any
// "swap" on testnet would land in junk pools or revert.
//
// To add an asset: confirm the address on BscScan, confirm it trades
// against WBNB on PancakeSwap v2 with at least the liquidity floor,
// then add an entry here.
export const ASSET_REGISTRY: Record<string, TradeableAsset> = {
  bitcoin: {
    coingeckoId: 'bitcoin',
    symbol: 'BTC',
    chains: {
      bnb: {
        // BTCB — Binance-Peg BTC on BSC mainnet
        tokenAddress: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
        minDailyVolumeUsd: 1_000_000,
        minPoolTvlUsd: 5_000_000,
      },
    },
  },
  ethereum: {
    coingeckoId: 'ethereum',
    symbol: 'ETH',
    chains: {
      bnb: {
        // ETH — Binance-Peg Ethereum Token on BSC mainnet
        tokenAddress: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
        minDailyVolumeUsd: 1_000_000,
        minPoolTvlUsd: 5_000_000,
      },
    },
  },
  // Note: solana, sui, zcash, arbitrum are deliberately omitted.
  //   - solana / sui: L1 chains, no canonical BEP-20 with deep liquidity
  //   - zcash: very thin BSC liquidity (privacy-coin bridges are sparse)
  //   - arbitrum: governance token, not the action we'd actually want
  // Signals on these assets still fire on Telegram; the trade just
  // goes to paper mode via the risk layer's fallback.
};

/**
 * Return the on-chain token address for an asset on a given chain,
 * or null if the asset isn't safe to trade live there.
 */
export function resolveTradeableToken(
  coingeckoId: string | undefined,
  chain: Chain,
): TradeableChainEntry | null {
  if (!coingeckoId) return null;
  const asset = ASSET_REGISTRY[coingeckoId];
  if (!asset) return null;
  return asset.chains[chain] ?? null;
}

export function isTradeable(coingeckoId: string | undefined, chain: Chain): boolean {
  return resolveTradeableToken(coingeckoId, chain) !== null;
}
