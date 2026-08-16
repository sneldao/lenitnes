import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import http from 'node:http';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.DATABASE_URL = 'postgresql://postgres:***@localhost:5432/lenitnes';

// No live PostgreSQL: the scorecard service is mocked below, so the DB pool
// never needs to answer real queries here.
vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), end: vi.fn() },
  query: async () => ({ rows: [], rowCount: 0 }),
}));

// Cache off: alias tests must measure the resolver, not cache hits.
vi.mock('../src/middleware/cache.js', () => ({
  cacheGet: vi.fn(() => undefined),
  cacheSet: vi.fn(),
}));

// Deterministic route-level payloads so the alias mapping — not DB state —
// is what the test discriminates.
vi.mock('../src/services/scorecard.js', () => ({
  overall: vi.fn(async () => ({ kind: 'markets-card', totalSignals: 7, totalTrades: 2 })),
  science: vi.fn(async () => ({ kind: 'research-card', totalAlerts: 3, cohorts: {} })),
}));

import { resolveDomainParam } from '../src/services/domain/domains.js';
const { app } = await import('../src/index.js');

// ─────────────────────────────────────────────────────────────
// Public domain labels (markets|research) + legacy aliases
// (code|science|bio) must all resolve to the canonical internal
// wire domain, in the resolver and through the HTTP routes.
// ─────────────────────────────────────────────────────────────

describe('resolveDomainParam — public labels → internal wire', () => {
  it('price oracle: markets, code, absent, empty', () => {
    expect(resolveDomainParam('markets')).toBe('code');
    expect(resolveDomainParam('code')).toBe('code');
    expect(resolveDomainParam(undefined)).toBe('code');
    expect(resolveDomainParam(null)).toBe('code');
    expect(resolveDomainParam('')).toBe('code');
  });

  it('record oracle: research, science, bio', () => {
    expect(resolveDomainParam('research')).toBe('science');
    expect(resolveDomainParam('science')).toBe('science');
    expect(resolveDomainParam('bio')).toBe('science');
  });

  it('unknown values default to code (the original vertical)', () => {
    expect(resolveDomainParam('nonsense')).toBe('code');
    expect(resolveDomainParam('MARKETS')).toBe('code'); // case-sensitive by design
  });
});

describe('GET /scorecard — every alias lands on the right card', () => {
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

  it('absent / markets / code are the same markets card', async () => {
    const [a, b, c] = await Promise.all([
      request(server).get('/scorecard'),
      request(server).get('/scorecard?domain=markets'),
      request(server).get('/scorecard?domain=code'),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);
    expect(a.body.kind).toBe('markets-card');
    expect(b.body.kind).toBe('markets-card');
    expect(c.body.kind).toBe('markets-card');
    expect(a.body.totalSignals).toBe(7);
  });

  it('research / science / bio are the same research card', async () => {
    const [a, b, c] = await Promise.all([
      request(server).get('/scorecard?domain=research'),
      request(server).get('/scorecard?domain=science'),
      request(server).get('/scorecard?domain=bio'),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);
    expect(a.body.kind).toBe('research-card');
    expect(b.body.kind).toBe('research-card');
    expect(c.body.kind).toBe('research-card');
    expect(a.body.totalAlerts).toBe(3);
  });

  it('markets and research hit different scorecard functions', async () => {
    const { overall, science } = await import('../src/services/scorecard.js');
    await request(server).get('/scorecard?domain=markets');
    await request(server).get('/scorecard?domain=research');
    expect(overall).toHaveBeenCalledTimes(1);
    expect(science).toHaveBeenCalledTimes(1);
  });
});
