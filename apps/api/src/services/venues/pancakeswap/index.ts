import { ethers } from 'ethers';
import type { Chain } from '@lenitnes/types';
import { getProvider, getWallet } from '../../evm/client.js';
import { priceData } from '../../data-providers/registry.js';
import { logger } from '../../../logger.js';
import type { Venue, QuoteResult, OpenSwapParams, CloseSwapParams } from '../types.js';

const PANCAKE_V2_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const PANCAKE_V2_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const WBNB_BSC_MAINNET = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] memory amounts)',
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
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const DEADLINE_SECONDS = 60;

async function getQuoteInternal(
  chain: Chain,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  slippageBps: number,
): Promise<QuoteResult | null> {
  if (chain !== 'bnb') return null;

  try {
    const provider = getProvider(chain);
    const router = new ethers.Contract(PANCAKE_V2_ROUTER, ROUTER_ABI, provider);
    const path = [tokenIn, tokenOut];
    const amounts = (await router.getAmountsOut(amountIn, path)) as bigint[];
    const amountOut = amounts[amounts.length - 1];
    if (amountOut === 0n) return null;

    const minAmountOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
    return { amountOut, minAmountOut, path };
  } catch (err) {
    logger.warn({ err, chain, tokenIn, tokenOut }, 'pancakeswap: quote failed');
    return null;
  }
}

export const pancakeswapVenue: Venue = {
  name: 'pancakeswap',

  isActive(chain: Chain): boolean {
    return chain === 'bnb';
  },

  getQuote(chain, tokenIn, tokenOut, amountIn, slippageBps) {
    return getQuoteInternal(chain, tokenIn, tokenOut, amountIn, slippageBps);
  },

  async getPoolTvlUsd(chain, tokenAddress, tokenCoingeckoId) {
    if (chain !== 'bnb') return null;

    try {
      const provider = getProvider(chain);
      const factory = new ethers.Contract(PANCAKE_V2_FACTORY, FACTORY_ABI, provider);
      const pairAddress = (await factory.getPair(WBNB_BSC_MAINNET, tokenAddress)) as string;
      if (pairAddress === ethers.ZeroAddress) {
        logger.warn({ tokenAddress }, 'pancakeswap: no pair for token');
        return null;
      }

      const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
      const token0Addr = ((await pair.token0()) as string).toLowerCase();
      const reserves = (await pair.getReserves()) as [bigint, bigint, number];
      const [reserve0, reserve1] = reserves;

      const wbnbIsToken0 = token0Addr === WBNB_BSC_MAINNET.toLowerCase();
      const tokenReserve = wbnbIsToken0 ? reserve1 : reserve0;

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const tokenDecimals = (await tokenContract.decimals()) as number;
      const tokenAmount = parseFloat(ethers.formatUnits(tokenReserve, tokenDecimals));

      const tokenPriceUsd = await priceData.getPriceAt(tokenCoingeckoId, new Date());
      if (tokenPriceUsd == null) return null;
      return tokenAmount * tokenPriceUsd * 2;
    } catch (err) {
      logger.warn({ err, tokenAddress }, 'pancakeswap: pool TVL query failed');
      return null;
    }
  },

  async openSwap(params: OpenSwapParams) {
    const { chain, tokenOut, amountIn: amountInBnb, slippageBps } = params;
    if (chain !== 'bnb') throw new Error('pancakeswap: only BSC supported');

    const wallet = getWallet(chain);
    const amountInWei = ethers.parseEther(amountInBnb);

    const quote = await getQuoteInternal(
      chain,
      WBNB_BSC_MAINNET,
      tokenOut,
      amountInWei,
      slippageBps,
    );
    if (!quote) {
      throw new Error(`pancakeswap: quote unavailable for ${WBNB_BSC_MAINNET}→${tokenOut}`);
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
      throw new Error(`pancakeswap: tx ${tx.hash} reverted`);
    }

    const token = new ethers.Contract(tokenOut, ERC20_ABI, wallet.provider);
    const balance = (await token.balanceOf(wallet.address)) as bigint;
    const decimals = (await token.decimals()) as number;

    return { txHash: receipt.hash, amountOut: ethers.formatUnits(balance, decimals) };
  },

  async closeSwap(params: CloseSwapParams) {
    const { chain, tokenAddress, slippageBps } = params;
    if (chain !== 'bnb') throw new Error('pancakeswap: only BSC supported');

    const wallet = getWallet(chain);
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    const balance = (await token.balanceOf(wallet.address)) as bigint;
    if (balance === 0n) {
      throw new Error(`pancakeswap: zero ${tokenAddress} balance`);
    }

    const quote = await getQuoteInternal(
      chain,
      tokenAddress,
      WBNB_BSC_MAINNET,
      balance,
      slippageBps,
    );
    if (!quote) {
      throw new Error(`pancakeswap: quote unavailable for ${tokenAddress}→${WBNB_BSC_MAINNET}`);
    }

    const currentAllowance = (await token.allowance(wallet.address, PANCAKE_V2_ROUTER)) as bigint;
    if (currentAllowance < balance) {
      const approveTx = await token.approve(PANCAKE_V2_ROUTER, balance);
      const approveReceipt = await approveTx.wait();
      if (approveReceipt?.status !== 1) {
        throw new Error(`pancakeswap: approve tx reverted (${approveTx.hash})`);
      }
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
      throw new Error(`pancakeswap: tx ${tx.hash} reverted`);
    }

    return { txHash: receipt.hash, amountOut: ethers.formatEther(quote.minAmountOut) };
  },
};
