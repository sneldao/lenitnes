import type { ReplayResponsiveness } from '../replay.js';

export type RepoTier = 'A' | 'B' | 'C';

export interface TieredProfile extends ReplayResponsiveness {
  tier: RepoTier;
  tierReason: string;
}

const MIN_TRADE_GRADE = 3;

/**
 * Assign A/B/C tier from a responsiveness profile.
 * A = strong T+7d or strong T+1d with positive T+7d drift.
 * C = weak hits or insufficient sample.
 */
export function assignRepoTier(profile: ReplayResponsiveness): TieredProfile {
  const { hitRateT1d, hitRateT7d, avgDirectionalT7d, tradeGradeCalls } = profile;

  if (tradeGradeCalls < MIN_TRADE_GRADE) {
    return {
      ...profile,
      tier: 'C',
      tierReason: `insufficient trade-grade sample (n=${tradeGradeCalls}, need ≥${MIN_TRADE_GRADE})`,
    };
  }

  const t7Hit = hitRateT7d ?? 0;
  const t1Hit = hitRateT1d ?? 0;
  const t7Dir = avgDirectionalT7d ?? 0;

  if (t7Hit >= 0.5 || (t1Hit >= 0.55 && t7Dir > 0)) {
    return {
      ...profile,
      tier: 'A',
      tierReason:
        t7Hit >= 0.5
          ? `T+7d hit ${(t7Hit * 100).toFixed(0)}%`
          : `T+1d hit ${(t1Hit * 100).toFixed(0)}% with positive T+7d drift`,
    };
  }

  if (t7Hit < 0.35 && t1Hit < 0.4) {
    return {
      ...profile,
      tier: 'C',
      tierReason: `weak T+1d (${(t1Hit * 100).toFixed(0)}%) and T+7d (${(t7Hit * 100).toFixed(0)}%)`,
    };
  }

  return {
    ...profile,
    tier: 'B',
    tierReason: 'moderate responsiveness — monitor before expanding spend',
  };
}

export function tierProfiles(profiles: ReplayResponsiveness[]): TieredProfile[] {
  return profiles.map(assignRepoTier);
}
