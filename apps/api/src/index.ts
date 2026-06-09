import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { authRouter } from './routes/auth.js';
import { monitorsRouter } from './routes/monitors.js';
import { signalsRouter } from './routes/signals.js';
import { rulesRouter } from './routes/rules.js';
import { webhooksRouter } from './routes/webhooks.js';
import { executeRouter } from './routes/execute.js';
import { ordersRouter } from './routes/orders.js';
import { krakenRouter } from './routes/kraken.js';
import { proofRouter } from './routes/proof.js';
import { dlqRouter } from './routes/dlq.js';
import { requireAuth } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { renderMetrics, metricsMiddleware } from './middleware/metrics.js';
import { x402Middleware } from './middleware/x402.js';
import { validateSchema } from './db/validate.js';
import { logger } from './logger.js';
import { checkRedisReachable } from './queue/connection.js';
import { getDlqDepth } from './queue/dlq.js';

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
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'too_many_requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
const executeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'too_many_requests' },
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
//   /health/ready → 200 only when DB + Redis are reachable. For readiness
//                    probes and load-balancer health checks.
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
    checkRedisReachable().then((ok) => {
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
  const redisOk = await checkRedisReachable();
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

app.use('/auth', authLimiter, authRouter);
// ── Public proof endpoint (no auth required) ─────────────────────────
app.use('/proof', proofRouter);
app.use('/monitors', requireAuth, monitorsRouter);
app.use('/signals', requireAuth, signalsRouter);
app.use('/rules', requireAuth, rulesRouter);
app.use('/webhooks', webhooksRouter); // Kraken callbacks — use separate HMAC auth
app.use('/orders', requireAuth, ordersRouter);
app.use('/kraken', requireAuth, krakenRouter);
app.use('/dlq', requireAuth, dlqRouter);

// ── x402-gated execution (payment → execution tightly coupled) ─
app.use('/execute', requireAuth, executeLimiter, x402Middleware, executeRouter);

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
