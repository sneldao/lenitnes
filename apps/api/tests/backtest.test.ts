import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/lenitnes';

// ── Mocks ────────────────────────────────────────────────────────

const queryMock = vi.fn();
vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn(), end: vi.fn() },
  query: (...args: unknown[]) => queryMock(...args),
}));

const getPriceAtWindowMock = vi.fn();
vi.mock('../src/services/data-providers/registry.js', () => ({
  priceData: {
    getPriceAtWindow: (...args: unknown[]) => getPriceAtWindowMock(...args),
    getPriceAt: vi.fn().mockResolvedValue(null),
  },
  marketData: {},
}));

const sendTelegramMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/services/notify.js', () => ({
  sendTelegram: (...args: unknown[]) => sendTelegramMock(...args),
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { processSignalOutcomes, refreshBacktestStats, getBacktestStats, getSignalOutcomes } =
  await import('../src/services/domain/backtest.service.js');

// ── Helpers ──────────────────────────────────────────────────────

function resetMocks() {
  queryMock.mockReset();
  getPriceAtWindowMock.mockReset();
}

// ── Tests ────────────────────────────────────────────────────────

describe('processSignalOutcomes', () => {
  beforeEach(resetMocks);

  it('processes pending signal-window pairs and inserts outcomes', async () => {
    // Step 1: pending query returns one row per matured signal×window
    const windows = [3600, 14400, 86400, 604800];
    queryMock.mockResolvedValueOnce({
      rows: windows.map((w) => ({
        signal_id: 'sig-1',
        detected_at: '2026-06-01T12:00:00Z',
        asset_id: 'zcash',
        window_seconds: w,
      })),
      rowCount: 4,
    });

    // Price fetches: 4 windows (1h, 4h, 24h, 7d)
    getPriceAtWindowMock
      .mockResolvedValueOnce({ atSignal: 25.0, afterWindow: 26.5 }) // 1h: +6%
      .mockResolvedValueOnce({ atSignal: 25.0, afterWindow: 24.0 }) // 4h: -4%
      .mockResolvedValueOnce({ atSignal: 25.0, afterWindow: 27.0 }) // 24h: +8%
      .mockResolvedValueOnce({ atSignal: 25.0, afterWindow: 25.5 }); // 7d: +2%

    // Per window: outcome insert; 1d/7d additionally fetch the agent
    // score for the verdict broadcast (telegram unconfigured in tests,
    // but the guard runs before the score query — order-insensitive
    // via mockResolvedValue).
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await processSignalOutcomes();
    expect(result.processed).toBe(4);
    expect(result.errors).toBe(0);
    expect(getPriceAtWindowMock).toHaveBeenCalledTimes(4);
  });

  it('skips signals with unresolvable asset mapping', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          signal_id: 'sig-2',
          detected_at: '2026-06-01T12:00:00Z',
          asset_id: null, // unresolvable — no coingeckoId on signal or monitor
          window_seconds: 3600,
        },
      ],
      rowCount: 1,
    });

    const result = await processSignalOutcomes();
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(1);
    expect(getPriceAtWindowMock).not.toHaveBeenCalled();
  });

  it('handles price fetch failures gracefully', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          signal_id: 'sig-3',
          detected_at: '2026-06-01T12:00:00Z',
          asset_id: 'bitcoin',
          window_seconds: 3600,
        },
      ],
      rowCount: 1,
    });

    // All price fetches return null
    getPriceAtWindowMock.mockResolvedValue(null);

    const result = await processSignalOutcomes();
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(1);
  });
});

describe('refreshBacktestStats', () => {
  beforeEach(resetMocks);

  it('aggregates stats and upserts into detector_backtest_stats', async () => {
    // Aggregate query returns one row
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          detector_type: 'emergency_patch',
          asset: 'zcash',
          total_signals: '10',
          correct_count: '7',
          avg_pct: '3.5',
          avg_abs: '4.2',
          best_window: 86400,
          returns: '{1.5,-2.0,5.0,3.0,-1.0,8.0,2.5,4.0,-0.5,6.0}',
        },
      ],
      rowCount: 1,
    });

    // Upsert query
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await refreshBacktestStats();

    // Verify the upsert was called with computed values
    const upsertCall = queryMock.mock.calls[1];
    expect(upsertCall).toBeDefined();
    const params = upsertCall[1] as unknown[];
    expect(params[0]).toBe('emergency_patch');
    expect(params[1]).toBe('zcash');
    expect(params[2]).toBe(10); // total_signals
    expect(params[3]).toBe(7); // correct_count
    expect(params[4]).toBe('70.00'); // accuracy: 7/10 * 100
  });

  it('handles empty results', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await refreshBacktestStats();
    expect(queryMock).toHaveBeenCalledTimes(1); // only the aggregate query
  });
});

describe('getBacktestStats', () => {
  beforeEach(resetMocks);

  it('queries without filters', async () => {
    const mockRows = [{ detector_type: 'emergency_patch', asset: 'zcash', accuracy: '70.00' }];
    queryMock.mockResolvedValueOnce({ rows: mockRows, rowCount: 1 });

    const result = await getBacktestStats();
    expect(result).toHaveLength(1);
    expect(result[0].detector_type).toBe('emergency_patch');

    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).not.toContain('WHERE');
  });

  it('applies detector and asset filters', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await getBacktestStats({ detectorType: 'security_critical_patch', asset: 'bitcoin' });

    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('detector_type = $1');
    expect(sql).toContain('asset = $2');
    const params = queryMock.mock.calls[0][1] as unknown[];
    expect(params).toEqual(['security_critical_patch', 'bitcoin']);
  });
});

describe('getSignalOutcomes', () => {
  beforeEach(resetMocks);

  it('returns outcomes ordered by window_seconds', async () => {
    const mockRows = [
      { signal_id: 'sig-1', asset: 'zcash', window_seconds: 3600, pct_change: '6.00' },
      { signal_id: 'sig-1', asset: 'zcash', window_seconds: 86400, pct_change: '8.00' },
    ];
    queryMock.mockResolvedValueOnce({ rows: mockRows, rowCount: 2 });

    const result = await getSignalOutcomes('sig-1');
    expect(result).toHaveLength(2);
    expect(result[0].window_seconds).toBe(3600);

    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY window_seconds');
  });
});
