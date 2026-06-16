-- 011_seo_tables_owner_karbonlens.sql — SEO Phase 1 fix
--
-- Migrations 008-010 created the seo_* tables while connected as the
-- `postgres` superuser, so they ended up owned by postgres with no grants
-- to the `karbonlens` application role. Every other app table (projects,
-- news_posts, ...) is owned by karbonlens. The mismatch meant the runtime
-- app (connecting as karbonlens) got "permission denied for table
-- seo_keyword_ranks" (SQLSTATE 42501) on any write — breaking both the
-- GSC cron and the /admin/seo dashboard's seo_tasks seeding.
--
-- Fix: transfer ownership of the four seo_* tables and their bigserial
-- sequences to karbonlens, matching the rest of the schema. Idempotent —
-- re-running is a no-op once ownership is karbonlens.

ALTER TABLE seo_indexation_snapshots OWNER TO karbonlens;
ALTER TABLE seo_backlinks            OWNER TO karbonlens;
ALTER TABLE seo_keyword_ranks        OWNER TO karbonlens;
ALTER TABLE seo_tasks                OWNER TO karbonlens;

ALTER SEQUENCE seo_indexation_snapshots_id_seq OWNER TO karbonlens;
ALTER SEQUENCE seo_backlinks_id_seq            OWNER TO karbonlens;
ALTER SEQUENCE seo_keyword_ranks_id_seq        OWNER TO karbonlens;
