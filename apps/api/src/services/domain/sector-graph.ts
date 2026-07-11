/** Static sector graph — upstream→downstream repo chains for sequence context. */

import { SECTOR_GRAPHS, type SectorGraphDef } from '@lenitnes/types';

export type SectorGraph = SectorGraphDef;

export { SECTOR_GRAPHS };

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
