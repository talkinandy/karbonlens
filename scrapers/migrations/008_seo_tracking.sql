-- 008_seo_tracking.sql — SEO Phase 1 dashboard tables.
--
-- All four tables are read by /admin/seo and written by nightly/weekly cron
-- scripts under scripts/seo/. Additive only — no existing column changes.
--
-- Storage philosophy: keep one row per (source, observed_at) snapshot rather
-- than mutating. This lets the dashboard compute deltas ("indexed pages +12
-- in last 7 days") cheaply with a single LAG().
--
-- All four tables are operator-data: missing rows mean "we haven't measured
-- yet", not "the metric is zero". Every reader must distinguish "no data"
-- from "no data because the value is zero".

-- ─── seo_indexation_snapshots ───────────────────────────────────────────────
-- One row per (source, observed_at). Sources: 'gsc', 'bwt', 'yandex'.
-- `indexed` is the engine's reported indexed-page count;
-- `submitted` is the count of URLs in the sitemap we asked them to index.
-- Difference = pending crawl.
CREATE TABLE IF NOT EXISTS seo_indexation_snapshots (
  id           bigserial PRIMARY KEY,
  source       text NOT NULL,           -- 'gsc' | 'bwt' | 'yandex'
  observed_at  timestamptz NOT NULL DEFAULT now(),
  indexed      integer NOT NULL,
  submitted    integer NOT NULL,
  stragglers   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{url, last_crawled?, reason?}]
  raw          jsonb,
  CONSTRAINT seo_indexation_source_ck CHECK (source IN ('gsc', 'bwt', 'yandex'))
);

CREATE INDEX IF NOT EXISTS idx_seo_indexation_source_time
  ON seo_indexation_snapshots (source, observed_at DESC);


-- ─── seo_backlinks ──────────────────────────────────────────────────────────
-- Discovered backlinks from Ahrefs Webmaster Tools (or whatever source we
-- wire up). Idempotent on (referring_host, target_url) — re-discovery just
-- updates last_seen.
CREATE TABLE IF NOT EXISTS seo_backlinks (
  id                 bigserial PRIMARY KEY,
  referring_host     text NOT NULL,
  referring_url      text NOT NULL,
  target_url         text NOT NULL,
  anchor_text        text,
  rel               text,                       -- 'nofollow' | 'ugc' | 'sponsored' | null=follow
  first_seen        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'ahrefs_wmt',
  raw               jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seo_backlinks_host_target
  ON seo_backlinks (referring_host, target_url);
CREATE INDEX IF NOT EXISTS idx_seo_backlinks_last_seen
  ON seo_backlinks (last_seen DESC);


-- ─── seo_keyword_ranks ──────────────────────────────────────────────────────
-- Daily rank snapshot per (query, page) pulled from GSC Search Analytics
-- (28-day rolling window, daily resolution). Unique on (observed_date, query,
-- page) so re-running the cron in the same day is idempotent.
CREATE TABLE IF NOT EXISTS seo_keyword_ranks (
  id            bigserial PRIMARY KEY,
  observed_date date NOT NULL,
  query         text NOT NULL,
  page          text NOT NULL,
  position      numeric(5, 2) NOT NULL,
  impressions   integer NOT NULL,
  clicks        integer NOT NULL,
  ctr           numeric(5, 4) NOT NULL,
  source        text NOT NULL DEFAULT 'gsc'
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seo_keyword_ranks_date_query_page
  ON seo_keyword_ranks (observed_date, query, page);
CREATE INDEX IF NOT EXISTS idx_seo_keyword_ranks_query
  ON seo_keyword_ranks (query, observed_date DESC);


-- ─── seo_tasks ──────────────────────────────────────────────────────────────
-- The SEO punch list — source-of-truth lives in lib/seo/plan.ts and is
-- seeded on first read. The DB row carries mutable state (status, closed_at,
-- notes) while the code row carries immutable metadata (priority, title,
-- description).
CREATE TABLE IF NOT EXISTS seo_tasks (
  code         text PRIMARY KEY,        -- e.g. 'B1', 'P1-www-redirect'
  status       text NOT NULL DEFAULT 'pending',
  closed_at    timestamptz,
  closed_by    text,                    -- email of operator who marked it done
  notes        text,
  CONSTRAINT seo_tasks_status_ck CHECK (status IN ('pending', 'in_progress', 'completed', 'wontfix'))
);

CREATE INDEX IF NOT EXISTS idx_seo_tasks_status ON seo_tasks (status);
