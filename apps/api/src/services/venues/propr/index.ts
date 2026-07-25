// ─────────────────────────────────────────────────────────────
// Propr perp execution adapter — the first venue that can take a
// LIVE short (and longs on assets the spot registry omits, e.g.
// ZEC/SOL/SUI/ARB). Trades Hyperliquid perps via the Propr API.
//
// Safety posture (matches treasury/risk.ts kill-switch discipline):
//   • Refuses to trade unless BOTH config.treasury.tradingEnabled
//     (the master kill switch) AND config.propr.enabled are true.
//   • Leverage is clamped to min(config.propr.leverage, asset cap)
//     and defaults to 1x.
//   • Notional is clamped to [PROPR_MIN_NOTIONAL_USD, PROPR_MAX_NOTIONAL_USD].
//   • Closes ALWAYS set reduceOnly:true (selling without it opens a
//     separate short — the #1 Propr pitfall).
//   • Stop-loss + take-profit are attached to every opened position
//     (conviction-scaled via the shared computeTpSlLevels). A naked
//     position (attachment failed) is logged at WARN.
//   • Every fill is notarized to Hedera HCS (best-effort) so the
//     live track record stays un-gameable.
//   • Never throws out of the trade path — returns null on any
//     decline so the caller falls back to paper, mirroring
//     executeAgentTrade's existing contract.
// ─────────────────────────────────────────────────────────────

import { ProprClient } from './propr-sdk.js';
import type { Order, Position } from './propr-sdk.js';
import { resolveProprAsset, formatPerpQuantity } from './asset-registry.js';
import { config } from '../../../config.js';
import { logger } from '../../../logger.js';
import { priceData } from '../../data-providers/registry.js';
import { getProofService } from '../../proof.js';
import { computeTpSlLevels } from '../../treasury/risk.js';

let _client: ProprClient | null = null;
let _initFailed = false;

/** Master gate: both kill switches must be on. */
export function isProprEnabled(): boolean {
  return !!config.treasury.tradingEnabled && !!config.propr.enabled;
}

/** Credentials present (key set). Distinct from isProprEnabled(). */
export function isProprConfigured(): boolean {
  return !!config.propr.apiKey;
}

/** Lazily create + setup the singleton client (3-tier account discovery). */
export async function initPropr(): Promise<ProprClient> {
  if (_client) return _client;
  if (_initFailed) throw new Error('propr: init previously failed — fix config and restart');
  if (!isProprConfigured()) throw new Error('propr: PROPR_API_KEY not set');

  const client = new ProprClient({
    apiKey: config.propr.apiKey,
    baseUrl: config.propr.apiUrl,
    timeout: 30_000,
  });

  // setup() runs the 3-tier discovery (funded → competition → challenge).
  // An explicit PROPR_ACCOUNT_ID overrides discovery (operator pin).
  const accountId = await client.setup(config.propr.accountId || undefined);
  _client = client;
  logger.info({ accountId, apiUrl: config.propr.apiUrl }, 'propr: client initialized');
  return _client;
}

export function getProprAccountId(): string | null {
  return _client?.accountId ?? null;
}

export { resolveProprAsset };

// ── Receipt shape ──

export interface ProprTradeReceipt {
  accountId: string;
  /** Propr order URN; recorded as `0xpropr:<orderId>` in the DB. */
  orderId: string;
  positionId: string | null;
  base: string;
  side: 'long' | 'short';
  positionSide: 'long' | 'short';
  orderType: string;
  quantity: string;
  entryPrice: string | null;
  averageFillPrice: string | null;
  status: string;
  slOrderId: string | null;
  tpOrderId: string | null;
  hederaTxId: string | null;
  notionalUsd: number;
  leverage: number;
  mode: 'live';
  timestamp: string;
}

export interface OpenProprPositionParams {
  signalId: string;
  coingeckoId: string;
  side: 'long' | 'short';
  /** 0–100; drives conviction-scaled TP/SL. */
  conviction: number;
  /** Override notional; defaults to PROPR_MAX_NOTIONAL_USD. */
  notionalUsd?: number;
}

function clampNotional(n: number): number {
  const min = config.propr.minNotionalUsd;
  const max = config.propr.maxNotionalUsd;
  return Math.max(min, Math.min(max, n));
}

function clampLeverage(asset: { maxLeverage: number }, requested: number): number {
  return Math.max(1, Math.min(requested, asset.maxLeverage));
}

/**
 * Open a perp position on Propr. Returns null (never throws) when the
 * adapter declines: kill switch off, asset not listed, price
 * unavailable for sizing, or the order is rejected. The caller then
 * falls back to paper mode.
 */
