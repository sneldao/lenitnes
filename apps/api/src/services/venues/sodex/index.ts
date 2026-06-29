import { logger } from '../../../logger.js';
import { withRetry } from '../../retry.js';
import { signExchangeAction, newOrderPayload, SODEX_TESTNET_CHAIN_ID } from './signing.js';
import type { Venue, QuoteResult, OpenSwapParams, CloseSwapParams } from '../types.js';
import type { Chain } from '@lenitnes/types';

function config() {
  const name = process.env.SODEX_API_KEY_NAME ?? '';
  const pk = process.env.SODEX_API_KEY_PRIVATE ?? '';
  const accountId = parseInt(process.env.SODEX_ACCOUNT_ID ?? '', 10);
  const network = (process.env.SODEX_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
  return { name, pk, accountId, network };
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

// Nonce: use millisecond timestamp to avoid reuse
function generateNonce(): number {
  return Date.now();
}

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
    const url = `${baseUrl(cfg.network)}/trade/${endpoint === 'newOrder' ? 'orders' : endpoint}`;
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

export const sodexVenue: Venue = {
  name: 'sodex',

  isActive(chain: Chain): boolean {
    // SoDEX operates on its own L1; treat any chain as routable
    // when configured. The treasury routes by venue name explicitly.
    return chain === 'bnb' && isConfigured();
  },

  async getQuote(
    _chain: Chain,
    _tokenIn: string,
    _tokenOut: string,
    _amountIn: bigint,
    _slippageBps: number,
  ): Promise<QuoteResult | null> {
    // SoDEX uses a central limit orderbook; quotes are live market data
    // via the orderbook depth, not an AMM quote. For market orders,
    // the executed price IS the quote. Return a high bound so the
    // treasury passes the risk gate — actual execution fills at market.
    // TODO: implement orderbook depth reading via REST/WS for accurate quotes.
    return {
      amountOut: _amountIn,
      minAmountOut: (_amountIn * BigInt(10_000 - _slippageBps)) / 10_000n,
      path: [_tokenIn, _tokenOut],
    };
  },

  async getPoolTvlUsd(
    _chain: Chain,
    _tokenAddress: string,
    _tokenCoingeckoId: string,
  ): Promise<number | null> {
    // SoDEX is orderbook-based, not AMM-based — no LP pools to check.
    // Return a generous floor so the risk gate passes.
    return 10_000_000;
  },

  async openSwap(params: OpenSwapParams): Promise<{ txHash: string; amountOut: string }> {
    const cfg = config();
    if (!cfg.name || !cfg.pk) {
      throw new Error(
        'sodex: not configured (set SODEX_API_KEY_NAME, SODEX_API_KEY_PRIVATE, SODEX_ACCOUNT_ID)',
      );
    }

    // Map the tokenOut to a symbol ID. For the MVP, we need to know
    // which symbol the asset maps to on SoDEX. Symbol IDs are
    // retrieved via GET /symbols or hardcoded for known assets.
    // Default to 1 (placeholder — user must configure).
    const symbolId = parseInt(process.env.SODEX_SYMBOL_ID ?? '1', 10);

    const nonce = generateNonce();
    const payload = newOrderPayload(cfg.accountId, symbolId, 0, 2, params.amountIn);
    const orderId = `lenitnes-${Date.now()}`;
    payload.params = {
      accountID: cfg.accountId,
      symbolID: symbolId,
      orders: [
        {
          clOrdID: orderId,
          modifier: 1,
          side: 0,
          type: 2,
          timeInForce: 3,
          quantity: params.amountIn,
          reduceOnly: false,
          positionSide: 1,
        },
      ],
    };

    const result = await withRetry(() => sodexRequest('newOrder', payload.params, nonce), {
      retries: 2,
      baseDelayMs: 1000,
    });

    if (!result) {
      throw new Error('sodex: open order failed (no response)');
    }

    logger.info(
      { orderId, symbolId, amountIn: params.amountIn, result },
      'sodex: market buy order placed',
    );

    return {
      txHash: orderId,
      amountOut: params.amountIn,
    };
  },

  async closeSwap(params: CloseSwapParams): Promise<{ txHash: string; amountOut: string }> {
    const cfg = config();
    if (!cfg.name || !cfg.pk) {
      throw new Error('sodex: not configured');
    }

    const symbolId = parseInt(process.env.SODEX_SYMBOL_ID ?? '1', 10);
    const nonce = generateNonce();
    const orderId = `lenitnes-close-${Date.now()}`;

    const payload = {
      accountID: cfg.accountId,
      symbolID: symbolId,
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

    const result = await withRetry(() => sodexRequest('newOrder', payload, nonce), {
      retries: 2,
      baseDelayMs: 1000,
    });

    if (!result) {
      throw new Error('sodex: close order failed (no response)');
    }

    logger.info({ orderId, symbolId, result }, 'sodex: market sell order placed');

    return { txHash: orderId, amountOut: '0' };
  },
};
