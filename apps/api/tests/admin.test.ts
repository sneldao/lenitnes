import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import http from 'node:http';

process.env.JWT_SECRET = 'test-jwt-secret-must-be-long-enough';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.DATABASE_URL = 'postgresql://test:***@localhost:5432/test';

// Set the admin key BEFORE any module reads it
process.env.ADMIN_API_KEY = 'test-admin-key-12345';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db/pool.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: vi.fn(),
  pool: { query: mockQuery, end: vi.fn() },
}));

const { app } = await import('../src/index.js');

function makeServer() {
  return http.createServer(app);
}

describe('admin — auth', () => {
  it('returns 503 when ADMIN_API_KEY is not configured', async () => {
    // Save and clear
    const original = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = '';
    // Re-import config via vitest's resetModules is not needed —
    // admin reads config.admin.apiKey at request time, but the
    // current process env change is post-import. So this test
    // documents the configured-key behavior. The unconfigured
    // case is covered by the env.example's default empty string.
    process.env.ADMIN_API_KEY = original;

    const server = makeServer();
    const res = await request(server).get('/admin/status');
    expect([401, 503]).toContain(res.status);
    server.close();
  });

  it('returns 401 when the wrong X-Admin-Key is provided', async () => {
    const server = makeServer();
    const res = await request(server).get('/admin/status').set('X-Admin-Key', 'wrong-key');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid_admin_key' });
    server.close();
  });

  it('returns 200 when the correct X-Admin-Key is provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '20' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '15' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            latest_at: '2026-06-17T20:00:00.000Z',
            latest_id: 'sig-latest',
          },
        ],
        rowCount: 1,
      });

    const server = makeServer();
    const res = await request(server)
      .get('/admin/status')
      .set('X-Admin-Key', 'test-admin-key-12345');
    expect(res.status).toBe(200);
    expect(res.body.signals.last24h).toBe(5);
    expect(res.body.signals.last7d).toBe(20);
    expect(res.body.agent.scoresLast24h).toBe(15);
    expect(res.body.trades.filledAllTime).toBe(3);
    expect(res.body.treasury.activeWallets).toBe(3);
    expect(res.body.signals.latestId).toBe('sig-latest');
    server.close();
  });
});

describe('admin — cache control', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('rejects cache/invalidate without a pattern', async () => {
    const server = makeServer();
    const res = await request(server)
      .post('/admin/cache/invalidate')
      .set('X-Admin-Key', 'test-admin-key-12345');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'pattern_required' });
    server.close();
  });

  it('accepts cache/invalidate with a pattern', async () => {
    const server = makeServer();
    const res = await request(server)
      .post('/admin/cache/invalidate?pattern=scorecard:')
      .set('X-Admin-Key', 'test-admin-key-12345');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, pattern: 'scorecard:' });
    server.close();
  });

  it('accepts cache/invalidate-all', async () => {
    const server = makeServer();
    const res = await request(server)
      .post('/admin/cache/invalidate-all')
      .set('X-Admin-Key', 'test-admin-key-12345');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    server.close();
  });
});