export async function openProprPosition(
  params: OpenProprPositionParams,
): Promise<ProprTradeReceipt | null> {
  const { signalId, coingeckoId, side, conviction } = params;

  // Gate 1: kill switch.
  if (!isProprEnabled()) {
    logger.debug({ signalId }, 'propr: disabled (kill switch off) — declining');
    return null;
  }

  // Gate 2: asset listed on Propr.
  const asset = resolveProprAsset(coingeckoId);
  if (!asset) {
    logger.debug({ signalId, coingeckoId }, 'propr: asset not listed — declining');
    return null;
  }

  let client: ProprClient;
  try {
    client = await initPropr();
  } catch (err) {
    _initFailed = true;
    logger.error({ err, signalId }, 'propr: init failed — declining');
    return null;
  }

  // Gate 3: notional bounds.
  const notionalUsd = clampNotional(params.notionalUsd ?? config.propr.maxNotionalUsd);

  // Gate 4: mark price for sizing (CoinGecko, already used elsewhere in
  // the treasury). Refuse rather than place an unbounded order.
  let markUsd: number | null = null;
  try {
    markUsd = await priceData.getPriceAt(coingeckoId, new Date());
  } catch (err) {
    logger.warn({ err, signalId, coingeckoId }, 'propr: price fetch failed');
  }
  if (markUsd == null || markUsd <= 0) {
    logger.warn({ signalId, coingeckoId }, 'propr: no mark price — declining (cannot size)');
    return null;
  }

  const rawQty = notionalUsd / markUsd;
  const quantity = formatPerpQuantity(rawQty, asset.szDecimals);
  if (quantity === '0' || parseFloat(quantity) <= 0) {
    logger.warn(
      { signalId, coingeckoId, notionalUsd, markUsd, szDecimals: asset.szDecimals },
      'propr: quantity rounds to zero at this lot size — declining',
    );
    return null;
  }

  // Gate 5: leverage (clamp to venue cap; default 1x). Best-effort —
  // failure leaves the account at its current (safe, 1x) setting.
  const leverage = clampLeverage(asset, config.propr.leverage);
  try {
    await client.setLeverage(asset.symbol, leverage, 'cross');
  } catch (err) {
    logger.warn(
      { err, signalId, asset: asset.symbol, leverage },
      'propr: setLeverage failed (continuing at current setting)',
    );
  }

  // ── Entry order ──
  // Long = buy / positionSide long. Short = sell / positionSide short.
  // Entries are NEVER reduceOnly (that would reject with no position).
  const entrySide = side === 'long' ? 'buy' : 'sell';
  const positionSide = side;
  const timestamp = new Date().toISOString();

  let entryOrder: Order | null = null;
  try {
    const orders = await client.createOrder({
      side: entrySide,
      positionSide,
      orderType: 'market',
      asset: asset.symbol,
      base: asset.symbol,
      quote: 'USDC',
      quantity,
      timeInForce: 'IOC',
      reduceOnly: false,
    });
    entryOrder = orders[0] ?? null;
  } catch (err) {
    logger.error(
      { err, signalId, asset: asset.symbol, side, quantity },
      'propr: entry order rejected',
    );
    return null;
  }
  if (!entryOrder) {
    logger.error({ signalId, asset: asset.symbol }, 'propr: entry order returned no data');
    return null;
  }

  // ── Resolve the position (market fills synchronously) ──
  let positionId: string | null = entryOrder.positionId;
  let entryPrice: string | null = entryOrder.averageFillPrice ?? entryOrder.price;
  if (!positionId) {
    try {
      const positions = await client.getOpenPositions(asset.symbol);
      const match = positions.find((p) => p.positionSide === positionSide);
      if (match) {
        positionId = match.positionId;
        entryPrice = entryPrice ?? match.entryPrice;
      }
    } catch (err) {
      logger.warn({ err, signalId, asset: asset.symbol }, 'propr: position lookup failed');
    }
  }

  // ── Attach SL + TP (conviction-scaled, shared with the spot book) ──
  let slOrderId: string | null = null;
  let tpOrderId: string | null = null;
  if (config.propr.slTpEnabled && positionId && entryPrice) {
    const levels = computeTpSlLevels(parseFloat(entryPrice), conviction, side);
    const closeSide = side === 'long' ? 'sell' : 'buy';
    const tpTrigger = levels.takeProfitUsd.toFixed(asset.szDecimals + 2);
    const slTrigger = levels.stopLossUsd.toFixed(asset.szDecimals + 2);

    // Each conditional is a single order with a positionId — no batch
    // orderGroupId needed (per api.md: a conditional with a positionId
    // is valid standalone).
    try {
      const sl = await client.createOrder({
        side: closeSide,
        positionSide,
        orderType: 'stop_market',
        asset: asset.symbol,
        base: asset.symbol,
        quote: 'USDC',
        quantity,
        triggerPrice: slTrigger,
        timeInForce: 'GTC',
        reduceOnly: true,
      });
      slOrderId = sl[0]?.orderId ?? null;
    } catch (err) {
      logger.warn(
        { err, signalId, asset: asset.symbol, slTrigger },
        'propr: SL attach failed — position is naked',
      );
    }
    try {
      const tp = await client.createOrder({
        side: closeSide,
        positionSide,
        orderType: 'take_profit_market',
        asset: asset.symbol,
        base: asset.symbol,
        quote: 'USDC',
        quantity,
        triggerPrice: tpTrigger,
        timeInForce: 'GTC',
        reduceOnly: true,
      });
      tpOrderId = tp[0]?.orderId ?? null;
    } catch (err) {
      logger.warn(
        { err, signalId, asset: asset.symbol, tpTrigger },
        'propr: TP attach failed — position is naked',
      );
    }
    if (slOrderId && tpOrderId) {
      logger.info(
        { signalId, asset: asset.symbol, positionId, slOrderId, tpOrderId, slTrigger, tpTrigger },
        'propr: SL + TP attached',
      );
    }
  } else if (config.propr.slTpEnabled && !positionId) {
    logger.warn(
      { signalId, asset: asset.symbol, orderId: entryOrder.orderId },
      'propr: no positionId resolved — SL/TP NOT attached (naked position)',
    );
  }

  // ── Notarize the fill to Hedera HCS (best-effort) ──
  let hederaTxId: string | null = null;
  if (config.propr.notarize) {
    try {
      const proof = getProofService();
      if (proof.writeHcsMessage) {
        const res = await proof.writeHcsMessage(
          {
            type: 'propr_fill',
            signalId,
            accountId: client.accountId,
            orderId: entryOrder.orderId,
            positionId,
            base: asset.symbol,
            coingeckoId,
            side,
            positionSide,
            quantity,
            entryPrice,
            notionalUsd,
            leverage,
            slOrderId,
            tpOrderId,
          },
          { memo: 'LENITNES propr live fill' },
        );
        hederaTxId = res.hederaTxId;
      }
    } catch (err) {
      logger.warn({ err, signalId }, 'propr: HCS notarization failed (non-blocking)');
    }
  }

  const receipt: ProprTradeReceipt = {
    accountId: client.accountId ?? '',
    orderId: entryOrder.orderId,
    positionId,
    base: asset.symbol,
    side,
    positionSide,
    orderType: 'market',
    quantity,
    entryPrice,
    averageFillPrice: entryOrder.averageFillPrice,
    status: entryOrder.status,
    slOrderId,
    tpOrderId,
    hederaTxId,
    notionalUsd,
    leverage,
    mode: 'live',
    timestamp,
  };

  logger.info(
    {
      signalId,
      accountId: receipt.accountId,
      orderId: receipt.orderId,
      positionId,
      base: asset.symbol,
      side,
      quantity,
      entryPrice,
      notionalUsd,
      leverage,
      slOrderId,
      tpOrderId,
      hederaTxId,
    },
    'propr: position opened',
  );
  return receipt;
}

