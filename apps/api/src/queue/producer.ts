import { Queue } from 'bullmq';
import { getRedisConnectionOpts } from './connection.js';
import { QUEUE_NAME, MAX_JOB_ATTEMPTS, type CheckJobData } from './contract.js';

let queue: Queue | null = null;

function getQueue(): Queue {
  if (queue) return queue;
  queue = new Queue(QUEUE_NAME, { connection: getRedisConnectionOpts() });
  return queue;
}

export async function enqueueMonitorCheck(
  monitorId: string,
  opts: { priority?: number } = {},
): Promise<void> {
  const q = getQueue();
  const jobData: CheckJobData = { monitorId };
  await q.add('check', jobData, {
    jobId: `monitor:${monitorId}:${Date.now()}`,
    priority: opts.priority ?? 0,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
    attempts: MAX_JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: 2000 },
  });
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
