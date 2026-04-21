-- ============================================================================
-- Migration: 001_init.sql
-- KarbonLens v0.1 — initial schema (14 application tables + schema_migrations)
--
-- Canonical source of truth: docs/architecture.md §3 (Database schema).
-- Story contract:              docs/stories/T02-schema-migration-001.md
--
-- Apply command (run as postgres superuser — required to CREATE EXTENSION;
-- ownership is transferred to the `karbonlens` role at the end of this file):
--
--     sudo -u postgres psql --single-transaction -d karbonlens \
--       -f scrapers/migrations/001_init.sql
--
-- The `--single-transaction` flag wraps the whole file in BEGIN/COMMIT so a
-- partial apply (E4) is impossible; every CREATE is also IF NOT EXISTS so
-- re-running on an already-applied database is a safe no-op (AC-4).
-- ============================================================================

-- ─── Extensions (idempotent) ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Bookkeeping table (created first so later failures leave no bookkeeping row) ─
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Application tables (14 total, dependency order)
-- ============================================================================

-- 1. projects — canonical entity after entity resolution
CREATE TABLE IF NOT EXISTS projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 TEXT NOT NULL UNIQUE,
  name_canonical       TEXT NOT NULL,
  name_aliases         TEXT[],
  developer            TEXT,
  country              CHAR(2) NOT NULL DEFAULT 'ID',
  province             TEXT,
  regency              TEXT,
  project_type         TEXT,              -- 'REDD+', 'ARR', 'Blue Carbon', etc.
  methodology          TEXT,              -- 'VM0007', 'VM0048', etc.
  hectares             NUMERIC,
  centroid             GEOGRAPHY(POINT, 4326),  -- project center, proxy for polygon in v0.1
  buffer_km            NUMERIC DEFAULT 10,      -- radius for satellite alert intersection
  status               TEXT,                    -- 'active', 'pipeline', 'suspended', 'flagged'
  validation_date      DATE,
  first_issuance_date  DATE,
  total_vcus_issued    NUMERIC DEFAULT 0,
  total_vcus_retired   NUMERIC DEFAULT 0,
  total_vcus_available NUMERIC GENERATED ALWAYS AS (total_vcus_issued - total_vcus_retired) STORED,
  last_vintage         INT,
  description          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 2. registries — cross-reference of a project on each registry
CREATE TABLE IF NOT EXISTS registries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  registry_name   TEXT NOT NULL,     -- 'Verra', 'SRN-PPI', 'Gold Standard', 'IDXCarbon'
  external_id     TEXT NOT NULL,     -- 'VCS1477', etc.
  status          TEXT,
  url             TEXT,
  raw_metadata    JSONB,
  last_synced_at  TIMESTAMPTZ,
  UNIQUE(registry_name, external_id)
);

-- 3. issuances — credits issued by registry
CREATE TABLE IF NOT EXISTS issuances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  registry_name  TEXT NOT NULL,
  vintage_year   INT NOT NULL,
  credits        NUMERIC NOT NULL,
  issuance_date  DATE NOT NULL,
  serial_start   TEXT,
  serial_end     TEXT,
  raw_payload    JSONB,
  ingested_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. retirements — credits retired by beneficiary
CREATE TABLE IF NOT EXISTS retirements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  registry_name       TEXT NOT NULL,
  vintage_year        INT,
  credits             NUMERIC NOT NULL,
  retirement_date     DATE NOT NULL,
  beneficiary_name    TEXT,
  beneficiary_country CHAR(2),
  beneficiary_type    TEXT,
  retirement_reason   TEXT,
  raw_payload         JSONB,
  ingested_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 5. idx_monthly_snapshots — IDXCarbon aggregate market data, no FK (per §3)
CREATE TABLE IF NOT EXISTS idx_monthly_snapshots (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month            DATE NOT NULL UNIQUE,  -- first day of month
  total_volume_tco2e      NUMERIC,
  total_value_idr         NUMERIC,
  total_transactions      INT,
  trading_days            INT,
  registered_participants INT,
  registered_projects     INT,
  available_units         NUMERIC,
  retired_units           NUMERIC,
  avg_price_idr           NUMERIC,
  raw_report_url          TEXT,
  raw_payload             JSONB,       -- structured extract of the PDF
  scraped_at              TIMESTAMPTZ DEFAULT NOW()
);

-- 6. satellite_alerts — from GFW integrated alerts API
CREATE TABLE IF NOT EXISTS satellite_alerts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  alert_source          TEXT NOT NULL,  -- 'RADD', 'GLAD-S2', 'GLAD-L', 'DIST-ALERT', 'VIIRS'
  alert_date            DATE NOT NULL,
  confidence            TEXT,           -- 'low', 'nominal', 'high'
  area_ha               NUMERIC,
  location              GEOGRAPHY(POINT, 4326),
  inside_project_buffer BOOLEAN DEFAULT FALSE,
  raw_payload           JSONB,
  ingested_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 7. regulatory_events — v0.1 manual curation, v0.2 scraped
CREATE TABLE IF NOT EXISTS regulatory_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date      DATE NOT NULL,
  ministry        TEXT,     -- 'Kemenhut', 'KLH', 'OJK', 'ESDM', 'Presidential'
  document_type   TEXT,     -- 'Perpres', 'Permen', 'POJK', 'Kepmen', 'MoU'
  document_number TEXT,
  title           TEXT NOT NULL,
  document_url    TEXT,
  summary_en      TEXT,
  summary_id      TEXT,
  importance      TEXT,     -- 'critical', 'high', 'medium', 'low'
  tags            TEXT[],
  is_upcoming     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 8. project_scores — composite PK (project_id, score_date); no UUID id column
