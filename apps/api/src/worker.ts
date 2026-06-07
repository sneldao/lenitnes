import { pool } from './db/pool.js';
import { logger } from './logger.js';
import { startScheduler, stopScheduler } from './queue/scheduler.js';
import { startWorker, stopWorker } from './queue/worker.js';
import { closeQueue } from './queue/producer.js';

logger.info('worker started — BullMQ queue + scheduler');

startWorker();
startScheduler();

let stopping = false;

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'worker stopping gracefully');

  stopScheduler();
  await stopWorker();
  await closeQueue();

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
  }, 15_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
