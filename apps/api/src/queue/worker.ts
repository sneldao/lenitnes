import { Worker, type Job } from 'bullmq';
import { getRedisConnectionOpts } from './connection.js';
import { query } from '../db/pool.js';
import type { Monitor } from '../types.js';
import { executeCheck } from '../execution/loop.js';
import { logger } from '../logger.js';

const QUEUE_NAME = 'monitor-checks';
const CONCURRENCY = 5;

interface CheckJobData {
  monitorId: string;
}

async function processCheck(job: Job<CheckJobData>): Promise<void> {
  const { monitorId } = job.data;

  const { rows } = await query<Monitor>(
    `SELECT * FROM monitors WHERE id = $1 AND status = 'active'`,
    [monitorId],
  );
  const monitor = rows[0];
  if (!monitor) {
    logger.debug({ monitorId }, 'skipping — monitor not found or inactive');
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

  worker.on('failed', (job, err) => {
    logger.error(
      { err, jobId: job?.id, monitorId: job?.data.monitorId },
      'check failed',
    );
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
