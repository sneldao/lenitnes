import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import http from 'node:http';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.DATABASE_URL = 'postgresql://localhost/lenitnes_test_placeholder';

// The route under test surfaces the assembled evidence path (P1).
// getSignalPath is mocked so we can assert the route actually forwards
// `path` in the JSON payload — a regression test for the wiring bug
// where getSignalWithProof returned it but the handler dropped it.

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
const { mockGetSignalPath } = vi.hoisted(() => ({
  mockGetSignalPath: vi.fn(),
}));

vi.mock('../src/db/pool.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: vi.fn(),
  pool: { query: mockQuery, end: vi.fn() },
}));

vi.mock('../src/services/domain/evidence-chain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/domain/evidence-chain.js')>();
  return { ...actual, getSignalPath: mockGetSignalPath };
});

const FAKE_PATH = {
  pathHash: 'a'.repeat(64),
  nodes: [
    { id: 1, node_type: 'signal', source_ref: 'sig-1', detected_at: '2026-08-30T00:00:00.000Z' },
    {
      id: 2,
      node_type: 'commit',
      source_repo: 'a/b',
      source_ref: 'abc1234',
      detected_at: '2026-08-29T00:00:00.000Z',
    },
  ],
  edges: [{ id: 10, kind: 'same_sha', from_node_id: 2, to_node_id: 1, provenance: 'auto' }],
  commitment: { anchored: true, hederaTxId: '0.0.123@1699999999.000000000' },
};

const { app } = await import('../src/index.js');

function makeServer() {
  return http.createServer(app);
}

describe('signals — evidence path surfaced in payloads', () => {
  let server: http.Server;

  beforeAll(() => {
    server = makeServer();
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockGetSignalPath.mockReset();
  });

  it('GET /signals/:id includes the assembled path', async () => {
    mockQuery
      // getSignalWithProof: signal row
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sig-1',
            monitor_id: 'mon-1',
            detected_at: '2026-08-30T00:00:00.000Z',
            evidence_text: 'abc1234: fix',
            condition_summary: 'High-impact PR',
            is_heartbeat: false,
            screenshot_urls: [],
            hedera_tx_id: null,
            ipfs_cid: null,
          },
        ],
        rowCount: 1,
      })
      // orders
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // monitor
      .mockResolvedValueOnce({
        rows: [{ id: 'mon-1', url: 'https://github.com/a/b', condition_text: 'x' }],
      })
      // agent score
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // signal_source classify: nothing extra (pure fn)
      // classifications
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // outcomes
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    mockGetSignalPath.mockResolvedValue(FAKE_PATH);

    const res = await request(server).get('/signals/sig-1');
    expect(res.status).toBe(200);
    expect(res.body.path).toEqual(FAKE_PATH);
    expect(mockGetSignalPath).toHaveBeenCalledWith('sig-1');
  });

  it('GET /signals/:id returns path:null when no path is assembled', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sig-2',
            monitor_id: 'mon-1',
            detected_at: '2026-08-30T00:00:00.000Z',
            evidence_text: null,
            condition_summary: null,
            is_heartbeat: false,
            screenshot_urls: [],
            hedera_tx_id: null,
            ipfs_cid: null,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ id: 'mon-1', url: 'https://github.com/a/b', condition_text: 'x' }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    mockGetSignalPath.mockResolvedValue(null);

    const res = await request(server).get('/signals/sig-2');
    expect(res.status).toBe(200);
    expect(res.body.path).toBeNull();
  });
});
