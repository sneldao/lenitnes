import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { monitorsRouter } from './routes/monitors.js';
import { signalsRouter } from './routes/signals.js';
import { webhooksRouter } from './routes/webhooks.js';
import { ordersRouter } from './routes/orders.js';
import { proofRouter } from './routes/proof.js';
import { dlqRouter } from './routes/dlq.js';
import { backtestRouter } from './routes/backtest.js';
import { portfolioRouter } from './routes/portfolio.js';
// Day 7: leaderboard router is removed (per-user feature dropped
// in the pivot). The /scorecard route replaces it.
import { scorecardRouter } from './routes/scorecard.js';
import { adminRouter } from './routes/admin.js';
import { auditMiddleware } from './middleware/audit.js';
import { renderMetrics, metricsMiddleware } from './middleware/metrics.js';
import { cacheInvalidate } from './middleware/cache.js';
import { validateSchema } from './db/validate.js';
import { logger } from './logger.js';
import { pingRedis } from './queue/connection.js';
import { getDlqDepth } from './queue/dlq.js';
import { startInvalidationSubscriber, stopInvalidationBus } from './middleware/cacheBus.js';

export const app = express();
app.use(helmet());
app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      (req as unknown as Record<string, unknown>).rawBody = buf.toString();
    },
  }),
);
app.use(cookieParser());

// ── Rate limiting ──────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

// ── Request correlation IDs for tracing ──────────────────────
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', id);
  (req as express.Request & { requestId: string }).requestId = id as string;
  next();
});

// ── Metrics collection for all requests ─────────────────────
app.use(metricsMiddleware);

// ── Audit logging for all write operations ────────────────────
app.use(auditMiddleware);

// ── Prometheus metrics endpoint (no auth) ─────────────────────
app.get('/metrics', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(renderMetrics());
});

// ── Health endpoints (no auth required) ────────────────────────
//   /health/live  → 200 always (process is up). For Kubernetes liveness.
//   /health/ready → 200 only when DB responds and Redis PING succeeds.
//                    For readiness probes and load-balancer health checks.
//   /health       → verbose snapshot (DB, Redis, DLQ depth, memory, uptime).
app.get('/health/live', (_req, res) => {
  res.json({ ok: true, service: 'lenitnes-api', version: '0.1.0' });
});

app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, 'ok' | 'fail'> = { database: 'fail', redis: 'fail' };
  const settled: Array<Promise<void>> = [
    pool
      .query('SELECT 1')
      .then(() => {
        checks.database = 'ok';
      })
      .catch(() => {
        /* fail */
      }),
    pingRedis().then((ok) => {
      checks.redis = ok ? 'ok' : 'fail';
    }),
  ];
  await Promise.all(settled);
  const ok = checks.database === 'ok' && checks.redis === 'ok';
  res.status(ok ? 200 : 503).json({ ok, checks });
});

app.get('/health', async (_req, res) => {
  let dbStatus: 'ok' | 'fail' = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    dbStatus = 'fail';
  }
  const redisOk = await pingRedis();
  const dlqDepth = await getDlqDepth();
  const mem = process.memoryUsage();
  res.json({
    ok: dbStatus === 'ok',
    service: 'lenitnes-api',
    version: '0.1.0',
    uptime: process.uptime(),
    checks: {
      database: dbStatus,
      redis: redisOk ? 'ok' : 'fail',
      dlq_depth: dlqDepth,
    },
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, external: mem.external },
  });
});

// Serve demo video for hackathon submission (static file, /app/demo.mp4)
app.get('/demo.mp4', (_req, res) => {
  res.sendFile('/app/demo.mp4', { acceptRanges: true });
});

app.use('/proof', proofRouter);
app.use('/scorecard', scorecardRouter);
app.use('/admin', adminRouter);
// Public backtest stats for landing page (no auth)
app.get('/backtest/stats', async (req, res) => {
  const { getBacktestStats } = await import('./services/domain/backtest.service.js');
  const detectorType = req.query.detector ? String(req.query.detector) : undefined;
  const asset = req.query.asset ? String(req.query.asset) : undefined;
  const stats = await getBacktestStats({ detectorType, asset });
  res.json(stats);
});
app.use('/monitors', monitorsRouter);
app.use('/signals', signalsRouter);
app.use('/webhooks', webhooksRouter); // HMAC-signed callbacks for the /webhooks/test utility
app.use('/orders', ordersRouter);
app.use('/dlq', dlqRouter);
app.use('/backtest', backtestRouter);
app.use('/portfolio', portfolioRouter);

// Centralized error handler.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal_error' });
  },
);

// ── Start server (only when run directly, not imported) ────────
const server = http.createServer(app);

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down gracefully');
  server.close(async () => {
    try {
      await stopInvalidationBus();
      await pool.end();
      logger.info('DB pool closed');
    } finally {
      process.exit(0);
    }
  });
  setTimeout(() => {
    logger.error('forced exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Only start listening when this file is run directly.
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, ''));
if (isMain) {
  validateSchema()
    .then(({ ok, missing }) => {
      if (!ok) {
        logger.error({ missing }, 'schema validation failed — run `npm run migrate`');
        process.exit(1);
      }
      logger.info('schema validation passed');

      // Wire the cross-instance cache invalidation bus. When
      // REDIS_CACHE_PUPSUB=true, this subscribes to a Redis channel and
      // drops locally-cached keys that peer instances have invalidated.
      // Off by default — single-instance deployments don't need it.
      startInvalidationSubscriber((pattern) => {
        cacheInvalidate(pattern);
      }).catch((err) => {
        logger.warn({ err }, 'cache invalidation subscriber failed to start');
      });

      server.listen(config.port, () => {
        logger.info({ port: config.port, env: config.env }, 'API listening');
      });
    })
    .catch((err) => {
      logger.error({ err }, 'schema validation error');
      process.exit(1);
    });
}

export { server };
