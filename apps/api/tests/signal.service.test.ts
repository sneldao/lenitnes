import { describe, it, expect, beforeAll, vi } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/lenitnes';

// Mock the pool with a tiny in-memory store shaped for the markSignalViewed CTE.
const signals: Record<
  string,
  {
    id: string;
    monitor_id: string;
    viewed_at: string | null;
    viewed_by: string | null;
    is_heartbeat: boolean;
  }
> = {};
const monitors: Record<
  string,
  { id: string; user_id: string; status: string; hbar_balance: string }
> = {};

vi.mock('../src/services/signature.js', () => ({
  verifyEd25519: () => true,
  verifyWalletSignature: () => true,
  isRecentAuthMessage: () => true,
}));

vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn(), end: vi.fn() },
  query: async (sql: string, params: unknown[]) => {
    // The CTE query in markSignalViewed: looks up signal, joins monitor,
    // updates signal, conditionally updates monitor status.
    if (sql.includes('WITH owned AS')) {
      const signalId = params[0] as string;
      const userId = params[1] as string;
      const sig = signals[signalId];
      if (!sig) return { rows: [], rowCount: 0 };
      const mon = monitors[sig.monitor_id];
      if (!mon || mon.user_id !== userId) return { rows: [], rowCount: 0 };

      const wasAlreadyViewed = sig.viewed_at !== null;
      if (!wasAlreadyViewed) {
        sig.viewed_at = new Date().toISOString();
        sig.viewed_by = userId;
      }
      let rearmed = false;
      if (mon.status === 'triggered' && Number(mon.hbar_balance) > 0) {
        mon.status = 'active';
        rearmed = true;
      }
      return {
        rows: [
          {
            signal_id: sig.id,
            monitor_id: sig.monitor_id,
            monitor_status: mon.status,
            monitor_balance: mon.hbar_balance,
            was_already_viewed: wasAlreadyViewed,
            rearmed,
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  },
}));

const { markSignalViewed } = await import('../src/services/domain/signal.service.js');

describe('markSignalViewed', () => {
  beforeAll(() => {
    monitors['mon-1'] = {
      id: 'mon-1',
      user_id: 'user-1',
      status: 'triggered',
      hbar_balance: '10',
    };
    signals['sig-1'] = {
      id: 'sig-1',
      monitor_id: 'mon-1',
      viewed_at: null,
      viewed_by: null,
      is_heartbeat: false,
    };
  });

  it('re-arms a triggered monitor with balance on first view', async () => {
    const res = await markSignalViewed('sig-1', 'user-1');
    expect(res).not.toBeNull();
    expect(res!.monitorRearmed).toBe(true);
    expect(res!.wasAlreadyViewed).toBe(false);
    expect(monitors['mon-1'].status).toBe('active');
    expect(signals['sig-1'].viewed_at).not.toBeNull();
  });

  it('is idempotent on second call', async () => {
    const res = await markSignalViewed('sig-1', 'user-1');
    expect(res).not.toBeNull();
    expect(res!.wasAlreadyViewed).toBe(true);
    // monitor status stays 'active' (no change, not a re-arm)
    expect(res!.monitorRearmed).toBe(false);
  });

  it('returns null for a signal the user does not own', async () => {
    const res = await markSignalViewed('sig-1', 'someone-else');
    expect(res).toBeNull();
  });

  it('returns null for a missing signal', async () => {
    const res = await markSignalViewed('does-not-exist', 'user-1');
    expect(res).toBeNull();
  });

  it('does NOT re-arm a triggered monitor with zero balance', async () => {
    // Reset state
    monitors['mon-1'].status = 'triggered';
    monitors['mon-1'].hbar_balance = '0';
    signals['sig-2'] = {
      id: 'sig-2',
      monitor_id: 'mon-1',
      viewed_at: null,
      viewed_by: null,
      is_heartbeat: false,
    };
    const res = await markSignalViewed('sig-2', 'user-1');
    expect(res).not.toBeNull();
    expect(res!.monitorRearmed).toBe(false);
    // The monitor stays 'triggered' because there's no balance to fund the
    // next check. The user has seen the signal but the monitor is dormant.
    expect(monitors['mon-1'].status).toBe('triggered');
  });
});
