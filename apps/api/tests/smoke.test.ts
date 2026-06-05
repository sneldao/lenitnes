import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import { app } from '../src/index.js';

// ─────────────────────────────────────────────────────────────
// Smoke tests — no DB required for /health and /auth.
// We mock the DB pool so tests run without a live PostgreSQL instance.
// ─────────────────────────────────────────────────────────────

// Mock users table: in-memory store for the upsertUserByWallet call.
const mockUsers: Record<string, { id: string; wallet_address: string; email: string | null }> = {};

vi.mock('../src/db/pool.js', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      // Health check: SELECT 1
      if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }], rowCount: 1 };

      // upsertUserByWallet
      if (sql.includes('INSERT INTO users')) {
        const walletAddress = params[0] as string;
        const email = params[1] as string | null;
        const existing = Object.values(mockUsers).find((u) => u.wallet_address === walletAddress);
        if (existing) {
          existing.email = email ?? existing.email;
          return { rows: [existing], rowCount: 1 };
        }
        const newUser = { id: 'test-user-id', wallet_address: walletAddress, email };
        mockUsers[newUser.id] = newUser;
        return { rows: [newUser], rowCount: 1 };
      }

      // SELECT monitors (empty list)
      if (sql.includes('FROM monitors')) {
        return { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 0 };
    }),
    end: vi.fn(),
  },
  query: async (sql: string, params: unknown[]) => {
    if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }], rowCount: 1 };
    if (sql.includes('INSERT INTO users')) {
      const walletAddress = params[0] as string;
      const email = params[1] as string | null;
      const existing = Object.values(mockUsers).find((u) => u.wallet_address === walletAddress);
      if (existing) {
        existing.email = email ?? existing.email;
        return { rows: [existing], rowCount: 1 };
      }
      const newUser = { id: 'test-user-id', wallet_address: walletAddress, email };
      mockUsers[newUser.id] = newUser;
      return { rows: [newUser], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  },
}));

describe('API smoke tests', () => {
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

  it('GET /health returns 200 with ok=true', async () => {
    const res = await request(server).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, service: 'lenitnes-api', version: '0.1.0' });
    expect(res.body.checks?.database).toBe('ok');
  });

  it('GET /monitors without token returns 401', async () => {
    const res = await request(server).get('/monitors');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'missing_token' });
  });

  it('POST /auth/login with valid body returns 200 and a token', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ walletAddress: '0.0.12345', email: 'test@example.com' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({ wallet_address: '0.0.12345' });
  });

  it('POST /auth/login without walletAddress returns 400', async () => {
    const res = await request(server).post('/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /monitors with valid token returns 200 and empty array', async () => {
    const loginRes = await request(server).post('/auth/login').send({ walletAddress: '0.0.99999' });
    const token = loginRes.body.token;

    const res = await request(server).get('/monitors').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /monitors with invalid token returns 401', async () => {
    const res = await request(server)
      .get('/monitors')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid_token' });
  });
});
