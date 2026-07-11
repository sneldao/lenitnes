import { CONSENSUS_WATCHLIST, type RepoTier } from '@lenitnes/types';

export interface WatchlistRepo {
  repo: string;
  asset: string;
}

/** Filter watchlist repos by tier labels from a completed mock sweep. */
export function reposForTier(
  tier: RepoTier,
  mockProfiles: Array<{ repo: string; tier: RepoTier }>,
  watchlist: readonly { repo: string; asset: string }[] = CONSENSUS_WATCHLIST,
): WatchlistRepo[] {
  const allowed = new Set(
    mockProfiles.filter((p) => p.tier === tier).map((p) => p.repo.toLowerCase()),
  );
  return watchlist
    .filter((r) => allowed.has(r.repo.toLowerCase()))
    .map(({ repo, asset }) => ({ repo, asset }));
}

export function watchlistRepos(): WatchlistRepo[] {
  return CONSENSUS_WATCHLIST.map(({ repo, asset }) => ({ repo, asset }));
}
