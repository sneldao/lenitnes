import type { RepoTier } from '@lenitnes/types';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import type { AgentEnv } from '../agent.js';
import { getResponsivenessSweepState } from '../responsiveness-sweep.js';

/** B-tier repos need higher conviction before a trade fires. */
export const B_TIER_TRADE_THRESHOLD = 80;

let tierMapCache: Map<string, RepoTier> | null = null;
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

/** Invalidate after a sweep completes (called from responsiveness-sweep). */
export function invalidateRepoTierCache(): void {
  tierMapCache = null;
  tierMapLoadedAt = 0;
}

export async function getRepoTierForMonitor(monitorUrl: string): Promise<RepoTier | null> {
  const repo = monitorRepoFromUrl(monitorUrl);
  const map = await getCachedRepoTierMap();
  return map.get(repo.toLowerCase()) ?? null;
}

export interface TierAgentPolicy {
  tier: RepoTier | null;
  forceMock: boolean;
  tradeThreshold: number;
  label: string;
}

export function resolveTierAgentPolicy(tier: RepoTier | null): TierAgentPolicy {
  const base = config.agent.convictionThreshold;
  if (tier === 'C') {
    return {
      tier,
      forceMock: true,
      tradeThreshold: base,
      label: 'C-tier — mock agent only (no LLM spend)',
    };
  }
  if (tier === 'A') {
    return {
      tier,
      forceMock: false,
      tradeThreshold: base,
      label: 'A-tier — full live agent',
    };
  }
  // B-tier or unknown (conservative until sweep warms)
  return {
    tier,
    forceMock: false,
    tradeThreshold: B_TIER_TRADE_THRESHOLD,
    label: tier === 'B' ? 'B-tier — live agent, elevated trade floor' : 'unknown tier — B-default',
  };
}

export function applyTierToAgentEnv(env: AgentEnv, policy: TierAgentPolicy): AgentEnv {
  if (!policy.forceMock) return env;
  return { ...env, mock: true };
}

export async function loadTierPolicyForMonitor(monitorUrl: string): Promise<TierAgentPolicy> {
  const repo = monitorRepoFromUrl(monitorUrl);
  const map = await getCachedRepoTierMap();
  const tier = map.get(repo.toLowerCase()) ?? null;
  const policy = resolveTierAgentPolicy(tier);
  if (policy.forceMock || policy.tradeThreshold !== config.agent.convictionThreshold) {
    logger.debug({ repo, tier, policy: policy.label }, 'repo tier policy applied');
  }
  return policy;
}