/**
 * Close an entire open position on Propr by base symbol. Uses the
 * SDK's closePosition (auto-detects side, reduceOnly + closePosition).
 * Returns the close order id (as `0xpropr:<id>`), or null if no
 * position / close failed.
 */
export async function closeProprPosition(
  coingeckoId: string,
  reason: string,
): Promise<{ txHash: string | null; realizedPnl: string | null }> {
  if (!isProprEnabled()) {
    logger.debug({ coingeckoId, reason }, 'propr: close skipped (disabled)');
    return { txHash: null, realizedPnl: null };
  }
  const asset = resolveProprAsset(coingeckoId);
  if (!asset) return { txHash: null, realizedPnl: null };

  let client: ProprClient;
  try {
    client = await initPropr();
  } catch (err) {
    logger.error({ err, coingeckoId }, 'propr: close init failed');
    return { txHash: null, realizedPnl: null };
  }

  try {
    const orders = await client.closePosition(asset.symbol);
    const closeOrder = orders[0];
    logger.info(
      { coingeckoId, asset: asset.symbol, reason, orderId: closeOrder?.orderId ?? null },
      'propr: position closed',
    );
    return {
      txHash: closeOrder ? `0xpropr:${closeOrder.orderId}` : null,
      realizedPnl: null,
    };
  } catch (err) {
    logger.error({ err, coingeckoId, asset: asset.symbol, reason }, 'propr: close failed');
    return { txHash: null, realizedPnl: null };
  }
}

/** Open (non-zero) positions on the Propr account, optionally filtered. */
export async function getProprOpenPositions(base?: string): Promise<Position[]> {
  const client = await initPropr();
  return client.getOpenPositions(base);
}

/** Operator observability — surfaces into the venue-status pattern. */
export function getProprStatus(): {
  enabled: boolean;
  configured: boolean;
  accountId: string | null;
} {
  return {
    enabled: isProprEnabled(),
    configured: isProprConfigured(),
    accountId: getProprAccountId(),
  };
}
