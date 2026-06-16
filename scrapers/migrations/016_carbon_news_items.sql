-- 016_carbon_news_items.sql — Carbon News Brief ingest store (WS3)
--
-- Compliant aggregator: we store only metadata about external carbon-news
-- articles (title, source, link, short snippet) — never the full text. The
-- "Carbon News Brief" then links OUT to each source with attribution. One row
-- per article, deduped by canonical url.
--
-- used_at marks an item already folded into a published brief, so the next
-- brief only covers fresh news.
--
-- Ownership set explicitly (app connects as karbonlens) per the 011/012 lesson.

CREATE TABLE IF NOT EXISTS carbon_news_items (
  id              bigserial PRIMARY KEY,
  url             text NOT NULL UNIQUE,          -- canonical link to the source article
  source_name     text,                          -- outlet, e.g. 'Mongabay', 'Reuters'
  source_category text NOT NULL                  -- google_news | outlet | specialist | gov_registry
                    CHECK (source_category IN ('google_news', 'outlet', 'specialist', 'gov_registry')),
  feed            text,                           -- which feed it came from
  title           text NOT NULL,
  snippet         text,                           -- short teaser (HTML-stripped), never full text
  published_at    timestamptz,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  used_at         timestamptz                     -- set when included in a published brief
);

CREATE INDEX IF NOT EXISTS idx_carbon_news_published ON carbon_news_items (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_carbon_news_used      ON carbon_news_items (used_at);
CREATE INDEX IF NOT EXISTS idx_carbon_news_fetched   ON carbon_news_items (fetched_at DESC);

ALTER TABLE    carbon_news_items           OWNER TO karbonlens;
ALTER SEQUENCE carbon_news_items_id_seq    OWNER TO karbonlens;
