-- 019_news_post_analysis_kind.sql — data-anchored "angle" analysis posts (WS5)
--
-- Angle pieces (a fresh news hook + KarbonLens proprietary data → original
-- analysis) publish as news_posts with kind='analysis'. They reuse the editorial
-- pipeline + gate, so this just widens the kind allow-list.

ALTER TABLE news_posts DROP CONSTRAINT IF EXISTS news_posts_kind_ck;
ALTER TABLE news_posts
  ADD CONSTRAINT news_posts_kind_ck
  CHECK (kind IN ('weekly_wrap', 'explainer', 'evergreen', 'comparison', 'investigation', 'market_report', 'news_brief', 'analysis'));
