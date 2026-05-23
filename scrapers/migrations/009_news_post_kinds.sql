-- 009_news_post_kinds.sql — SEO Phase 2C
--
-- Expand news_posts.kind CHECK constraint to allow editorial-content kinds
-- alongside the existing 'weekly_wrap'. The new kinds let us publish:
--   - 'explainer'     — policy / regulation explainers (e.g. Permenhut 6/2026)
--   - 'evergreen'     — perpetual reference posts (e.g. carbon prices archive)
--   - 'comparison'    — registry / methodology comparisons
--   - 'investigation' — data-driven investigative pieces
--
-- Additive only; existing rows remain valid (all are 'weekly_wrap').

ALTER TABLE news_posts
  DROP CONSTRAINT IF EXISTS news_posts_kind_ck;

ALTER TABLE news_posts
  ADD CONSTRAINT news_posts_kind_ck
  CHECK (kind IN ('weekly_wrap', 'explainer', 'evergreen', 'comparison', 'investigation'));
