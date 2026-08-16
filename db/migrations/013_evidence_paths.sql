-- 013_evidence_paths.sql
--
-- P0 of the chained-analysis evolution (docs/ROADMAP.md → "The chain
-- evolution"). Makes the chain a first-class object: typed evidence
-- nodes, typed edges with provenance, the ordered path a call was
-- scored against, and the HCS path commitment.
--
-- The corpus is ~25 repos, so this is deliberately plain Postgres —
-- the value is in the annotation policy, not a graph DB. Additive and
-- idempotent: safe to re-run on every deploy.
--
-- Honesty invariant (see AGENT_ARCHITECTURE addendum 6): only edges
-- with provenance = 'auto' | 'curated' may feed a chain. Edges
-- discovered after the outcome are labeled 'retrospective' and are
-- excluded from calibration.

CREATE TABLE IF NOT EXISTS evidence_nodes (
  id           BIGSERIAL PRIMARY KEY,
  node_type    TEXT NOT NULL CHECK (node_type IN
                 ('commit', 'advisory', 'pr', 'release', 'paper', 'macro', 'signal')),
  source_repo  TEXT,                 -- owner/repo (signal + commit nodes)
  source_ref   TEXT,                 -- signal id / commit sha / advisory id / doi
  source_url   TEXT,
  detected_at  TIMESTAMPTZ NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A node's identity is (node_type, source_repo, source_ref) when it
-- has a ref; partial so NULL refs (rare) never collide.
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
  path_hash    TEXT NOT NULL,        -- sha256 over canonical node+edge list
  node_ids     BIGINT[] NOT NULL DEFAULT '{}',  -- ordered path
  edge_ids     BIGINT[] NOT NULL DEFAULT '{}',
  assembled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signal_id)
);

CREATE TABLE IF NOT EXISTS path_commitments (
  id           BIGSERIAL PRIMARY KEY,
  signal_id    UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  path_hash    TEXT NOT NULL,
  hedera_tx_id TEXT,                  -- filled when the hash rides the HCS dispatch
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signal_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_nodes_detected ON evidence_nodes(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_links_from ON evidence_links(from_node_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_to ON evidence_links(to_node_id);
CREATE INDEX IF NOT EXISTS idx_signal_paths_signal ON signal_paths(signal_id);
CREATE INDEX IF NOT EXISTS idx_path_commitments_signal ON path_commitments(signal_id);
