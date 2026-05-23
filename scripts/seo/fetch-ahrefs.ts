/**
 * scripts/seo/fetch-ahrefs.ts — SEO Phase 1 dashboard cron.
 *
 * Pulls referring-domain + backlink list from Ahrefs Webmaster Tools (free
 * tier for owned domains) and upserts into seo_backlinks.
 *
 * STUB STATE (Phase 1 ship): no-ops until credentials land.
 *
 * Required env:
 *   AHREFS_WMT_TOKEN   — OAuth token from https://ahrefs.com/api
 *   AHREFS_WMT_TARGET  — 'karbonlens.com'
 *
 * Cron: weekly Sundays 04:00 UTC. Backlink discovery doesn't change
 * minute-to-minute and the free tier rate-limits aggressively.
 */

import { db } from '@/lib/db';
import { seoBacklinks } from '@/lib/schema';

function logJson(obj: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

async function main(): Promise<void> {
  const token = process.env.AHREFS_WMT_TOKEN;
  const target = process.env.AHREFS_WMT_TARGET;

  if (!token || !target) {
    logJson({
      event: 'fetch_ahrefs_skip',
      reason: 'env_missing',
      missing: [!token ? 'AHREFS_WMT_TOKEN' : null, !target ? 'AHREFS_WMT_TARGET' : null].filter(Boolean),
      note: 'Sign up for Ahrefs Webmaster Tools (free for verified owned domains).',
    });
    process.exit(0);
  }

  // TODO(Phase 2): integrate https://api.ahrefs.com/v3/backlinks-management/
  // and https://api.ahrefs.com/v3/site-explorer/refdomains-history for
  // delta tracking.
  logJson({
    event: 'fetch_ahrefs_stub',
    reason: 'integration_pending',
    target,
    will_write: [`N rows upserted into ${seoBacklinks._.name}`],
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
        event: 'fetch_ahrefs_fail',
        error: msg,
      }),
    );
    process.exit(1);
  });
