import { pool } from './db/pool.js';
import { logger } from './logger.js';
import { startScheduler, stopScheduler } from './queue/scheduler.js';
import { startWorker, stopWorker } from './queue/worker.js';
import { closeQueue } from './queue/producer.js';
import { closeDlq } from './queue/dlq.js';
import { getRedisConnectionOpts } from './queue/connection.js';
import http from 'node:http';

logger.info('worker started — BullMQ queue + scheduler');

startWorker();
startScheduler();

/**
 * Minimal HTTP server so a container orchestrator (Kubernetes, Coolify,
 * docker compose healthcheck) can probe this process. The worker has no
 * user-facing HTTP surface, but it does have a DB pool and a Redis
 * connection, both of which can fail independently of the API.
 */
const healthServer = http.createServer((req, res) => {
  // /health/live — process is up. Always 200 once Node is running.
  if (req.url === '/health/live') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'lenitnes-worker' }));
    return;
  }
  // /health/ready — DB + Redis reachable.
  if (req.url === '/health/ready') {
    void (async () => {
      const checks: Record<string, 'ok' | 'fail'> = { database: 'fail', redis: 'fail' };
      try {
        await pool.query('SELECT 1');
        checks.database = 'ok';
      } catch {
        /* keep 'fail' */
      }
      try {
        const net = await import('node:net');
        const opts = getRedisConnectionOpts();
        await new Promise<void>((resolve, reject) => {
          const sock = net.createConnection({ host: opts.host, port: opts.port });
          const done = (ok: boolean) => {
            sock.destroy();
            if (ok) resolve();
            else reject(new Error('connect failed'));
          };
          sock.once('connect', () => done(true));
          sock.once('error', () => done(false));
          setTimeout(() => done(false), 1500);
        });
        checks.redis = 'ok';
      } catch {
        /* keep 'fail' */
      }
      const ok = checks.database === 'ok' && checks.redis === 'ok';
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok, checks }));
    })();
    return;
  }
  res.writeHead(404).end();
});
healthServer.listen(8741, () => {
  logger.info('worker health server listening on :8741');
});

let stopping = false;

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'worker stopping gracefully');

  healthServer.close();
  stopScheduler();
  await stopWorker();
  await closeQueue();
  await closeDlq();

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
