-- 009_agent_scores_science.sql
--
-- LENITNES[science] — widen the agent action space and persist literature.
-- Rubric v6 emits 'alert' / 'investigate' (integrity actions) instead of
-- trade sides, and cites corroborating literature rows. Both are stored on
-- agent_scores.
--
-- Applied by apps/api/src/db/migrate-followup.ts (entry 0009).

ALTER TABLE agent_scores
  DROP CONSTRAINT IF EXISTS agent_scores_recommended_action_check;
ALTER TABLE agent_scores
  ADD CONSTRAINT agent_scores_recommended_action_check
  CHECK (recommended_action IN ('long', 'short', 'none', 'alert', 'investigate'));
ALTER TABLE agent_scores ADD COLUMN IF NOT EXISTS literature JSONB;
