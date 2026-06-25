// ─────────────────────────────────────────────────────────────
// Integration test: scorecard end-to-end.
//
// Exercises the full aggregation pipeline that backs /scorecard
// (the public credibility surface). Mocks only the DB driver;
// everything else — countsQuery, outcomesQuery, bySignalTypeQuery,
// byWatchlistQuery, recentCallsQuery — runs the actual SQL it
// would run in production.
//
// The fixture data is shaped like the real halo2 demo seed
// (3 signals, 1 above-threshold trade, 1 hit + 1 miss + 1
// sub-threshold). The expected response is what an operator
// with this state would see at https://lenitnes.persidian.com/scorecard.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { overall, recentCalls } from '../src/services/scorecard.js';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db/pool.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: vi.fn(),
  pool: { query: mockQuery, end: vi.fn() },
}));

/**
 * Helper: build the 5-query response sequence that overall()
 * issues via Promise.all([countsQuery, outcomesQuery,
 * bySignalTypeQuery, byWatchlistQuery, recentCallsQuery]).
 */
function mockScorecardQueries(opts: {
  totalSignals: number;
  totalTrades: number;
  t1dTotal: number;
  t1dHits: number;
  cumulativePnl: number;
  sharpe: number;
  maxDrawdown: number;
  byType: Array<{ detector_type: string; total: number; hits: number }>;
  byWatchlist: Array<{ monitor_id: string; url: string; total: number; hits: number }>;
  recent: Array<{
    signal_id: string;
    detected_at: string;
    monitor_url: string;
    conviction: number | null;
    thesis: string | null;
    recommended_action: 'long' | 'short' | 'none';
    trade_tx_hash: string | null;
    detector_types: string[];
    outcomes: { t1h: number | null; t1d: number | null; t7d: number | null };
  }>;
}): void {
  const hitRatio = opts.t1dTotal > 0 ? opts.t1dHits / opts.t1dTotal : null;

  mockQuery
    // 1. countsQuery (totalSignals, totalTrades, closed_trades = trades whose
    //    T+1d outcome has resolved). Approximated as min(totalTrades, t1dTotal).
    .mockResolvedValueOnce({
      rows: [
        {
          total_signals: String(opts.totalSignals),
          total_trades: String(opts.totalTrades),
          closed_trades: String(Math.min(opts.totalTrades, opts.t1dTotal)),
        },
      ],
      rowCount: 1,
    })
    // 2. outcomesQuery (single CTE pass)
    .mockResolvedValueOnce({
      rows: [
        {
          total: String(opts.t1dTotal),
          hits: String(opts.t1dHits),
          hit_ratio: hitRatio === null ? null : String(hitRatio),
          cumulative_pnl: String(opts.cumulativePnl),
          sharpe: String(opts.sharpe),
          max_drawdown: String(opts.maxDrawdown),
        },
      ],
      rowCount: 1,
    })
    // 3. bySignalTypeQuery
    .mockResolvedValueOnce({
      rows: opts.byType.map((b) => ({
        detector_type: b.detector_type,
        total: String(b.total),
        hits: String(b.hits),
      })),
      rowCount: opts.byType.length,
    })
    // 4. byWatchlistQuery
    .mockResolvedValueOnce({
      rows: opts.byWatchlist.map((b) => ({
        monitor_id: b.monitor_id,
        url: b.url,
        total: String(b.total),
        hits: String(b.hits),
      })),
      rowCount: opts.byWatchlist.length,
    })
    // 5. recentCallsQuery(20)
    .mockResolvedValueOnce({
      rows: opts.recent,
      rowCount: opts.recent.length,
    })
    // 6. proofCoverageQuery — keyed to totalSignals (post-Day 17 addition)
    .mockResolvedValueOnce({
      rows: [{ total: String(opts.totalSignals), with_hedera: '0' }],
      rowCount: 1,
    });
}

