/**
 * lib/queries/seo-metrics.ts — T31 SEO health dashboard data loader.
 *
 * Owns the read path for `app/admin/seo/page.tsx`. Single export
 * `getSeoMetrics()` returns a typed snapshot covering content inventory
 * (counts, latest-ingest timestamps) and freshness alerts (rows that
 * should normally be zero — anything non-zero is operator-actionable).
 *
 * Resilience: each underlying query is wrapped in its own try/catch so a
 * missing table on a dev DB without the latest migration (e.g. migration
 * 006 for `project_descriptions`) does not 500 the whole dashboard. The
 * shape stays stable; absent tables surface as 0 / null and the page
 * renders normally. Errors are logged via `console.warn` so the operator
 * can still spot the gap.
 *
 * All queries use raw `sql` rather than the Drizzle query builder. The
 * shapes here are simple aggregates (COUNT, MAX, COUNT-with-WHERE) and
 * raw SQL keeps this file self-contained — no schema imports needed, so
 * a missing table cannot break the module load itself.
 */

import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export type SeoMetrics = {
  contentInventory: {
    totalProjects: number;
    projectsWithDescription: number;
    regulatoryEvents: number;
    monthlyPriceSnapshots: number;
    latestScoreComputeAt: Date | null;
    latestSatelliteAlertIngestAt: Date | null;
  };
  freshnessAlerts: {
    staleScores: number; // projects whose latest score_date > 7 days ago
    staleDescriptions: number; // project_descriptions generated_at > 90 days ago
    missedUpcoming: number; // regulatory_events still is_upcoming=TRUE but event_date < now()
    staleDescriptionExampleSlug: string | null;
    missedUpcomingExampleTitle: string | null;
    staleScoresExampleSlug: string | null;
  };
};

/**
 * Run a one-row aggregate and return the first row, or `null` if the
 * underlying query throws (most commonly: relation does not exist).
 */
async function safeQuery<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[seo-metrics] ${label} failed:`, err);
    return null;
  }
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

type Row = Record<string, unknown>;

function firstRow(result: unknown): Row | null {
  if (!result) return null;
  const rows = Array.isArray(result) ? result : (result as { rows?: Row[] }).rows;
  if (!rows || rows.length === 0) return null;
  return rows[0] as Row;
}

export async function getSeoMetrics(): Promise<SeoMetrics> {
  // ── Content inventory ────────────────────────────────────────────────────
  const totalProjectsRow = await safeQuery('totalProjects', () =>
    db.execute(
      sql`SELECT COUNT(*)::int AS n FROM projects WHERE country = 'ID'`,
    ),
  );
  const projectsWithDescriptionRow = await safeQuery(
    'projectsWithDescription',
    () => db.execute(sql`SELECT COUNT(*)::int AS n FROM project_descriptions`),
  );
  const regulatoryEventsRow = await safeQuery('regulatoryEvents', () =>
    db.execute(sql`SELECT COUNT(*)::int AS n FROM regulatory_events`),
  );
  const monthlyPriceSnapshotsRow = await safeQuery('monthlyPriceSnapshots', () =>
    db.execute(sql`SELECT COUNT(*)::int AS n FROM idx_monthly_snapshots`),
  );
  const latestScoreRow = await safeQuery('latestScoreComputeAt', () =>
    db.execute(sql`SELECT MAX(score_date) AS d FROM project_scores`),
  );
  const latestSatRow = await safeQuery('latestSatelliteAlertIngestAt', () =>
    db.execute(sql`SELECT MAX(ingested_at) AS d FROM satellite_alerts`),
  );

  // ── Freshness alerts ─────────────────────────────────────────────────────
  // Stale scores: count of distinct projects whose most-recent score_date is
  // older than 7 days. Daily cron should keep this at 0.
  const staleScoresRow = await safeQuery('staleScores', () =>
    db.execute(sql`
      WITH latest AS (
        SELECT project_id, MAX(score_date) AS last_date
        FROM project_scores
        GROUP BY project_id
      )
      SELECT COUNT(*)::int AS n
      FROM latest
      WHERE last_date < (CURRENT_DATE - INTERVAL '7 days')
    `),
  );
  const staleScoresExampleRow = await safeQuery('staleScoresExample', () =>
    db.execute(sql`
      WITH latest AS (
        SELECT project_id, MAX(score_date) AS last_date
        FROM project_scores
        GROUP BY project_id
      )
      SELECT p.slug AS slug
      FROM latest l
      JOIN projects p ON p.id = l.project_id
      WHERE l.last_date < (CURRENT_DATE - INTERVAL '7 days')
      ORDER BY l.last_date ASC
      LIMIT 1
    `),
  );

  const staleDescriptionsRow = await safeQuery('staleDescriptions', () =>
    db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM project_descriptions
      WHERE generated_at < (NOW() - INTERVAL '90 days')
    `),
  );
  const staleDescriptionsExampleRow = await safeQuery(
    'staleDescriptionsExample',
    () =>
      db.execute(sql`
        SELECT p.slug AS slug
        FROM project_descriptions pd
        JOIN projects p ON p.id = pd.project_id
        WHERE pd.generated_at < (NOW() - INTERVAL '90 days')
        ORDER BY pd.generated_at ASC
        LIMIT 1
      `),
  );

  const missedUpcomingRow = await safeQuery('missedUpcoming', () =>
    db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM regulatory_events
      WHERE is_upcoming = TRUE
        AND event_date < CURRENT_DATE
    `),
  );
  const missedUpcomingExampleRow = await safeQuery('missedUpcomingExample', () =>
    db.execute(sql`
      SELECT title AS title
      FROM regulatory_events
      WHERE is_upcoming = TRUE
        AND event_date < CURRENT_DATE
      ORDER BY event_date ASC
      LIMIT 1
    `),
  );

  return {
    contentInventory: {
      totalProjects: toNumber(firstRow(totalProjectsRow)?.n),
      projectsWithDescription: toNumber(
        firstRow(projectsWithDescriptionRow)?.n,
      ),
      regulatoryEvents: toNumber(firstRow(regulatoryEventsRow)?.n),
      monthlyPriceSnapshots: toNumber(firstRow(monthlyPriceSnapshotsRow)?.n),
      latestScoreComputeAt: toDate(firstRow(latestScoreRow)?.d),
      latestSatelliteAlertIngestAt: toDate(firstRow(latestSatRow)?.d),
    },
    freshnessAlerts: {
      staleScores: toNumber(firstRow(staleScoresRow)?.n),
      staleDescriptions: toNumber(firstRow(staleDescriptionsRow)?.n),
      missedUpcoming: toNumber(firstRow(missedUpcomingRow)?.n),
      staleScoresExampleSlug: toString(firstRow(staleScoresExampleRow)?.slug),
      staleDescriptionExampleSlug: toString(
        firstRow(staleDescriptionsExampleRow)?.slug,
      ),
      missedUpcomingExampleTitle: toString(
        firstRow(missedUpcomingExampleRow)?.title,
      ),
    },
  };
}
