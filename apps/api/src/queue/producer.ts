import { Queue } from 'bullmq';
import { getRedisConnectionOpts } from './connection.js';

const QUEUE_NAME = 'monitor-checks';

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
  await q.add(
    'check',
    { monitorId },
    {
      jobId: `monitor:${monitorId}:${Date.now()}`,
      priority: opts.priority ?? 0,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
    },
  );
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
