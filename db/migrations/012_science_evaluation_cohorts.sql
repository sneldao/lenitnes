-- 012_science_evaluation_cohorts.sql
--
-- Carries the 0011 follow-up migration (apps/api/src/db/migrate-followup.ts)
-- into the deploy-applied SQL set. That entry previously existed only in the
-- manual TS runner, so boxes upgraded incrementally never received
-- signals.evaluation_mode and the science scorecard 500'd on
-- "column s.evaluation_mode does not exist".
--
-- Retrospective replays must never inflate the prospective live record.
-- An event only counts toward precision after explicit adjudication.
-- Idempotent: safe to re-run on every deploy.

ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS evaluation_mode TEXT NOT NULL DEFAULT 'live';
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_evaluation_mode_check;
ALTER TABLE signals ADD CONSTRAINT signals_evaluation_mode_check
  CHECK (evaluation_mode IN ('live', 'replay'));

ALTER TABLE signal_outcomes
  ADD COLUMN IF NOT EXISTS event_source_url TEXT,
  ADD COLUMN IF NOT EXISTS event_match_status TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE signal_outcomes DROP CONSTRAINT IF EXISTS signal_outcomes_event_match_status_check;
ALTER TABLE signal_outcomes ADD CONSTRAINT signal_outcomes_event_match_status_check
  CHECK (event_match_status IN ('unreviewed', 'candidate', 'confirmed', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_signals_evaluation_mode ON signals(evaluation_mode);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_match_status
  ON signal_outcomes(event_match_status) WHERE event_kind IS NOT NULL;