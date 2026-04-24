/**
 * lib/queries/regulatory.ts — Drizzle queries for the regulatory timeline (T15).
 *
 * Three server-only helpers:
 *   - getRegulatoryEvents(filters) — typed rows filtered + sorted for the page.
 *   - getDistinctTags()            — dynamic tag vocabulary (unnest(tags)).
 *   - getDistinctMinistries()      — dynamic ministry vocabulary.
 *
 * The tag/ministry helpers back the T15 FilterBar so the filter vocabulary
 * cannot drift from the seed (T10). The T15 spec forbids hardcoding tag
 * strings in FilterBar.tsx — all tag pills come from the DB.
 *
 * Sort order: upcoming rows (is_upcoming = TRUE) surface first (in the "Coming
 * up" section on the page); historical rows sort by event_date DESC. We apply
 * that order here via a single `ORDER BY is_upcoming DESC, event_date DESC` so
 * the page shell can slice the returned array into two contiguous groups
 * without a second sort.
 *
 * Filter semantics (multi-select = OR within dimension, AND across dimensions):
 *   importance IN (...), ministry IN (...), tags && ARRAY[...]
 *
 * The Postgres `&&` operator (array overlap) is used for tag filtering so an
 * event matches if ANY selected tag is present in its tags[]. This matches the
 * AC-5 semantics ("cards whose tags array contains 'forestry'").
 *
 * SQL injection: all inputs are parameterised via Drizzle's `inArray` / tagged
 * `sql` helpers — no string concatenation. Values come from Next.js
 * searchParams which have already been URL-decoded once; we do NOT decode
 * again (the double-decode gotcha called out in the T15 spec §7.4).
 */

import { and, desc, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { regulatoryEvents } from '@/lib/schema';

export type RegulatoryEventRow = {
  id: string;
  eventDate: string; // ISO date string, 'YYYY-MM-DD'
  ministry: string | null;
  documentType: string | null;
  documentNumber: string | null;
  title: string;
  documentUrl: string | null;
  summaryEn: string | null;
  summaryId: string | null;
  importance: string | null;
  tags: string[] | null;
  isUpcoming: boolean;
};

export type RegulatoryFilters = {
  importance?: string[];
  ministry?: string[];
  tag?: string[];
};

/**
 * getRegulatoryEvents — filtered + sorted rows for the timeline.
 *
 * Arrays are treated as OR-within; filters across dimensions AND together.
 * Empty / undefined filter arrays are no-ops.
 */
export async function getRegulatoryEvents(
  filters: RegulatoryFilters = {},
): Promise<RegulatoryEventRow[]> {
  const whereClauses = [] as Array<ReturnType<typeof sql>>;

  if (filters.importance && filters.importance.length > 0) {
    whereClauses.push(
      sql`${inArray(regulatoryEvents.importance, filters.importance)}`,
    );
  }

  if (filters.ministry && filters.ministry.length > 0) {
    whereClauses.push(
      sql`${inArray(regulatoryEvents.ministry, filters.ministry)}`,
    );
  }

  if (filters.tag && filters.tag.length > 0) {
    // Array-overlap: matches if tags[] contains ANY of the selected tags.
    whereClauses.push(
      sql`${regulatoryEvents.tags} && ${filters.tag}::text[]`,
    );
  }

  const whereExpr = whereClauses.length > 0 ? and(...whereClauses) : undefined;

  const rows = await db
    .select({
      id: regulatoryEvents.id,
      eventDate: regulatoryEvents.eventDate,
      ministry: regulatoryEvents.ministry,
      documentType: regulatoryEvents.documentType,
      documentNumber: regulatoryEvents.documentNumber,
      title: regulatoryEvents.title,
      documentUrl: regulatoryEvents.documentUrl,
      summaryEn: regulatoryEvents.summaryEn,
      summaryId: regulatoryEvents.summaryId,
      importance: regulatoryEvents.importance,
      tags: regulatoryEvents.tags,
      isUpcoming: regulatoryEvents.isUpcoming,
    })
    .from(regulatoryEvents)
    .where(whereExpr)
    .orderBy(desc(regulatoryEvents.isUpcoming), desc(regulatoryEvents.eventDate));

  // Coerce is_upcoming NULL (DB default FALSE, but schema column is nullable)
  // to boolean so downstream code doesn't have to defend against null.
  return rows.map((r) => ({
    ...r,
    isUpcoming: r.isUpcoming === true,
  }));
}

/**
 * getDistinctTags — sorted, deduped unnest of all `tags[]` values across the
 * table. Backs the FilterBar Tags section. Empty-string or NULL tag elements
 * are filtered out defensively (should not occur under T10's seed but cheap).
 */
export async function getDistinctTags(): Promise<string[]> {
  const rows = await db.execute<{ tag: string }>(
    sql`SELECT DISTINCT unnest(tags) AS tag
        FROM regulatory_events
        WHERE tags IS NOT NULL
        ORDER BY 1`,
  );
  return rows
    .map((r) => r.tag)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
}

/**
 * getDistinctMinistries — sorted, deduped non-null ministry values. Backs
 * the FilterBar Ministry section so the filter auto-updates when new seed
 * rows appear (v0.2) without code changes.
 */
export async function getDistinctMinistries(): Promise<string[]> {
  const rows = await db.execute<{ ministry: string }>(
    sql`SELECT DISTINCT ministry
        FROM regulatory_events
        WHERE ministry IS NOT NULL
        ORDER BY 1`,
  );
  return rows
    .map((r) => r.ministry)
    .filter((m): m is string => typeof m === 'string' && m.length > 0);
}
