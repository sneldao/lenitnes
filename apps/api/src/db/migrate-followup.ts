import { pool } from './pool.js';

/**
 * Idempotent follow-up migrations. Each statement is wrapped in
 * `IF NOT EXISTS` (where Postgres supports it) so re-running this
 * script is safe.
 *
 * New migrations should be added to the bottom of this file. They will
 * be applied in order on `npm run migrate --workspace=@lenitnes/api`.
 *
 * Note: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` requires Postgres
 * 9.6+, which is universally available on Supabase / Railway / Azure
 * PostgreSQL Flexible Server. If you target an older Postgres, write
 * the migration in a `DO $$ BEGIN ... EXCEPTION WHEN ...` block
 * instead.
 */
const MIGRATIONS: string[] = [
  // ── 0001: Add `viewed_at` + `viewed_by` to signals ──
  // Introduced so the dashboard can distinguish a fresh, unread signal
  // from an old one the user has already opened. The endpoint
  // `POST /signals/:id/viewed` populates these columns and re-arms
  // the parent monitor's `triggered` status to `active`.
  `ALTER TABLE signals
     ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS viewed_by UUID REFERENCES users(id) ON DELETE SET NULL`,

  // Index for the dashboard's "unviewed signal" lookup.
  `CREATE INDEX IF NOT EXISTS idx_signals_unviewed
     ON signals(monitor_id, detected_at DESC)
     WHERE is_heartbeat = false AND viewed_at IS NULL`,
];

async function migrate() {
  for (const sql of MIGRATIONS) {
    try {
      await pool.query(sql);
      // Show only the first line of each migration for readable logs.
      const summary = sql.replace(/\s+/g, ' ').slice(0, 80);
      console.log(`✓ ${summary}\u2026`);
    } catch (err) {
      console.error(`✗ Migration failed:\n  ${sql}\n  Reason:`, err);
      throw err;
    }
  }
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
