/**
 * scripts/seo/fetch-gsc.ts — SEO Phase 1 dashboard cron (live GSC pull).
 *
 * Pulls Search Analytics (per query+page) and an indexation snapshot from
 * Google Search Console and writes them to seo_keyword_ranks +
 * seo_indexation_snapshots. Reads the SEO dashboard at /admin/seo.
 *
 * Auth: service-account JWT-bearer flow, see lib/seo/gsc-client.ts.
 *
 * Required env:
 *   GSC_SERVICE_ACCOUNT_JSON_BASE64  — base64-encoded service account JSON
 *   GSC_SITE_URL                     — 'https://karbonlens.com/' (trailing slash matters)
 *
 * Indexation snapshot semantics (GSC has no clean "indexed page count" API):
 *   - submitted = count of <url> entries in our own /sitemap.xml
 *   - indexed   = count of DISTINCT pages that received >=1 impression in
 *                 the trailing 28-day window. A page appearing in Search
 *                 results is definitively indexed, so this is a true lower
 *                 bound on indexed pages (cheap, no per-URL URL-Inspection
 *                 rate-limit). Pages indexed but never shown for any query
 *                 are undercounted; URL Inspection backfill is a follow-up.
 *
 * Cron: daily 03:15 UTC.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { seoKeywordRanks, seoIndexationSnapshots } from '@/lib/schema';
import {
  parseServiceAccount,
  getGscAccessToken,
  gscSearchAnalytics,
} from '@/lib/seo/gsc-client';

function logJson(obj: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchSitemapUrlCount(siteUrl: string): Promise<number> {
  try {
    const base = siteUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/sitemap.xml`, {
      headers: { 'User-Agent': 'KarbonLensSeoCron/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return 0;
    const xml = await res.text();
    return (xml.match(/<url[\s>]/g) ?? []).length;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  const credsB64 = process.env.GSC_SERVICE_ACCOUNT_JSON_BASE64;
  const siteUrl = process.env.GSC_SITE_URL;

  if (!credsB64 || !siteUrl) {
    logJson({
      event: 'fetch_gsc_skip',
      reason: 'env_missing',
      missing: [
        !credsB64 ? 'GSC_SERVICE_ACCOUNT_JSON_BASE64' : null,
        !siteUrl ? 'GSC_SITE_URL' : null,
      ].filter(Boolean),
      note: 'See docs/runbooks/seo-search-engine-onboarding.md',
    });
    process.exit(0);
  }

  // GSC Search Analytics data lands with a ~2-3 day processing lag, so the
  // window ends 3 days ago and spans the prior 28 days.
  const end = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
  const observedDate = isoDate(new Date());

  const creds = parseServiceAccount(credsB64);
  const token = await getGscAccessToken(creds);

  // ── Keyword ranks: per (query, page) over the 28-day window ──────────────
  const rows = await gscSearchAnalytics(token, siteUrl, {
    startDate: isoDate(start),
    endDate: isoDate(end),
    dimensions: ['query', 'page'],
    rowLimit: 1000,
  });

  let keywordRowsWritten = 0;
  const distinctPages = new Set<string>();

  for (const r of rows) {
    const [query, page] = r.keys;
    if (page) distinctPages.add(page);
    if (!query || !page) continue;

    await db
      .insert(seoKeywordRanks)
      .values({
        observedDate,
        query,
        page,
        position: r.position.toFixed(2),
        impressions: Math.round(r.impressions),
        clicks: Math.round(r.clicks),
        ctr: Math.min(r.ctr, 9.9999).toFixed(4),
        source: 'gsc',
      })
      .onConflictDoUpdate({
        target: [
          seoKeywordRanks.observedDate,
          seoKeywordRanks.query,
          seoKeywordRanks.page,
        ],
        set: {
          position: r.position.toFixed(2),
          impressions: Math.round(r.impressions),
          clicks: Math.round(r.clicks),
          ctr: Math.min(r.ctr, 9.9999).toFixed(4),
        },
      });
    keywordRowsWritten += 1;
  }

  // ── Indexation snapshot ──────────────────────────────────────────────────
  const submitted = await fetchSitemapUrlCount(siteUrl);
  const indexed = distinctPages.size;

  await db.insert(seoIndexationSnapshots).values({
    source: 'gsc',
    indexed,
    submitted,
    stragglers: [],
    raw: sql`${JSON.stringify({
      window: { start: isoDate(start), end: isoDate(end) },
      keyword_rows: rows.length,
      distinct_pages_with_impressions: indexed,
    })}::jsonb`,
  });

  logJson({
    event: 'fetch_gsc_ok',
    window: { start: isoDate(start), end: isoDate(end) },
    keyword_rows_written: keywordRowsWritten,
    indexed,
    submitted,
  });
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      JSON.stringify({ ts: new Date().toISOString(), event: 'fetch_gsc_fail', error: msg }),
    );
    process.exit(1);
  });
