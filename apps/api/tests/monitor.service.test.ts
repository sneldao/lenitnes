import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env before imports.
process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
process.env.JWT_SECRET ??= 'test-jwt-secret-must-be-long-enough';
process.env.WEBHOOK_SECRET ??= 'test-webhook-secret';
process.env.DATABASE_URL ??= 'postgresql://test:***@localhost:5432/test';

// Mock pg and the pool module via hoisted factory.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db/pool.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: vi.fn(),
  pool: { query: mockQuery, end: vi.fn() },
}));

import {
  createMonitor,
  listMonitors,
  getMonitorById,
  updateMonitor,
  pauseAndReleaseEscrow,
} from '../src/services/domain/monitor.service.js';

describe('monitor.service (post-pivot, no user_id binding)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('createMonitor inserts a watchlist row without user_id', async () => {
    const fakeMonitor = {
      id: 'm-1',
      url: 'https://example.com',
      condition_text: 'x',
      frequency_seconds: 3600,
      status: 'active' as const,
      screenshots_enabled: true,
      last_check_at: null,
      last_seen_commit_hash: null,
      created_at: '2026-01-01',
      asset_mapping: {},
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeMonitor] });

    const result = await createMonitor({
      url: 'https://example.com',
      conditionText: 'x',
      frequencySeconds: 3600,
      screenshotsEnabled: true,
    });

    expect(result).toEqual(fakeMonitor);
    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('INSERT INTO monitors');
    expect(sql).not.toContain('user_id');
    expect(sql).not.toContain('hbar_balance');
    expect(sql).not.toContain('cost_per_check');
  });

  it('listMonitors returns rows without user filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'm-1' }] });
    const result = await listMonitors(50, 0);
    expect(result).toEqual([{ id: 'm-1' }]);
    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('SELECT * FROM monitors');
    expect(sql).not.toContain('user_id');
    const params = mockQuery.mock.calls[0]?.[1] as unknown[];
    expect(params).toEqual([50, 0]);
  });

  it('getMonitorById returns null when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getMonitorById('m-x');
    expect(result).toBeNull();
    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).not.toContain('user_id');
  });

  it('updateMonitor returns null when no fields provided', async () => {
    const result = await updateMonitor('m-1', {});
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updateMonitor applies frequencySeconds only', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'm-1', frequency_seconds: 7200 }] });
    const result = await updateMonitor('m-1', { frequencySeconds: 7200 });
    expect(result).toEqual({ id: 'm-1', frequency_seconds: 7200 });
    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('frequency_seconds');
    expect(sql).not.toContain('condition_text');
    expect(sql).not.toContain('hbar_balance');
  });

  it('pauseAndReleaseEscrow returns true on success', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const result = await pauseAndReleaseEscrow('m-1');
    expect(result).toBe(true);
    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("status = 'paused'");
    expect(sql).not.toContain('hbar_balance');
  });

  it('pauseAndReleaseEscrow returns false when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await pauseAndReleaseEscrow('m-x');
    expect(result).toBe(false);
  });
});
