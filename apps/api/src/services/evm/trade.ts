import { ethers } from 'ethers';
import { getWallet, getChainConfig } from './client.js';
import { logger } from '../../logger.js';

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
  const minAmountOut = 0;
  const amountIn = ethers.parseEther(params.amountIn);

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
    },
    'EVM trade executed',
  );

  return { txHash: receipt.hash, amountOut, chainId: cfg.chainId };
}
