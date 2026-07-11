import type { RepoTier } from '@lenitnes/types';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import type { AgentEnv } from '../agent.js';
import { getResponsivenessSweepState } from '../responsiveness-sweep.js';

/** B-tier repos need higher conviction before a trade fires. */
export const B_TIER_TRADE_THRESHOLD = 80;

let tierMapCache: Map<string, RepoTier> | null = null;
let liveTierMapCache: Map<string, RepoTier> | null = null;
let tierMapLoadedAt = 0;
const TIER_MAP_TTL_MS = 5 * 60 * 1000;

export function monitorRepoFromUrl(url: string): string {
  const path = url
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .split(/[?#]/)[0]!;
  const [owner, repo] = path.split('/').filter(Boolean);
  return owner && repo ? `${owner}/${repo}` : path;
}

export async function getCachedRepoTierMap(): Promise<Map<string, RepoTier>> {
  const now = Date.now();
  if (tierMapCache && now - tierMapLoadedAt < TIER_MAP_TTL_MS) {
    return tierMapCache;
  }

  const state = await getResponsivenessSweepState('mock');
  const map = new Map<string, RepoTier>();
  if (state.status === 'ready' && state.payload?.profiles) {
    for (const p of state.payload.profiles) {
      map.set(p.repo.toLowerCase(), p.tier);
    }
  }
  tierMapCache = map;
  tierMapLoadedAt = now;
  return map;
}

/** Live tier labels from the latest tier-scoped (A) or full live sweep. */
export async function getCachedLiveTierMap(): Promise<Map<string, RepoTier>> {
  const now = Date.now();
  if (liveTierMapCache && now - tierMapLoadedAt < TIER_MAP_TTL_MS) {
    return liveTierMapCache;
  }

  const tierA = await getResponsivenessSweepState('live', undefined, undefined, 'A');
  const state =
    tierA.status === 'ready' && tierA.payload?.profiles.length
      ? tierA
      : await getResponsivenessSweepState('live');

  const map = new Map<string, RepoTier>();
  if (state.status === 'ready' && state.payload?.profiles) {
    for (const p of state.payload.profiles) {
      map.set(p.repo.toLowerCase(), p.tier);
    }
  }
  liveTierMapCache = map;
  return map;
}

/** Invalidate after a sweep completes (called from responsiveness-sweep). */
export function invalidateRepoTierCache(): void {
  tierMapCache = null;
  liveTierMapCache = null;
  tierMapLoadedAt = 0;
}

export async function getRepoTierForMonitor(monitorUrl: string): Promise<RepoTier | null> {
  const repo = monitorRepoFromUrl(monitorUrl);
  const map = await getCachedRepoTierMap();
  return map.get(repo.toLowerCase()) ?? null;
}

export interface TierAgentPolicy {
  tier: RepoTier | null;
  mockTier: RepoTier | null;
  liveTier: RepoTier | null;
  liveConfirmed: boolean;
  forceMock: boolean;
  tradeThreshold: number;
  label: string;
}

export function resolveTierAgentPolicy(tier: RepoTier | null): TierAgentPolicy {
  const base = config.agent.convictionThreshold;
  if (tier === 'C') {
    return {
      tier,
      mockTier: tier,
      liveTier: null,
      liveConfirmed: false,
      forceMock: true,
      tradeThreshold: base,
      label: 'C-tier — mock agent only (no LLM spend)',
    };
  }
  if (tier === 'A') {
    return {
      tier,
      mockTier: tier,
      liveTier: tier,
      liveConfirmed: true,
      forceMock: false,
      tradeThreshold: base,
      label: 'A-tier — full live agent',
    };
  }
  return {
    tier,
    mockTier: tier,
    liveTier: null,
    liveConfirmed: false,
    forceMock: false,
    tradeThreshold: B_TIER_TRADE_THRESHOLD,
    label: tier === 'B' ? 'B-tier — live agent, elevated trade floor' : 'unknown tier — B-default',
  };
}

/**
 * Mock A-tier requires live A-tier confirmation before full spend.
 * Prevents Agave-style mock overstatement from unlocking the 70 floor.
 */
export function resolveEffectiveTierPolicy(
  mockTier: RepoTier | null,
  liveTier: RepoTier | null,
): TierAgentPolicy {
  if (mockTier === 'C') return resolveTierAgentPolicy('C');

  if (mockTier === 'A') {
    if (liveTier === 'A') return resolveTierAgentPolicy('A');
    return {
      tier: 'B',
      mockTier: 'A',
      liveTier,
      liveConfirmed: false,
      forceMock: false,
      tradeThreshold: B_TIER_TRADE_THRESHOLD,
      label: liveTier
        ? `mock A / live ${liveTier} — elevated floor until live confirms A`
        : 'mock A — awaiting live confirmation',
    };
  }

  const policy = resolveTierAgentPolicy(mockTier);
  return { ...policy, mockTier, liveTier, liveConfirmed: false };
}

export function applyTierToAgentEnv(env: AgentEnv, policy: TierAgentPolicy): AgentEnv {
  if (!policy.forceMock) return env;
  return { ...env, mock: true };
}

export async function loadTierPolicyForMonitor(monitorUrl: string): Promise<TierAgentPolicy> {
  const repo = monitorRepoFromUrl(monitorUrl);
  const [mockMap, liveMap] = await Promise.all([getCachedRepoTierMap(), getCachedLiveTierMap()]);
  const mockTier = mockMap.get(repo.toLowerCase()) ?? null;
  const liveTier = liveMap.get(repo.toLowerCase()) ?? null;
  const policy = resolveEffectiveTierPolicy(mockTier, liveTier);
  if (policy.forceMock || policy.tradeThreshold !== config.agent.convictionThreshold) {
    logger.debug({ repo, mockTier, liveTier, policy: policy.label }, 'repo tier policy applied');
  }
  return policy;
}

export interface TierDriftEntry {
  repo: string;
  mockTier: RepoTier;
  liveTier: RepoTier | null;
  diverged: boolean;
}

/** Compare mock vs live tier labels for calibration surfaces. */
export function computeTierDrift(
  mockProfiles: Array<{ repo: string; tier: RepoTier }>,
  liveProfiles: Array<{ repo: string; tier: RepoTier }> | null | undefined,
): TierDriftEntry[] {
  const liveByRepo = new Map(liveProfiles?.map((p) => [p.repo.toLowerCase(), p.tier]) ?? []);
  return mockProfiles.map((p) => {
    const liveTier = liveByRepo.get(p.repo.toLowerCase()) ?? null;
    return {
      repo: p.repo,
      mockTier: p.tier,
      liveTier,
      diverged: liveTier != null && liveTier !== p.tier,
    };
  });
}
