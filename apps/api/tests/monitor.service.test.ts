import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env before imports.
process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
process.env.JWT_SECRET ??= 'test-jwt-secret-must-be-long-enough';
process.env.WEBHOOK_SECRET ??= 'test-webhook-secret';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// Mock BOTH pg and the pool module via hoisted factory.
// The factory cannot reference top-level variables, so we use vi.hoisted.
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

describe('monitor.service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('createMonitor returns the inserted monitor', async () => {
    const fakeMonitor = {
      id: 'm-1',
      user_id: 'u-1',
      url: 'https://example.com',
      condition_text: 'x',
      frequency_seconds: 3600,
      escrow_account_id: null,
      hbar_balance: '0',
      cost_per_check: '0.5',
      status: 'active' as const,
      screenshots_enabled: true,
      last_check_at: null,
      last_seen_commit_hash: null,
      created_at: '2026-01-01',
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeMonitor] });

    const result = await createMonitor({
      userId: 'u-1',
      url: 'https://example.com',
      conditionText: 'x',
      frequencySeconds: 3600,
      screenshotsEnabled: true,
    });

    expect(result).toEqual(fakeMonitor);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO monitors'),
      expect.arrayContaining(['u-1', 'https://example.com', 'x', 3600]),
    );
  });

  it('listMonitors returns rows for the user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'm-1' }] });
    const result = await listMonitors('u-1', 50, 0);
    expect(result).toEqual([{ id: 'm-1' }]);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM monitors'), [
      'u-1',
      50,
      0,
    ]);
  });

  it('getMonitorById returns null when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getMonitorById('m-x', 'u-1');
    expect(result).toBeNull();
  });

  it('updateMonitor returns null when no fields provided', async () => {
    const result = await updateMonitor('m-1', 'u-1', {});
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updateMonitor applies frequencySeconds only', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'm-1', frequency_seconds: 7200 }] });
    const result = await updateMonitor('m-1', 'u-1', { frequencySeconds: 7200 });
    expect(result).toEqual({ id: 'm-1', frequency_seconds: 7200 });
    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('frequency_seconds');
    expect(sql).not.toContain('condition_text');
  });

  it('pauseAndReleaseEscrow returns true on success', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const result = await pauseAndReleaseEscrow('m-1', 'u-1');
    expect(result).toBe(true);
  });

  it('pauseAndReleaseEscrow returns false when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await pauseAndReleaseEscrow('m-x', 'u-1');
    expect(result).toBe(false);
  });
});
