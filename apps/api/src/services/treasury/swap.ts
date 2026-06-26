// ─────────────────────────────────────────────────────────────
// PancakeSwap V2 swap helpers for BSC mainnet.
//
// Two operations:
//   - openSwap(): native BNB → target token, via
//     router.swapExactETHForTokens. amountOutMin is computed
//     from getQuote() so the trade reverts on slippage > config.
//   - closeSwap(): target token → native BNB, via
//     router.swapExactTokensForETH. Reads the wallet's full
//     token balance (the risk gate enforces 1 open position per
//     asset, so the balance unambiguously matches the one
//     position being closed). Approves the router first, then
//     swaps.
//
// Both functions throw on any failure — callers (treasury.ts) are
// expected to translate the throw into a "trade failed" outcome
// rather than swallow it silently.
// ─────────────────────────────────────────────────────────────

import { ethers } from 'ethers';
import type { Chain } from '@lenitnes/types';
import { getWallet } from '../evm/client.js';
import { getQuote } from './quote.js';
import { logger } from '../../logger.js';

// Same addresses as services/treasury/quote.ts — PancakeSwap V2
// mainnet on BSC (chainId 56). Testnet has neither real liquidity
// nor a deployed equivalent of this router, which is why the
// asset registry is mainnet-only.
const PANCAKE_V2_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const WBNB_BSC_MAINNET = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] memory amounts)',
];
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const DEADLINE_SECONDS = 60;

export interface OpenSwapResult {
  txHash: string;
  /** Token amount received (raw, in token's smallest unit). */
  amountOutRaw: bigint;
  /** Token amount received (human-readable, decimal-adjusted). */
  amountOut: string;
}

/**
 * Swap native BNB → tokenOut on PancakeSwap V2. The path is
 * BNB → WBNB (implicit) → tokenOut, which is the canonical
 * single-hop for any BSC token that has a WBNB pair.
 */
export async function openSwap(
  chain: Chain,
  tokenOut: string,
  amountInBnb: string,
  slippageBps: number,
): Promise<OpenSwapResult> {
  if (chain !== 'bnb') {
    throw new Error(`openSwap: only BSC supported, got ${chain}`);
  }

  const wallet = getWallet(chain);
  const amountInWei = ethers.parseEther(amountInBnb);

  // Quote the swap so minAmountOut is a real bound, not 0.
  const quote = await getQuote(chain, WBNB_BSC_MAINNET, tokenOut, amountInWei, slippageBps);
  if (!quote) {
    throw new Error(
      `openSwap: quote unavailable for ${WBNB_BSC_MAINNET}→${tokenOut}. Refusing to swap.`,
    );
  }

  const router = new ethers.Contract(PANCAKE_V2_ROUTER, ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS;
  const tx = await router.swapExactETHForTokens(
    quote.minAmountOut,
    [WBNB_BSC_MAINNET, tokenOut],
    wallet.address,
    deadline,
    { value: amountInWei },
  );
  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new Error(`openSwap: tx ${tx.hash} reverted (status ${receipt?.status})`);
  }

  // The router's amountsOut return is consumed via the on-chain
  // event; reading the recipient's balance delta is the simplest
  // truth source for what landed in the wallet.
  const token = new ethers.Contract(tokenOut, ERC20_ABI, wallet.provider);
  const balance = (await token.balanceOf(wallet.address)) as bigint;
  const decimals = (await token.decimals()) as number;

  logger.info(
    {
      chain,
      txHash: receipt.hash,
      tokenOut,
      amountInBnb,
      slippageBps,
      minAmountOut: quote.minAmountOut.toString(),
      walletTokenBalance: balance.toString(),
    },
    'openSwap: PancakeSwap V2 BNB→token executed',
  );

  return {
    txHash: receipt.hash,
    amountOutRaw: balance,
    amountOut: ethers.formatUnits(balance, decimals),
  };
}

export interface CloseSwapResult {
  txHash: string;
  /** BNB received from the close (wei). */
  amountOutWei: bigint;
  /** BNB received (human-readable). */
  amountOut: string;
}

/**
 * Swap the wallet's entire `tokenAddress` balance back to native
 * BNB on PancakeSwap V2. Approves the router first if allowance
 * is insufficient. Used by the auto-close scheduler when TP/SL
 * fires.
 *
 * Assumes the position is the only open one for this asset
 * (enforced by the risk gate's per-asset cap). If that invariant
 * breaks we'd close ALL holdings of the asset, not just the
 * triggered position.
 */
export async function closeSwap(
  chain: Chain,
  tokenAddress: string,
  slippageBps: number,
): Promise<CloseSwapResult> {
  if (chain !== 'bnb') {
    throw new Error(`closeSwap: only BSC supported, got ${chain}`);
  }

  const wallet = getWallet(chain);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  const balance = (await token.balanceOf(wallet.address)) as bigint;
  if (balance === 0n) {
    throw new Error(`closeSwap: wallet has zero ${tokenAddress} balance — nothing to close`);
  }

  // Quote the reverse: tokenAddress → WBNB. minAmountOut bounds
  // the BNB we'll accept.
  const quote = await getQuote(chain, tokenAddress, WBNB_BSC_MAINNET, balance, slippageBps);
  if (!quote) {
    throw new Error(
      `closeSwap: quote unavailable for ${tokenAddress}→${WBNB_BSC_MAINNET}. Refusing to swap.`,
    );
  }

  // Approve the router for `balance` if current allowance is below it.
  // We don't pre-approve max-uint to limit blast radius if the router
  // is ever compromised — per-trade approvals only.
  const currentAllowance = (await token.allowance(wallet.address, PANCAKE_V2_ROUTER)) as bigint;
  if (currentAllowance < balance) {
    const approveTx = await token.approve(PANCAKE_V2_ROUTER, balance);
    const approveReceipt = await approveTx.wait();
    if (approveReceipt?.status !== 1) {
      throw new Error(`closeSwap: approve tx reverted (${approveTx.hash})`);
    }
    logger.info(
      { chain, tokenAddress, approveTx: approveTx.hash, amount: balance.toString() },
      'closeSwap: approve granted',
    );
  }

  const router = new ethers.Contract(PANCAKE_V2_ROUTER, ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS;
  const tx = await router.swapExactTokensForETH(
    balance,
    quote.minAmountOut,
    [tokenAddress, WBNB_BSC_MAINNET],
    wallet.address,
    deadline,
  );
  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new Error(`closeSwap: tx ${tx.hash} reverted (status ${receipt?.status})`);
  }

  // The actual BNB received is the wallet's balance delta, but
  // querying that requires a before/after snapshot. The quote's
  // amountOut is a tight upper bound; the actual delivered amount
  // is between minAmountOut and amountOut. We use minAmountOut as
  // the conservative book-keeping figure — over-counting realized
  // PnL is the bug we want to avoid.
  return {
    txHash: receipt.hash,
    amountOutWei: quote.minAmountOut,
    amountOut: ethers.formatEther(quote.minAmountOut),
  };
}
