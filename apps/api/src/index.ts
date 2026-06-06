import express from 'express';
import cors from 'cors';
import http from 'node:http';
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
import { requireAuth } from './middleware/auth.js';
import { x402Middleware } from './middleware/x402.js';

export const app = express();
app.use(cors({ origin: config.webOrigin }));
app.use(express.json({ limit: '10mb' }));

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

// ── Health check (no auth required) ────────────────────────────
app.get('/health', async (_req, res) => {
  let dbStatus: 'ok' | 'fail' = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    dbStatus = 'fail';
  }
  res.json({
    ok: dbStatus === 'ok',
    service: 'lenitnes-api',
    version: '0.1.0',
    checks: { database: dbStatus },
  });
});

app.use('/auth', authLimiter, authRouter);
app.use('/monitors', requireAuth, monitorsRouter);
app.use('/signals', requireAuth, signalsRouter);
app.use('/rules', requireAuth, rulesRouter);
app.use('/webhooks', webhooksRouter); // Kraken callbacks — use separate HMAC auth
app.use('/orders', requireAuth, ordersRouter);
app.use('/kraken', requireAuth, krakenRouter);

// ── x402-gated execution (payment → execution tightly coupled) ─
app.use('/execute', requireAuth, executeLimiter, x402Middleware, executeRouter);

// Centralized error handler.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'internal_error' });
  },
);

// ── Start server (only when run directly, not imported) ────────
const server = http.createServer(app);

function shutdown(signal: string) {
  console.log(`\n[api] received ${signal} — shutting down gracefully`);
  server.close(async () => {
    try {
      await pool.end();
      console.log('[api] DB pool closed');
    } finally {
      process.exit(0);
    }
  });
  setTimeout(() => {
    console.error('[api] forced exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Only start listening when this file is run directly.
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, ''));
if (isMain) {
  server.listen(config.port, () => {
    console.log(`LENITNES API listening on :${config.port} (${config.env})`);
  });
}

export { server };
