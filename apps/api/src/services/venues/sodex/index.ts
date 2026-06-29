import { logger } from '../../../logger.js';
import { withRetry } from '../../retry.js';
import { signExchangeAction } from './signing.js';
import type { Venue, QuoteResult, OpenSwapParams, CloseSwapParams } from '../types.js';
import type { Chain } from '@lenitnes/types';

interface OrderBookLevel {
  price: string;
  quantity: string;
}

interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

interface SodexSymbol {
  symbolID: number;
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  pricePrecision: number;
  quantityPrecision: number;
  stepSize: string;
  tickSize: string;
  minNotional: string;
  maxNotional: string;
  minQuantity: string;
  maxQuantity: string;
  marketMinQuantity: string;
  marketMaxQuantity: string;
  marketDeviationRatio: string;
  lastTradePrice: string;
}

function config() {
  const name = process.env.SODEX_API_KEY_NAME ?? '';
  const pk = process.env.SODEX_API_KEY_PRIVATE ?? '';
  const accountId = parseInt(process.env.SODEX_ACCOUNT_ID ?? '', 10);
  const network = (process.env.SODEX_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
  const symbolStr = process.env.SODEX_SYMBOL ?? 'vBTC_vUSDC';
  return { name, pk, accountId, network, symbolStr };
}

function isConfigured(): boolean {
  return !!(
    process.env.SODEX_API_KEY_NAME &&
    process.env.SODEX_API_KEY_PRIVATE &&
    process.env.SODEX_ACCOUNT_ID
  );
}

function baseUrl(network: 'mainnet' | 'testnet'): string {
  return network === 'mainnet'
    ? 'https://mainnet-gw.sodex.dev/api/v1/spot'
    : 'https://testnet-gw.sodex.dev/api/v1/spot';
}

function generateNonce(): number {
  return Date.now();
}

async function get<T>(url: string): Promise<{ data: T } | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { data: T };
  } catch (err) {
    logger.warn({ err, url: url.slice(0, 120) }, 'sodex: public GET failed');
    return null;
  }
}

async function getSymbols(
  network: 'mainnet' | 'testnet',
  symbolFilter?: string,
): Promise<SodexSymbol[]> {
  const url = `${baseUrl(network)}/markets/symbols`;
  const qs = symbolFilter ? `?symbol=${encodeURIComponent(symbolFilter)}` : '';
  const result = await get<SodexSymbol[]>(url + qs);
  return result?.data ?? [];
}

async function getOrderbookDepth(
  network: 'mainnet' | 'testnet',
  symbol: string,
  limit = 20,
): Promise<OrderBookData | null> {
  const url = `${baseUrl(network)}/markets/${encodeURIComponent(symbol)}/orderbook?limit=${limit}`;
  const result = await get<OrderBookData>(url);
  return result?.data ?? null;
}

function parseDecimal(s: string): number {
  return Number.parseFloat(s) || 0;
}

const BIGINT_SCALE = 10_000_000_000_000_000_000n; // 1e18

function toBigint(value: number): bigint {
  return BigInt(Math.floor(value * 1e18));
}

function fromBigint(value: bigint): number {
  return Number(value) / 1e18;
}

