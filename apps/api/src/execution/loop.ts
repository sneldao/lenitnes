import pLimit from 'p-limit';
import { query, withTransaction } from '../db/pool.js';
import { config } from '../config.js';
import type { Monitor, TinyFishResult } from '@lenitnes/types';
import * as tinyfish from '../services/tinyfish.js';
import * as scraper from '../services/scraper.js';
import * as ipfs from '../services/ipfs.js';
import { getProofService } from '../services/proof.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../services/circuit.js';
import { incCounter } from '../middleware/metrics.js';
import { logger } from '../logger.js';
import { runDetectors } from '../services/detectors/registry.js';
import { recordSignalOnChain } from '../services/evm/signal-registry.js';
import { FEATURES } from '../features.js';
import { buildAgentEnvFromConfig, precedentCount, scoreAndPersist } from '../services/agent.js';
import type { AgentScore } from '@lenitnes/types';

// ─────────────────────────────────────────────────────────────
// Monitor execution loop — the heart of LENITNES.
// One pass over every monitor that is due for a check.
// ─────────────────────────────────────────────────────────────

/** Select monitors whose next check is due based on frequency + last_check_at. */
async function dueMonitors(): Promise<Monitor[]> {
  const { rows } = await query<Monitor>(
    `SELECT * FROM monitors
     WHERE status = 'active'
       AND (
         last_check_at IS NULL
         OR last_check_at + (frequency_seconds || ' seconds')::interval <= now()
       )`,
  );
  return rows;
}

const CONCURRENCY = 5;
const limit = pLimit(CONCURRENCY);

export async function runDueChecks(): Promise<void> {
  const monitors = await dueMonitors();
  await Promise.all(
    monitors.map((monitor) =>
      limit(() =>
        executeCheck(monitor).catch((err) => {
          logger.error({ err, monitorId: monitor.id }, 'monitor check failed');
        }),
      ),
    ),
  );
}

export interface CheckMetadata {
  checkMethod: 'tinyfish' | 'tinyfish-fetch' | 'scraper-fallback';
  circuitOpen: boolean;
  githubCommitsFetched: number;
  confidence: number;
  confidenceThreshold: number;
  thresholdBlocked: boolean;
  classifications?: Array<{
    type: string;
    score: number;
    confidence: number;
    label: string;
  }>;
  // Day 4: agent conviction gating (Gate 2).
  gate2Blocked?: boolean;
  agentConviction?: number;
  agentBand?: 'low' | 'mid' | 'high';
  agentAction?: 'long' | 'short' | 'none';
  agentThesis?: string;
}

