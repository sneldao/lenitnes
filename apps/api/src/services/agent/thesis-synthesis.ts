// ─────────────────────────────────────────────────────────────
// Thesis synthesis — the commit-aggregation layer.
//
// The existing pipeline is single-commit: one detector matches
// one commit → one signal → one score → one trade. Commits that
// don't trip a detector are silently discarded. But 15 mundane
// commits across 3 days can collectively telegraph a consensus-
// breaking change that no individual detector would catch.
//
// This service periodically fetches recent settled commits from
// ALL active monitors, excludes those that already produced a
// signal, and — when the un-triggered pool is large enough — asks
// the LLM agent: "do these collectively form a tradeable thesis?"
//
// The agent scores the synthesis against the same rubric v4, with
// full commit SHAs in the evidence text so it can satisfy the
// commit-citation requirement. If conviction clears the threshold,
// the trade executes through the same treasury path (Propr perps
// for shorts, spot/paper fallback).
// ─────────────────────────────────────────────────────────────

import { query } from '../../db/pool.js';
import { logger } from '../../logger.js';
import { config } from '../../config.js';
import { cacheInvalidate } from '../../middleware/cache.js';
import { marketData } from '../data-providers/registry.js';
import { scoreAndPersist, buildAgentEnvFromConfig, buildBookContext } from '../agent.js';
import { executeAgentTrade } from '../treasury.js';
import { broadcastSignal, buildOutcomeWindows } from '../notify.js';
import { getProofService } from '../proof.js';
import { fetchCommitsRange, formatCommitEvidence, enrichCommitStats } from '../github.js';
import type { GitHubCommit } from '../github.js';
import { buildNarrativeContext } from './narrative.js';
import type { AssetMapping, AgentScore } from '@lenitnes/types';

const SYNTHESIS_MONITOR_URL = 'synthesis:thesis';
/** Hours back to scan for un-triggered commits. */
const SCAN_WINDOW_HOURS = 4;
/** Min un-triggered commits across ≥2 repos to attempt synthesis. */
const MIN_COMMITS_MULTI_REPO = 4;
/** Min un-triggered commits in a single repo to attempt synthesis. */
const MIN_COMMITS_SINGLE_REPO = 6;

interface MonitorRepo {
  id: string;
  url: string;
  asset: string | null;
  lastSeenCommitHash: string | null;
  confidenceThreshold: number;
}

interface RepoCommitBatch {
  monitor: MonitorRepo;
  commits: GitHubCommit[];
}

/** Fetch active non-narrative monitors with their asset mappings. */
async function activeMonitorRepos(): Promise<MonitorRepo[]> {
  const { rows } = await query<MonitorRepo>(
    `SELECT id,
            url,
            asset_mapping->>'coingeckoId' AS asset,
            last_seen_commit_hash AS "lastSeenCommitHash",
            confidence_threshold AS "confidenceThreshold"
       FROM monitors
      WHERE status = 'active'
        AND url NOT LIKE 'narrative:%'
        AND url NOT LIKE 'synthesis:%'
        AND url LIKE 'https://github.com/%'`,
  );
  return rows;
}

/**
 * Fetch recent commits from a repo and exclude any that already
 * produced a signal (by checking last_seen_commit_hash boundary).
 * Only settled commits (older than MIN_COMMIT_AGE_MINUTES) are
 * included — mirrors the settle gate in loop.ts.
 */
