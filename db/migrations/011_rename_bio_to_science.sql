-- 011: rename the public scientific-software vertical from bio to science.
-- Existing rows are migrated in place; API query handlers continue to
-- accept domain=bio as a compatibility alias for old bookmarks.

BEGIN;

ALTER TABLE monitors DROP CONSTRAINT IF EXISTS monitors_domain_check;

UPDATE monitors
   SET domain = 'science'
 WHERE domain = 'bio';
ALTER TABLE monitors ADD CONSTRAINT monitors_domain_check
  CHECK (domain IN ('code', 'science'));

COMMIT;