export async function executeCheck(monitor: Monitor): Promise<{
  signalId: string | null;
  conditionMet: boolean;
  isHeartbeat: boolean;
  summary: string | null;
  metadata: CheckMetadata;
}> {
  const proof = getProofService();
  const circuitOpts = { name: 'tinyfish', threshold: 5, windowMs: 60_000, cooldownMs: 300_000 };

  // ── 2) Three-tier scraping: Fetch (free) → Agent (credits) → scraper ─────
  let result: TinyFishResult;
  const agentCircuitOpen = isCircuitOpen(circuitOpts);
  let checkMethod: 'tinyfish' | 'tinyfish-fetch' | 'scraper-fallback' = 'tinyfish-fetch';

  // Tier 1: Fetch API (free, Chromium-rendered page content)
  try {
    const fetchedPage = await tinyfish.fetchPage(monitor.url);
    result = scraper.analyzeContent(fetchedPage.content, monitor.condition_text, 'tinyfish-fetch');
    recordSuccess(circuitOpts);
    logger.debug({ monitorId: monitor.id, confidence: result.confidence }, 'Fetch API succeeded');
  } catch (err) {
    logger.warn({ err, monitorId: monitor.id }, 'Fetch API failed, trying Agent fallback');

    // Tier 2: Agent API (credits, full NL evaluation)
    if (agentCircuitOpen) {
      logger.warn({ monitorId: monitor.id }, 'Agent circuit open — using scraper fallback');
      result = await scraper.runScraperFallback(monitor.url, monitor.condition_text);
      checkMethod = 'scraper-fallback';
      incCounter('tinyfish_errors_total', { fallback: 'scraper' });
    } else {
      try {
        result = await tinyfish.runMonitorCheck({
          url: monitor.url,
          condition: monitor.condition_text,
          lastSeenCommitHash: monitor.last_seen_commit_hash,
          screenshots: monitor.screenshots_enabled,
        });
        checkMethod = 'tinyfish';
        recordSuccess(circuitOpts);
        logger.debug({ monitorId: monitor.id }, 'Agent API succeeded after Fetch failure');
      } catch (agentErr) {
        recordFailure(circuitOpts);
        incCounter('tinyfish_errors_total', { fallback: 'scraper' });
        logger.warn({ err: agentErr, monitorId: monitor.id }, 'Agent failed — scraper fallback');
        result = await scraper.runScraperFallback(monitor.url, monitor.condition_text);
        checkMethod = 'scraper-fallback';
      }
    }
  }

  // ── 3) DB mutations inside a transaction ──────────────────────────
  let signalId: string | null = null;
  let isHeartbeat: boolean;
  const summary: string | null = result.summary;

  try {
    const txResult = await withTransaction((client) =>
      executeCheckTransaction(client, {
        monitor,
        result,
      }),
    );
    signalId = txResult.signalId;
    isHeartbeat = txResult.isHeartbeat;
  } catch (err) {
    logger.error({ err, monitorId: monitor.id }, 'monitor check transaction failed');

    return {
      signalId: null,
      conditionMet: false,
      isHeartbeat: false,
      summary: null,
      metadata: {
        checkMethod,
        circuitOpen: agentCircuitOpen,
        githubCommitsFetched: result.githubCommitsFetched ?? 0,
        confidence: result.confidence,
        confidenceThreshold: monitor.confidence_threshold,
        thresholdBlocked: false,
      },
    };
  }

  // ── 4) Post-commit: IPFS + HCS (best-effort) ──────────────────────
  if (!isHeartbeat && signalId) {
    try {
      const { cid } = await ipfs.uploadProofPackage({
        signalId,
        monitorId: monitor.id,
        detectedAt: new Date().toISOString(),
        url: monitor.url,
        condition: monitor.condition_text,
        tinyfishRunId: result.runId,
        evidence: result.evidence,
        summary: result.summary,
        screenshots: result.screenshots,
      });

      const hcs = await proof.writeHcsMessage!({
        kind: 'signal',
        signalId,
        monitorId: monitor.id,
        ipfsCid: cid,
        ts: new Date().toISOString(),
      });

      await query(`UPDATE signals SET ipfs_cid = $1, hedera_hcs_message_id = $2 WHERE id = $3`, [
        cid,
        hcs.hederaTxId,
        signalId,
      ]);
    } catch (err) {
      logger.error({ err, monitorId: monitor.id, signalId }, 'post-commit IPFS/HCS write failed');
      // Intentional swallow — the signal row is already committed in the DB.
    }

    // Also write a heartbeat HCS message for the successful signal.
    try {
      await proof.writeHcsMessage!({
        kind: 'heartbeat',
        monitorId: monitor.id,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err, monitorId: monitor.id }, 'failed to write HCS heartbeat (best-effort)');
    }
  }

  // ── 4a) Record signal on Arbitrum (dual-chain proof, best-effort) ────────
  if (!isHeartbeat && signalId && FEATURES.evmProof) {
    recordSignalOnChain('arbitrum', signalId, result.evidence, result.summary)
      .then(({ txHash }) =>
        query(`UPDATE signals SET arb_tx_hash = $1 WHERE id = $2`, [txHash, signalId]),
      )
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ err, signalId }, 'Arbitrum proof recording failed — queued for retry');
        query(
          `INSERT INTO failed_proofs (signal_id, chain, error, next_retry)
           VALUES ($1, 'arbitrum', $2, now() + interval '2 minutes')`,
          [signalId, errMsg],
        ).catch((e) => logger.error({ err: e, signalId }, 'failed to write to failed_proofs'));
      });
  }

  // ── 4b) Run detector pipeline on new signals (best-effort) ─────────
  let classifications: Array<{ type: string; score: number; confidence: number; label: string }> =
    [];
  let detectorResultsFull: Array<{
    type: string;
    score: number;
    confidence: number;
    label: string;
    metadata: Record<string, unknown>;
  }> = [];
  if (!isHeartbeat && signalId && result.commits && result.commits.length > 0) {
    try {
      const detectorResults = runDetectors({
        result,
        commits: result.commits,
        monitorUrl: monitor.url,
        monitorCondition: monitor.condition_text,
      });
      if (detectorResults.length > 0) {
        classifications = detectorResults.map((c) => ({
          type: c.type,
          score: c.score,
          confidence: c.confidence,
          label: c.label,
        }));
        detectorResultsFull = detectorResults.map((c) => ({
          type: c.type,
          score: c.score,
          confidence: c.confidence,
          label: c.label,
          metadata: c.metadata,
        }));
        await Promise.all(
          detectorResults.map((c) =>
            query(
              `INSERT INTO signal_classifications
               (signal_id, detector_type, score, confidence, label, metadata)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [signalId, c.type, c.score, c.confidence, c.label, JSON.stringify(c.metadata)],
            ),
          ),
        );
        // Note: backtest outcomes (price_at_signal, pct_change, etc.) are
        // computed by `processSignalOutcomes()` on the 6h cron in scheduler.ts.
        // No need to trigger per-classify — the cron picks up everything that's
        // missing outcomes within minutes anyway.
      }
    } catch (err) {
      logger.warn({ err, signalId }, 'detector pipeline failed (non-blocking)');
    }
  }

  // ── 4c) Search enrichment: find related context (free, best-effort) ───────
  if (!isHeartbeat && signalId && result.summary) {
    tinyfish
      .searchWeb(`${monitor.url} ${result.summary}`)
      .then((results) => {
        if (results.length > 0) {
          return query(`UPDATE signals SET search_results = $1 WHERE id = $2`, [
            JSON.stringify(results),
            signalId,
          ]);
        }
      })
      .catch((err) => {
        logger.warn({ err, signalId }, 'search enrichment failed (non-blocking)');
      });
  }

  // ── 5) Agent conviction gating (Gate 2) ─────────────────────────
  // If detectors fired, the agent scores the signal against a versioned
  // rubric. Sub-threshold scores are persisted (agent reasoning archive)
  // and the signal is published without a trade. Above-threshold
  // signals continue to the treasury step (Day 5).
  let agentScore: AgentScore | null = null;
  let gate2Blocked = false;
  if (!isHeartbeat && signalId && detectorResultsFull.length > 0) {
    const env = buildAgentEnvFromConfig();
    const threshold = config.agent.convictionThreshold;
    try {
      const precedent = await precedentCount(
        monitor.id,
        detectorResultsFull.map((d) => d.type),
      );
      agentScore = await scoreAndPersist(
        {
          signal_id: signalId,
          detector_classifications: detectorResultsFull.map((d) => ({
            detector_type: d.type,
            score: d.score,
            confidence: d.confidence,
            label: d.label,
            metadata: d.metadata,
          })),
          asset_mapping: monitor.asset_mapping,
          evidence_text: result.evidence,
          condition_summary: result.summary,
          precedent_count: precedent,
        },
        env,
      );
      if (agentScore.conviction < threshold) {
        gate2Blocked = true;
        logger.info(
          { signalId, monitorId: monitor.id, conviction: agentScore.conviction, threshold },
          'agent below threshold — no trade, signal still public',
        );
      } else {
        logger.info(
          { signalId, monitorId: monitor.id, conviction: agentScore.conviction },
          'agent above threshold — trade eligible (Day 5 wires treasury)',
        );
      }
    } catch (err) {
      // Budget exceeded, API error, parse error — treat as blocked.
      // No agent_scores row is written when the call itself fails.
      gate2Blocked = true;
      logger.error(
        { err, signalId, monitorId: monitor.id },
        'agent scoring failed — gate 2 blocked, no trade',
      );
    }
  }

  return {
    signalId,
    conditionMet: !isHeartbeat,
    isHeartbeat,
    summary,
    metadata: {
      checkMethod,
      circuitOpen: agentCircuitOpen,
      githubCommitsFetched: result.githubCommitsFetched ?? 0,
      confidence: result.confidence,
      confidenceThreshold: monitor.confidence_threshold ?? 50,
      thresholdBlocked:
        result.conditionMet && result.confidence < (monitor.confidence_threshold ?? 50),
      ...(classifications.length > 0 ? { classifications } : {}),
      gate2Blocked,
      agentConviction: agentScore?.conviction,
      agentBand: agentScore?.confidence_band,
      agentAction: agentScore?.recommended_action,
      agentThesis: agentScore?.thesis,
    },
  };
}

// ── Transaction handler ──────────────────────────────────────

interface TxHandlerParams {
  monitor: Monitor;
  result: TinyFishResult;
}

async function executeCheckTransaction(
  client: import('pg').PoolClient,
  params: TxHandlerParams,
): Promise<{ signalId: string | null; isHeartbeat: boolean }> {
  const { monitor, result } = params;

  // Update last_check_at.
  await client.query(`UPDATE monitors SET last_check_at = now() WHERE id = $1`, [monitor.id]);

  // Track the newest commit hash so we only evaluate new commits next cycle.
  if (result.latestCommitHash) {
    await client.query(`UPDATE monitors SET last_seen_commit_hash = $1 WHERE id = $2`, [
      result.latestCommitHash,
      monitor.id,
    ]);
  }

  // No signal -> store a heartbeat row.
  if (!result.conditionMet) {
    const { rows: heartbeatRows } = await client.query<{ id: string }>(
      `INSERT INTO signals (monitor_id, tinyfish_run_id, is_heartbeat, condition_summary)
       VALUES ($1, $2, true, $3)
       RETURNING id`,
      [monitor.id, result.runId, result.summary],
    );
    return { signalId: heartbeatRows[0]?.id ?? null, isHeartbeat: true };
  }

  // Condition met but confidence below threshold -> treat as heartbeat.
  const threshold = monitor.confidence_threshold ?? 50;
  if (result.confidence < threshold) {
    const { rows: heartbeatRows } = await client.query<{ id: string }>(
      `INSERT INTO signals (monitor_id, tinyfish_run_id, is_heartbeat, condition_summary)
       VALUES ($1, $2, true, $3)
       RETURNING id`,
      [
        monitor.id,
        result.runId,
        `Confidence ${result.confidence} below threshold ${threshold}. ${result.summary}`,
      ],
    );
    return { signalId: heartbeatRows[0]?.id ?? null, isHeartbeat: true };
  }

  // Signal! Insert the signal row. The on-chain timestamp lives in
  // hedera_hcs_message_id (set by the post-commit HCS write), so
  // hedera_tx_id is null at insert time.
  const detectedAt = new Date().toISOString();
  const { rows: sigRows } = await client.query<{ id: string }>(
    `INSERT INTO signals
       (monitor_id, detected_at, tinyfish_run_id, evidence_text,
        screenshot_urls, condition_summary, is_heartbeat)
     VALUES ($1, $2, $3, $4, $5, $6, false)
     RETURNING id`,
    [
      monitor.id,
      detectedAt,
      result.runId,
      result.evidence,
      JSON.stringify(result.screenshots),
      result.summary,
    ],
  );
  const signalId = sigRows[0].id;

  // Mark the monitor as triggered.
  await client.query(`UPDATE monitors SET status = 'triggered' WHERE id = $1`, [monitor.id]);

  return { signalId, isHeartbeat: false };
}

// ── Rule execution (removed after pivot) ─────────────────────
// The agent is now the only rule. Agent scoring + trade actions live in
// services/agent.ts and services/treasury.ts (Day 3-5). The user-defined
// rules table is dropped in the Day 2 schema migration.
