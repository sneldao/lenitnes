// ─────────────────────────────────────────────────────────────
// Boot-time treasury status report.
//
// At API startup, summarize whether live trading is reachable
// end-to-end. Operators reading the logs should be able to tell
// at a glance:
//   - is the kill switch on?
//   - which BSC network are we on?
//   - does the wallet have funds?
//   - which assets are registry-listed?
//
// All of these failure modes used to be invisible until a real
// trade got blocked by them. Boot-time logging surfaces them on
// every restart instead.
// ─────────────────────────────────────────────────────────────

import { ethers } from 'ethers';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { getProvider, getWallet } from '../evm/client.js';
import { ASSET_REGISTRY } from './asset-registry.js';

const BSC_MAINNET_CHAIN_ID = 56;

export async function logTreasuryStatus(): Promise<void> {
  const summary: Record<string, unknown> = {
    tradingEnabled: config.treasury.tradingEnabled,
    mode: config.treasury.defaultMode,
    defaultChain: config.treasury.defaultChain,
    defaultTradeAmount: config.treasury.defaultTradeAmount,
    slippageBps: config.treasury.defaultSlippageBps,
    maxConcurrentPositions: config.treasury.maxConcurrentPositions,
    maxPerAssetPositions: config.treasury.maxPerAssetPositions,
    takeProfitBps: config.treasury.takeProfitBps,
    stopLossBps: config.treasury.stopLossBps,
  };

  // Registry coverage — what's even possible to trade live
  const registryAssets = Object.entries(ASSET_REGISTRY).flatMap(([id, asset]) =>
    Object.keys(asset.chains).map((chain) => `${id}:${chain}`),
  );
  summary.registryAssets = registryAssets;

  // BSC chain + balance — the only fully wired live path today
  if (config.treasury.defaultChain === 'bnb') {
    summary.bnbChainId = config.chains.bnb.chainId;
    summary.bnbMainnet = config.chains.bnb.chainId === BSC_MAINNET_CHAIN_ID;
    try {
      const wallet = getWallet('bnb');
      summary.bnbWallet = wallet.address;
      const balance = await getProvider('bnb').getBalance(wallet.address);
      summary.bnbBalance = ethers.formatEther(balance);
    } catch (err) {
      summary.bnbWalletError = err instanceof Error ? err.message : String(err);
    }
  }

  // Single-line headline so the per-field block isn't the first thing
  // operators scan past.
  let posture: string;
  if (!config.treasury.tradingEnabled) {
    posture = 'KILL SWITCH ON — every trade routes to paper';
  } else if (config.treasury.defaultMode === 'paper') {
    posture = 'paper mode (TREASURY_MODE=paper)';
  } else if (
    config.treasury.defaultChain === 'bnb' &&
    config.chains.bnb.chainId !== BSC_MAINNET_CHAIN_ID
  ) {
    posture = `live blocked — BSC chainId ${config.chains.bnb.chainId} is not mainnet (${BSC_MAINNET_CHAIN_ID})`;
  } else if (registryAssets.length === 0) {
    posture = 'live blocked — asset registry is empty';
  } else {
    posture = `live ready — ${registryAssets.length} registry asset(s), ${config.treasury.defaultChain} chain`;
  }

  logger.info(summary, `treasury: ${posture}`);
}