async function untriggeredCommits(monitor: MonitorRepo): Promise<GitHubCommit[]> {
  const since = new Date(Date.now() - SCAN_WINDOW_HOURS * 3_600_000).toISOString();
  const until = new Date(Date.now() - config.agent.minCommitAgeMinutes * 60_000).toISOString();

  let commits: GitHubCommit[] | null = null;
  try {
    commits = await fetchCommitsRange(monitor.url, since, until, 2);
  } catch (err) {
    logger.warn({ err, url: monitor.url }, 'thesis-synthesis: commit fetch failed');
    return [];
  }
  if (!commits || commits.length === 0) return [];

  // Enrich with diff stats (best-effort, bounded, mutates in place).
  try {
    await enrichCommitStats(monitor.url, commits);
  } catch {
    // Stats enrichment is cosmetic; proceed without.
  }

  // Exclude commits at or before the last-seen boundary. The
  // monitor's last_seen_commit_hash is the most recent commit that
  // was already processed (signaled or heartbeated). Everything
  // after it in the list is un-triggered.
  if (monitor.lastSeenCommitHash) {
    const idx = commits.findIndex((c) => c.sha === monitor.lastSeenCommitHash);
    if (idx >= 0) {
      commits = commits.slice(0, idx);
    }
    // If the hash isn't found (e.g. force-push rewrote history),
    // treat all fetched commits as un-triggered. The agent's
    // book-discipline rule prevents re-trading existing theses.
  }

  return commits;
}

/**
 * Decide whether the un-triggered commit pool warrants an LLM
 * synthesis call. Returns the dominant asset + evidence text, or
 * null if the pool is too small.
 */
