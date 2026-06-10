import { query } from './pool.js';

const EXPECTED_TABLES = [
  'users',
  'monitors',
  'signals',
  'rules',
  'orders',
  'audit_logs',
  'waitlist',
];

export async function validateSchema(): Promise<{ ok: boolean; missing: string[] }> {
  const { rows } = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const existing = new Set(rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !existing.has(t));
  return { ok: missing.length === 0, missing };
}
