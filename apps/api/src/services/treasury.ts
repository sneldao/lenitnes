// ─────────────────────────────────────────────────────────────
// Treasury — system wallet + testnet trade execution. Day 5 of
// the pivot. Modular boundary per AGENT_ARCHITECTURE.md: this
// module knows about chain RPCs + signing. It does NOT know about
// the loop, detectors, or Telegram.
// ─────────────────────────────────────────────────────────────

import { ethers } from 'ethers';
import type { AgentScore, AssetMapping, Chain } from '@lenitnes/types';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { executeEvmTrade } from './evm/trade.js';
import { isTwakConfigured, swap as twakSwap } from './twak.js';

export type TradeMode = 'paper' | 'live';

/**
 * A single trade action the agent can ask the treasury to execute.
 * Built from the agent's recommended_action + the watchlist entry's
 * asset_mapping. mode='paper' returns a deterministic mock receipt
 * without contacting any chain.
 */
export interface TradeAction {
  signalId: string;
  chain: Chain;
  /** 'long' = buy the underlying with USDC; 'short' = sell the underlying. */
  side: 'long' | 'short';
  /** Pair label, e.g. 'ZECUSD' — written to the orders row. */
  pair: string;
  /** Amount of tokenIn (USDC by default), in human-readable units. */
  amountIn: string;
  /** Token address on the chain to sell. */
  tokenIn: string;
  /** Token address on the chain to buy. */
  tokenOut: string;
  /** Slippage tolerance in basis points. */
  slippageBps: number;
  mode: TradeMode;
}

export interface TradeReceipt {
  chain: Chain;
  /** Transaction hash on the chain, or a deterministic mock hash in paper mode. */
  txHash: string;
  pair: string;
  amountIn: string;
  amountOut: string | null;
  mode: TradeMode;
  timestamp: string;
}

/**
 * Look up the active system wallet for a chain. The wallet address
 * is stored in treasury_wallets (populated by db/seed/treasury_wallets.sql).
 * The signing key is TREASURY_PRIVATE_KEY (env var, single key for all
 * chains in v1; 2-of-3 Gnosis Safe in v2).
 */
export async function getActiveWallet(chain: Chain): Promise<{ address: string }> {
  const { rows } = await query<{ address: string }>(
    `SELECT address FROM treasury_wallets WHERE chain = $1 AND is_active = true LIMIT 1`,
    [chain],
  );
  const row = rows[0];
  if (!row) throw new Error(`No active treasury wallet for chain: ${chain}`);
  return row;
}

/**
 * Build a deterministic mock tx hash for paper trades. The `0xpap`
 * prefix marks it as paper so log scrapers / dashboards can filter
 * real on-chain trades from paper ones without ambiguity.
 */
function paperTxHash(action: TradeAction, wallet: { address: string }): string {
  const seed = `${action.signalId}:${action.chain}:${action.pair}:${action.amountIn}:${wallet.address}`;
  const hash = ethers.keccak256(ethers.toUtf8Bytes(seed));
  return `0xpap${hash.slice(2, 66)}`;
}

/**
 * Sign + send a trade through the system wallet. In paper mode
 * returns a deterministic mock receipt without contacting any chain.
 * In live mode calls the existing EVM client to execute the swap on
 * the configured testnet (Arbitrum Sepolia or Robinhood Chain).
 */
