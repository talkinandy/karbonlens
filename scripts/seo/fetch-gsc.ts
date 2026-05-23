/**
 * scripts/seo/fetch-gsc.ts — SEO Phase 1 dashboard cron.
 *
 * Pulls indexation + Search Analytics from Google Search Console and writes
 * one row into seo_indexation_snapshots + N rows into seo_keyword_ranks per
 * run.
 *
 * STUB STATE (Phase 1 ship): this script no-ops with a clear log line until
 * GSC API credentials land. The dashboard will display "no data yet" until
 * then. Wiring is deferred to a follow-up PR — the env contract below is
 * the integration point.
 *
 * Required env (when credentials land):
 *   GSC_SERVICE_ACCOUNT_JSON_BASE64  — base64-encoded service account JSON
 *   GSC_SITE_URL                     — 'https://karbonlens.com/' (trailing slash matters in GSC API)
 *
 * Setup:
 *   1. GCP Console → IAM → Service Accounts → Create
 *   2. Add the service account email as a user on the GSC property
 *      (Settings → Users and permissions → Add user, Full permission)
 *   3. Generate a JSON key, base64-encode it, set GSC_SERVICE_ACCOUNT_JSON_BASE64.
 *
 * Cron: daily at 03:15 UTC (after the registry scrapers, before sitemap drift).
 */

import { db } from '@/lib/db';
import { seoIndexationSnapshots, seoKeywordRanks } from '@/lib/schema';

function logJson(obj: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
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

  // TODO(Phase 2): integrate googleapis or the raw Webmasters API v3.
  //   - /sites/<siteUrl>/searchAnalytics/query for clicks/impressions/position
  //   - /sites/<siteUrl>/urlCrawlErrorsCounts for indexation deltas
  // For now log a placeholder so cron logs show the script is wired.
  logJson({
    event: 'fetch_gsc_stub',
    reason: 'integration_pending',
    site: siteUrl,
    will_write: [
      `1 row into ${seoIndexationSnapshots._.name}`,
      `~30 rows into ${seoKeywordRanks._.name}`,
    ],
  });

  // No-op insert to keep this file compile-time wired to the schema imports
  // (so a missing column would break this script, not just /admin/seo).
  void db;
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'fetch_gsc_fail',
        error: msg,
      }),
    );
    process.exit(1);
  });
