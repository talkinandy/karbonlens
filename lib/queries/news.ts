/**
 * news.ts — read accessors for `news_posts` (T33 Phase 4B).
 *
 * The runtime app is read-only against this table; the writer is
 * `scripts/publish-weekly-wrap.ts` running under cron. All queries swallow
 * missing-table errors so fresh dev DBs (without migration 007) render
 * empty news lists rather than 500.
 */

import { db } from '@/lib/db';
import { newsPosts } from '@/lib/schema';
import { desc, eq } from 'drizzle-orm';

export type NewsPost = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  summary: string;
  bodyMd: string;
  factsJson: Record<string, unknown>;
  publishedAt: Date;
};

export async function listNewsPosts(limit = 50): Promise<NewsPost[]> {
  try {
    const rows = await db
      .select()
      .from(newsPosts)
      .orderBy(desc(newsPosts.publishedAt))
      .limit(limit);
    return rows.map(mapRow);
  } catch {
    return [];
  }
}

export async function getNewsPostBySlug(slug: string): Promise<NewsPost | null> {
  try {
    const rows = await db
      .select()
      .from(newsPosts)
      .where(eq(newsPosts.slug, slug))
      .limit(1);
    const row = rows[0];
    return row ? mapRow(row) : null;
  } catch {
    return null;
  }
}

function mapRow(row: typeof newsPosts.$inferSelect): NewsPost {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    bodyMd: row.bodyMd,
    factsJson: row.factsJson,
    publishedAt: row.publishedAt,
  };
}