export async function signAndSend(action: TradeAction): Promise<TradeReceipt> {
  const wallet = await getActiveWallet(action.chain);
  const timestamp = new Date().toISOString();

  // Hedera is a notarization chain only in v1 — no swap router wired.
  // Treat as paper so the dev loop produces a deterministic receipt.
  if (action.mode === 'paper' || action.chain === 'hedera') {
    const receipt: TradeReceipt = {
      chain: action.chain,
      txHash: paperTxHash(action, wallet),
      pair: action.pair,
      amountIn: action.amountIn,
      amountOut: null,
      mode: action.mode === 'paper' ? 'paper' : 'live',
      timestamp,
    };
    logger.info(
      {
        signalId: action.signalId,
        chain: action.chain,
        mode: receipt.mode,
        txHash: receipt.txHash,
        pair: receipt.pair,
      },
      'treasury: paper trade receipt',
    );
    return receipt;
  }

  // For BSC live trades, use TWAK (Trust Wallet Agent Kit) instead of
  // direct ethers.Wallet signing. This enables self-custody signing
  // (keys never leave the user's device) and unlocks the TWAK special
  // prize track in the BNB Hack.
  if (action.chain === 'bnb' && isTwakConfigured()) {
    const slippagePct = action.slippageBps / 100;
    const result = await twakSwap(
      action.amountIn,
      action.tokenIn,
      action.tokenOut,
      'bsc',
      slippagePct,
    );
    logger.info(
      {
        signalId: action.signalId,
        chain: action.chain,
        txHash: result.txHash,
        pair: action.pair,
      },
      'treasury: TWAK live trade executed',
    );
    return {
      chain: action.chain,
      txHash: result.txHash,
      pair: action.pair,
      amountIn: action.amountIn,
      amountOut: result.amountOut,
      mode: 'live',
      timestamp,
    };
  }

  // Live EVM path: call the existing TradeExecutor contract.
  // The wallet is signed by TREASURY_PRIVATE_KEY.
  const result = await executeEvmTrade({
    chain: action.chain,
    tokenIn: action.tokenIn,
    tokenOut: action.tokenOut,
    amountIn: action.amountIn,
    slippageBps: action.slippageBps,
    recipient: wallet.address,
  });

  logger.info(
    {
      signalId: action.signalId,
      chain: action.chain,
      txHash: result.txHash,
      pair: action.pair,
    },
    'treasury: live trade executed',
  );

  return {
    chain: action.chain,
    txHash: result.txHash,
    pair: action.pair,
    amountIn: action.amountIn,
    amountOut: result.amountOut,
    mode: 'live',
    timestamp,
  };
}

/**
 * Derive a trade action from the agent's recommendation + the watchlist
 * entry's asset_mapping. Returns {action: 'none'} when the directions
 * conflict (e.g., agent says 'short' but the asset is only tradeable
 * long) — the agent's note explains the asymmetry in the thesis.
 */
export function deriveActionFromAgent(
  agentScore: Pick<AgentScore, 'recommended_action' | 'signal_id' | 'thesis'>,
  assetMapping: Pick<AssetMapping, 'krakenPair' | 'coingeckoId' | 'direction'>,
  config: {
    chain: Chain;
    mode: TradeMode;
    amountIn: string;
    slippageBps: number;
    tokenIn: string;
    tokenOut: string;
  },
): { action: 'long' | 'short' | 'none'; trade?: TradeAction } {
  if (agentScore.recommended_action === 'none') return { action: 'none' };
  const direction = assetMapping.direction;
  const wantsLong = agentScore.recommended_action === 'long';
  const wantsShort = agentScore.recommended_action === 'short';
  const allowLong = direction === 'long' || direction === 'both';
  const allowShort = direction === 'short' || direction === 'both';

  if (wantsLong && !allowLong) return { action: 'none' };
  if (wantsShort && !allowShort) return { action: 'none' };

  const side = wantsLong ? 'long' : 'short';
  const pair = assetMapping.krakenPair ?? assetMapping.coingeckoId ?? 'unknown';

  return {
    action: side,
    trade: {
      signalId: agentScore.signal_id,
      chain: config.chain,
      side,
      pair,
      amountIn: config.amountIn,
      tokenIn: config.tokenIn,
      tokenOut: config.tokenOut,
      slippageBps: config.slippageBps,
      mode: config.mode,
    },
  };
}

/**
 * Write a single orders row. Status:
 *   - paper: 'filled' (paper trades always "succeed" by definition)
 *   - live:  'filled' once executeEvmTrade returns a receipt with
 *     a non-empty txHash; 'failed' if the call throws
 *
 * chain_tx_hash is the canonical on-chain reference. The kraken_*
 * columns stay null — Kraken is a future path, not the current one.
 */
export async function recordTrade(
  signalId: string,
  action: TradeAction,
  receipt: TradeReceipt,
  status: 'filled' | 'failed',
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders
       (signal_id, rule_id, order_params, status, placed_at, chain, chain_tx_hash)
     VALUES ($1, NULL, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      signalId,
      JSON.stringify({
        side: action.side,
        pair: action.pair,
        amountIn: action.amountIn,
        tokenIn: action.tokenIn,
        tokenOut: action.tokenOut,
        slippageBps: action.slippageBps,
        mode: action.mode,
      }),
      status,
      receipt.timestamp,
      action.chain,
      receipt.txHash,
    ],
  );
  return rows[0]?.id ?? '';
}
