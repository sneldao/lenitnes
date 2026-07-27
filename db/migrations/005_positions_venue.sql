-- 005: Dedicated venue column on positions.
-- Replaces the fragile entry_tx_hash prefix convention so the book
-- discipline and close logic can filter by venue instead of parsing
-- transaction hashes.

-- 1. Add the column with a safe default so concurrent inserts
--    during rollout don't block the NOT NULL step.
ALTER TABLE positions ADD COLUMN IF NOT EXISTS venue TEXT DEFAULT 'spot';

-- 2. Backfill legacy rows using the old prefix rules.
UPDATE positions SET venue = 'propr' WHERE entry_tx_hash LIKE '0xpropr:%';
UPDATE positions SET venue = 'paper' WHERE entry_tx_hash LIKE '0xpap%';

-- 3. Ensure every row has a venue (fallback for any unmapped hashes).
UPDATE positions SET venue = 'spot' WHERE venue IS NULL;

-- 4. Enforce integrity and remove the temporary default now that
--    the application layer writes the value explicitly.
ALTER TABLE positions ALTER COLUMN venue SET NOT NULL;
ALTER TABLE positions ALTER COLUMN venue DROP DEFAULT;

-- 5. Index the new column because it participates in the hot-path
--    duplicate-position check.
CREATE INDEX IF NOT EXISTS idx_positions_venue_asset_status
  ON positions (venue, asset, status);
