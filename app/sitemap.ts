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
 *
 * SEO Phase 1 (B3): `revalidate = 600` so the sitemap re-renders at most
 * every 10 minutes. The weekly Market Wrap publisher additionally hits
 * `/api/internal/revalidate-sitemap` after each successful insert so the
 * new /news/<slug> URL lands in the sitemap without waiting for the next
 * tick. Previously this route was cached at deploy time and stayed
 * frozen — sitemap had 1 of 4 weekly posts when the audit ran.
 */

import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import {
  listCanonicalProvinces,
  listDistinctMethodologies,
  listDistinctRegistries,
  listDistinctDevelopers,
  listVintageYears,
  provinceCanonicalToSlug,
} from '@/lib/queries/projects-by';
import { listRegulatoryYears } from '@/lib/queries/regulatory';
import { listTerms } from '@/lib/data/glossary';

export const revalidate = 600;

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
    // SEO Phase 2B (E-E-A-T): /data-sources + /methodology/changelog. Both
    // are citation/auditability surfaces that journalists and academic
    // papers link into — high SEO value despite low traffic.
    { url: `${BASE}/data-sources`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/methodology/changelog`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
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

  // T32 — Phase 3 programmatic hub pages. Each hub lists projects in a slice
  // (by province / methodology / registry / developer) plus an index page
  // per dimension, plus a glossary. These are the compounding SEO surfaces.
  const hubIndexEntries: MetadataRoute.Sitemap = [
    { url: `${BASE}/projects/by-province`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/projects/by-methodology`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/projects/by-registry`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/projects/by-developer`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    // SEO Phase 2D — new programmatic hubs.
    { url: `${BASE}/projects/by-vintage`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/regulatory/by-year`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/glossary`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];

  // SEO Phase 2D — per-vintage-year project hubs.
  let vintageHubEntries: MetadataRoute.Sitemap = [];
  try {
    const vintages = await listVintageYears();
    vintageHubEntries = vintages.map((v) => ({
      url: `${BASE}/projects/by-vintage/${v.year}`,
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    }));
  } catch {}

  // SEO Phase 2D — per-year regulatory roll-ups.
  let regulatoryYearEntries: MetadataRoute.Sitemap = [];
  try {
    const years = await listRegulatoryYears();
    regulatoryYearEntries = years.map((y) => ({
      url: `${BASE}/regulatory/by-year/${y.year}`,
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    }));
  } catch {}

  // SEO Phase 1 (B3): hubs derive lastmod from MAX(p.updated_at) of the
  // underlying slice. `new Date()` here was lying — every request saw a
  // fresh timestamp regardless of whether anything had actually changed.
  // One COALESCE-with-now fallback per axis keeps the sitemap honest even
  // when the slice has no projects yet (shouldn't happen, but defensive).
  type HubLastmod = { key: string; updated_at: string | Date | null };

  async function fetchHubLastmods(column: 'province' | 'methodology'): Promise<Map<string, Date>> {
    try {
      const rows = (await db.execute(sql`
        SELECT ${sql.identifier(column)} AS key,
               MAX(updated_at) AS updated_at
        FROM projects
        WHERE country = 'ID'
          AND ${sql.identifier(column)} IS NOT NULL
        GROUP BY ${sql.identifier(column)}
      `)) as unknown as HubLastmod[];
      const m = new Map<string, Date>();
      for (const r of rows) {
        if (r.key) m.set(r.key, iso(r.updated_at));
      }
      return m;
    } catch {
      return new Map();
    }
  }

  const [provinceLastmods, methodologyLastmods] = await Promise.all([
    fetchHubLastmods('province'),
    fetchHubLastmods('methodology'),
  ]);

  let provinceHubEntries: MetadataRoute.Sitemap = [];
  try {
    const provs = await listCanonicalProvinces();
    provinceHubEntries = provs.map((p) => ({
      url: `${BASE}/projects/by-province/${provinceCanonicalToSlug(p.canonical)}`,
      lastModified: provinceLastmods.get(p.canonical) ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch {}

  let methodologyHubEntries: MetadataRoute.Sitemap = [];
  try {
    const codes = await listDistinctMethodologies();
    methodologyHubEntries = codes.map((code) => ({
      url: `${BASE}/projects/by-methodology/${code.toLowerCase().replace(/\./g, '-')}`,
      lastModified: methodologyLastmods.get(code) ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch {}

  let registryHubEntries: MetadataRoute.Sitemap = [];
  try {
    const regs = await listDistinctRegistries();
    registryHubEntries = regs.map((r) => ({
      url: `${BASE}/projects/by-registry/${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`,
      lastModified: now, // registry hub aggregates all projects of that registry; refresh cadence is weekly enough that `now` doesn't drift far from truth
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch {}

  let developerHubEntries: MetadataRoute.Sitemap = [];
  try {
    const devs = await listDistinctDevelopers();
    developerHubEntries = devs.map((d) => ({
      url: `${BASE}/projects/by-developer/${d.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch {}

  const glossaryEntries: MetadataRoute.Sitemap = listTerms().map((t) => ({
    url: `${BASE}/glossary/${t.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  // T33 Phase 4B — news posts (weekly Market Wrap + future post kinds).
  // Table may not exist on fresh dev DBs; swallow errors so the sitemap
  // still ships without the news block.
  const newsIndexEntry: MetadataRoute.Sitemap = [
    { url: `${BASE}/news`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
  ];
  let newsEntries: MetadataRoute.Sitemap = [];
  try {
    const rows = (await db.execute(sql`
      SELECT slug, published_at AS updated_at
      FROM news_posts
      WHERE superseded_by IS NULL
      ORDER BY published_at DESC
    `)) as unknown as Row[];

    newsEntries = rows
      .filter((r) => r.slug)
      .map((r) => ({
        url: `${BASE}/news/${r.slug}`,
        lastModified: iso(r.updated_at),
        changeFrequency: 'yearly' as const, // once published, body is immutable
        priority: 0.6,
      }));
  } catch {
    // news_posts table missing on fresh DBs — fall through.
  }

  return [
    ...staticEntries,
    ...projectEntries,
    ...regulatoryEntries,
    ...priceEntries,
    ...hubIndexEntries,
    ...provinceHubEntries,
    ...methodologyHubEntries,
    ...registryHubEntries,
    ...developerHubEntries,
    ...vintageHubEntries,
    ...regulatoryYearEntries,
    ...glossaryEntries,
    ...newsIndexEntry,
    ...newsEntries,
  ];
}
