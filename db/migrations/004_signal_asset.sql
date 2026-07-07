-- 004: per-signal asset override.
-- Narrative-synthesis signals live under the narrative:portfolio
-- monitor, whose asset_mapping has no coingeckoId (the dominant
-- asset varies per scan). Outcome attribution resolved the asset
-- from the MONITOR, so every narrative signal was permanently
-- stuck "pending" — 47 signals with no price outcomes. This column
-- lets the scan record the asset per signal; the outcome processor
-- prefers it over the monitor mapping.

ALTER TABLE signals ADD COLUMN IF NOT EXISTS asset TEXT;

-- Backfill existing narrative signals from their evidence text
-- ("Narrative synthesis · dominant asset ZCASH").
UPDATE signals s
   SET asset = lower(substring(s.evidence_text from 'dominant asset ([A-Z]+)'))
  FROM monitors m
 WHERE m.id = s.monitor_id
   AND m.url = 'narrative:portfolio'
   AND s.asset IS NULL
   AND s.evidence_text ~ 'dominant asset [A-Z]+';
