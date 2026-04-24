-- =============================================================================
-- Migration 004 — Add notifications.digested_at + pending-digest partial index
-- =============================================================================
-- Belongs to: T17 (weekly digest email — idempotence fix, audit F2)
-- Apply: psql -U karbonlens -d karbonlens --single-transaction \
--           -f scrapers/migrations/004_add_digested_at.sql
--
-- Context: T17 implements the weekly digest cron endpoint. To prevent the same
-- notification from appearing in two consecutive digests (idempotence), the
-- route writes digested_at = NOW() after a successful sendEmail. This migration
-- ensures the column and the partial index on pending rows exist. The column
-- was already created by an earlier Drizzle push; the ALTER TABLE is therefore
-- guarded with IF NOT EXISTS so the migration is safe to re-run.
-- =============================================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS digested_at TIMESTAMPTZ;

-- Partial index: only un-digested rows need to be scanned during each cron run.
-- Greatly reduces scan cost once the table grows (most rows will have
-- digested_at set after the first digest cycle).
CREATE INDEX IF NOT EXISTS idx_notifications_pending_digest
  ON notifications (user_id, created_at)
  WHERE digested_at IS NULL;

INSERT INTO schema_migrations (version) VALUES ('004') ON CONFLICT DO NOTHING;
