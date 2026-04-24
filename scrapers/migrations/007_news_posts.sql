-- 007_news_posts.sql — T33 Phase 4B
--
-- Stores the auto-published weekly Market Wrap (and any future post kinds).
-- Composed deterministically from DB deltas by `scripts/publish-weekly-wrap.ts`;
-- never hand-edited at runtime. `facts_json` captures the exact inputs the
-- composer saw so the post can be re-rendered under a new template without
-- re-scraping.
--
-- The publisher writes at most one row per (kind, published_at::date) guarded
-- by uq_news_posts_kind_date. This turns an accidentally-double-firing cron
-- into a silent no-op rather than a duplicate post.

CREATE TABLE IF NOT EXISTS news_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,           -- "2026-04-27-indonesia-carbon-market-weekly-wrap"
  kind          text NOT NULL,                  -- 'weekly_wrap' | future post types
  title         text NOT NULL,
  summary       text NOT NULL,                  -- <=200 chars; drives meta description
  body_md       text NOT NULL,                  -- rendered markdown body
  facts_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at  timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES news_posts(id),
  CONSTRAINT news_posts_kind_ck CHECK (kind IN ('weekly_wrap'))
);

CREATE INDEX IF NOT EXISTS idx_news_posts_published ON news_posts (published_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_news_posts_kind_date
  ON news_posts (kind, ((published_at AT TIME ZONE 'UTC')::date));
