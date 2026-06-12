import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
process.env.JWT_SECRET ??= 'test-jwt-secret-must-be-long-enough';
process.env.WEBHOOK_SECRET ??= 'test-webhook-secret';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.MAX_OPEN_ORDERS ??= '1';

const insertedOrders: Array<{ signalId: string; userId: string; pair: string }> = [];
const userLocks = new Map<string, Promise<void>>();

async function acquireUserLock(userId: string): Promise<() => void> {
  while (userLocks.has(userId)) {
    await userLocks.get(userId);
  }
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  userLocks.set(userId, gate);
  return () => {
    userLocks.delete(userId);
    release();
  };
}

vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn(), end: vi.fn() },
  query: vi.fn(async (sql: string, params: unknown[]) => {
    if (sql === 'SELECT 1') return { rows: [], rowCount: 0 };
    if (sql.includes('kraken_api_key_encrypted')) {
      return { rows: [{ k: null, s: null }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => {
    let lockedUserId: string | null = null;
    const client = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.includes('FOR UPDATE')) {
          const userId = params[0] as string;
          const release = await acquireUserLock(userId);
          lockedUserId = userId;
          (client as { _release?: () => void })._release = release;
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("o.order_params->>'pair'")) {
          const userId = params[0] as string;
          const pair = params[1] as string;
          const match = insertedOrders.find((o) => o.userId === userId && o.pair === pair);
          return { rows: match ? [{ id: 'existing' }] : [], rowCount: match ? 1 : 0 };
        }
        if (sql.includes('count(*)')) {
          const userId = params[0] as string;
          const count = insertedOrders.filter((o) => o.userId === userId).length;
          return { rows: [{ count: String(count) }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO orders')) {
          const signalId = params[0] as string;
          const orderParams = JSON.parse(params[2] as string);
          insertedOrders.push({ signalId, userId: lockedUserId!, pair: orderParams.pair });
          return { rows: [{ id: `order-${insertedOrders.length}` }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    try {
      return await fn(client);
    } finally {
      (client as { _release?: () => void })._release?.();
    }
  }),
}));

vi.mock('../src/services/kraken.js', () => ({
  paperAddOrder: vi.fn(async () => ({ krakenOrderId: 'paper-123', raw: {} })),
  addOrder: vi.fn(),
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/services/tinyfish.js', () => ({ detect: vi.fn() }));
vi.mock('../src/services/scraper.js', () => ({ scrape: vi.fn() }));
vi.mock('../src/services/ipfs.js', () => ({ pinJSON: vi.fn() }));
vi.mock('../src/services/notify.js', () => ({ sendNotifications: vi.fn() }));
vi.mock('../src/services/circuit.js', () => ({
  isCircuitOpen: () => false,
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));
vi.mock('../src/services/proof.js', () => ({
  getProofService: () => ({
    submitHeartbeat: vi.fn(),
    submitSignal: vi.fn(),
  }),
}));

const { executeTrade } = await import('../src/execution/loop.js');

const baseMonitor = {
  id: 'mon-1',
  user_id: 'user-1',
  url: 'https://example.com',
  condition: 'test',
  frequency_seconds: 300,
  status: 'active' as const,
  hbar_balance: 10,
  created_at: new Date().toISOString(),
};

const baseRule = {
  id: 'rule-1',
  monitor_id: 'mon-1',
  action_type: 'trade' as const,
  action_config: {
    pair: 'XBTEUR',
    type: 'buy',
    ordertype: 'market',
    volume: '0.001',
    validate: true,
  },
  conditions: {},
  created_at: new Date().toISOString(),
};

describe('executeTrade concurrency guards', () => {
  beforeEach(() => {
    insertedOrders.length = 0;
    userLocks.clear();
    vi.clearAllMocks();
  });

  it('serializes concurrent trades — only one passes when max-open=1', async () => {
    await Promise.allSettled([
      executeTrade(baseMonitor, baseRule, 'sig-1'),
      executeTrade(baseMonitor, baseRule, 'sig-2'),
    ]);

    expect(insertedOrders).toHaveLength(1);
  });

  it('allows concurrent trades for different users', async () => {
    const monitor2 = { ...baseMonitor, id: 'mon-2', user_id: 'user-2' };
    insertedOrders.length = 0;

    await Promise.allSettled([
      executeTrade(baseMonitor, baseRule, 'sig-1'),
      executeTrade(monitor2, baseRule, 'sig-2'),
    ]);

    const user1Orders = insertedOrders.filter((o) => o.userId === 'user-1').length;
    const user2Orders = insertedOrders.filter((o) => o.userId === 'user-2').length;
    expect(user1Orders).toBe(1);
    expect(user2Orders).toBe(1);
  });
});