CREATE TABLE IF NOT EXISTS project_scores (
  project_id               UUID REFERENCES projects(id) ON DELETE CASCADE,
  score_date               DATE NOT NULL,
  integrity_score          NUMERIC CHECK (integrity_score BETWEEN 0 AND 100),
  validation_recency_score NUMERIC,
  reversal_score           NUMERIC,
  community_score          NUMERIC,
  transparency_score       NUMERIC,
  components               JSONB,
  methodology_version      TEXT DEFAULT 'v1',
  PRIMARY KEY (project_id, score_date)
);

-- 9. project_match_queue — entity resolution review queue.
-- candidate_a_id and candidate_b_id reference projects(id) with no ON DELETE
-- clause, so Postgres defaults to ON DELETE RESTRICT (see spec §7 E7).
CREATE TABLE IF NOT EXISTS project_match_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_a_id UUID REFERENCES projects(id),
  candidate_b_id UUID REFERENCES projects(id),
  similarity     NUMERIC,
  match_reason   TEXT,                    -- 'name_fuzzy', 'centroid_proximity', 'developer_match'
  status         TEXT DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  resolved_by    TEXT,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 10. users — populated by NextAuth on first login.
-- email_verified is required by @auth/drizzle-adapter v5; T04 exposes it as
-- Drizzle field `emailVerified` (see spec §6 auth field-naming contract).
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT UNIQUE NOT NULL,
  email_verified      TIMESTAMPTZ,          -- required by @auth/drizzle-adapter v5
  name                TEXT,
  image               TEXT,
  organization        TEXT,
  persona             TEXT,       -- 'buyer', 'broker', 'corporate', 'researcher', 'developer', 'other'
  email_digest_opt_in BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 11. accounts — NextAuth OAuth account link (one row per provider per user)
CREATE TABLE IF NOT EXISTS accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          BIGINT,
  token_type          TEXT,
  scope               TEXT,
  id_token            TEXT,
  session_state       TEXT,
  UNIQUE(provider, provider_account_id)
);

-- 12. sessions — NextAuth database-backed session storage
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT UNIQUE NOT NULL,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  expires       TIMESTAMPTZ NOT NULL
);

-- 13. verification_tokens — composite PK (identifier, token); no UUID id column
CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- 14. notifications — in-app bell + weekly digest source
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,    -- 'reversal', 'price', 'regulatory', 'news', 'retirement', 'issuance'
  title       TEXT NOT NULL,
  description TEXT,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  url         TEXT,             -- link to relevant page
  read_at     TIMESTAMPTZ,
  digested_at TIMESTAMPTZ,      -- when this was included in a weekly digest
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes — every CREATE uses IF NOT EXISTS, including GIST indexes (AC-4)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_projects_province ON projects(province);
CREATE INDEX IF NOT EXISTS idx_projects_type     ON projects(project_type);
CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_centroid ON projects USING GIST(centroid);

CREATE INDEX IF NOT EXISTS idx_registries_project ON registries(project_id);

CREATE INDEX IF NOT EXISTS idx_issuances_project_vintage ON issuances(project_id, vintage_year);

CREATE INDEX IF NOT EXISTS idx_retirements_project_date ON retirements(project_id, retirement_date);

CREATE INDEX IF NOT EXISTS idx_sat_project_date ON satellite_alerts(project_id, alert_date);
CREATE INDEX IF NOT EXISTS idx_sat_location     ON satellite_alerts USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read    ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- ============================================================================
-- Ownership transfer — every table owned by karbonlens so the app role can
-- ALTER TABLE in future migrations (e.g. T07 adds projects.gfw_geostore_id).
-- Extensions stay owned by postgres; the public schema's default grants let
-- karbonlens use them via search_path.
-- ============================================================================

GRANT USAGE  ON SCHEMA public TO karbonlens;
GRANT CREATE ON SCHEMA public TO karbonlens;

ALTER TABLE schema_migrations     OWNER TO karbonlens;
ALTER TABLE projects              OWNER TO karbonlens;
ALTER TABLE registries            OWNER TO karbonlens;
ALTER TABLE issuances             OWNER TO karbonlens;
ALTER TABLE retirements           OWNER TO karbonlens;
ALTER TABLE idx_monthly_snapshots OWNER TO karbonlens;
ALTER TABLE satellite_alerts      OWNER TO karbonlens;
ALTER TABLE regulatory_events     OWNER TO karbonlens;
ALTER TABLE project_scores        OWNER TO karbonlens;
ALTER TABLE project_match_queue   OWNER TO karbonlens;
ALTER TABLE users                 OWNER TO karbonlens;
ALTER TABLE accounts              OWNER TO karbonlens;
ALTER TABLE sessions              OWNER TO karbonlens;
ALTER TABLE verification_tokens   OWNER TO karbonlens;
ALTER TABLE notifications         OWNER TO karbonlens;

-- Safety net for any table / sequence not enumerated above (none today, but
-- protects against drift if a future edit adds an object before the ownership
-- block). gen_random_uuid() is used for IDs so no explicit sequences exist.
GRANT ALL ON ALL TABLES    IN SCHEMA public TO karbonlens;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO karbonlens;

-- ─── Bookkeeping row ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('001') ON CONFLICT DO NOTHING;
