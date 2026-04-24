-- =============================================================================
-- Migration 003 — Normalize projects.status + enforce canonical enum
-- =============================================================================
-- Belongs to: T06.1 (status-normalization follow-up story)
-- Apply: sudo -u postgres psql -d karbonlens --single-transaction \
--           -f scrapers/migrations/003_normalize_status.sql
--
-- Context: T06 originally wrote raw Verra strings to projects.status via a
-- partial STATUS_MAP that fell through to 'suspended' for unmapped values.
-- Verra exposes 11 distinct resourceStatus values for Indonesian projects
-- (most common: 'Under development', 'Under validation', 'Late to verify',
-- 'Verification approval requested', 'Registration requested', …). Most of
-- these are pipeline/verification states, not terminal suspensions. As a
-- result 29 of 64 projects were incorrectly labelled 'suspended' — Katingan,
-- Sumatra Merang, and Rimba Raya all mislabelled despite being genuine
-- operational flagships.
--
-- This migration:
--   1. Transitional safety UPDATE — any raw Verra string still lingering in
--      projects.status is mapped to the canonical enum. (In practice the
--      T06.1 scraper rerun has already normalised every row; this UPDATE is
--      defensive for idempotence.)
--   2. Adds a CHECK constraint so future Verra-response changes cannot
--      silently introduce a new raw string — they will fail at INSERT time
--      and surface as scraper errors.
--
-- Row count before + after: 64. No rows deleted.
-- =============================================================================

-- Defensive: if any row still holds a raw Verra string, map it now.
UPDATE projects SET status = 'active'
  WHERE status IN ('Registered', 'Units Transferred from Approved GHG Program');

UPDATE projects SET status = 'pipeline'
  WHERE status IN (
    'Under development', 'Under Development',
    'Under validation',
    'Registration requested',
    'Registration and verification approval requested',
    'Verification approval requested',
    'Crediting Period Renewal Requested',
    'Crediting Period Renewal and Verification Approval Requested',
    'Late to verify'
  );

UPDATE projects SET status = 'suspended'
  WHERE status IN ('Inactive', 'On Hold - see notification letter', 'On Hold');

UPDATE projects SET status = 'flagged'
  WHERE status IN (
    'Withdrawn',
    'Rejected by Administrator',
    'Rejected',
    'Registration request denied',
    'Registration and verification approval request denied',
    'Verification approval request denied'
  );

-- Enforce canonical enum going forward. A future Verra-response change
-- that produces an unmapped value will cause the scraper to write NULL
-- (per fetch.py _map_status post-T06.1), which is permitted — surfacing
-- unknowns as visibly NULL rather than misclassified.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_canonical;
ALTER TABLE projects
  ADD CONSTRAINT projects_status_canonical
  CHECK (status IS NULL OR status IN ('active', 'pipeline', 'suspended', 'flagged'));

-- Bookkeeping
INSERT INTO schema_migrations (version) VALUES ('003') ON CONFLICT DO NOTHING;
