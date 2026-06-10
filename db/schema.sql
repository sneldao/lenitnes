-- ─────────────────────────────────────────────────────────────
-- LENITNES — PostgreSQL schema
-- Run against your Supabase / Railway database.
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address              TEXT UNIQUE NOT NULL,
  email                       TEXT,
  kraken_api_key_encrypted    TEXT,
  kraken_api_secret_encrypted TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Monitors ----------------------------------------------------
-- status: active | paused | triggered | insufficient_balance
CREATE TABLE IF NOT EXISTS monitors (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url                    TEXT NOT NULL,
  condition_text         TEXT NOT NULL,
  frequency_seconds      INTEGER NOT NULL DEFAULT 86400,
  escrow_account_id      TEXT,
  hbar_balance           NUMERIC(20, 8) NOT NULL DEFAULT 0,
  cost_per_check         NUMERIC(20, 8) NOT NULL DEFAULT 0.5,
  screenshots_enabled    BOOLEAN NOT NULL DEFAULT true,
  is_public              BOOLEAN NOT NULL DEFAULT true,
  status                 TEXT NOT NULL DEFAULT 'active',
  last_check_at          TIMESTAMPTZ,
  last_seen_commit_hash  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitors_user_id ON monitors(user_id);
CREATE INDEX IF NOT EXISTS idx_monitors_status  ON monitors(status);
-- Partial index for the worker's due-check query (only active monitors).
CREATE INDEX IF NOT EXISTS idx_monitors_due ON monitors(last_check_at) WHERE status = 'active';

-- Signals -----------------------------------------------------
CREATE TABLE IF NOT EXISTS signals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id             UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  detected_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  hedera_tx_id           TEXT,
  hedera_hcs_message_id  TEXT,
  tinyfish_run_id        TEXT,
  ipfs_cid               TEXT,
  evidence_text          TEXT,
  screenshot_urls        JSONB NOT NULL DEFAULT '[]'::jsonb,
  condition_summary      TEXT,
  is_heartbeat           BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_signals_monitor_id  ON signals(monitor_id);
CREATE INDEX IF NOT EXISTS idx_signals_detected_at ON signals(detected_at DESC);

-- Rules -------------------------------------------------------
-- action_type: trade | webhook | email | telegram
CREATE TABLE IF NOT EXISTS rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id    UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  action_type   TEXT NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditions    JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_monitor_id ON rules(monitor_id);

-- Orders ------------------------------------------------------
-- status: pending | placed | filled | partially_filled | cancelled | failed | expired
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  rule_id         UUID REFERENCES rules(id) ON DELETE SET NULL,
  kraken_order_id TEXT,
  order_params    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',
  placed_at       TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  kraken_response JSONB
);

CREATE INDEX IF NOT EXISTS idx_orders_signal_id ON orders(signal_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status) WHERE status = 'placed';

-- Audit logs --------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  wallet_address TEXT,
  method       TEXT NOT NULL,
  path         TEXT NOT NULL,
  action       TEXT NOT NULL,
  resource_type TEXT,
  resource_id  TEXT,
  meta         JSONB,
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Waitlist ----------------------------------------------------
CREATE TABLE IF NOT EXISTS waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  source     TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
