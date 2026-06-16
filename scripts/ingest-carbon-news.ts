/**
 * scripts/ingest-carbon-news.ts — pull carbon news into carbon_news_items (WS3).
 *
 * Run with: ./node_modules/.bin/tsx scripts/ingest-carbon-news.ts
 * Emits one JSON log line (event ∈ {carbon_news_ingest_ok, carbon_news_ingest_crash}).
 */

import { ingestCarbonNews } from '@/lib/seo/news/ingest';

async function main(): Promise<void> {
  try {
    const r = await ingestCarbonNews();
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'carbon_news_ingest_ok',
        feeds: r.feeds,
        feedsOk: r.feedsOk,
        parsed: r.parsed,
        inserted: r.inserted,
      }),
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'carbon_news_ingest_crash',
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    process.exitCode = 1;
  }
}

void main();
