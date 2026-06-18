import { query } from './pool.js';

// Day 2 pivot dropped users / rules / waitlist / signal_comments /
// webhook_deliveries / audit_logs. New table agent_scores added
// (see db/migrations/003_pivot.sql). Day 11: treasury_wallets is
// also expected (db/seed/treasury_wallets.sql).
const EXPECTED_TABLES = [
  'monitors',
  'signals',
  'orders',
  'signal_classifications',
  'signal_outcomes',
  'detector_backtest_stats',
  'agent_scores',
  'treasury_wallets',
];

export async function validateSchema(): Promise<{ ok: boolean; missing: string[] }> {
  const { rows } = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const existing = new Set(rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !existing.has(t));
  return { ok: missing.length === 0, missing };
}