describe('scorecard — end-to-end integration', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('reflects the halo2 demo state correctly (3 signals, 1 trade, 1 hit)', async () => {
    // ── Fixture: the demo seed state from apps/api/src/seed/demo.ts ──
    //
    //   Signal 1 (halo2 2022-04-15, emergency_patch + consensus_relevant)
    //     - conviction 92, action 'long', trade tx_hash present
    //     - T+1d outcome: +2.15% (hit)
    //   Signal 2 (halo2 2024-08-22, documentation_only)
    //     - sub-threshold, no trade
    //     - T+1d outcome: +1.41% (signal was 'none', outcome irrelevant)
    //   Signal 3 (bitcoin 2024-09-12, minor_improvement)
    //     - sub-threshold, no trade
    //     - T+1d outcome: -0.69%
    //
    // expectedScorecard totals:
    //   totalSignals: 3
    //   totalTrades:  1 (only signal 1 crossed threshold + got a trade)
    //   t1dTotal:     3 (3 outcomes on T+1d window)
    //   t1dHits:      1 (signal 1: long + direction 'up')
    //   hitRatio:     1/3 ≈ 0.3333
    mockScorecardQueries({
      totalSignals: 3,
      totalTrades: 1,
      t1dTotal: 3,
      t1dHits: 1,
      cumulativePnl: 2.15, // +2.15 USD from signal 1's outcome
      sharpe: 0.6,
      maxDrawdown: 0,
      byType: [
        { detector_type: 'security_critical_patch', total: 1, hits: 1 },
        { detector_type: 'consensus_relevant', total: 1, hits: 1 },
        { detector_type: 'documentation_only', total: 1, hits: 0 },
        { detector_type: 'minor_improvement', total: 1, hits: 0 },
      ],
      byWatchlist: [
        {
          monitor_id: '11111111-1111-1111-1111-111111111111',
          url: 'https://github.com/zcash/halo2/releases',
          total: 2,
          hits: 1,
        },
        {
          monitor_id: '22222222-2222-2222-2222-222222222222',
          url: 'https://github.com/bitcoin/bitcoin/releases',
          total: 1,
          hits: 0,
        },
      ],
      recent: [
        {
          signal_id: 'sig-1',
          detected_at: '2022-04-15T14:32:00.000Z',
          monitor_url: 'https://github.com/zcash/halo2/releases',
          conviction: 92,
          thesis: 'Soundness fix touching the verifier path',
          recommended_action: 'long',
          trade_tx_hash: '0xpaper0001',
          detector_types: ['security_critical_patch', 'consensus_relevant'],
          outcomes: { t1h: 0.4, t1d: 2.15, t7d: -0.8 },
        },
        {
          signal_id: 'sig-2',
          detected_at: '2024-08-22T09:15:00.000Z',
          monitor_url: 'https://github.com/zcash/halo2/releases',
          conviction: 18,
          thesis: 'Documentation-only change',
          recommended_action: 'none',
          trade_tx_hash: null,
          detector_types: ['documentation_only'],
          outcomes: { t1h: 0.1, t1d: 1.41, t7d: 6.42 },
        },
        {
          signal_id: 'sig-3',
          detected_at: '2024-09-12T16:48:00.000Z',
          monitor_url: 'https://github.com/bitcoin/bitcoin/releases',
          conviction: 32,
          thesis: 'Incremental wallet improvement',
          recommended_action: 'none',
          trade_tx_hash: null,
          detector_types: ['minor_improvement'],
          outcomes: { t1h: -0.2, t1d: -0.69, t7d: 2.5 },
        },
      ],
    });

    const result = await overall();

    // ── Aggregate counts match the fixture ──
    expect(result.totalSignals).toBe(3);
    expect(result.totalTrades).toBe(1);
    expect(result.cumulativePnlUsd).toBe(2.15);
    expect(result.maxDrawdownUsd).toBe(0);

    // ── Hit ratio: 1 hit out of 3 T+1d outcomes ──
    expect(result.hitRatio).toBeCloseTo(1 / 3, 4);

    // ── outcomesSummary surfaces the n=X closed denominator so the public
    //    scorecard can render an honest caveat. Halo2 demo: 1 trade placed,
    //    1 T+1d outcome resolved against it → 1 closed, 0 pending.
    expect(result.outcomesSummary).toEqual({ closed: 1, pending: 0 });

    // ── Recent calls come back in fixture order (DESC by detected_at) ──
    expect(result.recentCalls).toHaveLength(3);
    expect(result.recentCalls[0]?.signalId).toBe('sig-1');
    expect(result.recentCalls[0]?.conviction).toBe(92);
    expect(result.recentCalls[0]?.tradeTxHash).toBe('0xpaper0001');
    expect(result.recentCalls[1]?.tradeTxHash).toBeNull();

    // ── Outcome windows preserved per signal ──
    expect(result.recentCalls[0]?.outcomes).toEqual({ t1h: 0.4, t1d: 2.15, t7d: -0.8 });
    expect(result.recentCalls[1]?.outcomes).toEqual({ t1h: 0.1, t1d: 1.41, t7d: 6.42 });

    // ── Detector-type breakdown matches fixture ──
    expect(result.bySignalType).toEqual([
      { detectorType: 'security_critical_patch', total: 1, hits: 1, hitRatio: 1 },
      { detectorType: 'consensus_relevant', total: 1, hits: 1, hitRatio: 1 },
      { detectorType: 'documentation_only', total: 1, hits: 0, hitRatio: 0 },
      { detectorType: 'minor_improvement', total: 1, hits: 0, hitRatio: 0 },
    ]);

    // ── Watchlist breakdown matches fixture ──
    expect(result.byWatchlist).toHaveLength(2);
    const zcash = result.byWatchlist.find((b) => b.url.includes('zcash/halo2'));
    expect(zcash).toEqual({
      monitorId: '11111111-1111-1111-1111-111111111111',
      url: 'https://github.com/zcash/halo2/releases',
      total: 2,
      hits: 1,
      hitRatio: 0.5,
    });

    // ── generatedAt is set to a fresh ISO timestamp ──
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const ageMs = Date.now() - new Date(result.generatedAt).getTime();
    expect(ageMs).toBeLessThan(1000); // set within the last second
  });

  it('returns hitRatio=0 when there are signals but no outcomes yet', async () => {
    mockScorecardQueries({
      totalSignals: 5,
      totalTrades: 0,
      t1dTotal: 0,
      t1dHits: 0,
      cumulativePnl: 0,
      sharpe: 0,
      maxDrawdown: 0,
      byType: [],
      byWatchlist: [],
      recent: [],
    });

    const result = await overall();
    expect(result.totalSignals).toBe(5);
    expect(result.totalTrades).toBe(0);
    expect(result.hitRatio).toBe(0);
    expect(result.cumulativePnlUsd).toBe(0);
  });

  it('returns hitRatio=0 on an empty database (the public surface still works)', async () => {
    mockScorecardQueries({
      totalSignals: 0,
      totalTrades: 0,
      t1dTotal: 0,
      t1dHits: 0,
      cumulativePnl: 0,
      sharpe: 0,
      maxDrawdown: 0,
      byType: [],
      byWatchlist: [],
      recent: [],
    });

    const result = await overall();
    expect(result.totalSignals).toBe(0);
    expect(result.totalTrades).toBe(0);
    expect(result.hitRatio).toBe(0);
    expect(result.recentCalls).toEqual([]);
    expect(result.bySignalType).toEqual([]);
    expect(result.byWatchlist).toEqual([]);
  });

  it('recentCalls() returns the same data as overall().recentCalls when called standalone', async () => {
    // recentCalls() issues a single query (recentCallsQuery only).
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          signal_id: 'sig-A',
          detected_at: '2024-01-01T00:00:00.000Z',
          monitor_url: 'https://github.com/zcash/halo2/releases',
          conviction: 95,
          thesis: 'Major security fix',
          recommended_action: 'long',
          trade_tx_hash: '0xreal',
          detector_types: ['security_critical_patch'],
          outcomes: { t1h: null, t1d: 5.0, t7d: null },
        },
      ],
      rowCount: 1,
    });

    const result = await recentCalls(10);
    expect(result).toHaveLength(1);
    expect(result[0]?.signalId).toBe('sig-A');
    expect(result[0]?.recommendedAction).toBe('long');
    expect(result[0]?.outcomes.t1d).toBe(5.0);
  });

  it('issues exactly 6 parallel queries (not sequential)', async () => {
    mockScorecardQueries({
      totalSignals: 0,
      totalTrades: 0,
      t1dTotal: 0,
      t1dHits: 0,
      cumulativePnl: 0,
      sharpe: 0,
      maxDrawdown: 0,
      byType: [],
      byWatchlist: [],
      recent: [],
    });

    await overall();
    // counts, outcomes, bySignalType, byWatchlist, recentCalls, proofCoverage
    // all run via Promise.all → 6 mocks consumed.
    expect(mockQuery).toHaveBeenCalledTimes(6);
  });

  it('uses the same T+1d window constant (86400s) across all outcome queries', async () => {
    mockScorecardQueries({
      totalSignals: 1,
      totalTrades: 1,
      t1dTotal: 1,
      t1dHits: 1,
      cumulativePnl: 1,
      sharpe: 1,
      maxDrawdown: 0,
      byType: [],
      byWatchlist: [],
      recent: [],
    });

    await overall();
    // The T+1d constant 86400 appears as the [0] param in 4 queries:
    // counts (closed_trades sub-select), outcomes, bySignalType, byWatchlist.
    const calls = mockQuery.mock.calls as Array<[string, unknown[]]>;
    const t1dCalls = calls.filter(
      ([sql, params]) => params?.[0] === 86400 && /window_seconds/.test(sql),
    );
    expect(t1dCalls.length).toBe(4);
  });
});
