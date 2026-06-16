-- 013_news_post_author.sql — named author per news post (E-E-A-T, WS1)
--
-- Adds news_posts.author_slug so every post carries a named human author
-- (see lib/authors.ts). YMYL-adjacent market-intel content needs author
-- attribution for E-E-A-T + AI-citation credibility, replacing the anonymous
-- "Organization" byline.
--
-- Backfill: existing rows (weekly wraps + the autopilot's editorial posts) are
-- attributed to the founder/editorial owner by the column default. New posts
-- set author_slug explicitly at insert time.
--
-- Ownership: news_posts is already owned by karbonlens (created by the app
-- role), so ALTER TABLE here runs as owner — no OWNER TO needed.

ALTER TABLE news_posts
  ADD COLUMN IF NOT EXISTS author_slug text NOT NULL DEFAULT 'andy-fajar-handika';
