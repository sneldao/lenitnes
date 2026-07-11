import type { AssetMapping } from '@lenitnes/types';

const REPO_ASSET_MAP: Record<string, AssetMapping> = {
  'zcash/zcash': { coingeckoId: 'zcash', direction: 'both' },
  'zcash/halo2': { coingeckoId: 'zcash', direction: 'both' },
  'zcash/librustzcash': { coingeckoId: 'zcash', direction: 'both' },
  'bitcoin/bitcoin': { coingeckoId: 'bitcoin', direction: 'both' },
  'bitcoin-core/secp256k1': { coingeckoId: 'bitcoin', direction: 'both' },
  'ethereum/go-ethereum': { coingeckoId: 'ethereum', direction: 'both' },
  'ethereum/solidity': { coingeckoId: 'ethereum', direction: 'both' },
  'ethereum/evmone': { coingeckoId: 'ethereum', direction: 'both' },
  'solana-labs/solana': { coingeckoId: 'solana', direction: 'both' },
  'anza-xyz/agave': { coingeckoId: 'solana', direction: 'both' },
  'cosmos/cosmos-sdk': { coingeckoId: 'cosmos', direction: 'both' },
  'tendermint/tendermint': { coingeckoId: 'cosmos', direction: 'both' },
  'polkadot-js/api': { coingeckoId: 'polkadot', direction: 'both' },
  'paritytech/polkadot-sdk': { coingeckoId: 'polkadot', direction: 'both' },
  'cardano-foundation/cardano-wallet': {
    coingeckoId: 'cardano',
    direction: 'both',
  },

  'openssl/openssl': { coingeckoId: 'bitcoin', direction: 'both' },
  'jedisct1/libsodium': { coingeckoId: 'bitcoin', direction: 'both' },
  'curl/curl': { coingeckoId: 'bitcoin', direction: 'both' },

  'torvalds/linux': { coingeckoId: 'ethereum', direction: 'both' },
  'nvidia/cuda-samples': { tokenizedStock: 'NVDA', direction: 'long' },
  'apple/swift': { tokenizedStock: 'AAPL', direction: 'long' },
  'nicklockwood/swiftformat': { tokenizedStock: 'AAPL', direction: 'long' },
  'chromium/chromium': { tokenizedStock: 'GOOG', direction: 'long' },

  'uniswap/v3-core': { coingeckoId: 'uniswap', direction: 'both' },
  'uniswap/v4-core': { coingeckoId: 'uniswap', direction: 'both' },
  'aave/aave-v3-core': { coingeckoId: 'aave', direction: 'both' },
  'compound-finance/compound-protocol': {
    coingeckoId: 'compound-governance-token',
    direction: 'both',
  },
  'makerdao/dss': { coingeckoId: 'maker', direction: 'both' },
  'lido/lido-dao': { coingeckoId: 'lido-dao', direction: 'both' },
  'OffchainLabs/nitro': { coingeckoId: 'arbitrum', direction: 'both' },
  'ZcashFoundation/zebra': { coingeckoId: 'zcash', direction: 'both' },
  'paradigmxyz/reth': { coingeckoId: 'ethereum', direction: 'both' },
  'MystenLabs/sui': { coingeckoId: 'sui', direction: 'both' },
};

/** Commit-level monitors from db/seed/watchlist.sql — replay responsiveness sweep. */
export const CONSENSUS_WATCHLIST_REPOS: ReadonlyArray<{ repo: string; asset: string }> = [
  { repo: 'zcash/halo2', asset: 'zcash' },
  { repo: 'ZcashFoundation/zebra', asset: 'zcash' },
  { repo: 'bitcoin/bitcoin', asset: 'bitcoin' },
  { repo: 'ethereum/go-ethereum', asset: 'ethereum' },
  { repo: 'anza-xyz/agave', asset: 'solana' },
  { repo: 'paradigmxyz/reth', asset: 'ethereum' },
  { repo: 'MystenLabs/sui', asset: 'sui' },
];

function normalizeRepoKey(url: string): string {
  return url
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
}

export function detectAssetMapping(repoUrl: string): AssetMapping | null {
  const key = normalizeRepoKey(repoUrl);
  const exact = REPO_ASSET_MAP[key];
  if (exact) return exact;

  const org = key.split('/')[0];
  for (const [repoKey, mapping] of Object.entries(REPO_ASSET_MAP)) {
    if (repoKey.startsWith(org + '/')) return mapping;
  }

  return null;
}
