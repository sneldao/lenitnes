import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import http from 'node:http';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.DATABASE_URL = 'postgresql://postgres:***@localhost:5432/lenitnes';

const { app } = await import('../src/index.js');

// ─────────────────────────────────────────────────────────────
// Smoke tests — no DB required for /health and /monitors.
// We mock the DB pool so tests run without a live PostgreSQL instance.
// ─────────────────────────────────────────────────────────────

vi.mock('../src/db/pool.js', () => ({
  pool: {
    query: vi.fn(async (sql: string) => {
      if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }], rowCount: 1 };
      if (sql.includes('FROM monitors')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }),
    end: vi.fn(),
  },
  query: async (sql: string) => {
    if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }], rowCount: 1 };
    if (sql.includes('FROM monitors')) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  },
}));

describe('API smoke tests (post-pivot, public API)', () => {
  let server: http.Server;

  beforeAll(() => {
    server = http.createServer(app);
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /health/live returns 200 (process is up)', async () => {
    const res = await request(server).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, service: 'lenitnes-api', version: '0.1.0' });
  });

  it('GET /health returns a snapshot with database check', async () => {
    const res = await request(server).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ service: 'lenitnes-api', version: '0.1.0' });
    expect(res.body.checks?.database).toBe('ok');
  });

  it('GET /monitors is public (no token required) and returns 200', async () => {
    const res = await request(server).get('/monitors');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /proof/public/nonexistent returns 404', async () => {
    const res = await request(server).get('/proof/public/nonexistent');
    expect(res.status).toBe(404);
  });
});
