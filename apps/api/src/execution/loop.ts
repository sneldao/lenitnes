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
}

export async function executeCheck(
  monitor: Monitor,
  opts: { skipDebit?: boolean } = {},
): Promise<{
  signalId: string | null;
  conditionMet: boolean;
  isHeartbeat: boolean;
  summary: string | null;
  metadata: CheckMetadata;
}> {
  const proof = getProofService();
  const cost = Number(monitor.cost_per_check) || config.hedera.defaultCostPerCheck;
  const isPaid = !opts.skipDebit;

  let debitTxId = 'free';
  const circuitOpts = { name: 'tinyfish', threshold: 5, windowMs: 60_000, cooldownMs: 300_000 };

  // ── 1) Atomic balance debit (outside transaction) ─────────────────
  if (isPaid) {
    const { rowCount } = await query(
      `UPDATE monitors SET hbar_balance = hbar_balance - $1,
         status = CASE WHEN hbar_balance - $1 < 0 THEN 'insufficient_balance' ELSE status END
       WHERE id = $2 AND hbar_balance >= $1`,
      [cost, monitor.id],
    );
    if (!rowCount) {
      await query(`UPDATE monitors SET status = 'insufficient_balance' WHERE id = $1`, [
        monitor.id,
      ]);
      logger.warn({ monitorId: monitor.id }, 'monitor paused: insufficient balance');
      return {
        signalId: null,
        conditionMet: false,
        isHeartbeat: false,
        summary: null,
        metadata: {
          checkMethod: 'scraper-fallback',
          circuitOpen: false,
          githubCommitsFetched: 0,
          confidence: 0,
          confidenceThreshold: monitor.confidence_threshold,
          thresholdBlocked: false,
        },
      };
    }

    // External proof call — record the debit on-ledger.
    const debit = await proof.debitPerCheckFee!({
      fromAccountId: monitor.escrow_account_id ?? config.hedera.treasuryId,
      amountHbar: cost,
    });
    debitTxId = debit.hederaTxId;
  }

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
        debitTxId,
        isPaid,
      }),
    );
    signalId = txResult.signalId;
    isHeartbeat = txResult.isHeartbeat;
  } catch (err) {
    logger.error({ err, monitorId: monitor.id }, 'monitor check transaction failed');

    // Compensating refund: if the debit was already charged, release escrow.
    if (isPaid) {
      try {
        await proof.releaseEscrow?.({
          toWalletAddress: monitor.escrow_account_id ?? config.hedera.treasuryId,
          amountHbar: cost,
        });
        logger.info(
          { monitorId: monitor.id, amountHbar: cost },
          'escrow released after failed transaction',
        );
      } catch (refundErr) {
        logger.error({ err: refundErr, monitorId: monitor.id }, 'failed to release escrow');
      }
    }

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
        hederaTxId: debitTxId,
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
        txRef: debitTxId,
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

  // ── 5) Best-effort rule execution ─────────────────────────────────
  // (disabled after pivot — agent is the only rule, reimplemented in
  // Day 4 as the agent + treasury integration. See HACKATHON_CUT.md.)
  if (!isHeartbeat && signalId) {
    logger.debug(
      { signalId, monitorId: monitor.id },
      'rule execution skipped — pending Day 4 agent integration',
    );
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
    },
  };
}

// ── Transaction handler ──────────────────────────────────────

interface TxHandlerParams {
  monitor: Monitor;
  result: TinyFishResult;
  debitTxId: string;
  isPaid: boolean;
}

async function executeCheckTransaction(
  client: import('pg').PoolClient,
  params: TxHandlerParams,
): Promise<{ signalId: string | null; isHeartbeat: boolean }> {
  const { monitor, result, debitTxId, isPaid } = params;

  // Update last_check_at.
  await client.query(`UPDATE monitors SET last_check_at = now() WHERE id = $1`, [monitor.id]);

  // Track the newest commit hash so we only evaluate new commits next cycle.
  if (result.latestCommitHash) {
    await client.query(`UPDATE monitors SET last_seen_commit_hash = $1 WHERE id = $2`, [
      result.latestCommitHash,
      monitor.id,
    ]);
  }

  // If this was an on-demand check, write the heartbeat HCS message from inside the
  // transaction (the on-demand middleware already settled payment).
  if (!isPaid) {
    const proof = getProofService();
    await proof.writeHcsMessage!({
      kind: 'heartbeat',
      monitorId: monitor.id,
      ts: new Date().toISOString(),
      txRef: debitTxId,
    }).catch((err: unknown) => {
      logger.error(
        { err, monitorId: monitor.id },
        'failed to write on-demand heartbeat (best-effort)',
      );
    });
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

  // Signal! Insert the signal row.
  const detectedAt = new Date().toISOString();
  const { rows: sigRows } = await client.query<{ id: string }>(
    `INSERT INTO signals
       (monitor_id, detected_at, hedera_tx_id, tinyfish_run_id, evidence_text,
        screenshot_urls, condition_summary, is_heartbeat)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false)
     RETURNING id`,
    [
      monitor.id,
      detectedAt,
      debitTxId,
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
