import { ethers } from 'ethers';
import { getWallet, getChainConfig } from './client.js';
import { logger } from '../../logger.js';
import { getQuote } from '../treasury/quote.js';

const ABI = [
  'function executeTrade(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient) external returns (uint256)',
  'event TradeExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)',
];

export interface EvmTradeParams {
  chain: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageBps?: number;
  recipient?: string;
}

export async function executeEvmTrade(params: EvmTradeParams): Promise<{
  txHash: string;
  amountOut: string;
  chainId: number;
}> {
  const wallet = getWallet(params.chain);
  const cfg = getChainConfig(params.chain);
  const contract = new ethers.Contract(cfg.tradeExecutorAddress, ABI, wallet);

  const recipient = params.recipient ?? wallet.address;
  const amountIn = ethers.parseEther(params.amountIn);

  // Compute amountOutMin from a real on-chain quote. The earlier
  // implementation passed `0`, which allowed unlimited slippage —
  // a sandwich-attack vector. We refuse to swap when:
  //   - the quote helper isn't wired for this chain (yet)
  //   - the quote returns null (pool dry / RPC flake)
  // Failing closed keeps the kill switch's safety guarantee:
  // every live trade has a real minOut bound by configured
  // slippage.
  const slippageBps = params.slippageBps ?? 50;
  const quote = await getQuote(
    params.chain as 'bnb',
    params.tokenIn,
    params.tokenOut,
    amountIn,
    slippageBps,
  );
  if (!quote) {
    throw new Error(
      `executeEvmTrade: quote unavailable for ${params.tokenIn}→${params.tokenOut} on ${params.chain}. ` +
        `Refusing to swap without a real minAmountOut (would allow infinite slippage).`,
    );
  }
  const minAmountOut = quote.minAmountOut;

  const tx = await contract.executeTrade(
    params.tokenIn,
    params.tokenOut,
    amountIn,
    minAmountOut,
    recipient,
  );
  const receipt = await tx.wait();

  const tradeEvent = receipt.logs.find(
    (log: { topics: string[] }) =>
      log.topics[0] === ethers.id('TradeExecuted(address,address,uint256,uint256,address)'),
  );
  const amountOut = tradeEvent
    ? ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], tradeEvent.data)[0].toString()
    : '0';

  logger.info(
    {
      chain: params.chain,
      txHash: receipt.hash,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      slippageBps,
      minAmountOut: minAmountOut.toString(),
      amountOut,
    },
    'EVM trade executed',
  );

  return { txHash: receipt.hash, amountOut, chainId: cfg.chainId };
}
