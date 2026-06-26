// ─────────────────────────────────────────────────────────────
// On-chain quote + liquidity service for PancakeSwap V2 (BSC).
//
// Two responsibilities:
//   1. `getQuote()` — ask the router how much tokenOut a swap of
//      `amountIn` tokenIn would receive. Used to compute a real
//      `amountOutMin` from the configured slippage (instead of
//      sending 0 and accepting any execution).
//   2. `getPoolTvlUsd()` — read the underlying LP pool's reserves
//      and convert to USD via the price oracle. Used by the risk
//      gate to enforce the registry's `minPoolTvlUsd` floor.
//
// Both queries hit a stock UniswapV2-compatible router/factory —
// PancakeSwap V2 mainnet on BSC. The testnet has very thin
// liquidity for most pairs; the registry is mainnet-only by
// design, so testnet callers never reach this module.
// ─────────────────────────────────────────────────────────────

import { ethers } from 'ethers';
import type { Chain } from '@lenitnes/types';
import { getProvider, getChainConfig } from '../evm/client.js';
import { getPriceAt } from '../price.js';
import { logger } from '../../logger.js';

// PancakeSwap V2 mainnet (chainId 56). The router exposes
// getAmountsOut; the factory exposes getPair so we can read pool
// reserves. Testnet uses a different fork with much shallower
// liquidity, which is why the registry is mainnet-only.
const PANCAKE_V2_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const PANCAKE_V2_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const WBNB_BSC_MAINNET = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
];
const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
];
const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];
const ERC20_ABI = ['function decimals() view returns (uint8)'];

export interface QuoteResult {
  /** Raw amountOut returned by the router for the given amountIn. */
  amountOut: bigint;
  /** amountOut minus the slippage tolerance — pass this as minAmountOut. */
  minAmountOut: bigint;
  /** Path used for the quote (for logging). */
  path: string[];
}

/**
 * Ask the configured PancakeSwap V2 router how much `tokenOut` we'd
 * receive for `amountIn` of `tokenIn`. Slippage tolerance trims
 * `minAmountOut` so the swap reverts on a sandwich attack instead
 * of executing at any price.
 *
 * Caller must already have validated that the pair has liquidity
 * (see getPoolTvlUsd). A pool with zero reserves returns 0 from
 * getAmountsOut, which would make minAmountOut also 0 — defeating
 * the slippage check.
 */
export async function getQuote(
  chain: Chain,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  slippageBps: number,
): Promise<QuoteResult | null> {
  if (chain !== 'bnb') {
    // Other chains use Uniswap V3 routers (different ABI). They're
    // not in the registry yet; when added, plug in their quoter
    // contract here. Returning null forces the caller to either
    // refuse the trade or fall through to paper.
    return null;
  }

  try {
    const provider = getProvider(chain);
    const router = new ethers.Contract(PANCAKE_V2_ROUTER, ROUTER_ABI, provider);
    const path = [tokenIn, tokenOut];
    const amounts = (await router.getAmountsOut(amountIn, path)) as bigint[];
    const amountOut = amounts[amounts.length - 1];
    if (amountOut === 0n) return null;

    // minAmountOut = amountOut * (1 - slippageBps/10000)
    const minAmountOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
    return { amountOut, minAmountOut, path };
  } catch (err) {
    logger.warn(
      { err, chain, tokenIn, tokenOut, amountIn: amountIn.toString() },
      'quote: router call failed',
    );
    return null;
  }
}

/**
 * Compute the USD TVL of the WBNB↔token PancakeSwap V2 pool.
 *
 * Pulls reserves directly from the LP contract, then converts each
 * side to USD using the price oracle. Returns null if any step
 * fails — caller treats null as "below floor" (i.e. blocks the
 * trade) so a flaky RPC doesn't accidentally green-light a swap
 * into an empty pool.
 *
 * The token side is priced by coingeckoId (passed in), since the
 * on-chain oracle is the BNB price relationship we're already
 * querying as part of the quote.
 */
export async function getPoolTvlUsd(
  chain: Chain,
  tokenAddress: string,
  tokenCoingeckoId: string,
): Promise<number | null> {
  if (chain !== 'bnb') return null;

  try {
    const provider = getProvider(chain);
    const factory = new ethers.Contract(PANCAKE_V2_FACTORY, FACTORY_ABI, provider);
    const pairAddress = (await factory.getPair(WBNB_BSC_MAINNET, tokenAddress)) as string;
    if (pairAddress === ethers.ZeroAddress) {
      logger.warn({ tokenAddress }, 'quote: no PancakeSwap pair for token');
      return null;
    }

    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
    const token0Addr = ((await pair.token0()) as string).toLowerCase();
    const reserves = (await pair.getReserves()) as [bigint, bigint, number];
    const [reserve0, reserve1] = reserves;

    // Identify which side is WBNB (always 18 decimals) and which is
    // the asset. Token order in a UniswapV2 pair is keyed by
    // address bytes, not by which token was deposited first.
    const wbnbIsToken0 = token0Addr === WBNB_BSC_MAINNET.toLowerCase();
    const wbnbReserve = wbnbIsToken0 ? reserve0 : reserve1;
    const tokenReserve = wbnbIsToken0 ? reserve1 : reserve0;

    // Token decimals — most BSC bluechips are 18, but we read to
    // be safe (USDC on BSC is 18, but USDT is 18 on BSC vs 6 on ETH,
    // so we don't want to hardcode).
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const tokenDecimals = (await tokenContract.decimals()) as number;

    const wbnbAmount = parseFloat(ethers.formatUnits(wbnbReserve, 18));
    const tokenAmount = parseFloat(ethers.formatUnits(tokenReserve, tokenDecimals));

    // Price both sides. WBNB price = bnb-binance-coin via CG, asset
    // price by its registered coingeckoId. We could skip the BNB
    // call and infer from the asset side alone (2× one side =
    // total TVL for a balanced V2 pool), which is what we do here
    // to halve the price-oracle call count.
    const tokenPriceUsd = await getPriceAt(tokenCoingeckoId, new Date());
    if (tokenPriceUsd == null) return null;
    const tvlUsd = tokenAmount * tokenPriceUsd * 2;
    return tvlUsd;
  } catch (err) {
    logger.warn({ err, tokenAddress }, 'quote: pool TVL query failed');
    return null;
  }
}
