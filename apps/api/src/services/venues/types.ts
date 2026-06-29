import type { Chain } from '@lenitnes/types';

export interface QuoteResult {
  amountOut: bigint;
  minAmountOut: bigint;
  path: string[];
}

export interface OpenSwapParams {
  chain: Chain;
  tokenOut: string;
  amountIn: string;
  slippageBps: number;
}

export interface CloseSwapParams {
  chain: Chain;
  tokenAddress: string;
  slippageBps: number;
}

export interface SwapResult {
  txHash: string;
  amountOut: string;
}

export interface Venue {
  readonly name: string;
  isActive(chain: Chain): boolean;
  getQuote(
    chain: Chain,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    slippageBps: number,
  ): Promise<QuoteResult | null>;
  getPoolTvlUsd(
    chain: Chain,
    tokenAddress: string,
    tokenCoingeckoId: string,
  ): Promise<number | null>;
  openSwap(params: OpenSwapParams): Promise<SwapResult>;
  closeSwap(params: CloseSwapParams): Promise<SwapResult>;
}

export type VenueName = 'pancakeswap' | 'sodex';
