/** Commit-level watchlist — single source of truth for API sweep + web UI. */

export interface WatchlistEntry {
  repo: string;
  asset: string;
  /** One-line rationale shown on /methodology and /monitors. */
  why: string;
}

/** Repos in the 90-day responsiveness sweep (matches replay engine). */
export const CONSENSUS_WATCHLIST: readonly WatchlistEntry[] = [
  {
    repo: 'zcash/halo2',
    asset: 'zcash',
    why: 'Founding case study · Orchard soundness / circuit layer',
  },
  {
    repo: 'ZcashFoundation/zebra',
    asset: 'zcash',
    why: 'ZEC consensus client · where the emergency fork landed',
  },
  {
    repo: 'bitcoin/bitcoin',
    asset: 'bitcoin',
    why: 'L1 · largest USD volume · low replay responsiveness',
  },
  {
    repo: 'ethereum/go-ethereum',
    asset: 'ethereum',
    why: 'L1 execution client · high commit velocity',
  },
  {
    repo: 'anza-xyz/agave',
    asset: 'solana',
    why: 'Solana validator client · strong T+7d replay signal',
  },
  { repo: 'paradigmxyz/reth', asset: 'ethereum', why: 'Rust execution client · Ethereum L1 stack' },
  { repo: 'MystenLabs/sui', asset: 'sui', why: 'Alt L1 · strongest T+7d replay in first sweep' },
] as const;

export interface SectorGraphDef {
  id: string;
  label: string;
  primaryAsset: string;
  /** Upstream → downstream (circuit → node → protocol). */
  sequence: readonly string[];
}

export const SECTOR_GRAPHS: readonly SectorGraphDef[] = [
  {
    id: 'privacy-l1',
    label: 'Privacy L1 (Zcash stack)',
    primaryAsset: 'zcash',
    sequence: ['zcash/halo2', 'ZcashFoundation/zebra', 'zcash/zcash', 'zcash/librustzcash'],
  },
  {
    id: 'bitcoin-l1',
    label: 'Bitcoin L1',
    primaryAsset: 'bitcoin',
    sequence: ['bitcoin-core/secp256k1', 'bitcoin/bitcoin'],
  },
  {
    id: 'ethereum-l1',
    label: 'Ethereum L1',
    primaryAsset: 'ethereum',
    sequence: ['ethereum/solidity', 'ethereum/go-ethereum', 'paradigmxyz/reth'],
  },
  {
    id: 'solana-l1',
    label: 'Solana L1',
    primaryAsset: 'solana',
    sequence: ['solana-labs/solana', 'anza-xyz/agave'],
  },
  {
    id: 'alt-l1',
    label: 'Alt L1',
    primaryAsset: 'sui',
    sequence: ['MystenLabs/sui'],
  },
] as const;

export type RepoTier = 'A' | 'B' | 'C';

export function findWatchlistEntry(repo: string): WatchlistEntry | undefined {
  const key = repo.toLowerCase();
  return CONSENSUS_WATCHLIST.find((w) => w.repo.toLowerCase() === key);
}

export function watchlistAssetForRepo(repo: string): string | undefined {
  return findWatchlistEntry(repo)?.asset;
}
