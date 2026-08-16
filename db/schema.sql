-- ─────────────────────────────────────────────────────────────
-- LENITNES — PostgreSQL schema
-- Run against your Supabase / Railway database.
--
-- Schema evolution policy: this file uses `CREATE TABLE IF NOT EXISTS`
-- and `CREATE INDEX IF NOT EXISTS`, so re-running it is safe. New
-- columns should be added with `ALTER TABLE ... ADD COLUMN IF NOT
-- EXISTS` (a Postgres 9.6+ feature) and paired with a follow-up
-- migration in `apps/api/src/db/migrate.ts`. The `viewed_at` +
-- `viewed_by` columns on `signals` were added this way — re-running
-- the file is still safe because both use `IF NOT EXISTS` guards.
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address              TEXT UNIQUE NOT NULL,
  email                       TEXT,
  display_name                TEXT,
  kraken_api_key_encrypted    TEXT,
  kraken_api_secret_encrypted TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Monitors ----------------------------------------------------
-- status: active | paused | triggered | insufficient_balance
CREATE TABLE IF NOT EXISTS monitors (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url                    TEXT NOT NULL,
  condition_text         TEXT NOT NULL,
  frequency_seconds      INTEGER NOT NULL DEFAULT 86400,
  escrow_account_id      TEXT,
  hbar_balance           NUMERIC(20, 8) NOT NULL DEFAULT 0,
  cost_per_check         NUMERIC(20, 8) NOT NULL DEFAULT 0.5,
  screenshots_enabled    BOOLEAN NOT NULL DEFAULT true,
  is_public              BOOLEAN NOT NULL DEFAULT true,
  status                 TEXT NOT NULL DEFAULT 'active',
  confidence_threshold   INTEGER NOT NULL DEFAULT 50,
  last_check_at          TIMESTAMPTZ,
  last_seen_commit_hash  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  is_heartbeat           BOOLEAN NOT NULL DEFAULT false,
  -- Per-signal asset override (coingeckoId). Set by the narrative
  -- scan, whose monitor row has no fixed asset — the dominant asset
  -- varies per synthesis. Outcome attribution prefers this over the
  -- monitor's asset_mapping.
  asset                  TEXT,
  -- Set when the owning user opens the signal detail page. Used by the
  -- dashboard to distinguish a fresh, unread signal from an old one the
  -- user has already seen. NULL = unviewed.
  viewed_at              TIMESTAMPTZ,
  viewed_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  search_results         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- live = prospective production signal; replay = retrospective evaluation
  evaluation_mode        TEXT NOT NULL DEFAULT 'live'
    CHECK (evaluation_mode IN ('live', 'replay'))
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

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Waitlist ----------------------------------------------------
CREATE TABLE IF NOT EXISTS waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  source     TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);

-- Signal Classifications ──────────────────────────────────────
-- Structured classifications from the detector pipeline.
-- One row per (signal, detector_type). Multiple detectors can fire
-- on the same signal (e.g. emergency_patch + security_critical).
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS asset_mapping JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS search_results JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS chain TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS chain_tx_hash TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS arb_tx_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Signal Comments ────────────────────────────────────────────
-- User-attached notes on signals for collaboration and context.
CREATE TABLE IF NOT EXISTS signal_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_comments_signal ON signal_comments(signal_id, created_at);

-- Webhook Deliveries ─────────────────────────────────────────
-- Log of every webhook rule execution with status and timing.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         UUID NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  signal_id       UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  status_code     INTEGER,
  duration_ms     INTEGER,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_rule ON webhook_deliveries(rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);

