-- 018_regulatory_job_type.sql — regulatory autopilot job type (WS4)
--
-- Regulatory updates flow through the autopilot as job_type='regulatory': an LLM
-- extracts structured events from ingested gov/registry carbon-news items, the
-- regulatory gate validates + traces each to a real source, and on human
-- approval they insert into regulatory_events (not news_posts).

ALTER TABLE seo_jobs DROP CONSTRAINT IF EXISTS seo_jobs_job_type_check;
ALTER TABLE seo_jobs
  ADD CONSTRAINT seo_jobs_job_type_check
  CHECK (job_type IN ('editorial', 'meta', 'internal_link', 'glossary', 'programmatic', 'news_brief', 'regulatory'));
