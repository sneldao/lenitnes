import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/lenitnes';

// ── Mocks ───────────────────────────────────────────────────────

const queryMock = vi.fn();
vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn(), end: vi.fn() },
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { getLeaderboard, getHunterDetail } =
  await import('../src/services/domain/leaderboard.service.js');

// ── Helpers ─────────────────────────────────────────────────────

function resetMocks() {
  queryMock.mockReset();
}

// ── Tests ───────────────────────────────────────────────────────

describe('getLeaderboard', () => {
  beforeEach(resetMocks);

  const defaultEntries = [
    {
      user_id: 'u-1',
      wallet_address: '0x1111',
      email: 'alice@test.com',
      total_signals: '10',
      chain_completed: '5',
      hit_rate: '0.70',
      top_pair: 'BTCUSD',
      last_signal_at: '2026-06-13T12:00:00Z',
      current_streak: '3',
    },
    {
      user_id: 'u-2',
      wallet_address: '0x2222',
      email: null,
      total_signals: '3',
      chain_completed: '1',
      hit_rate: null,
      top_pair: null,
      last_signal_at: '2026-06-10T08:00:00Z',
      current_streak: '0',
    },
  ];

  const defaultStats = {
    total_signals: '13',
    active_hunters: '2',
    public_monitors: '5',
    anchored: '6',
  };

  it('returns entries mapped correctly from query result', async () => {
    queryMock.mockResolvedValueOnce({ rows: defaultEntries, rowCount: 2 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    const result = await getLeaderboard({ limit: 50, offset: 0, sort: 'signals' });

    expect(result.entries).toHaveLength(2);

    // First entry: has accuracy, streak, top_pair
    expect(result.entries[0]).toMatchObject({
      user_id: 'u-1',
      wallet_address: '0x1111',
      total_signals: 10,
      chain_completed: 5,
      accuracy: '70%',
      streak: 3,
      top_pair: 'BTCUSD',
      last_signal_at: '2026-06-13T12:00:00Z',
    });

    // Second entry: null accuracy, no streak, no top_pair
    expect(result.entries[1]).toMatchObject({
      user_id: 'u-2',
      total_signals: 3,
      chain_completed: 1,
      accuracy: null,
      streak: 0,
      top_pair: null,
    });
  });

  it('computes aggregate stats correctly', async () => {
    queryMock.mockResolvedValueOnce({ rows: defaultEntries, rowCount: 2 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    const result = await getLeaderboard({ limit: 50, offset: 0, sort: 'signals' });

    expect(result.stats).toMatchObject({
      total_signals: 13,
      active_hunters: 2,
      public_monitors: 5,
    });
    // 6 anchored out of 13 = 46%
    expect(result.stats.anchor_coverage).toBe('46%');
  });

  it('handles zero anchors gracefully', async () => {
    queryMock.mockResolvedValueOnce({ rows: defaultEntries, rowCount: 2 });
    queryMock.mockResolvedValueOnce({
      rows: [{ ...defaultStats, anchored: '0' }],
      rowCount: 1,
    });

    const result = await getLeaderboard({ limit: 50, offset: 0, sort: 'signals' });
    expect(result.stats.anchor_coverage).toBe('0%');
  });

  it('handles empty entries', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    const result = await getLeaderboard({ limit: 50, offset: 0, sort: 'signals' });
    expect(result.entries).toHaveLength(0);
  });

  it('passes limit and offset parameters', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    await getLeaderboard({ limit: 10, offset: 20, sort: 'signals' });

    const sql = queryMock.mock.calls[0][0] as string;
    const params = queryMock.mock.calls[0][1] as unknown[];
    expect(sql).toContain('LIMIT $1');
    expect(sql).toContain('OFFSET $2');
    expect(params).toEqual([10, 20]);
  });

  it('generates ORDER BY for sort=signals', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    await getLeaderboard({ limit: 50, offset: 0, sort: 'signals' });
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY hs.total_signals DESC');
  });

  it('generates ORDER BY for sort=accuracy', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    await getLeaderboard({ limit: 50, offset: 0, sort: 'accuracy' });
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('(ua.correct::numeric / NULLIF(ua.total, 1)) DESC NULLS LAST');
  });

  it('generates ORDER BY for sort=streak', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    await getLeaderboard({ limit: 50, offset: 0, sort: 'streak' });
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY cs.current_streak DESC NULLS LAST');
  });

  it('generates ORDER BY for sort=recent', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    await getLeaderboard({ limit: 50, offset: 0, sort: 'recent' });
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY hs.last_signal_at DESC NULLS LAST');
  });

  it('uses $1/$2 for ALL sort modes (same param positions)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    await getLeaderboard({ limit: 25, offset: 10, sort: 'accuracy' });
    const params = queryMock.mock.calls[0][1] as unknown[];
    expect(params).toEqual([25, 10]);
  });

  it('handles edge: hit_rate is a decimal fraction (0.1234 formatted to 12%)', async () => {
    const row = {
      ...defaultEntries[0],
      hit_rate: '0.1234',
    };
    queryMock.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    const result = await getLeaderboard({ limit: 50, offset: 0, sort: 'signals' });
    expect(result.entries[0].accuracy).toBe('12%');
  });

  it('handles edge: hit_rate is exactly 1.0 (100%)', async () => {
    const row = {
      ...defaultEntries[0],
      hit_rate: '1.0',
    };
    queryMock.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    queryMock.mockResolvedValueOnce({ rows: [defaultStats], rowCount: 1 });

    const result = await getLeaderboard({ limit: 50, offset: 0, sort: 'signals' });
    expect(result.entries[0].accuracy).toBe('100%');
  });
});

