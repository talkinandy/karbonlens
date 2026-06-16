/**
 * lib/seo/news/ingest.ts — fetch + parse + store carbon news (WS3).
 *
 * Dependency-free RSS 2.0 parser (all configured feeds are RSS 2.0). We keep
 * only metadata — title, link, source, a short HTML-stripped snippet, date —
 * and dedupe by url (ON CONFLICT DO NOTHING). No article body is ever stored.
 */

// NOTE: no `import 'server-only'` — this module is run by a standalone tsx
// cron script (scripts/ingest-carbon-news.ts), where that guard can't resolve.
import { db } from '@/lib/db';
import { carbonNewsItems } from '@/lib/schema';
import { NEWS_SOURCES, type NewsSource } from './sources';

export type ParsedItem = {
  url: string;
  title: string;
  snippet: string | null;
  sourceName: string | null;
  publishedAt: Date | null;
};

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

function stripCdata(s: string): string {
  const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : s;
}

/** First captured group of <tag>…</tag>, CDATA-aware and entity-decoded. */
function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  if (!m) return null;
  return decodeEntities(stripCdata(m[1]).trim());
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parseRss(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const link = tag(block, 'link');
    const title = tag(block, 'title');
    if (!link || !title) continue;
    const desc = tag(block, 'description');
    // Google News items carry <source url="...">Outlet</source>.
    const srcMatch = block.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);
    const sourceName = srcMatch ? decodeEntities(stripCdata(srcMatch[1]).trim()) : null;
    const pub = tag(block, 'pubDate') ?? tag(block, 'dc:date');
    let publishedAt: Date | null = null;
    if (pub) {
      const d = new Date(pub);
      if (!Number.isNaN(d.getTime())) publishedAt = d;
    }
    const snippet = desc ? stripHtml(desc).slice(0, 400) : null;
    items.push({ url: link.trim(), title, snippet, sourceName, publishedAt });
  }
  return items;
}

async function fetchFeed(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; KarbonLensBot/1.0; +https://karbonlens.com)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function relevant(item: ParsedItem, src: NewsSource): boolean {
  if (!src.keywordFilter || src.keywordFilter.length === 0) return true;
  const hay = `${item.title} ${item.snippet ?? ''}`.toLowerCase();
  return src.keywordFilter.some((k) => hay.includes(k));
}

export type IngestResult = {
  feeds: number;
  feedsOk: number;
  parsed: number;
  inserted: number;
  perFeed: Array<{ feed: string; ok: boolean; parsed: number; inserted: number }>;
};

/** Fetch every source, parse, and insert new items (deduped by url). */
export async function ingestCarbonNews(): Promise<IngestResult> {
  const result: IngestResult = { feeds: NEWS_SOURCES.length, feedsOk: 0, parsed: 0, inserted: 0, perFeed: [] };

  for (const src of NEWS_SOURCES) {
    const xml = await fetchFeed(src.feed);
    if (xml === null) {
      result.perFeed.push({ feed: src.feed, ok: false, parsed: 0, inserted: 0 });
      continue;
    }
    result.feedsOk += 1;
    const items = parseRss(xml).filter((i) => relevant(i, src));
    result.parsed += items.length;

    let insertedHere = 0;
    for (const it of items) {
      try {
        const ret = await db
          .insert(carbonNewsItems)
          .values({
            url: it.url,
            title: it.title.slice(0, 500),
            snippet: it.snippet,
            sourceName: src.sourceName ?? it.sourceName,
            sourceCategory: src.category,
            feed: src.feed,
            publishedAt: it.publishedAt,
          })
          .onConflictDoNothing({ target: carbonNewsItems.url })
          .returning({ id: carbonNewsItems.id });
        if (ret.length > 0) insertedHere += 1;
      } catch {
        // skip a bad row, keep ingesting
      }
    }
    result.inserted += insertedHere;
    result.perFeed.push({ feed: src.feed, ok: true, parsed: items.length, inserted: insertedHere });
  }
  return result;
}
