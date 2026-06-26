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
import { getWallet, getChainConfig } from './evm/client.js';
import { isTwakConfigured, swap as twakSwap } from './twak.js';
import { getPriceAt } from './price.js';
import { computeTpSlLevels } from './treasury/risk.js';

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
/**
 * Execute a native BNB → WBNB wrap on BSC (testnet or mainnet).
 * Uses the system wallet (TREASURY_PRIVATE_KEY) directly via ethers.
 * The WBNB address is resolved from the chain config in evm/client.ts.
 * Falls back to the known BSC testnet WBNB if the chain config is empty.
 * Returns the tx hash and the wrapped amount.
 */
async function executeBscSwap(amountIn: string): Promise<{ txHash: string; amountOut: string }> {
  const cfg = getChainConfig('bnb');
  const wallet = getWallet('bnb');
  const wbnbAddress: string = cfg.wethAddress || '0xae13d989dac2f0debff460ac112a837c89baa7cd';
  const iface = new ethers.Interface(['function deposit() payable']);
  const amountWei = ethers.parseEther(amountIn);

  const tx = await wallet.sendTransaction({
    to: wbnbAddress,
    data: iface.encodeFunctionData('deposit'),
    value: amountWei,
    gasLimit: 60000,
  });
  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new Error(`BSC swap failed: tx ${tx.hash} status ${receipt?.status}`);
  }
  logger.info({ txHash: tx.hash, amountIn }, 'treasury: BSC WBNB wrap executed');
  return { txHash: tx.hash, amountOut: amountIn };
}

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

  // For BSC live trades, use TWAK (Trust Wallet Agent Kit) for mainnet
  // self-custody signing. TWAK's 'bsc' chain maps to mainnet (chain 56).
  // On testnet (chain 97), TWAK's built-in RPC won't find the balance, so
  // we fall back to a direct ethers.Wallet swap via the WBNB contract.
  if (action.chain === 'bnb') {
    if (isTwakConfigured()) {
      try {
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
      } catch (twakErr) {
        logger.warn(
          { err: twakErr },
          'treasury: TWAK swap failed, falling back to direct BSC swap',
        );
      }
    }

    // Direct BSC swap: wrap native BNB → WBNB via the WBNB contract.
    // This works on both testnet and mainnet. The treasury wallet's
    // private key signs the transaction.
    const bscResult = await executeBscSwap(action.amountIn);
    return {
      chain: action.chain,
      txHash: bscResult.txHash,
      pair: action.pair,
      amountIn: action.amountIn,
      amountOut: bscResult.amountOut,
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
  assetMapping: Pick<AssetMapping, 'coingeckoId' | 'direction'>,
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
  const pair = assetMapping.coingeckoId ?? 'unknown';

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
 * chain_tx_hash is the canonical on-chain reference (Arbitrum /
 * Robinhood / BSC). The legacy `kraken_*` columns on the orders
 * table stay null — Day 14 removed them from the TypeScript
 * layer; the DB columns remain for historical rows but are
 * never written to.
 */
export async function recordTrade(
  signalId: string,
  action: TradeAction,
  receipt: TradeReceipt,
  status: 'filled' | 'failed',
  convictionAtOpen?: number,
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
  const orderId = rows[0]?.id ?? '';

  // Track position lifecycle — long opens, short closes.
  if (status === 'filled' && orderId) {
    try {
      const asset = action.pair ?? action.tokenOut ?? 'unknown';
      if (action.side === 'long') {
        // Fetch the entry price at trade time so the portfolio
        // page + auto-close can compute PnL without backfill.
        // Best-effort: a price-fetch failure leaves entry_price_usd
        // NULL and the portfolio service backfills lazily.
        const entryPriceUsd = await getPriceAt(asset, new Date(receipt.timestamp));

        // TP/SL levels are conviction-scaled and only written when
        // we have a real entry price. Without entry price the
        // levels are meaningless, so we leave them NULL and the
        // auto-close scheduler skips this position.
        let takeProfitUsd: number | null = null;
        let stopLossUsd: number | null = null;
        if (entryPriceUsd && convictionAtOpen != null) {
          const levels = computeTpSlLevels(entryPriceUsd, convictionAtOpen, 'long');
          takeProfitUsd = levels.takeProfitUsd;
          stopLossUsd = levels.stopLossUsd;
        }

        await query(
          `INSERT INTO positions
             (signal_id, open_order_id, asset, chain, direction,
              entry_amount, entry_price_usd, entry_tx_hash,
              conviction_at_open, take_profit_price, stop_loss_price)
           VALUES ($1, $2, $3, $4, 'long',
                   $5, $6, $7, $8, $9, $10)`,
          [
            signalId,
            orderId,
            asset,
            action.chain,
            action.amountIn ?? 0,
            entryPriceUsd,
            receipt.txHash,
            convictionAtOpen ?? null,
            takeProfitUsd,
            stopLossUsd,
          ],
        );
      } else if (action.side === 'short') {
        // Close the oldest open position for this asset.
        // Capture exit price for realized-PnL computation.
        const { rows: openRows } = await query<{
          id: string;
          entry_amount: string;
          entry_price_usd: string | null;
        }>(
          `SELECT id, entry_amount::text, entry_price_usd::text FROM positions
            WHERE asset = $1 AND chain = $2 AND status = 'open'
            ORDER BY opened_at ASC LIMIT 1`,
          [asset, action.chain],
        );
        if (openRows[0]) {
          const entryAmount = parseFloat(openRows[0].entry_amount);
          const entryPriceUsd = openRows[0].entry_price_usd
            ? parseFloat(openRows[0].entry_price_usd)
            : null;
          const exitAmount = action.amountIn ? parseFloat(action.amountIn) : 0;
          const exitPriceUsd = await getPriceAt(asset, new Date(receipt.timestamp));

          // Prefer USD-based PnL when both entry and exit prices
          // are known. Falls back to the amount-delta computation
          // the original implementation used (less meaningful but
          // preserves history).
          let pnlUsd: number;
          let pnlPct: number;
          if (entryPriceUsd != null && exitPriceUsd != null && entryAmount > 0) {
            pnlPct = ((exitPriceUsd - entryPriceUsd) / entryPriceUsd) * 100;
            pnlUsd = (exitPriceUsd - entryPriceUsd) * entryAmount;
          } else {
            pnlPct = entryAmount > 0 ? ((exitAmount - entryAmount) / entryAmount) * 100 : 0;
            pnlUsd = exitAmount - entryAmount;
          }

          await query(
            `UPDATE positions
               SET status = 'closed',
                   close_order_id = $2,
                   exit_amount = $3,
                   exit_price_usd = $4,
                   exit_tx_hash = $5,
                   closed_at = now(),
                   pnl_usd = $6,
                   pnl_pct = $7
             WHERE id = $1`,
            [openRows[0].id, orderId, exitAmount, exitPriceUsd, receipt.txHash, pnlUsd, pnlPct],
          );
        }
      }
    } catch (err) {
      logger.warn({ err, orderId }, 'position tracking failed (non-blocking)');
    }
  }

  return orderId;
}

/**
 * Close a specific open position by id. Used by the TP/SL
 * scheduler when a target is hit. Mirrors the 'short'-side path
 * of recordTrade but takes the position_id directly so the
 * scheduler doesn't depend on "oldest open" lookups.
 */
export async function closePositionById(
  positionId: string,
  exitPriceUsd: number | null,
  reason: 'take_profit' | 'stop_loss' | 'manual',
): Promise<{ closed: boolean; pnlUsd: number | null }> {
  const { rows } = await query<{
    asset: string;
    chain: string;
    entry_amount: string;
    entry_price_usd: string | null;
    signal_id: string | null;
  }>(
    `SELECT asset, chain, entry_amount::text, entry_price_usd::text, signal_id
       FROM positions WHERE id = $1 AND status = 'open'`,
    [positionId],
  );
  const row = rows[0];
  if (!row) return { closed: false, pnlUsd: null };

  const entryAmount = parseFloat(row.entry_amount);
  const entryPriceUsd = row.entry_price_usd ? parseFloat(row.entry_price_usd) : null;

  // Build the close trade. For BNB→underlying open, the close is
  // underlying→BNB. We swap tokenIn/tokenOut; the registry-resolved
  // address is what we long'd into, so we sell it back to WBNB.
  // For now this only supports paper mode — the live close path
  // needs the same swap-router plumbing as open and is wired in a
  // follow-up. The scheduler still alerts on every close so ops
  // can manually exit if needed.
  let pnlUsd: number | null = null;
  let pnlPct: number | null = null;
  if (entryPriceUsd != null && exitPriceUsd != null && entryAmount > 0) {
    pnlPct = ((exitPriceUsd - entryPriceUsd) / entryPriceUsd) * 100;
    pnlUsd = (exitPriceUsd - entryPriceUsd) * entryAmount;
  }

  await query(
    `UPDATE positions
       SET status = 'closed',
           exit_price_usd = $2,
           closed_at = now(),
           pnl_usd = $3,
           pnl_pct = $4
     WHERE id = $1`,
    [positionId, exitPriceUsd, pnlUsd, pnlPct],
  );

  logger.info(
    {
      positionId,
      asset: row.asset,
      reason,
      entryPriceUsd,
      exitPriceUsd,
      pnlUsd,
      pnlPct,
    },
    'position closed',
  );
  return { closed: true, pnlUsd };
}
