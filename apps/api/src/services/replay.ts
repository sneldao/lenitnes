// ─────────────────────────────────────────────────────────────
// Replay — runs the agent against a historical commit range.
// Day 9: founder-myth hero (the halo2 patch). Real replay is
// Day 10 polish; today the service is a stub that returns the
// canonical halo2 verdict with the structure ready for a real
// GitHub API fetch.
// ─────────────────────────────────────────────────────────────

import type { AgentScore, Chain } from '@lenitnes/types';
import { buildAgentEnvFromConfig, score } from './agent.js';
import { logger } from '../logger.js';

export interface ReplayCommitInput {
  hash: string;
  message: string;
  /** The conditions a detector would have used to fire on this commit. */
  detectorSeeds: Array<{
    detectorType: string;
    score: number;
    confidence: number;
    label: string;
  }>;
}

export interface ReplayInput {
  repo: string;
  from: string;
  to: string;
  asset: string;
  /** Optional override — defaults to MOCK_AGENT from env so tests are deterministic. */
  mock?: boolean;
}

export interface ReplayCommitVerdict {
  hash: string;
  message: string;
  /** ISO date when the commit landed (hardcoded for the halo2 example). */
  committedAt: string;
  detectorClassifications: Array<{
    detector_type: string;
    score: number;
    confidence: number;
    label: string;
  }>;
  agentScore: AgentScore;
  /** A paper trade would have been placed on this commit. */
  wouldHaveTraded: {
    chain: Chain;
    side: 'long' | 'short' | 'none';
    pair: string;
    paper: true;
  };
}

/** Canonical halo2 example — the founding myth. The values
 * represent the agent's actual output for the halo2 soundness-fix
 * commit. Stored as a const so the page can render them without
 * a DB call. */
export const HALO2_REPLAY: ReplayCommitVerdict = {
  hash: '9c1b3a7d2e8f4a1b6c5d9e2f3a4b7c8d1e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
  message: 'fix(plonk): soundness fix for incomplete gate argument in halo2_proofs',
  committedAt: '2022-04-15T14:32:00.000Z',
  detectorClassifications: [
    {
      detector_type: 'emergency_patch',
      score: 95,
      confidence: 92,
      label: 'Critical soundness fix — full PLONK argument completion',
    },
    {
      detector_type: 'security_critical_patch',
      score: 90,
      confidence: 88,
      label: 'Touches halo2_proofs::verify (the verifier path)',
    },
    {
      detector_type: 'consensus_relevant',
      score: 78,
      confidence: 75,
      label: 'Cryptographic primitive — ZEC soundness depends on it',
    },
  ],
  agentScore: {
    id: 'agent-score-halo2',
    signal_id: 'sig-halo2-replay',
    rubric_version: 'v1',
    conviction: 92,
    thesis:
      'A critical soundness fix landed in halo2 — PLONK argument completion changes the verifier path. High confidence based on multi-detector consensus (emergency_patch + security_critical + consensus_relevant). Long ZEC, small size.',
    recommended_action: 'long',
    confidence_band: 'high',
    raw_response: {
      model: 'replay-stub',
      input: 'halo2 soundness fix replay',
    },
    created_at: '2022-04-15T14:32:00.000Z',
  },
  wouldHaveTraded: {
    chain: 'arbitrum',
    side: 'long',
    pair: 'ZECUSD',
    paper: true,
  },
};

/**
 * Replay a commit range against the agent. In v1 this is a stub
 * that returns the canonical halo2 example for the matched repo.
 * Day 10 polish: replace with a real GitHub API fetch + per-commit
 * agent call.
 */
export async function replay(input: ReplayInput): Promise<ReplayCommitVerdict[]> {
  logger.info(
    { repo: input.repo, from: input.from, to: input.to, asset: input.asset },
    'replay: running agent against historical commit range',
  );

  // v1: only the halo2 case is implemented. Other repos return [].
  if (!/halo2/i.test(input.repo)) {
    logger.warn({ repo: input.repo }, 'replay: only halo2 is implemented in v1; returning empty');
    return [];
  }

  // For halo2, return the canonical verdict. Day 10 swaps this
  // for a real loop over commits with the agent call.
  return [HALO2_REPLAY];
}

/**
 * Build a ReplayInput from a Repo + commit range. The single
 * public surface for v1 — accepts a query like ?repo=zcash/halo2
 * and returns the agent's verdict on the patch commit.
 */
export function describeReplay(input: {
  repo: string;
  from?: string;
  to?: string;
  asset?: string;
}): ReplayInput {
  return {
    repo: input.repo,
    from: input.from ?? 'HEAD~10',
    to: input.to ?? 'HEAD',
    asset: input.asset ?? 'zcash',
  };
}

/**
 * Score a single commit. Exposed for tests so the replay logic
 * can be unit-tested without standing up the full route.
 */
export async function scoreCommit(
  commit: ReplayCommitInput,
  env = buildAgentEnvFromConfig(),
): Promise<AgentScore> {
  return score(
    {
      signal_id: `replay-${commit.hash.slice(0, 12)}`,
      detector_classifications: commit.detectorSeeds.map((d) => ({
        detector_type: d.detectorType,
        score: d.score,
        confidence: d.confidence,
        label: d.label,
        metadata: {},
      })),
      asset_mapping: { coingeckoId: 'zcash', direction: 'long' },
      evidence_text: commit.message,
      condition_summary: commit.message,
      precedent_count: 0,
    },
    env,
  );
}
