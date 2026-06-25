import { describe, it, expect, beforeEach, vi } from 'vitest';
import { overall, recentCalls } from '../src/services/scorecard.js';
import type { ScorecardOverall } from '../src/services/scorecard.js';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db/pool.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: vi.fn(),
  pool: { query: mockQuery, end: vi.fn() },
}));

interface QueryCall {
  sql: string;
  params?: unknown[];
}

interface RowSet {
  rows: unknown[];
}

function queryCall(rowSet: RowSet | unknown[]): () => QueryCall {
  return () => {
    if (Array.isArray(rowSet)) {
      return { sql: '', params: [], ...rowSet } as unknown as QueryCall;
    }
    return { sql: '', params: [] } as unknown as QueryCall;
  };
}

describe('scorecard.overall — empty DB', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    // Five queries in parallel:
    //   1. countsQuery → { total_signals: '0', total_trades: '0' }
    //   2. outcomesQuery → { total, hits, hit_ratio, cumulative_pnl, sharpe, max_drawdown }
    //   3. bySignalTypeQuery → []
    //   4. byWatchlistQuery → []
    //   5. recentCallsQuery → []
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ total_signals: '0', total_trades: '0', closed_trades: '0' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            total: '0',
            hits: '0',
            hit_ratio: null,
            cumulative_pnl: '0',
            sharpe: '0',
            max_drawdown: '0',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: '0', with_hedera: '0' }], rowCount: 1 });
  });

  it('returns zeroed metrics for an empty DB', async () => {
    const result = await overall();
    expect(result.totalSignals).toBe(0);
    expect(result.totalTrades).toBe(0);
    expect(result.hitRatio).toBe(0);
    expect(result.cumulativePnlUsd).toBe(0);
    expect(result.sharpe).toBe(0);
    expect(result.maxDrawdownUsd).toBe(0);
    expect(result.bySignalType).toEqual([]);
    expect(result.byWatchlist).toEqual([]);
    expect(result.recentCalls).toEqual([]);
    expect(result.generatedAt).toBeTruthy();
  });
});

describe('scorecard.overall — with signals + trades', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ total_signals: '7', total_trades: '4', closed_trades: '2' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            total: '5',
            hits: '3',
            hit_ratio: '0.6',
            cumulative_pnl: '123.45',
            sharpe: '1.2',
            max_drawdown: '50',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          { detector_type: 'emergency_patch', total: '3', hits: '2' },
          { detector_type: 'security_critical_patch', total: '2', hits: '1' },
        ],
        rowCount: 2,
      })
      .mockResolvedValueOnce({
        rows: [
          { monitor_id: 'm-1', url: 'https://github.com/zcash/halo2', total: '3', hits: '2' },
          { monitor_id: 'm-2', url: 'https://example.com', total: '2', hits: '1' },
        ],
        rowCount: 2,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            signal_id: 'sig-1',
            detected_at: '2026-06-17T20:00:00.000Z',
            monitor_url: 'https://github.com/zcash/halo2',
            conviction: 85,
            thesis: 'Critical soundness fix',
            recommended_action: 'long',
            trade_tx_hash: '0xpapabc',
            outcomes: { t1h: 0.5, t1d: 2.1, t7d: 5.3 },
            detector_types: ['emergency_patch', 'security_critical_patch'],
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ total: '7', with_hedera: '3' }], rowCount: 1 });
  });

  it('returns the metrics with the right types', async () => {
    const result = await overall();
    expect(result.totalSignals).toBe(7);
    expect(result.totalTrades).toBe(4);
    expect(result.hitRatio).toBeCloseTo(0.6);
    expect(result.cumulativePnlUsd).toBeCloseTo(123.45);
    expect(result.sharpe).toBeCloseTo(1.2);
    expect(result.maxDrawdownUsd).toBe(50);
  });

  it('returns bySignalType with hitRatio computed', async () => {
    const result = await overall();
    expect(result.bySignalType).toHaveLength(2);
    expect(result.bySignalType[0]).toEqual({
      detectorType: 'emergency_patch',
      total: 3,
      hits: 2,
      hitRatio: 2 / 3,
    });
    expect(result.bySignalType[1]).toEqual({
      detectorType: 'security_critical_patch',
      total: 2,
      hits: 1,
      hitRatio: 0.5,
    });
  });

  it('returns byWatchlist', async () => {
    const result = await overall();
    expect(result.byWatchlist).toHaveLength(2);
    expect(result.byWatchlist[0]?.url).toBe('https://github.com/zcash/halo2');
    expect(result.byWatchlist[0]?.hitRatio).toBeCloseTo(2 / 3);
  });

  it('returns recentCalls with outcomes map', async () => {
    const result = await overall();
    expect(result.recentCalls).toHaveLength(1);
    expect(result.recentCalls[0]).toMatchObject({
      signalId: 'sig-1',
      conviction: 85,
      thesis: 'Critical soundness fix',
      recommendedAction: 'long',
      tradeTxHash: '0xpapabc',
      outcomes: { t1h: 0.5, t1d: 2.1, t7d: 5.3 },
      detectorTypes: ['emergency_patch', 'security_critical_patch'],
    });
  });
});

describe('scorecard.recentCalls', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('queries with the requested limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await recentCalls(5);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1'), [5]);
  });

  it('defaults to 20 when called without a limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await recentCalls();
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1'), [20]);
  });
});

describe('ScorecardOverall shape', () => {
  it('contains the expected top-level fields', () => {
    const sample: ScorecardOverall = {
      totalSignals: 0,
      totalTrades: 0,
      hitRatio: 0,
      cumulativePnlUsd: 0,
      sharpe: 0,
      maxDrawdownUsd: 0,
      bySignalType: [],
      byWatchlist: [],
      recentCalls: [],
      generatedAt: '2026-06-17T20:00:00.000Z',
    };
    expect(Object.keys(sample).sort()).toEqual(
      [
        'bySignalType',
        'byWatchlist',
        'cumulativePnlUsd',
        'generatedAt',
        'hitRatio',
        'maxDrawdownUsd',
        'recentCalls',
        'sharpe',
        'totalSignals',
        'totalTrades',
      ].sort(),
    );
  });
});
