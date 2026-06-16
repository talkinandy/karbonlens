-- 012_seo_autopilot_jobs.sql — SEO Autopilot (N8N-driven, LLM content engine)
--
-- One row per unit of autopilot work. The N8N "SEO Autopilot" workflow:
--   1. GET /api/seo/opportunities          → ranked candidate jobs + grounding
--   2. LLM (OpenAI) generates an artifact for the chosen candidate
--   3. POST /api/seo/autopilot/publish      → the app runs the fact-check GATE,
--      and on pass applies the change (insert news_posts / record override),
--      revalidates the sitemap, pings IndexNow, and writes the seo_jobs row.
--
-- Every step of the loop lands here so /admin/seo "Autopilot" can show the
-- whole pipeline (queued → generating → published / qa_failed) plus the
-- 4-week ranking impact (join target_query → seo_keyword_ranks).
--
-- Ownership: tables created while connected as the `postgres` superuser end
-- up owned by postgres with no grants to the app role `karbonlens`, which is
-- exactly the 42501 bug migration 011 had to fix for the other seo_* tables.
-- Set ownership explicitly here so the app (connecting as karbonlens) can
-- write without a follow-up migration.

CREATE TABLE IF NOT EXISTS seo_jobs (
  id           bigserial PRIMARY KEY,

  -- What kind of SEO work this job represents.
  job_type     text NOT NULL
                 CHECK (job_type IN ('editorial', 'meta', 'internal_link', 'glossary', 'programmatic')),

  -- Lifecycle. queued → generating → (published | applied | qa_failed | error | skipped).
  status       text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'generating', 'qa_failed', 'published', 'applied', 'skipped', 'error')),

  target_query text,            -- the striking-distance query (editorial / meta)
  target_url   text,            -- the page being optimised (meta / internal_link)
  title        text,            -- human label for the dashboard

  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- the generated artifact (body_md, meta, link pairs…)
  grounding    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- the real DB facts handed to the LLM (audit trail)
  qa           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- gate result {passed, checks:[{name, ok, detail}]}

  result_ref   text,            -- on success: news_posts slug or page path
  llm_model    text,            -- e.g. 'gpt-4o' — what generated the artifact
  tokens_in    integer,
  tokens_out   integer,
  error        text,            -- on status='error': the failure reason
  external_id  text,            -- N8N execution id, for trace + idempotency

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_jobs_status_time ON seo_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_jobs_type_time   ON seo_jobs (job_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_jobs_query       ON seo_jobs (target_query);

ALTER TABLE    seo_jobs        OWNER TO karbonlens;
ALTER SEQUENCE seo_jobs_id_seq OWNER TO karbonlens;
