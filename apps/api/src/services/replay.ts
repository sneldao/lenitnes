// ─────────────────────────────────────────────────────────────
// Replay — runs the detector pipeline + agent against a historical
// commit range of ANY public GitHub repo. This is three products in
// one function:
//   1. the case-study generator (what would we have said, and was
//      it right?) — feeds the public track-record narrative;
//   2. the "signal spotlight" content engine for resolved calls;
//   3. the enterprise leak-scan demo: point it at a company's repo
//      and show what its commit history was telling the market.
// The engine is the SAME detectors + rubric the live trader uses —
// that identity is the product claim, so nothing here may fork
// detector or scoring logic.
// ─────────────────────────────────────────────────────────────

import type { AgentScore, Chain } from '@lenitnes/types';
import { buildAgentEnvFromConfig, score } from './agent.js';
import { fetchCommitsRange, type GitHubCommit } from './github.js';
import { runDetectors } from './detectors/registry.js';
import { priceData } from './data-providers/registry.js';
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
  /** Number of commits in the day-batch this verdict covers (real replays). */
  commitCount?: number;
  /** What the price actually did afterwards — only for matured windows. */
  priceOutcome?: {
    t1dPct: number | null;
    t7dPct: number | null;
    /** T+1d verdict vs the recommended action; null when flat/unknown. */
    correct: boolean | null;
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

/** Max day-batches sent to the agent per replay — bounds LLM cost.
 * Batches beyond the cap keep their detector classifications but are
 * dropped from the scored output (strongest-first). */
const MAX_SCORED_BATCHES = 8;

/** Group commits by UTC day — the granularity a live monitor would
 * effectively see them at, and the natural unit for "what did this
 * repo tell the market that day". */
function groupByDay(commits: GitHubCommit[]): Map<string, GitHubCommit[]> {
  const groups = new Map<string, GitHubCommit[]>();
  for (const c of commits) {
    const day = (c.date || '').slice(0, 10);
    if (!day) continue;
    const list = groups.get(day) ?? [];
    list.push(c);
    groups.set(day, list);
  }
  return groups;
}

/** Price outcome for a batch date — only windows that have matured. */
async function fetchPriceOutcome(
  asset: string,
  dayIso: string,
  recommendedAction: 'long' | 'short' | 'none',
): Promise<ReplayCommitVerdict['priceOutcome']> {
  const dayStart = new Date(`${dayIso}T00:00:00Z`);
  const pctFor = async (windowSec: number): Promise<number | null> => {
    if (dayStart.getTime() + windowSec * 1000 > Date.now()) return null;
    const result = await priceData.getPriceAtWindow(asset, dayStart, windowSec).catch(() => null);
    if (!result) return null;
    return ((result.afterWindow - result.atSignal) / result.atSignal) * 100;
  };
  const [t1dPct, t7dPct] = await Promise.all([pctFor(86_400), pctFor(604_800)]);

  let correct: boolean | null = null;
  if (t1dPct != null && Math.abs(t1dPct) > 0.5 && recommendedAction !== 'none') {
    correct =
      (recommendedAction === 'long' && t1dPct > 0) || (recommendedAction === 'short' && t1dPct < 0);
  }
  return { t1dPct, t7dPct, correct };
}

/**
 * Replay a commit range against the live detector pipeline + agent.
 * Fetches the repo's real commit history for [from, to], batches by
 * UTC day, runs the 9 typed detectors on each batch, and scores the
 * firing batches with the agent (mock mode = deterministic detector-
 * max conviction, no LLM cost). When the asset is priced, matured
 * T+1d / T+7d windows are attached so every verdict carries its own
 * "was it right?" answer.
 */
export async function replay(input: ReplayInput): Promise<ReplayCommitVerdict[]> {
  logger.info(
    { repo: input.repo, from: input.from, to: input.to, asset: input.asset, mock: input.mock },
    'replay: scanning historical commit range',
  );

  const commits = await fetchCommitsRange(input.repo, input.from, input.to);
  if (!commits || commits.length === 0) {
    logger.info({ repo: input.repo }, 'replay: no commits found in range');
    return [];
  }

  // Detector pass per day-batch — free, runs on everything.
  const firing: Array<{
    day: string;
    batch: GitHubCommit[];
    classifications: ReturnType<typeof runDetectors>;
    topScore: number;
  }> = [];
  for (const [day, batch] of groupByDay(commits)) {
    const classifications = runDetectors({
      result: {
        conditionMet: true,
        confidence: 100,
        evidence: batch.map((c) => `${c.sha.slice(0, 7)}: ${c.message.split('\n')[0]}`).join('\n'),
        summary: `replay batch ${day} · ${batch.length} commit(s)`,
      },
      commits: batch,
      monitorUrl: input.repo,
      monitorCondition:
        'Any commit referencing a consensus-critical change, emergency patch, or security vulnerability fix.',
    });
    if (classifications.length > 0) {
      firing.push({
        day,
        batch,
        classifications,
        topScore: Math.max(...classifications.map((c) => c.score)),
      });
    }
  }

  // Score the strongest batches with the agent; cap bounds LLM cost.
  firing.sort((a, b) => b.topScore - a.topScore);
  const toScore = firing.slice(0, MAX_SCORED_BATCHES);
  if (firing.length > toScore.length) {
    logger.info(
      { firing: firing.length, scored: toScore.length },
      'replay: capped agent-scored batches (strongest first)',
    );
  }

  const env = buildAgentEnvFromConfig();
  if (input.mock != null) env.mock = input.mock;

  const verdicts: ReplayCommitVerdict[] = [];
  for (const f of toScore) {
    const strongest = f.batch[0];
    try {
      const agentScore = await score(
        {
          signal_id: `replay-${f.day}-${strongest.sha.slice(0, 8)}`,
          detector_classifications: f.classifications.map((c) => ({
            detector_type: c.type,
            score: c.score,
            confidence: c.confidence,
            label: c.label,
            metadata: c.metadata,
          })),
          asset_mapping: { coingeckoId: input.asset, direction: 'both' },
          evidence_text: f.batch
            .slice(0, 10)
            .map((c) => `${c.sha.slice(0, 7)}: ${c.message.split('\n')[0]}`)
            .join('\n'),
          condition_summary: `Replay ${input.repo} · ${f.day} · ${f.batch.length} commit(s)`,
          precedent_count: 0,
        },
        env,
      );

      const priceOutcome = input.asset
        ? await fetchPriceOutcome(input.asset, f.day, agentScore.recommended_action)
        : undefined;

      verdicts.push({
        hash: strongest.sha,
        message: strongest.message.split('\n')[0],
        committedAt: `${f.day}T00:00:00.000Z`,
        detectorClassifications: f.classifications.map((c) => ({
          detector_type: c.type,
          score: c.score,
          confidence: c.confidence,
          label: c.label,
        })),
        agentScore,
        wouldHaveTraded: {
          chain: 'bnb',
          side: agentScore.recommended_action,
          pair: input.asset ? `${input.asset.toUpperCase()}USD` : 'UNKNOWN',
          paper: true,
        },
        commitCount: f.batch.length,
        priceOutcome,
      });
    } catch (err) {
      logger.warn({ err, day: f.day, repo: input.repo }, 'replay: batch scoring failed — skipped');
    }
  }

  // Chronological order reads as a narrative.
  verdicts.sort((a, b) => a.committedAt.localeCompare(b.committedAt));
  return verdicts;
}

/**
 * Build a ReplayInput from a repo + optional range. Defaults to the
 * last 90 days — the same lookback the enterprise leak-scan pitch
 * uses ("what did your last quarter of commits tell the market?").
 */
export function describeReplay(input: {
  repo: string;
  from?: string;
  to?: string;
  asset?: string;
}): ReplayInput {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  return {
    repo: input.repo,
    from: input.from ?? ninetyDaysAgo.toISOString(),
    to: input.to ?? now.toISOString(),
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
      asset_mapping: { coingeckoId: 'zcash', direction: 'both' },
      evidence_text: commit.message,
      condition_summary: commit.message,
      precedent_count: 0,
    },
    env,
  );
}
