/** Static sector graph — upstream→downstream repo chains for sequence context. */

export interface SectorGraph {
  id: string;
  label: string;
  /** Primary coingecko asset id for the sector. */
  primaryAsset: string;
  /** Repos in causal order (circuit/libs → node → protocol). */
  sequence: readonly string[];
}

export const SECTOR_GRAPHS: readonly SectorGraph[] = [
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

const REPO_SECTOR = new Map<string, SectorGraph>();
for (const sector of SECTOR_GRAPHS) {
  for (const repo of sector.sequence) {
    REPO_SECTOR.set(repo.toLowerCase(), sector);
  }
}

export function getSectorForRepo(repo: string): SectorGraph | null {
  return REPO_SECTOR.get(repo.toLowerCase()) ?? null;
}

/** Watchlist sweep order — sector chains first, then unmapped repos. */
export function sortReposBySectorSequence(
  repos: ReadonlyArray<{ repo: string; asset: string }>,
): Array<{ repo: string; asset: string }> {
  const rank = new Map<string, number>();
  let globalIdx = 0;
  for (const sector of SECTOR_GRAPHS) {
    for (const repo of sector.sequence) {
      rank.set(repo.toLowerCase(), globalIdx++);
    }
  }
  return [...repos].sort((a, b) => {
    const ra = rank.get(a.repo.toLowerCase()) ?? 999;
    const rb = rank.get(b.repo.toLowerCase()) ?? 999;
    if (ra !== rb) return ra - rb;
    return a.repo.localeCompare(b.repo);
  });
}
