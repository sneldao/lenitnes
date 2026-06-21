import cron from 'node-cron';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { enqueueMonitorCheck } from './producer.js';
import { processSignalOutcomes } from '../services/domain/backtest.service.js';
import { recordSignalOnChain } from '../services/evm/signal-registry.js';
import { sendDailyWatchReport } from '../services/watch-report.js';
import { sendTelegram } from '../services/notify.js';
import { logger } from '../logger.js';

let monitorJob: cron.ScheduledTask | null = null;
let backtestJob: cron.ScheduledTask | null = null;
let proofRetryJob: cron.ScheduledTask | null = null;
let watchReportJob: cron.ScheduledTask | null = null;
let heartbeatJob: cron.ScheduledTask | null = null;
let monitorRunning = false;
let backtestRunning = false;
let proofRetryRunning = false;
let heartbeatRunning = false;

const PROOF_RETRY_MAX_ATTEMPTS = 10;

async function scanAndEnqueue(): Promise<void> {
  if (monitorRunning) return;
  monitorRunning = true;
  try {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM monitors
       WHERE status = 'active'
         AND (
           last_check_at IS NULL
           OR last_check_at + (frequency_seconds || ' seconds')::interval <= now()
         )`,
    );

    for (const row of rows) {
      await enqueueMonitorCheck(row.id);
    }

    if (rows.length > 0) {
      logger.debug({ count: rows.length }, 'enqueued due monitors');
    }
  } catch (err) {
    logger.error({ err }, 'scheduler scan failed');
  } finally {
    monitorRunning = false;
  }
}

async function runBacktest(): Promise<void> {
  if (backtestRunning) return;
  backtestRunning = true;
  try {
    const result = await processSignalOutcomes();
    if (result.processed > 0) {
      logger.info(result, 'backtest cycle complete');
    }
  } catch (err) {
    logger.error({ err }, 'backtest cycle failed');
  } finally {
    backtestRunning = false;
  }
}

// ── Retry queue for on-chain proofs (failed_proofs) ────────────────────
// The execution loop inserts into `failed_proofs` when the fire-and-forget
// EVM write throws (RPC blip, gas spike, etc.). Without a consumer, those
// rows are stranded forever and the "dual-chain" claim silently degrades.
// This worker picks up due rows every 2 minutes and replays the write.
// Idempotency: we re-check the signal's arb_tx_hash before retrying, so a
// successful write that races with a retry just resolves the row.
async function retryFailedProofs(): Promise<void> {
  if (proofRetryRunning) return;
  proofRetryRunning = true;
  try {
    const { rows } = await query<{
      id: string;
      signal_id: string;
      chain: string;
      attempt: number;
      evidence: string | null;
      summary: string | null;
    }>(
      `SELECT fp.id, fp.signal_id, fp.chain, fp.attempt,
              s.evidence_text AS evidence, s.condition_summary AS summary
         FROM failed_proofs fp
         JOIN signals s ON s.id = fp.signal_id
        WHERE fp.resolved_at IS NULL
          AND fp.next_retry <= now()
          AND fp.attempt < $1
        ORDER BY fp.next_retry
        LIMIT 10`,
      [PROOF_RETRY_MAX_ATTEMPTS],
    );

    if (rows.length === 0) return;

    let succeeded = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const row of rows) {
      try {
        // If the signal already has an arb_tx_hash (e.g. another path
        // succeeded), just resolve the row and move on.
        const { rows: sigRows } = await query<{ arb_tx_hash: string | null }>(
          `SELECT arb_tx_hash FROM signals WHERE id = $1`,
          [row.signal_id],
        );
        if (sigRows[0]?.arb_tx_hash) {
          await query(`UPDATE failed_proofs SET resolved_at = now() WHERE id = $1`, [row.id]);
          succeeded++;
          continue;
        }

        const { txHash } = await recordSignalOnChain(
          row.chain,
          row.signal_id,
          row.evidence ?? '',
          row.summary ?? '',
        );
        await query(`UPDATE signals SET arb_tx_hash = $1 WHERE id = $2`, [txHash, row.signal_id]);
        await query(`UPDATE failed_proofs SET resolved_at = now() WHERE id = $1`, [row.id]);
        succeeded++;
        logger.info(
          { signalId: row.signal_id, chain: row.chain, txHash, attempt: row.attempt },
          'failed proof retry succeeded',
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const newAttempt = row.attempt + 1;
        // If we just hit the cap, mark the row as dead-letter (resolved_at
        // set so it stops being picked up, but error preserved for ops).
        const isDead = newAttempt >= PROOF_RETRY_MAX_ATTEMPTS;
        await query(
          `UPDATE failed_proofs
              SET attempt = $2,
                  error = $3,
                  next_retry = now() + interval '2 minutes',
                  resolved_at = CASE WHEN $4 THEN now() ELSE NULL END
            WHERE id = $1`,
          [row.id, newAttempt, errMsg, isDead],
        );
        failed++;
        if (isDead) deadLettered++;
        logger.warn(
          { err, signalId: row.signal_id, chain: row.chain, attempt: newAttempt, isDead },
          'failed proof retry failed',
        );
      }
    }

    logger.info(
      { picked: rows.length, succeeded, failed, deadLettered },
      'failed proof retry cycle complete',
    );
  } catch (err) {
    logger.error({ err }, 'failed proof retry scan failed');
  } finally {
    proofRetryRunning = false;
  }
}

// ── Hourly heartbeat broadcast ─────────────────────────────────
// Sends a concise "pipeline is alive" message to the public Telegram
// channel every hour. Shows monitor count, recent activity, and
// latest agent thought.
async function sendPipelineHeartbeat(): Promise<void> {
  if (heartbeatRunning || !config.telegram.botToken || !config.telegram.publicChannelId) return;
  heartbeatRunning = true;
  try {
    const [{ rows: mons }, { rows: sigs }, { rows: scores }] = await Promise.all([
      query<{ c: string }>("SELECT COUNT(*)::text AS c FROM monitors WHERE status = 'active'"),
      query<{ c: string }>(
        "SELECT COUNT(*)::text AS c FROM signals WHERE detected_at > now() - interval '24 hours'",
      ),
      query<{ conviction: number; thesis: string }>(
        `SELECT conviction, LEFT(thesis, 120) AS thesis FROM agent_scores
          WHERE created_at > now() - interval '24 hours'
          ORDER BY created_at DESC LIMIT 1`,
      ),
    ]);

    const activeMonitors = parseInt(mons[0]?.c ?? '0', 10);
    const signals24h = parseInt(sigs[0]?.c ?? '0', 10);
    const lastThought = scores[0];

    const lines: string[] = [
      `🛡️ LENITNES — Pipeline heartbeat`,
      ``,
      `📡 ${activeMonitors} monitors · ${signals24h} signals (24h)`,
    ];
    if (lastThought) {
      lines.push(`🧠 Latest: conviction ${lastThought.conviction} — ${lastThought.thesis}`);
    } else {
      lines.push(`🧠 No agent activity in 24h — watching quietly`);
    }
    lines.push(`⏱ ${new Date().toISOString().slice(11, 16)} UTC`);
    lines.push(`🔗 Scorecard: ${config.webOrigin}/scorecard`);

    await sendTelegram(config.telegram.publicChannelId, lines.join('\n'));
    logger.info('pipeline heartbeat sent to telegram');
  } catch (err) {
    logger.error({ err }, 'pipeline heartbeat failed');
  } finally {
    heartbeatRunning = false;
  }
}

export function startScheduler(): void {
  logger.info(
    'scheduler started — monitors every 30s, backtest every 6h, proof retries every 2m, watch report daily at 09:00, heartbeat hourly',
  );
  monitorJob = cron.schedule('*/30 * * * * *', scanAndEnqueue);
  backtestJob = cron.schedule('0 */6 * * *', runBacktest);
  proofRetryJob = cron.schedule('*/2 * * * *', retryFailedProofs);
  watchReportJob = cron.schedule('0 9 * * *', sendDailyWatchReport);
  heartbeatJob = cron.schedule('0 * * * *', sendPipelineHeartbeat);
}

export function stopScheduler(): void {
  if (monitorJob) {
    monitorJob.stop();
    monitorJob = null;
  }
  if (backtestJob) {
    backtestJob.stop();
    backtestJob = null;
  }
  if (proofRetryJob) {
    proofRetryJob.stop();
    proofRetryJob = null;
  }
  if (watchReportJob) {
    watchReportJob.stop();
    watchReportJob = null;
  }
  if (heartbeatJob) {
    heartbeatJob.stop();
    heartbeatJob = null;
  }
}
