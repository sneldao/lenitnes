import { ethers } from 'ethers';
import { config } from '../../config.js';

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  signalRegistryAddress: string;
  tradeExecutorAddress: string;
  swapRouterAddress: string;
  wethAddress: string;
}

const chains: Record<string, ChainConfig> = {
  arbitrum: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: config.evm.arbitrumRpcUrl,
    explorerUrl: 'https://sepolia.arbiscan.io',
    signalRegistryAddress: config.evm.arbSignalRegistry,
    tradeExecutorAddress: config.evm.arbTradeExecutor,
    swapRouterAddress: '0x101F443B4D1b059569C6452319124001853b2156',
    wethAddress: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
  },
  robinhood: {
    chainId: 46630,
    name: 'Robinhood Chain',
    rpcUrl: config.evm.robinhoodRpcUrl,
    explorerUrl: 'https://explorer.testnet.chain.robinhood.com',
    signalRegistryAddress: config.evm.rhSignalRegistry,
    tradeExecutorAddress: config.evm.rhTradeExecutor,
    swapRouterAddress: config.evm.robinhoodSwapRouter,
    wethAddress: '0x7943e237c7F95DA44E0301572D358911207852Fa',
  },
};

const providers: Record<string, ethers.JsonRpcProvider> = {};
const wallets: Record<string, ethers.Wallet> = {};

export function getProvider(chain: string): ethers.JsonRpcProvider {
  if (!providers[chain]) {
    const cfg = chains[chain];
    if (!cfg) throw new Error(`Unknown chain: ${chain}`);
    providers[chain] = new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
  }
  return providers[chain];
}

export function getWallet(chain: string): ethers.Wallet {
  if (!wallets[chain]) {
    if (!config.evm.privateKey) throw new Error('EVM_PRIVATE_KEY not configured');
    wallets[chain] = new ethers.Wallet(config.evm.privateKey, getProvider(chain));
  }
  return wallets[chain];
}

export function getChainConfig(chain: string): ChainConfig {
  const cfg = chains[chain];
  if (!cfg) throw new Error(`Unknown chain: ${chain}`);
  return cfg;
}
