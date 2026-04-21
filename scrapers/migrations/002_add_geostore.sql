-- ============================================================================
-- Migration: 002_add_geostore.sql
-- KarbonLens v0.1 — T07 additions for GFW alerts scraper.
--
-- Canonical source of truth: docs/architecture.md §5.2 (GFW workflow).
-- Story contract:              docs/stories/T07-gfw-alerts-scraper.md
--
-- Apply command (the `karbonlens` role has sufficient rights — no superuser
-- required because this migration only runs ALTER TABLE / CREATE INDEX on
-- objects already owned by karbonlens after migration 001):
--
--     sudo -u postgres psql --single-transaction -d karbonlens \
--       -f scrapers/migrations/002_add_geostore.sql
--
-- OR (equivalent):
--
--     psql -U karbonlens -d karbonlens --single-transaction \
--       -f scrapers/migrations/002_add_geostore.sql
--
-- Every statement is idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`)
-- so re-applying this file is a safe no-op (AC-1).
-- ============================================================================

-- 1. Add gfw_geostore_id to projects — caches the GFW geostore ID so repeat
--    runs skip re-registration.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS gfw_geostore_id TEXT;

-- Re-assert ownership (no-op if already owned by karbonlens; guards against a
-- future edit that might apply 002 as `postgres` and transfer ownership back).
ALTER TABLE projects OWNER TO karbonlens;

-- 2. Unique index on satellite_alerts for dedupe.
--    `location` is GEOGRAPHY(POINT, 4326); a direct UNIQUE on a geography
--    column is non-standard, so we extract ST_X/ST_Y and round to 6 decimal
--    places (~0.1 m at the equator). This matches the spec (B-1 fix) and is
--    the ON CONFLICT target used by scrapers/gfw/fetch.py.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sat_project_date_loc
  ON satellite_alerts (
    project_id,
    alert_date,
    ROUND(ST_Y(location::geometry)::NUMERIC, 6),
    ROUND(ST_X(location::geometry)::NUMERIC, 6)
  );

-- 3. Unique index on issuances — future-proofs T06's dedup. T06 currently
--    uses WHERE NOT EXISTS; after 002 lands it can switch to ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS uq_issuances_dedupe
  ON issuances (project_id, vintage_year, issuance_date, registry_name);

-- 4. Unique index on notifications — supports T07's fan-out dedup. Per-day
--    granularity prevents duplicate notifications on same-calendar-day re-runs
--    and bounds retroactive-spam risk for newly-signed-up users.
--    NOTE: `created_at::date` cast of a TIMESTAMPTZ is NOT immutable (the
--    result depends on the session timezone). `AT TIME ZONE 'UTC'` returns a
--    plain TIMESTAMP whose ::date IS immutable. See:
--    https://www.postgresql.org/docs/current/indexes-expressional.html
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe
  ON notifications (
    user_id,
    type,
    project_id,
    (((created_at AT TIME ZONE 'UTC'))::date)
  );

-- 5. Record migration (pattern mirrors 001).
INSERT INTO schema_migrations (version)
VALUES ('002')
ON CONFLICT DO NOTHING;
