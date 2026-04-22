-- ============================================================================
-- Migration: 005_admin_actions.sql
-- KarbonLens v0.1 — T21 admin audit log for entity-resolution actions.
--
-- Canonical source of truth: docs/architecture.md §3, docs/stories/T21-match-queue-admin.md §3.0.
--
-- Motivation: the T21 match-queue admin page (approve / reject / defer) needs
-- a durable audit trail. Writing audit rows into `notifications` would leak
-- them into the T16 bell inbox and T17 weekly digest (both query `notifications`
-- by user_id with no type filter). A dedicated `admin_actions` table keeps
-- audit records out of user-facing queries with zero coupling.
--
-- Apply command:
--
--     sudo -u postgres psql --single-transaction -d karbonlens \
--       -f scrapers/migrations/005_admin_actions.sql
--
-- Every statement is idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`),
-- so re-applying this file is a safe no-op.
-- ============================================================================

-- 1. admin_actions — audit log for privileged admin actions.
--    actor_id references users(id) (admin's NextAuth UUID). entity_type is a
--    free-form tag (v0.1: only 'project_match_queue'). payload is JSONB so
--    per-action shape stays flexible without schema changes.
CREATE TABLE IF NOT EXISTS admin_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,          -- 'approve-merge', 'reject-match', 'defer-match'
  entity_type TEXT NOT NULL,          -- 'project_match_queue'
  entity_id   UUID,
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index for audit-history queries (most recent first).
CREATE INDEX IF NOT EXISTS idx_admin_actions_created
  ON admin_actions (created_at DESC);

-- 3. Re-assert ownership (mirrors 001/002 pattern).
ALTER TABLE admin_actions OWNER TO karbonlens;

-- 4. Record migration.
INSERT INTO schema_migrations (version)
VALUES ('005')
ON CONFLICT DO NOTHING;
