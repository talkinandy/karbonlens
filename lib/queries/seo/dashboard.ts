/**
 * lib/queries/seo/dashboard.ts — SEO Phase 1 dashboard data layer.
 *
 * Each function returns a tile-ready view-model. All are tolerant of empty
 * tables (returning null counts + "no data yet" sentinels) so the dashboard
 * renders cleanly before any API integrations land.
 */

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { seoTasks, type SeoTaskStatus } from '@/lib/schema';
import { SEO_PLAN, type SeoTaskDef, type SeoTaskPriority } from '@/lib/seo/plan';

// ─── Indexation tile ─────────────────────────────────────────────────────────

export type IndexationRow = {
  source: 'gsc' | 'bwt' | 'yandex';
  indexed: number | null;
  submitted: number | null;
  observedAt: Date | null;
  delta7d: number | null;
};

export async function getIndexationSnapshot(): Promise<IndexationRow[]> {
  // Latest snapshot per source + the snapshot from ~7 days ago for the delta.
  const rows = (await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (source)
        source, indexed, submitted, observed_at
      FROM seo_indexation_snapshots
      ORDER BY source, observed_at DESC
    ),
    week_ago AS (
      SELECT DISTINCT ON (source)
        source, indexed AS indexed_then
      FROM seo_indexation_snapshots
      WHERE observed_at <= NOW() - INTERVAL '7 days'
      ORDER BY source, observed_at DESC
    )
    SELECT l.source, l.indexed, l.submitted, l.observed_at,
           (l.indexed - w.indexed_then) AS delta7d
    FROM latest l
    LEFT JOIN week_ago w USING (source)
  `)) as unknown as Array<{
    source: string;
    indexed: number;
    submitted: number;
    observed_at: string;
    delta7d: number | null;
  }>;

  const bySource = new Map(rows.map((r) => [r.source, r]));
  const sources: IndexationRow['source'][] = ['gsc', 'bwt', 'yandex'];
  return sources.map((s) => {
    const row = bySource.get(s);
    return {
      source: s,
      indexed: row ? Number(row.indexed) : null,
      submitted: row ? Number(row.submitted) : null,
      observedAt: row ? new Date(row.observed_at) : null,
      delta7d: row?.delta7d !== null && row?.delta7d !== undefined ? Number(row.delta7d) : null,
    };
  });
}

// ─── Backlinks tile ──────────────────────────────────────────────────────────

export type BacklinksSummary = {
  referringDomains: number | null;
  totalBacklinks: number | null;
  newLast7d: Array<{ referringHost: string; lastSeen: Date }>;
  lastFetched: Date | null;
};

export async function getBacklinksSummary(): Promise<BacklinksSummary> {
  const totals = (await db.execute(sql`
    SELECT
      COUNT(DISTINCT referring_host)::int AS referring_domains,
      COUNT(*)::int                        AS total_backlinks,
      MAX(last_seen)                       AS last_fetched
    FROM seo_backlinks
  `)) as unknown as Array<{
    referring_domains: number;
    total_backlinks: number;
    last_fetched: string | null;
  }>;

  const newRows = (await db.execute(sql`
    SELECT referring_host, MAX(last_seen) AS last_seen
    FROM seo_backlinks
    WHERE first_seen >= NOW() - INTERVAL '7 days'
    GROUP BY referring_host
    ORDER BY MAX(last_seen) DESC
    LIMIT 5
  `)) as unknown as Array<{ referring_host: string; last_seen: string }>;

  const t = totals[0];
  return {
    referringDomains: t?.referring_domains ?? null,
    totalBacklinks: t?.total_backlinks ?? null,
    newLast7d: newRows.map((r) => ({
      referringHost: r.referring_host,
      lastSeen: new Date(r.last_seen),
    })),
    lastFetched: t?.last_fetched ? new Date(t.last_fetched) : null,
  };
}

// ─── Keyword ranks tile ──────────────────────────────────────────────────────

export type KeywordRankRow = {
  query: string;
  page: string;
  positionLatest: number;
  positionPrior: number | null;
  trend: 'up' | 'down' | 'flat' | 'new';
  impressions28d: number;
  clicks28d: number;
};

export async function getTopKeywords(): Promise<KeywordRankRow[]> {
  const rows = (await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (query, page)
        query, page, position, impressions, clicks
      FROM seo_keyword_ranks
      WHERE observed_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY query, page, observed_date DESC
    ),
    prior AS (
      SELECT DISTINCT ON (query, page)
        query, page, position AS position_prior
      FROM seo_keyword_ranks
      WHERE observed_date BETWEEN CURRENT_DATE - INTERVAL '35 days'
                              AND CURRENT_DATE - INTERVAL '8 days'
      ORDER BY query, page, observed_date DESC
    ),
    impr_total AS (
      SELECT query, page,
             SUM(impressions)::int AS impressions_28d,
             SUM(clicks)::int      AS clicks_28d
      FROM seo_keyword_ranks
      WHERE observed_date >= CURRENT_DATE - INTERVAL '28 days'
      GROUP BY query, page
    )
    SELECT l.query, l.page, l.position, p.position_prior,
           COALESCE(i.impressions_28d, 0)::int AS impressions_28d,
           COALESCE(i.clicks_28d, 0)::int      AS clicks_28d
    FROM latest l
    LEFT JOIN prior  p USING (query, page)
    LEFT JOIN impr_total i USING (query, page)
    ORDER BY l.position ASC
    LIMIT 10
  `)) as unknown as Array<{
    query: string;
    page: string;
    position: string;
    position_prior: string | null;
    impressions_28d: number;
    clicks_28d: number;
  }>;

  return rows.map((r) => {
    const latest = Number(r.position);
    const prior = r.position_prior !== null ? Number(r.position_prior) : null;
    let trend: KeywordRankRow['trend'] = 'new';
    if (prior !== null) {
      const delta = latest - prior;
      trend = delta < -0.5 ? 'up' : delta > 0.5 ? 'down' : 'flat';
    }
    return {
      query: r.query,
      page: r.page,
      positionLatest: latest,
      positionPrior: prior,
      trend,
      impressions28d: r.impressions_28d,
      clicks28d: r.clicks_28d,
    };
  });
}