describe('getHunterDetail', () => {
  beforeEach(resetMocks);

  it('returns null when user does not exist', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getHunterDetail('nonexistent', { limit: 25, offset: 0 });
    expect(result).toBeNull();
    // Only the user check query ran
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('returns hunter with signals', async () => {
    // User check
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'u-1', wallet_address: '0x1111', email: 'alice@test.com' }],
      rowCount: 1,
    });
    // Hunter aggregate stats
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          total_signals: '10',
          chain_completed: '5',
          hit_rate: '0.70',
          top_pair: 'BTCUSD',
          last_signal_at: '2026-06-13T12:00:00Z',
          current_streak: '3',
        },
      ],
      rowCount: 1,
    });
    // Signals
    const fakeSignals = [
      {
        id: 'sig-1',
        monitor_id: 'mon-1',
        detected_at: '2026-06-13T12:00:00Z',
        is_heartbeat: false,
        orders_count: 1,
      },
      {
        id: 'sig-2',
        monitor_id: 'mon-1',
        detected_at: '2026-06-12T10:00:00Z',
        is_heartbeat: false,
        orders_count: 0,
      },
    ];
    queryMock.mockResolvedValueOnce({ rows: fakeSignals, rowCount: 2 });

    const result = await getHunterDetail('u-1', { limit: 25, offset: 0 });

    expect(result).not.toBeNull();
    expect(result!.hunter).toMatchObject({
      user_id: 'u-1',
      wallet_address: '0x1111',
      total_signals: 10,
      chain_completed: 5,
      accuracy: '70%',
      streak: 3,
      top_pair: 'BTCUSD',
    });
    expect(result!.signals).toHaveLength(2);
    expect(result!.signals[0].id).toBe('sig-1');
  });

  it('returns zeros and nulls when user has no signals', async () => {
    // User check
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'u-2', wallet_address: '0x2222', email: null }],
      rowCount: 1,
    });
    // Hunter aggregate — empty group returns no row from CROSS JOIN
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Signals — empty
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getHunterDetail('u-2', { limit: 25, offset: 0 });

    expect(result).not.toBeNull();
    expect(result!.hunter).toMatchObject({
      user_id: 'u-2',
      total_signals: 0,
      chain_completed: 0,
      accuracy: null,
      streak: 0,
      top_pair: null,
    });
    expect(result!.signals).toHaveLength(0);
  });

  it('passes pagination params for signals query', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'u-1', wallet_address: '0x1111', email: null }],
      rowCount: 1,
    });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await getHunterDetail('u-1', { limit: 10, offset: 20 });

    // Third query is the signals query
    const signalsSql = queryMock.mock.calls[2][0] as string;
    const signalsParams = queryMock.mock.calls[2][1] as unknown[];
    expect(signalsSql).toContain('LIMIT $2');
    expect(signalsSql).toContain('OFFSET $3');
    expect(signalsParams).toEqual(['u-1', 10, 20]);
  });

  it('handles null accuracy when hit_rate is null', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'u-1', wallet_address: '0x1111', email: null }],
      rowCount: 1,
    });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          total_signals: '5',
          chain_completed: '2',
          hit_rate: null,
          top_pair: null,
          last_signal_at: '2026-06-01T00:00:00Z',
          current_streak: '0',
        },
      ],
      rowCount: 1,
    });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getHunterDetail('u-1', { limit: 25, offset: 0 });
    expect(result!.hunter.accuracy).toBeNull();
  });
});
