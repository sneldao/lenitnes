import cron from 'node-cron';
import { runDueChecks } from './execution/loop.js';
import { pool } from './db/pool.js';
import { logger } from './logger.js';

logger.info('worker started — scanning for due monitors every minute');

let running = false;
let stopping = false;

const job = cron.schedule('* * * * *', async () => {
  if (running || stopping) return;
  running = true;
  try {
    await runDueChecks();
  } catch (err) {
    logger.error({ err }, 'runDueChecks failed');
  } finally {
    running = false;
  }
});

function shutdown(signal: string) {
  logger.info({ signal }, 'worker stopping gracefully');
  stopping = true;
  job.stop();
  pool
    .end()
    .then(() => {
      logger.info('DB pool closed');
      process.exit(0);
    })
    .catch((e) => {
      logger.error({ err: e }, 'pool.close error');
      process.exit(1);
    });
  setTimeout(() => {
    logger.error('forced exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
