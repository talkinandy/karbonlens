-- 015_news_post_market_report_kind.sql — allow data-report posts (WS2b)
--
-- The autopilot's data reports (monthly IDXCarbon recap, quarterly league table)
-- publish as news_posts with kind='market_report'. The news_posts_kind_ck
-- constraint (migration 009) predates that kind, so approving a data report
-- failed with a 23514 check violation. Add 'market_report' to the allow-list.

ALTER TABLE news_posts DROP CONSTRAINT IF EXISTS news_posts_kind_ck;
ALTER TABLE news_posts
  ADD CONSTRAINT news_posts_kind_ck
  CHECK (kind IN ('weekly_wrap', 'explainer', 'evergreen', 'comparison', 'investigation', 'market_report'));
