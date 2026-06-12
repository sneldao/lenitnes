import cron from 'node-cron';
import { query } from '../db/pool.js';
import { enqueueMonitorCheck } from './producer.js';
import { processSignalOutcomes } from '../services/domain/backtest.service.js';
import { logger } from '../logger.js';

let monitorJob: cron.ScheduledTask | null = null;
let backtestJob: cron.ScheduledTask | null = null;
let monitorRunning = false;
let backtestRunning = false;

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

export function startScheduler(): void {
  logger.info('scheduler started — monitors every 30s, backtest every 6h');
  monitorJob = cron.schedule('*/30 * * * * *', scanAndEnqueue);
  backtestJob = cron.schedule('0 */6 * * *', runBacktest);
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
}
