/**
 * sitemap.ts — dynamic sitemap for every indexable URL (T31).
 *
 * Per 2026 large-site best practice this exposes a single merged
 * sitemap. If the project grows past ~10,000 URLs we'll split into a
 * sitemap index (sitemap-projects.xml, sitemap-regulatory.xml, etc.)
 * but v0.1 is ~200 projects + ~10 monthly prices + a handful of
 * static pages — well inside the 50,000-URL / 50MB Google ceiling.
 *
 * `lastModified` wires to the real updated_at / event_date / month end
 * on the row — not to `new Date()`. Per Ahrefs Dec 2025 guidance,
 * lying about lastmod is a trust hit against Google's own crawl log.
 */

import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

const BASE = 'https://karbonlens.com';

type Row = {
  slug?: string;
  updated_at?: string | Date | null;
  event_date?: string | Date | null;
  period_end?: string | Date | null;
  created_at?: string | Date | null;
};

function iso(d: Row['updated_at'] | undefined): Date {
  if (!d) return new Date();
  const dt = typeof d === 'string' ? new Date(d) : d;
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static public routes — high priority, low change frequency.
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE}/projects`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/prices`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/regulatory`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/methodology`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Project detail pages — one per indexed project. Latest-update is the
  // greatest of (project.updated_at, most-recent issuance.ingested_at,
  // most-recent retirement.ingested_at, description.generated_at). The two
  // scraper tables use `ingested_at`, not `updated_at`.
  let projectEntries: MetadataRoute.Sitemap = [];
  try {
    const rows = (await db.execute(sql`
      SELECT p.slug,
             COALESCE(
               GREATEST(
                 MAX(i.ingested_at),
                 MAX(r.ingested_at),
                 MAX(pd.generated_at),
                 p.updated_at
               ),
               p.updated_at
             ) AS updated_at
      FROM projects p
      LEFT JOIN issuances i ON i.project_id = p.id
      LEFT JOIN retirements r ON r.project_id = p.id
      LEFT JOIN project_descriptions pd ON pd.project_id = p.id
      WHERE p.country = 'ID' AND p.slug IS NOT NULL
      GROUP BY p.id
    `)) as unknown as Row[];

    projectEntries = rows.map((r) => ({
      url: `${BASE}/projects/${r.slug}`,
      lastModified: iso(r.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch {
    // If the DB is cold or the join set is missing, fall through — the
    // static sitemap still ships. Better than a 500 on /sitemap.xml.
  }

  // Regulatory event detail pages (T31 introduces /regulatory/[slug]).
  let regulatoryEntries: MetadataRoute.Sitemap = [];
  try {
    const rows = (await db.execute(sql`
      SELECT
        LOWER(REPLACE(REPLACE(COALESCE(document_type, '') || '-' || COALESCE(document_number, ''), '/', '-'), ' ', '-')) AS slug,
        event_date AS updated_at
      FROM regulatory_events
      WHERE is_upcoming = FALSE
    `)) as unknown as Row[];

    regulatoryEntries = rows
      .filter((r) => r.slug && r.slug !== '-')
      .map((r) => ({
        url: `${BASE}/regulatory/${r.slug}`,
        lastModified: iso(r.updated_at),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }));
  } catch {
    // Same defensive fallthrough.
  }

  // Monthly price pages — the table uses `period_month` (first day of each
  // month). The `/prices/[YYYY-MM]` detail page is a Phase-3 surface; the
  // sitemap entries are forward-listed so crawlers discover them as soon as
  // the routes ship.
  let priceEntries: MetadataRoute.Sitemap = [];
  try {
    const rows = (await db.execute(sql`
      SELECT TO_CHAR(period_month, 'YYYY-MM') AS slug,
             period_month AS updated_at
      FROM idx_monthly_snapshots
      ORDER BY period_month DESC
    `)) as unknown as Row[];

    priceEntries = rows.map((r) => ({
      url: `${BASE}/prices/${r.slug}`,
      lastModified: iso(r.updated_at),
      changeFrequency: 'yearly' as const, // monthly snapshot is immutable once closed
      priority: 0.5,
    }));
  } catch {
    // defensive
  }

  return [...staticEntries, ...projectEntries, ...regulatoryEntries, ...priceEntries];
}