function assessCommitPool(
  batches: RepoCommitBatch[],
): { dominantAsset: string; assetMapping: AssetMapping; evidence: string } | null {
  const nonEmpty = batches.filter((b) => b.commits.length > 0);
  const totalCommits = nonEmpty.reduce((sum, b) => sum + b.commits.length, 0);
  const distinctRepos = nonEmpty.length;

  const multiRepo = distinctRepos >= 2 && totalCommits >= MIN_COMMITS_MULTI_REPO;
  const singleRepo = totalCommits >= MIN_COMMITS_SINGLE_REPO;
  if (!multiRepo && !singleRepo) return null;

  // Find the dominant asset: the one with the most un-triggered commits.
  const byAsset = new Map<string, { count: number; batches: RepoCommitBatch[] }>();
  for (const b of nonEmpty) {
    const asset = b.monitor.asset ?? 'unknown';
    const entry = byAsset.get(asset) ?? { count: 0, batches: [] };
    entry.count += b.commits.length;
    entry.batches.push(b);
    byAsset.set(asset, entry);
  }

  let best: { asset: string; entry: { count: number; batches: RepoCommitBatch[] } } | null = null;
  for (const [asset, entry] of byAsset) {
    if (!best || entry.count > best.entry.count) {
      best = { asset, entry };
    }
  }
  if (!best) return null;

  // Build evidence text with full commit SHAs (the rubric requires
  // the agent to cite a specific SHA).
  const lines: string[] = [
    `Thesis synthesis · ${totalCommits} un-triggered commits across ${distinctRepos} repos (${SCAN_WINDOW_HOURS}h window)`,
    '',
  ];
  for (const b of nonEmpty) {
    const repo = b.monitor.url.replace(/^https?:\/\/github\.com\//, '');
    lines.push(`── ${repo} (${b.commits.length} commits, asset: ${b.monitor.asset ?? 'n/a'}) ──`);
    lines.push(formatCommitEvidence(b.commits, 10));
    lines.push('');
  }

  return {
    dominantAsset: best.asset,
    assetMapping: { coingeckoId: best.asset, direction: 'both' },
    evidence: lines.join('\n'),
  };
}

let synthesisRunning = false;

/**
 * Run one thesis-synthesis pass. Fetches un-triggered commits from
 * all active monitors, and if the pool is large enough, creates a
 * synthesis signal, scores it, and trades it.
 */
export async function runThesisSynthesis(): Promise<void> {
  if (synthesisRunning) return;
  synthesisRunning = true;
  try {
    const monitors = await activeMonitorRepos();
    if (monitors.length === 0) {
      logger.debug('thesis-synthesis: no active GitHub monitors');
      return;
    }

    // Fetch un-triggered commits from all monitors in parallel.
    const batches: RepoCommitBatch[] = [];
    const results = await Promise.allSettled(
      monitors.map(async (m) => ({ monitor: m, commits: await untriggeredCommits(m) })),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') batches.push(r.value);
    }

    const pool = assessCommitPool(batches);
    if (!pool) {
      const total = batches.reduce((s, b) => s + b.commits.length, 0);
      logger.debug(
        { totalUntriggered: total, repos: batches.filter((b) => b.commits.length > 0).length },
        'thesis-synthesis: insufficient commit pool — skipping',
      );
      return;
    }

    logger.info(
      {
        dominantAsset: pool.dominantAsset,
        evidenceLength: pool.evidence.length,
      },
      'thesis-synthesis: commit pool warrants synthesis',
    );

    // Ensure the synthetic monitor row exists (auto-seed). No
    // unique constraint on monitors.url, so SELECT-then-INSERT.
    let monitorId: string;
    let threshold: number;
    const { rows: monitorRows } = await query<{ id: string; confidence_threshold: number }>(
      `SELECT id, confidence_threshold FROM monitors WHERE url = $1`,
      [SYNTHESIS_MONITOR_URL],
    );
    if (monitorRows.length > 0) {
      monitorId = monitorRows[0].id;
      threshold = monitorRows[0].confidence_threshold;
    } else {
      const { rows: inserted } = await query<{ id: string; confidence_threshold: number }>(
        `INSERT INTO monitors (url, condition_text, frequency_seconds, status, confidence_threshold, is_public)
         VALUES ($1, 'thesis synthesis from un-triggered commits', 14400, 'active', 70, true)
         RETURNING id, confidence_threshold`,
        [SYNTHESIS_MONITOR_URL],
      );
      monitorId = inserted[0].id;
      threshold = inserted[0].confidence_threshold;
    }

    // Create the synthesis signal row.
    const detectedAt = new Date().toISOString();
    const { rows: sigRows } = await query<{ id: string }>(
      `INSERT INTO signals (monitor_id, detected_at, evidence_text, condition_summary, is_heartbeat, asset)
       VALUES ($1, $2, $3, $4, false, $5) RETURNING id`,
      [monitorId, detectedAt, pool.evidence, 'thesis synthesis', pool.dominantAsset],
    );
    const signalId = sigRows[0].id;
    cacheInvalidate('scorecard:');

    // HCS timestamp anchor (best-effort).
    const proof = getProofService();
    if (proof.writeHcsMessage) {
      try {
        const hcs = await proof.writeHcsMessage({
          kind: 'signal',
          signalId,
          monitorId,
          ts: detectedAt,
          evidence: pool.evidence.slice(0, 500),
          summary: 'thesis synthesis',
        });
        await query(
          `UPDATE signals SET hedera_hcs_message_id = COALESCE($1, hedera_hcs_message_id) WHERE id = $2`,
          [hcs.hederaTxId, signalId],
        );
      } catch (err) {
        logger.warn({ err, signalId }, 'thesis-synthesis: HCS anchor failed (non-blocking)');
      }
    }

    // No detector classifications for synthesis signals — the
    // evidence text carries the raw commits. The agent scores
    // against rubric v4 with the full commit context.

    // Build market + narrative + book context.
    const coingeckoId = pool.dominantAsset;
    const [metrics, quotes] = await Promise.all([
      marketData.getGlobalMetrics(),
      coingeckoId && coingeckoId !== 'unknown'
        ? marketData.getQuotes([coingeckoId])
        : Promise.resolve([]),
    ]);
    let marketContext = marketData.formatMarketContext(metrics, quotes);
    try {
      const { buildMacroContext, buildIndexContext } =
        await import('../data-providers/sosovalue/index.js');
      const [macroCtx, indexCtx] = await Promise.all([buildMacroContext(), buildIndexContext()]);
      if (macroCtx) marketContext += '\n\n' + macroCtx;
      if (indexCtx) marketContext += '\n\n' + indexCtx;
    } catch {
      // SoSoValue not available; proceed without macro/index context.
    }

    const [narrativeContext, bookContext] = await Promise.all([
      buildNarrativeContext(pool.assetMapping),
      buildBookContext(),
    ]);

    const env = buildAgentEnvFromConfig();
    let agentScore: AgentScore;
    try {
      agentScore = await scoreAndPersist(
        {
          signal_id: signalId,
          detector_classifications: [
            {
              detector_type: 'thesis_synthesis',
              score: 50,
              confidence: 50,
              label: `${pool.dominantAsset}: ${pool.evidence.split('\n').length} lines of un-triggered commit evidence`,
              metadata: { source: 'thesis-synthesis', windowHours: SCAN_WINDOW_HOURS },
            },
          ],
          asset_mapping: pool.assetMapping,
          evidence_text: pool.evidence,
          condition_summary:
            'Thesis synthesis: aggregated un-triggered commits from multiple repos. No single commit tripped a detector, but the collective pattern may form a tradeable thesis.',
          precedent_count: 0,
          market_context: marketContext,
          narrative_context: narrativeContext || undefined,
          book_context: bookContext || undefined,
        },
        env,
      );
    } catch (err) {
      logger.error({ err, signalId }, 'thesis-synthesis: agent scoring failed');
      return;
    }

    logger.info(
      {
        signalId,
        conviction: agentScore.conviction,
        action: agentScore.recommended_action,
        thesis: agentScore.thesis,
      },
      'thesis-synthesis: scored',
    );

    // HCS dispatch anchor (best-effort).
    if (proof.writeHcsMessage) {
      try {
        await proof.writeHcsMessage(
          {
            kind: 'agent_dispatch',
            signalId,
            conviction: agentScore.conviction,
            recommendedAction: agentScore.recommended_action,
            confidenceBand: agentScore.confidence_band,
            rubricVersion: agentScore.rubric_version,
            dispatch: agentScore.hcs_dispatch,
          },
          { memo: `LENITNES thesis-synthesis dispatch · ${signalId.slice(0, 8)}` },
        );
      } catch (err) {
        logger.warn(
          { err, signalId },
          'thesis-synthesis: HCS dispatch anchor failed (non-blocking)',
        );
      }
    }

    if (agentScore.conviction < threshold) {
      logger.info(
        { signalId, conviction: agentScore.conviction, threshold },
        'thesis-synthesis: below threshold — archived, no trade',
      );
      return;
    }

    // Above threshold — trade + broadcast.
    const { tradeReceipt, orderId } = await executeAgentTrade(
      signalId,
      agentScore,
      pool.assetMapping,
    );
    logger.info(
      {
        signalId,
        conviction: agentScore.conviction,
        orderId,
        tradeMode: tradeReceipt?.mode,
      },
      'thesis-synthesis: signal traded',
    );

    if (tradeReceipt) {
      const { rows: proofRows } = await query<{
        ipfs_cid: string | null;
        hedera_hcs_message_id: string | null;
        arb_tx_hash: string | null;
      }>(`SELECT ipfs_cid, hedera_hcs_message_id, arb_tx_hash FROM signals WHERE id = $1`, [
        signalId,
      ]);
      broadcastSignal({
        signalId,
        summary: pool.evidence,
        monitorUrl: SYNTHESIS_MONITOR_URL,
        detectedAt,
        agentScore: {
          conviction: agentScore.conviction,
          thesis: agentScore.thesis,
          recommended_action: agentScore.recommended_action,
          confidence_band: agentScore.confidence_band,
          hcs_dispatch: agentScore.hcs_dispatch,
        },
        detectorTypes: ['thesis_synthesis'],
        tradeReceipt: {
          chain: tradeReceipt.chain,
          txHash: tradeReceipt.txHash,
          pair: tradeReceipt.pair,
          mode: tradeReceipt.mode,
        },
        proofs: {
          ipfsCid: proofRows[0]?.ipfs_cid ?? null,
          hederaTxId: proofRows[0]?.hedera_hcs_message_id ?? null,
          arbitrumTxHash: proofRows[0]?.arb_tx_hash ?? null,
        },
        outcomeWindows: buildOutcomeWindows(detectedAt),
      }).catch((err) => logger.error({ err, signalId }, 'thesis-synthesis: broadcast errored'));
    }
  } catch (err) {
    logger.error({ err }, 'thesis-synthesis: scan failed');
  } finally {
    synthesisRunning = false;
  }
}
