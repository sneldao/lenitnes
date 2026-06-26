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

  // ── 0003: Pivot to zero-headcount operator (Day 2) ──
  // Full SQL lives at db/migrations/003_pivot.sql. Inlined here
  // because the runner reads a hardcoded array (see apps/api/src/db/migrate.ts).
  //
  // Drops user-owned tables, drops user_id / hbar_balance / cost_per_check /
  // escrow_account_id from monitors, nullifies orders.rule_id FK, adds
  // agent_scores + treasury_wallets. Idempotent — safe to re-run.
  `
  DROP TABLE IF EXISTS webhook_deliveries CASCADE;
  DROP TABLE IF EXISTS signal_comments CASCADE;
  DROP TABLE IF EXISTS rules CASCADE;
  DROP TABLE IF EXISTS waitlist CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
  ALTER TABLE signals DROP COLUMN IF EXISTS viewed_at;
  ALTER TABLE signals DROP COLUMN IF EXISTS viewed_by;
  ALTER TABLE audit_logs DROP COLUMN IF EXISTS user_id;
  ALTER TABLE monitors DROP COLUMN IF EXISTS user_id CASCADE;
  ALTER TABLE monitors DROP COLUMN IF EXISTS hbar_balance;
  ALTER TABLE monitors DROP COLUMN IF EXISTS cost_per_check;
  ALTER TABLE monitors DROP COLUMN IF EXISTS escrow_account_id;
  DROP INDEX IF EXISTS idx_monitors_user_id;
  DROP INDEX IF EXISTS idx_audit_logs_user_id;
  DROP INDEX IF EXISTS idx_signals_unviewed;
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_rule_id_fkey;
  ALTER TABLE orders ALTER COLUMN rule_id DROP NOT NULL;
  CREATE TABLE IF NOT EXISTS agent_scores (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id            UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    rubric_version       TEXT NOT NULL,
    conviction           INTEGER NOT NULL CHECK (conviction BETWEEN 0 AND 100),
    thesis               TEXT NOT NULL,
    recommended_action   TEXT NOT NULL CHECK (recommended_action IN ('long', 'short', 'none')),
    confidence_band      TEXT NOT NULL CHECK (confidence_band IN ('low', 'mid', 'high')),
    raw_response         JSONB NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_agent_scores_signal ON agent_scores(signal_id);
  CREATE INDEX IF NOT EXISTS idx_agent_scores_conviction ON agent_scores(conviction DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_scores_created_at ON agent_scores(created_at DESC);
  CREATE TABLE IF NOT EXISTS treasury_wallets (
    chain      TEXT PRIMARY KEY,
    address    TEXT NOT NULL,
    label      TEXT,
    is_active  BOOLEAN NOT NULL DEFAULT true
  );
  `,

  // ── 0004: Agent rubric v2 — Hedera-aware fields ──
  // The agent now produces a tamper-evident dispatch (its own
  // first-person words, anchored on HCS) and a proof_action
  // (whether to create a dedicated topic for the highest-
  // conviction calls). Older rows keep hcs_dispatch=NULL and
  // proof_action='standard' — the application code handles
  // both shapes.
  //
  // The signals table gains hedera_dedicated_topic_id for when
  // the agent's proof_action is 'dedicated_topic' — stores the
  // newly-created topic ID so the signal page can link to it
  // alongside the main HCS message.
  `
  ALTER TABLE agent_scores
    ADD COLUMN IF NOT EXISTS hcs_dispatch TEXT,
    ADD COLUMN IF NOT EXISTS proof_action TEXT NOT NULL DEFAULT 'standard';
  ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS hedera_dedicated_topic_id TEXT;
  `,
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
