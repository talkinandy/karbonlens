-- 010_news_posts_kind_date_weekly_wrap_only.sql — SEO Phase 2C
--
-- The original migration 007 created uq_news_posts_kind_date on
-- (kind, (published_at AT TIME ZONE 'UTC')::date) to dedupe accidental
-- double-fires of the weekly_wrap cron. Now that we have multiple
-- editorial kinds (explainer / evergreen / comparison / investigation)
-- it is normal to publish more than one post of the same kind on the
-- same date.
--
-- Solution: replace the table-wide unique constraint with a partial
-- unique index that only applies to kind = 'weekly_wrap'. Slug uniqueness
-- (news_posts_slug_key) still provides hard dedupe for everything else.

DROP INDEX IF EXISTS uq_news_posts_kind_date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_news_posts_weekly_wrap_date
  ON news_posts (((published_at AT TIME ZONE 'UTC')::date))
  WHERE kind = 'weekly_wrap';
