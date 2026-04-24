/**
 * lib/queries/regulatory-detail.ts — single-row regulatory event lookup (T31).
 *
 * Owns the data read for `app/(public)/regulatory/[slug]/page.tsx`.
 *
 * Slug derivation matches `app/sitemap.ts`:
 *   slug = lower(replace(replace(document_type || '-' || document_number,
 *                                '/', '-'), ' ', '-'))
 *
 * The slug is computed in SQL on every lookup so we never have to maintain a
 * generated column or risk drift between the sitemap and the lookup. The
 * matching expression mirrors the sitemap SELECT verbatim, including the
 * COALESCE on the two source columns.
 *
 * Returns null on no-match so the page can call `notFound()`. The schema
 * column for `event_date` is Drizzle `date()` which returns a `YYYY-MM-DD`
 * string — we pass that through unchanged (matches the convention in
 * `lib/queries/regulatory.ts`).
 */

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { regulatoryEvents } from '@/lib/schema';

export type RegulatoryDetail = {
  id: string;
  eventDate: string; // ISO 'YYYY-MM-DD' (Drizzle date() → string)
  ministry: string | null;
  documentType: string | null;
  documentNumber: string | null;
  title: string;
  documentUrl: string | null;
  summaryEn: string | null;
  summaryId: string | null;
  importance: string | null;
  tags: string[];
  isUpcoming: boolean;
  slug: string;
};

export async function getRegulatoryEventBySlug(
  slug: string,
): Promise<RegulatoryDetail | null> {
  const rows = await db
    .select()
    .from(regulatoryEvents)
    .where(
      sql`LOWER(REPLACE(REPLACE(COALESCE(${regulatoryEvents.documentType}, '') || '-' || COALESCE(${regulatoryEvents.documentNumber}, ''), '/', '-'), ' ', '-')) = ${slug}`,
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    eventDate: row.eventDate,
    ministry: row.ministry,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    title: row.title,
    documentUrl: row.documentUrl,
    summaryEn: row.summaryEn,
    summaryId: row.summaryId,
    importance: row.importance,
    tags: (row.tags as string[] | null) ?? [],
    isUpcoming: row.isUpcoming === true,
    slug,
  };
}
