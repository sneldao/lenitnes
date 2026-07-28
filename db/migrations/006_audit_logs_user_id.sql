-- 006_audit_logs_user_id.sql
--
-- The audit middleware (apps/api/src/middleware/audit.ts) has always
-- inserted `user_id`, but the base schema never created the column —
-- every request logged "column user_id of relation audit_logs does
-- not exist" and the audit trail was never persisted.
BEGIN;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
COMMIT;
