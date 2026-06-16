-- 017_news_brief_job_kind.sql — Carbon News Brief job + post kind (WS3 part B)
--
-- News briefs flow through the autopilot as their own job_type so the editorial
-- N8N workflow (which filters job_type='editorial') never grabs them, and they
-- run through a citation gate instead of the editorial gate. They publish as
-- news_posts with kind='news_brief'.

-- seo_jobs.job_type: add 'news_brief'
ALTER TABLE seo_jobs DROP CONSTRAINT IF EXISTS seo_jobs_job_type_check;
ALTER TABLE seo_jobs
  ADD CONSTRAINT seo_jobs_job_type_check
  CHECK (job_type IN ('editorial', 'meta', 'internal_link', 'glossary', 'programmatic', 'news_brief'));

-- news_posts.kind: add 'news_brief' (alongside market_report from migration 015)
ALTER TABLE news_posts DROP CONSTRAINT IF EXISTS news_posts_kind_ck;
ALTER TABLE news_posts
  ADD CONSTRAINT news_posts_kind_ck
  CHECK (kind IN ('weekly_wrap', 'explainer', 'evergreen', 'comparison', 'investigation', 'market_report', 'news_brief'));
