-- ─────────────────────────────────────────────────────────────
-- 008: multi-vertical support (re:AGENT / LENITNES[science] pivot).
--
-- monitors.domain tags which vertical a monitor belongs to:
--   'code' — the original crypto consensus-repo sentinel (default,
--            keeps every existing row behaving exactly as before)
--   'science' — scientific-software integrity sentinel (re:AGENT build)
-- The UI, scorecard, replay and Telegram surfaces all derive their
-- badge/labels from this single column.
--
-- Science outcomes are discrete, dated events in the scientific record
-- (retraction / correction / disclosure / release) instead of price
-- moves, so signal_outcomes grows event columns next to the price
-- ones. Price columns stay NULL for science rows; event columns stay
-- NULL for code rows. Same table, same scorecard join, one more
-- dimension of ground truth.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE monitors ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'code';
ALTER TABLE monitors DROP CONSTRAINT IF EXISTS monitors_domain_check;
ALTER TABLE monitors ADD CONSTRAINT monitors_domain_check
    CHECK (domain IN ('code', 'science'));

ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_kind   TEXT;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_at     TIMESTAMPTZ;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_source TEXT;
-- Days between the committed alert (signals.detected_at) and the
-- confirmed event. Positive lead time = the agent called it early,
-- which is the whole point of the sentinel.
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS lead_days    INTEGER;

CREATE INDEX IF NOT EXISTS idx_monitors_domain ON monitors(domain);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_event
    ON signal_outcomes(event_kind, event_at)
    WHERE event_kind IS NOT NULL;
