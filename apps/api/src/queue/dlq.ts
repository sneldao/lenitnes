import { Queue } from 'bullmq';
import { getRedisConnectionOpts } from './connection.js';
import { DLQ_NAME, type DLQJobData, type CheckJobData } from './contract.js';
import { logger } from '../logger.js';
import { incCounter } from '../middleware/metrics.js';

/**
 * Dead-Letter Queue for monitor check jobs.
 *
 * BullMQ's `attempts` config caps retries, but exhausted jobs are silently
 * dropped by default. We listen to the `failed` event with `job.attemptsMade
 * >= job.opts.attempts` and re-publish the job to a separate DLQ for human
 * inspection. The API can then surface DLQ depth and let operators replay
 * or discard stuck jobs.
 */

let dlq: Queue<DLQJobData> | null = null;

function getDlq(): Queue<DLQJobData> {
  if (dlq) return dlq;
  dlq = new Queue<DLQJobData>(DLQ_NAME, {
    connection: getRedisConnectionOpts(),
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: false, // keep all DLQ entries until manual intervention
    },
  });
  return dlq;
}

/** Send a permanently-failed check job to the DLQ. */
export async function sendToDlq(
  data: CheckJobData,
  err: unknown,
  attemptsMade: number,
): Promise<void> {
  const finalError = err instanceof Error ? err.message : String(err);
  await getDlq().add('dlq', {
    ...data,
    finalError,
    attemptsMade,
    movedAt: new Date().toISOString(),
  });
  incCounter('monitor_check_dlq_total', { reason: classifyError(finalError) });
  logger.error(
    { monitorId: data.monitorId, attemptsMade, finalError },
    'monitor check moved to DLQ',
  );
}

/** Best-effort classification so the metric label is bounded. */
function classifyError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out')) return 'timeout';
  if (lower.includes('tinyfish')) return 'tinyfish';
  if (lower.includes('scraper')) return 'scraper';
  if (lower.includes('database') || lower.includes('pg')) return 'db';
  if (lower.includes('proof') || lower.includes('hedera')) return 'proof';
  return 'other';
}

/** Return the current DLQ depth (for /health/ready and metrics). */
export async function getDlqDepth(): Promise<number> {
  try {
    // Cap the wait so a dead Redis can't hang the health endpoint.
    const counts = await Promise.race([
      getDlq().getJobCounts('wait', 'active', 'delayed', 'failed'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('dlq_depth_timeout')), 1500),
      ),
    ]);
    return (counts.wait ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0) + (counts.failed ?? 0);
  } catch (err) {
    logger.warn({ err }, 'failed to read DLQ depth');
    return -1;
  }
}

/** List DLQ jobs for operator inspection. */
export async function listDlqJobs(limit = 50): Promise<DLQJobData[]> {
  const jobs = await getDlq().getJobs(['wait', 'active', 'delayed', 'failed'], 0, limit - 1);
  return jobs.map((j) => j.data).filter((d): d is DLQJobData => d !== undefined);
}

/** Replay a DLQ job by re-enqueuing it on the main queue. */
export async function replayDlqJob(jobId: string): Promise<boolean> {
  const job = await getDlq().getJob(jobId);
  if (!job) return false;
  const { enqueueMonitorCheck } = await import('./producer.js');
  await enqueueMonitorCheck(job.data.monitorId);
  await job.remove();
  logger.info({ monitorId: job.data.monitorId, originalJobId: jobId }, 'DLQ job replayed');
  return true;
}

/** Permanently discard a DLQ job. */
export async function discardDlqJob(jobId: string): Promise<boolean> {
  const job = await getDlq().getJob(jobId);
  if (!job) return false;
  await job.remove();
  return true;
}

export async function closeDlq(): Promise<void> {
  if (dlq) {
    await dlq.close();
    dlq = null;
  }
}
