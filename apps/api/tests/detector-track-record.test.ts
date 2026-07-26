import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db/pool.js', () => ({ query: mockQuery }));

const {
  isChronicallyLosing,
  anyDetectorChronicallyLosing,
  buildDetectorTrackRecordContext,
  MIN_MATURED_FOR_HARD_FLOOR,
  CHRONIC_LOSS_WIN_RATE,
  _internalResetTrackRecordCache,
} = await import('../src/services/agent/detector-track-record.js');
import type { DetectorTrackRecord } from '../src/services/agent/detector-track-record.js';

function record(overrides: Partial<DetectorTrackRecord> = {}): DetectorTrackRecord {
  return {
    detectorType: 'security_critical_patch',
    totalSignals: 20,
    maturedT1d: 15,
    hitsT1d: 11,
    winRate: 11 / 15,
    avgDirectionalPct1d: 1.4,
    avgConviction: 74,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _internalResetTrackRecordCache();
});

describe('isChronicallyLosing', () => {
  it('flags a detector with enough history and a low win rate', () => {
    const r = record({ maturedT1d: 20, hitsT1d: 6, winRate: 6 / 20 });
    expect(r.winRate!).toBeLessThan(CHRONIC_LOSS_WIN_RATE);
    expect(isChronicallyLosing(r)).toBe(true);
  });

  it('does not flag a detector with a healthy win rate', () => {
    expect(isChronicallyLosing(record({ maturedT1d: 20, hitsT1d: 14, winRate: 0.7 }))).toBe(false);
  });

  it('does not flag thin history, even at 0% wins', () => {
    const r = record({ maturedT1d: 3, hitsT1d: 0, winRate: 0 });
    expect(r.maturedT1d).toBeLessThan(MIN_MATURED_FOR_HARD_FLOOR);
    expect(isChronicallyLosing(r)).toBe(false);
  });

  it('does not flag missing history (no matured outcomes)', () => {
    expect(isChronicallyLosing(record({ maturedT1d: 0, hitsT1d: 0, winRate: null }))).toBe(false);
  });

  it('does not flag an undefined record', () => {
    expect(isChronicallyLosing(undefined)).toBe(false);
  });
});

describe('anyDetectorChronicallyLosing', () => {
  it('returns losing=true when a fired detector is chronically losing', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          detector_type: 'news_signal',
          total_signals: '30',
          matured_t1d: '25',
          hits_t1d: '7',
          avg_dir_1d: '-0.8',
          avg_conviction: '60',
        },
      ],
    });

    const result = await anyDetectorChronicallyLosing(['news_signal', 'emergency_patch']);
    expect(result.losing).toBe(true);
    expect(result.losingDetectors).toContain('news_signal');
    expect(result.losingDetectors).not.toContain('emergency_patch');
  });

  it('returns losing=false when none are chronically losing', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          detector_type: 'emergency_patch',
          total_signals: '20',
          matured_t1d: '18',
          hits_t1d: '14',
          avg_dir_1d: '2.1',
          avg_conviction: '80',
        },
      ],
    });

    const result = await anyDetectorChronicallyLosing(['emergency_patch']);
    expect(result.losing).toBe(false);
    expect(result.losingDetectors).toHaveLength(0);
  });

  it('short-circuits on an empty detector list', async () => {
    const result = await anyDetectorChronicallyLosing([]);
    expect(result.losing).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('buildDetectorTrackRecordContext', () => {
  it('renders a chronically-losing detector with a discount flag', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          detector_type: 'governance_shift',
          total_signals: '20',
          matured_t1d: '20',
          hits_t1d: '5',
          avg_dir_1d: '-1.2',
          avg_conviction: '55',
        },
      ],
    });

    const ctx = await buildDetectorTrackRecordContext(['governance_shift']);
    expect(ctx).toContain('governance_shift');
    expect(ctx).toContain('25%');
    expect(ctx).toContain('chronically losing');
  });

  it('reports unproven when there is no matured history', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const ctx = await buildDetectorTrackRecordContext(['brand_new_detector']);
    expect(ctx).toContain('unproven');
  });

  it('returns empty string for an empty detector list', async () => {
    const ctx = await buildDetectorTrackRecordContext([]);
    expect(ctx).toBe('');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
