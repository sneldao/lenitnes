import { Worker, type Job } from 'bullmq';
import { getRedisConnectionOpts } from './connection.js';
import { query } from '../db/pool.js';
import type { Monitor } from '@lenitnes/types';
import { QUEUE_NAME, MAX_JOB_ATTEMPTS, type CheckJobData } from './contract.js';
import { executeCheck } from '../execution/loop.js';
import { logger } from '../logger.js';
import { sendToDlq } from './dlq.js';
import { incCounter } from '../middleware/metrics.js';

const CONCURRENCY = 5;

async function processCheck(job: Job<CheckJobData>): Promise<void> {
  const { monitorId } = job.data;

  // 'triggered' is a valid schedulable state: it marks "fired last
  // check" and is reset to 'active' by the check itself. Only
  // 'paused'/'deleted' monitors should be refused here — filtering
  // to 'active' alone made the worker drop every re-check of a
  // monitor that had ever fired.
  const { rows } = await query<Monitor>(
    `SELECT * FROM monitors WHERE id = $1 AND status IN ('active', 'triggered')`,
    [monitorId],
  );
  const monitor = rows[0];
  if (!monitor) {
    // Info level (not debug) so silent scheduler issues surface in
    // production. The previous "this monitor is silently skipped" bug
    // (status='triggered' never reset to 'active') only manifested as
    // a missing signal in the DB; flipping this to info would have
    // produced one log per skipped job and made the bug obvious.
    logger.info({ monitorId }, 'skipping — monitor not found or inactive');
    return;
  }

  await executeCheck(monitor);
}

let worker: Worker<CheckJobData> | null = null;

export function startWorker(): void {
  worker = new Worker<CheckJobData>(QUEUE_NAME, processCheck, {
    connection: getRedisConnectionOpts(),
    concurrency: CONCURRENCY,
    stalledInterval: 30_000,
  });

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, monitorId: job.data.monitorId }, 'check completed');
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const attemptsMade = job.attemptsMade;
    incCounter('monitor_check_failures_total', { reason: 'unknown' });
    logger.error(
      { err, jobId: job.id, monitorId: job.data.monitorId, attemptsMade },
      'check failed',
    );

    // After the final attempt, move to the DLQ for human inspection.
    if (attemptsMade >= MAX_JOB_ATTEMPTS) {
      try {
        await sendToDlq(job.data, err, attemptsMade);
      } catch (dlqErr) {
        logger.error(
          { err: dlqErr, jobId: job.id, monitorId: job.data.monitorId },
          'failed to move exhausted job to DLQ',
        );
      }
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'worker error');
  });

  logger.info({ concurrency: CONCURRENCY }, 'BullMQ worker started');
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
