-- ─────────────────────────────────────────────────────────────
-- 0003: Pivot to zero-headcount operator (Day 2)
-- Drops every user-owned surface; nullifies rules references; adds
-- agent_scores and treasury_wallets for the autonomous-agent model.
-- See docs/AGENT_ARCHITECTURE.md and docs/HACKATHON_CUT.md.
-- ─────────────────────────────────────────────────────────────

-- 1. Drop user-owned tables (CASCADE handles FKs into them).
DROP TABLE IF EXISTS webhook_deliveries CASCADE;
DROP TABLE IF EXISTS signal_comments CASCADE;
DROP TABLE IF EXISTS rules CASCADE;
DROP TABLE IF EXISTS waitlist CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. Drop columns that referenced the user model.
ALTER TABLE signals DROP COLUMN IF EXISTS viewed_at;
ALTER TABLE signals DROP COLUMN IF EXISTS viewed_by;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS user_id;

-- 3. Drop per-monitor billing columns. After the pivot, the agent
--    is the operator — no escrow, no per-check cost, no user_id binding.
ALTER TABLE monitors DROP COLUMN IF EXISTS user_id CASCADE;
ALTER TABLE monitors DROP COLUMN IF EXISTS hbar_balance;
ALTER TABLE monitors DROP COLUMN IF EXISTS cost_per_check;
ALTER TABLE monitors DROP COLUMN IF EXISTS escrow_account_id;

-- 4. Drop indexes that referenced the dropped columns.
DROP INDEX IF EXISTS idx_monitors_user_id;
DROP INDEX IF EXISTS idx_audit_logs_user_id;
DROP INDEX IF EXISTS idx_signals_unviewed;

-- 5. Nullify orders.rule_id FK. The rules table is gone; old order
--    rows are orphaned. Keep the column for backtest history; drop
--    the FK constraint and the NOT NULL so the column can be null.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_rule_id_fkey;
ALTER TABLE orders ALTER COLUMN rule_id DROP NOT NULL;

-- 6. agent_scores — every score the agent has returned, persisted
--    regardless of conviction_threshold. Sub-threshold scores form
--    the "agent reasoning archive" (public surface, future).
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

-- 7. treasury_wallets — system wallets, one per chain. Populated
--    once via seed (db/seed/treasury_wallets.sql), not via API.
CREATE TABLE IF NOT EXISTS treasury_wallets (
  chain      TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  label      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true
);
