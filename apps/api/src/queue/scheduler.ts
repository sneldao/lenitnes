import cron from 'node-cron';
import { query } from '../db/pool.js';
import { enqueueMonitorCheck } from './producer.js';
import { logger } from '../logger.js';

let job: cron.ScheduledTask | null = null;
let running = false;

async function scanAndEnqueue(): Promise<void> {
  if (running) return;
  running = true;
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
    running = false;
  }
}

export function startScheduler(): void {
  logger.info('scheduler started — scanning every 30s');
  job = cron.schedule('*/30 * * * * *', scanAndEnqueue);
}

export function stopScheduler(): void {
  if (job) {
    job.stop();
    job = null;
  }
}
