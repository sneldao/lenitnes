import cron from 'node-cron';
import { runDueChecks } from './execution/loop.js';
import { pool } from './db/pool.js';

// ─────────────────────────────────────────────────────────────
// Scheduled monitor execution. Runs every minute; each monitor's own
// frequency_seconds + last_check_at decides whether it is actually due.
// For higher throughput, swap node-cron for a BullMQ queue.
// ─────────────────────────────────────────────────────────────

console.log('LENITNES worker started — scanning for due monitors every minute.');

let running = false;
let stopping = false;

const job = cron.schedule('* * * * *', async () => {
  if (running || stopping) return; // avoid overlapping passes
  running = true;
  try {
    await runDueChecks();
  } catch (err) {
    console.error('[worker] runDueChecks failed:', err);
  } finally {
    running = false;
  }
});

function shutdown(signal: string) {
  console.log(`\n[worker] received ${signal} — stopping gracefully`);
  stopping = true;
  job.stop();
  pool
    .end()
    .then(() => {
      console.log('[worker] DB pool closed');
      process.exit(0);
    })
    .catch((e) => {
      console.error('[worker] pool.close error:', e);
      process.exit(1);
    });
  setTimeout(() => {
    console.error('[worker] forced exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
