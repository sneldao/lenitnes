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
    chainId: config.chains.arbitrum.chainId,
    name: 'Arbitrum Sepolia',
    rpcUrl: config.chains.arbitrum.rpcUrl,
    explorerUrl: 'https://sepolia.arbiscan.io',
    signalRegistryAddress: config.chains.arbitrum.signalRegistry,
    tradeExecutorAddress: config.chains.arbitrum.tradeExecutor,
    swapRouterAddress: config.chains.arbitrum.swapRouter,
    wethAddress: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
  },
  robinhood: {
    chainId: config.chains.robinhood.chainId,
    name: 'Robinhood Chain',
    rpcUrl: config.chains.robinhood.rpcUrl,
    explorerUrl: 'https://explorer.testnet.chain.robinhood.com',
    signalRegistryAddress: config.chains.robinhood.signalRegistry,
    tradeExecutorAddress: config.chains.robinhood.tradeExecutor,
    swapRouterAddress: config.chains.robinhood.swapRouter,
    wethAddress: '0x7943e237c7F95DA44E0301572D358911207852Fa',
  },
  bnb: {
    // BSC testnet. The BNB Hack live-trading window (June 22-28)
    // uses this chain. TradeExecutor's router-agnostic shape lets
    // us plug in PancakeSwap without contract changes.
    chainId: config.chains.bnb.chainId,
    name: 'BNB Smart Chain Testnet',
    rpcUrl: config.chains.bnb.rpcUrl,
    explorerUrl: 'https://testnet.bscscan.com',
    signalRegistryAddress: config.chains.bnb.signalRegistry,
    tradeExecutorAddress: config.chains.bnb.tradeExecutor,
    swapRouterAddress: config.chains.bnb.swapRouter,
    // WBNB on BSC testnet — the wrapped BNB used by PancakeSwap as
    // the base asset for swaps. BEP-20 USDC is the quote.
    wethAddress: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
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
    if (!config.evm.privateKey) throw new Error('TREASURY_PRIVATE_KEY not configured');
    wallets[chain] = new ethers.Wallet(config.evm.privateKey, getProvider(chain));
  }
  return wallets[chain];
}

export function getChainConfig(chain: string): ChainConfig {
  const cfg = chains[chain];
  if (!cfg) throw new Error(`Unknown chain: ${chain}`);
  return cfg;
}