export const sodexVenue: Venue = {
  name: 'sodex',

  isActive(chain: Chain): boolean {
    return chain === 'valuechain' && isConfigured();
  },

  async getQuote(
    _chain: Chain,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    slippageBps: number,
  ): Promise<QuoteResult | null> {
    const cfg = config();
    const symbols = await getSymbols(cfg.network, cfg.symbolStr);
    const sym = symbols[0];
    if (!sym) {
      logger.warn({ symbol: cfg.symbolStr }, 'sodex: symbol not found');
      return null;
    }

    const depth = await getOrderbookDepth(cfg.network, cfg.symbolStr);
    if (!depth) {
      logger.warn({ symbol: cfg.symbolStr }, 'sodex: orderbook unavailable');
      return null;
    }

    const amountNum = fromBigint(amountIn);

    // Determine direction: if amountIn matches the quote currency's
    // decimal representation it's a buy (spending quote); otherwise
    // it's a sell (spending base). Heuristic: compare tokenIn/Out
    // against the symbol's baseCoin/quoteCoin.
    const isBuy = tokenOut.toLowerCase().includes(sym.baseCoin.replace('v', '').toLowerCase());

    let totalOut = 0;
    let filled = false;

    if (isBuy) {
      // Market buy: spending amountIn in quote currency, receiving base.
      // Walk asks sorted ascending by price.
      const asks = [...depth.asks].sort((a, b) => parseDecimal(a.price) - parseDecimal(b.price));
      let remainingQuote = amountNum;
      for (const ask of asks) {
        if (remainingQuote <= 0) break;
        const price = parseDecimal(ask.price);
        const qty = parseDecimal(ask.quantity);
        if (price <= 0 || qty <= 0) continue;
        const levelCost = price * qty;
        if (levelCost <= remainingQuote) {
          totalOut += qty;
          remainingQuote -= levelCost;
        } else {
          totalOut += remainingQuote / price;
          remainingQuote = 0;
        }
      }
      filled = remainingQuote < amountNum;
    } else {
      // Market sell: spending amountIn in base currency, receiving quote.
      // Walk bids sorted descending by price.
      const bids = [...depth.bids].sort((a, b) => parseDecimal(b.price) - parseDecimal(a.price));
      let remainingBase = amountNum;
      for (const bid of bids) {
        if (remainingBase <= 0) break;
        const price = parseDecimal(bid.price);
        const qty = parseDecimal(bid.quantity);
        if (price <= 0 || qty <= 0) continue;
        if (qty <= remainingBase) {
          totalOut += price * qty;
          remainingBase -= qty;
        } else {
          totalOut += price * remainingBase;
          remainingBase = 0;
        }
      }
      filled = remainingBase < amountNum;
    }

    if (!filled || totalOut <= 0) {
      logger.warn(
        { symbol: cfg.symbolStr, amountIn: amountNum, isBuy },
        'sodex: insufficient orderbook depth for quote',
      );
      return null;
    }

    const amountOut = toBigint(totalOut);
    const minAmountOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

    return { amountOut, minAmountOut, path: [tokenIn, tokenOut] };
  },

  async getPoolTvlUsd(
    _chain: Chain,
    _tokenAddress: string,
    _tokenCoingeckoId: string,
  ): Promise<number | null> {
    const cfg = config();
    const depth = await getOrderbookDepth(cfg.network, cfg.symbolStr);
    if (!depth) return 10_000_000;
    const bidLiquidity = depth.bids.reduce(
      (sum, l) => sum + parseDecimal(l.price) * parseDecimal(l.quantity),
      0,
    );
    const askLiquidity = depth.asks.reduce(
      (sum, l) => sum + parseDecimal(l.price) * parseDecimal(l.quantity),
      0,
    );
    return Math.max(bidLiquidity + askLiquidity, 10_000);
  },

  async openSwap(params: OpenSwapParams): Promise<{ txHash: string; amountOut: string }> {
    const cfg = config();
    if (!cfg.name || !cfg.pk) {
      throw new Error(
        'sodex: not configured (set SODEX_API_KEY_NAME, SODEX_API_KEY_PRIVATE, SODEX_ACCOUNT_ID)',
      );
    }

    const symbols = await getSymbols(cfg.network, cfg.symbolStr);
    const sym = symbols[0];
    if (!sym) throw new Error(`sodex: symbol ${cfg.symbolStr} not found`);

    const nonce = generateNonce();
    const orderId = `lenitnes-${Date.now()}`;

    // Determine side from tokenOut vs symbol base:
    // buying base → market buy (spend quote via `funds`)
    // buying quote → market sell (spend base via `quantity`)
    const isBuy = params.tokenOut
      .toLowerCase()
      .includes(sym.baseCoin.replace('v', '').toLowerCase());

    if (isBuy) {
      // Market buy: use `funds` (amount of quote to spend)
      const order = {
        clOrdID: orderId,
        modifier: 1,
        side: 0,
        type: 2,
        timeInForce: 3,
        funds: params.amountIn,
        reduceOnly: false,
        positionSide: 1,
      };
      const body = { accountID: cfg.accountId, symbolID: sym.symbolID, orders: [order] };
      const result = await withRetry(() => sodexRequest('newOrder', body, nonce), {
        retries: 2,
        baseDelayMs: 1000,
      });
      if (!result) throw new Error('sodex: market buy order failed (no response)');
      logger.info(
        { orderId, symbolId: sym.symbolID, amountIn: params.amountIn, result },
        'sodex: market buy placed',
      );
      return { txHash: orderId, amountOut: params.amountIn };
    }

    // Market sell: use `quantity` (amount of base to sell)
    const order = {
      clOrdID: orderId,
      modifier: 1,
      side: 1,
      type: 2,
      timeInForce: 3,
      quantity: params.amountIn,
      reduceOnly: false,
      positionSide: 1,
    };
    const body = { accountID: cfg.accountId, symbolID: sym.symbolID, orders: [order] };
    const result = await withRetry(() => sodexRequest('newOrder', body, nonce), {
      retries: 2,
      baseDelayMs: 1000,
    });
    if (!result) throw new Error('sodex: market sell order failed (no response)');
    logger.info(
      { orderId, symbolId: sym.symbolID, amountIn: params.amountIn, result },
      'sodex: market sell placed',
    );
    return { txHash: orderId, amountOut: params.amountIn };
  },

  async closeSwap(params: CloseSwapParams): Promise<{ txHash: string; amountOut: string }> {
    const cfg = config();
    if (!cfg.name || !cfg.pk) throw new Error('sodex: not configured');

    const symbols = await getSymbols(cfg.network, cfg.symbolStr);
    const sym = symbols[0];
    if (!sym) throw new Error(`sodex: symbol ${cfg.symbolStr} not found`);

    const nonce = generateNonce();
    const orderId = `lenitnes-close-${Date.now()}`;
    const body = {
      accountID: cfg.accountId,
      symbolID: sym.symbolID,
      orders: [
        {
          clOrdID: orderId,
          modifier: 1,
          side: 1,
          type: 2,
          timeInForce: 3,
          quantity: params.tokenAddress,
          reduceOnly: false,
          positionSide: 1,
        },
      ],
    };
    const result = await withRetry(() => sodexRequest('newOrder', body, nonce), {
      retries: 2,
      baseDelayMs: 1000,
    });
    if (!result) throw new Error('sodex: close order failed (no response)');
    logger.info({ orderId, symbolId: sym.symbolID, result }, 'sodex: market sell closed');
    return { txHash: orderId, amountOut: '0' };
  },
};

async function sodexRequest(
  endpoint: string,
  body: Record<string, unknown>,
  nonce: number,
): Promise<Record<string, unknown> | null> {
  const cfg = config();
  if (!cfg.name || !cfg.pk) return null;

  const payload = { type: endpoint, params: body };
  const signature = signExchangeAction(payload, nonce, cfg.pk, cfg.network);

  try {
    const url = `${baseUrl(cfg.network)}/trade/orders`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-Key': cfg.name,
        'X-API-Sign': signature,
        'X-API-Nonce': String(nonce),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn(
        { endpoint, status: res.status, body: text.slice(0, 200) },
        'sodex: request failed',
      );
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    logger.warn({ err, endpoint }, 'sodex: request error');
    return null;
  }
}
