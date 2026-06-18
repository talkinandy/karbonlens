/**
 * lib/seo/news/sources.ts — carbon-news feed registry (WS3).
 *
 * Backbone is Google News RSS (aggregates many outlets, incl. ones whose own
 * feeds are awkward), plus a couple of direct outlet/specialist feeds. Broad
 * feeds (Mongabay) carry a keyword filter so only carbon-relevant items land.
 *
 * Editorial sourcing — tune freely; nothing else depends on the exact list.
 */

import type { CarbonNewsCategory } from '@/lib/schema';

export type NewsSource = {
  feed: string;
  category: CarbonNewsCategory;
  /** Override outlet name (else taken from the item's <source> or the host). */
  sourceName?: string;
  /** For broad feeds: keep an item only if its title/snippet hits a keyword. */
  keywordFilter?: string[];
};

/** Google News RSS search feed for a query, scoped to Indonesia/English. */
function gnews(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-ID&gl=ID&ceid=ID:en`;
}

export const NEWS_SOURCES: NewsSource[] = [
  // Google News — topic coverage
  { feed: gnews('Indonesia carbon market'), category: 'google_news' },
  { feed: gnews('Indonesia carbon credit OR "REDD+" Indonesia'), category: 'google_news' },
  // Google News — carbon-adjacent themes (deforestation / forest / EUDR)
  { feed: gnews('Indonesia deforestation OR peatland'), category: 'google_news' },
  { feed: gnews('Indonesia mangrove restoration OR reforestation'), category: 'google_news' },
  { feed: gnews('EUDR Indonesia OR "deforestation regulation" palm'), category: 'google_news' },
  { feed: gnews('Indonesia forest fire emissions OR land use emissions'), category: 'google_news' },
  // Google News — gov / registry / exchange
  { feed: gnews('IDXCarbon OR "bursa karbon"'), category: 'gov_registry' },
  { feed: gnews('"nilai ekonomi karbon" OR KLHK karbon OR Indonesia carbon regulation'), category: 'gov_registry' },
  { feed: gnews('Verra Indonesia OR "Gold Standard" Indonesia carbon'), category: 'gov_registry' },
  // Direct outlet + specialist feeds
  {
    feed: 'https://news.mongabay.com/feed/',
    category: 'outlet',
    sourceName: 'Mongabay',
    keywordFilter: [
      'carbon', 'karbon', 'redd', 'emission', 'climate', 'offset',
      'peatland', 'deforest', 'mangrove', 'forest', 'credit',
    ],
  },
  { feed: 'https://carbon-pulse.com/feed/', category: 'specialist', sourceName: 'Carbon Pulse' },
];