// ─── Punch list tile ─────────────────────────────────────────────────────────

export type PunchListRow = SeoTaskDef & {
  status: SeoTaskStatus;
  closedAt: Date | null;
  closedBy: string | null;
  notes: string | null;
};

/**
 * Seed seo_tasks with any SEO_PLAN codes that aren't yet present, then
 * return the full joined list. Seeding is idempotent.
 */
export async function getPunchList(): Promise<PunchListRow[]> {
  // Seed missing rows. PostgreSQL VALUES + ON CONFLICT means one round-trip
  // for the whole plan.
  if (SEO_PLAN.length > 0) {
    await db
      .insert(seoTasks)
      .values(SEO_PLAN.map((t) => ({ code: t.code })))
      .onConflictDoNothing();
  }

  const rows = (await db.execute(sql`
    SELECT code, status, closed_at, closed_by, notes
    FROM seo_tasks
  `)) as unknown as Array<{
    code: string;
    status: SeoTaskStatus;
    closed_at: string | null;
    closed_by: string | null;
    notes: string | null;
  }>;

  const stateByCode = new Map(rows.map((r) => [r.code, r]));
  return SEO_PLAN.map((def) => {
    const state = stateByCode.get(def.code);
    return {
      ...def,
      status: (state?.status ?? 'pending') as SeoTaskStatus,
      closedAt: state?.closed_at ? new Date(state.closed_at) : null,
      closedBy: state?.closed_by ?? null,
      notes: state?.notes ?? null,
    };
  });
}

export type PunchListSummary = {
  byPriority: Record<SeoTaskPriority, { total: number; completed: number }>;
};

export function summarisePunchList(rows: PunchListRow[]): PunchListSummary {
  const out: PunchListSummary['byPriority'] = {
    P0: { total: 0, completed: 0 },
    P1: { total: 0, completed: 0 },
    P2: { total: 0, completed: 0 },
  };
  for (const r of rows) {
    out[r.priority].total += 1;
    if (r.status === 'completed') out[r.priority].completed += 1;
  }
  return { byPriority: out };
}

// ─── Content cadence tile ────────────────────────────────────────────────────

export type ContentCadence = {
  lastMarketWrap: { slug: string; publishedAt: Date } | null;
  nextMarketWrap: Date;
  glossaryEntries: number;
  glossaryTarget: number;
};

export async function getContentCadence(): Promise<ContentCadence> {
  const wrapRows = (await db.execute(sql`
    SELECT slug, published_at
    FROM news_posts
    WHERE kind = 'weekly_wrap' AND superseded_by IS NULL
    ORDER BY published_at DESC
    LIMIT 1
  `)) as unknown as Array<{ slug: string; published_at: string }>;

  const last = wrapRows[0]
    ? { slug: wrapRows[0].slug, publishedAt: new Date(wrapRows[0].published_at) }
    : null;

  // Next Monday 06:00 UTC.
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(6, 0, 0, 0);
  const daysUntilMonday = (1 - next.getUTCDay() + 7) % 7;
  if (daysUntilMonday === 0 && next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  }

  // Glossary count from lib/data/glossary listTerms — read here to avoid
  // a Drizzle join through file-system data.
  const { listTerms } = await import('@/lib/data/glossary');
  const glossaryEntries = listTerms().length;

  return {
    lastMarketWrap: last,
    nextMarketWrap: next,
    glossaryEntries,
    glossaryTarget: 80,
  };
}
