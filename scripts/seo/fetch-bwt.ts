/**
 * scripts/seo/fetch-bwt.ts — SEO Phase 1 dashboard cron.
 *
 * Pulls indexation stats from Bing Webmaster Tools and writes one
 * seo_indexation_snapshots row per run (source='bwt').
 *
 * STUB STATE (Phase 1 ship): no-ops until credentials land.
 *
 * Required env:
 *   BWT_API_KEY  — Bing Webmaster API key (Settings → API access in BWT)
 *   BWT_SITE_URL — 'https://karbonlens.com/'
 *
 * Cron: daily at 03:20 UTC (5 min after GSC fetch).
 */

import { db } from '@/lib/db';
import { seoIndexationSnapshots } from '@/lib/schema';

function logJson(obj: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

async function main(): Promise<void> {
  const apiKey = process.env.BWT_API_KEY;
  const siteUrl = process.env.BWT_SITE_URL;

  if (!apiKey || !siteUrl) {
    logJson({
      event: 'fetch_bwt_skip',
      reason: 'env_missing',
      missing: [!apiKey ? 'BWT_API_KEY' : null, !siteUrl ? 'BWT_SITE_URL' : null].filter(Boolean),
      note: 'See docs/runbooks/seo-search-engine-onboarding.md §2',
    });
    process.exit(0);
  }

  // TODO(Phase 2): integrate https://www.bing.com/webmaster/api.svc/json/
  //   - GetUrlInfo for per-URL indexed status
  //   - GetPageStats for the property-level rollup
  logJson({
    event: 'fetch_bwt_stub',
    reason: 'integration_pending',
    site: siteUrl,
    will_write: [`1 row into ${seoIndexationSnapshots._.name}`],
  });

  void db;
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'fetch_bwt_fail',
        error: msg,
      }),
    );
    process.exit(1);
  });
