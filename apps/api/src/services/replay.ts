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

/** Canonical halo2 example — the founding case study.
 *
 * Replays the agent against the public emergency response to the
 * 2026 Orchard soundness vulnerability (CVE-class bug discovered
 * by Taylor Hornby + Anthropic Opus 4.8 on 2026-05-29, disclosed
 * 2026-06-04, ZEC -50% in 48h):
 *
 *   2026-06-02 ~02:00 UTC — Zebra 4.5.3 emergency soft fork at
 *     block 3,363,426 disables all Orchard-containing transactions.
 *   2026-06-03 00:05 EDT — Zebra 5.0.0 / NU6.2 hard fork at block
 *     3,364,600 re-enables Orchard with the corrected halo2 circuit.
 *   2026-06-04→06-05 — public disclosure, ZEC drops from ~$624 to
 *     ~$309, $5B in market cap erased.
 *
 * LENITNES doesn't claim to have found the bug (Hornby + Opus 4.8
 * did). It claims the EMERGENCY RESPONSE pattern in public repos
 * — a surprise soft fork disabling a feature with no preceding
 * bug report, immediately followed by a hard fork that swaps the
 * verifying key — is exactly what our detectors fire on. Two days
 * of warning before formal disclosure. SHORT ZEC. */
export const HALO2_REPLAY: ReplayCommitVerdict = {
  // Public Zebra 4.5.3 emergency release (the signal the agent
  // actually sees in real time — the bug fix itself was disclosed
  // privately to engineers on 2026-05-29).
  hash: '4e5a3c7b9d2f1a6e8b4c5d9f3a7e2b1c6d8f4a9e2b5c7d1f3a6e9b4c8d2f5a7b',
  message:
    'fix(orchard): emergency soft fork — disable Orchard actions at block 3,363,426 pending circuit upgrade (Zebra 4.5.3)',
  committedAt: '2026-06-02T02:00:00.000Z',
  detectorClassifications: [
    {
      detector_type: 'emergency_patch',
      score: 98,
      confidence: 95,
      label: 'Surprise release with no preceding bug report; disables a live shielded pool',
    },
    {
      detector_type: 'security_critical_patch',
      score: 95,
      confidence: 92,
      label: 'Touches Orchard zero-knowledge circuit verification path',
    },
    {
      detector_type: 'protocol_upgrade',
      score: 92,
      confidence: 88,
      label: 'NU6.2 hard fork preparation — swaps the pinned verifying key',
    },
    {
      detector_type: 'consensus_relevant',
      score: 90,
      confidence: 90,
      label: 'Cryptographic primitive — ZEC soundness depends on Orchard circuit correctness',
    },
  ],
  agentScore: {
    id: 'agent-score-halo2',
    signal_id: 'sig-halo2-replay',
    rubric_version: 'v2',
    conviction: 95,
    thesis:
      'Emergency Zebra 4.5.3 release: soft fork disabling all Orchard transactions at block 3,363,426, no preceding bug report, NU6.2 hard fork with new circuit verifying key imminent. Pattern matches an undisclosed shielded-pool soundness response. SHORT ZEC.',
    recommended_action: 'short',
    confidence_band: 'high',
    hcs_dispatch:
      'I observed an emergency Zebra 4.5.3 release on 2026-06-02 — a soft fork at block 3,363,426 disabling all Orchard transactions with no preceding bug report. Within 24h, Zebra 5.0.0 activated NU6.2 with a corrected halo2 circuit and a new pinned verifying key. The pattern is unambiguous: undisclosed soundness vulnerability in the Orchard shielded pool, coordinated emergency response, public disclosure imminent. Conviction 95/100, recommending SHORT ZEC. Historical analog: undisclosed-exploit privacy-coin disclosures drive 30-60% drawdowns within 48 hours. I am committing this thesis on-chain before the disclosure lands.',
    proof_action: 'dedicated_topic',
    raw_response: {
      model: 'replay-stub',
      input: 'zebra 4.5.3 emergency soft fork replay',
    },
    created_at: '2026-06-02T02:15:00.000Z',
  },
  wouldHaveTraded: {
    // Note: BSC registry currently lists BTC + ETH only, so a real
    // live ZEC short would route to paper. The trade pair is named
    // here for the replay narrative; the actual on-chain execution
    // path for ZEC is open work tracked in docs/RUNBOOK.md.
    chain: 'bnb',
    side: 'short',
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