CREATE TABLE IF NOT EXISTS signal_classifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  detector_type   TEXT NOT NULL,
  score           INTEGER NOT NULL DEFAULT 0,
  confidence      INTEGER NOT NULL DEFAULT 0,
  label           TEXT NOT NULL DEFAULT '',
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_class_signal_id ON signal_classifications(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_class_type ON signal_classifications(detector_type);

-- Signal Outcomes ─────────────────────────────────────────────
-- Price outcome per signal per time window, filled by the backtest
-- engine after fetching historical price data.
CREATE TABLE IF NOT EXISTS signal_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  asset           TEXT NOT NULL,
  window_seconds  INTEGER NOT NULL,
  price_at_signal NUMERIC(20, 8),
  price_after     NUMERIC(20, 8),
  pct_change      NUMERIC(10, 4),
  direction       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(signal_id, asset, window_seconds)
);

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_signal ON signal_outcomes(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_asset ON signal_outcomes(asset, created_at DESC);

-- Detector Backtest Stats ────────────────────────────────────
-- Aggregated backtest results per detector type + asset.
-- Refreshed by the backtest engine after processing new outcomes.
CREATE TABLE IF NOT EXISTS detector_backtest_stats (
  detector_type     TEXT NOT NULL,
  asset             TEXT NOT NULL,
  total_signals     INTEGER NOT NULL DEFAULT 0,
  correct_count     INTEGER NOT NULL DEFAULT 0,
  accuracy          NUMERIC(5, 2),
  avg_pct_change    NUMERIC(10, 4),
  median_pct_change NUMERIC(10, 4),
  avg_abs_return    NUMERIC(10, 4),
  sharpe_estimate   NUMERIC(8, 4),
  best_window       INTEGER,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(detector_type, asset)
);

-- Failed Proofs ───────────────────────────────────────
-- Dead-letter queue for failed on-chain proof recordings.
-- A periodic retry job (or manual replay) picks these up with
-- exponential backoff. Keeps the database and chain in sync.
CREATE TABLE IF NOT EXISTS failed_proofs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id    UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  chain        TEXT NOT NULL,
  error        TEXT,
  attempt      INTEGER NOT NULL DEFAULT 1,
  next_retry   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_failed_proofs_pending
  ON failed_proofs(next_retry) WHERE resolved_at IS NULL;

-- Multi-vertical support (re:AGENT pivot, migration 008) ──────
-- monitors.domain: 'code' (crypto sentinel, default) | 'science'
-- (scientific-software integrity sentinel). `bio` was the internal
-- prototype label; migration 011 canonicalizes existing rows.
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'code';
ALTER TABLE monitors DROP CONSTRAINT IF EXISTS monitors_domain_check;
UPDATE monitors SET domain = 'science' WHERE domain = 'bio';
ALTER TABLE monitors ADD CONSTRAINT monitors_domain_check
    CHECK (domain IN ('code', 'science'));

-- Science outcomes are discrete, dated events in the scientific record
-- (retraction / correction / disclosure / release) instead of price
-- moves. Price columns stay NULL for science rows; event columns stay
-- NULL for code rows.
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_kind   TEXT;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_at     TIMESTAMPTZ;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_source TEXT;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS lead_days    INTEGER;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_source_url TEXT;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_match_status TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE signal_outcomes DROP CONSTRAINT IF EXISTS signal_outcomes_event_match_status_check;
ALTER TABLE signal_outcomes ADD CONSTRAINT signal_outcomes_event_match_status_check
    CHECK (event_match_status IN ('unreviewed', 'candidate', 'confirmed', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_monitors_domain ON monitors(domain);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_event
    ON signal_outcomes(event_kind, event_at)
    WHERE event_kind IS NOT NULL;

-- Evidence paths (P0 of chained analysis — mirrors migration 013) --
CREATE TABLE IF NOT EXISTS evidence_nodes (
  id           BIGSERIAL PRIMARY KEY,
  node_type    TEXT NOT NULL CHECK (node_type IN
                 ('commit', 'advisory', 'pr', 'release', 'paper', 'macro', 'signal')),
  source_repo  TEXT,
  source_ref   TEXT,
  source_url   TEXT,
  detected_at  TIMESTAMPTZ NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_nodes_identity
  ON evidence_nodes(node_type, source_repo, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS evidence_links (
  id            BIGSERIAL PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN
                  ('same_sha', 'backport', 'releases_fix', 'corroborates',
                   'contradicts', 'same_root', 'supersedes',
                   'paper_depends_on', 'mechanism_shared', 'sector_upstream')),
  from_node_id  BIGINT NOT NULL REFERENCES evidence_nodes(id) ON DELETE CASCADE,
  to_node_id    BIGINT NOT NULL REFERENCES evidence_nodes(id) ON DELETE CASCADE,
  provenance    TEXT NOT NULL DEFAULT 'auto'
                  CHECK (provenance IN ('auto', 'curated', 'retrospective')),
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (from_node_id, to_node_id, kind)
);

CREATE TABLE IF NOT EXISTS signal_paths (
  id           BIGSERIAL PRIMARY KEY,
  signal_id    UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  path_hash    TEXT NOT NULL,
  node_ids     BIGINT[] NOT NULL DEFAULT '{}',
  edge_ids     BIGINT[] NOT NULL DEFAULT '{}',
  assembled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signal_id)
);

CREATE TABLE IF NOT EXISTS path_commitments (
  id           BIGSERIAL PRIMARY KEY,
  signal_id    UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  path_hash    TEXT NOT NULL,
  hedera_tx_id TEXT,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signal_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_nodes_detected ON evidence_nodes(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_links_from ON evidence_links(from_node_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_to ON evidence_links(to_node_id);
CREATE INDEX IF NOT EXISTS idx_signal_paths_signal ON signal_paths(signal_id);
CREATE INDEX IF NOT EXISTS idx_path_commitments_signal ON path_commitments(signal_id);
