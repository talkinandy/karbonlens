/**
 * scripts/indexnow-nightly.ts — nightly IndexNow delta-ping (T33 Phase 4A).
 *
 * Collects every KarbonLens URL whose underlying content changed in the
 * last 24 hours and submits them as a single IndexNow batch via
 * `pingIndexNow`. The helper is a no-op when `INDEXNOW_KEY` is unset, so
 * the cron is safe to land before the key is provisioned (T32 runbook).
 *
 * Freshness sources (UNION-ed, deduped in JS):
 *   1. projects.updated_at          — row itself changed
 *   2. issuances.ingested_at        — new issuance rows
 *   3. retirements.ingested_at      — new retirement rows
 *   4. satellite_alerts.ingested_at — new GFW / GLAD alerts
 *   5. project_descriptions.generated_at — AI description (re)generated
 *   6. regulatory_events.created_at — new regulatory items
 *   7. idx_monthly_snapshots.scraped_at — new monthly price snapshots
 *   8. news_posts.published_at      — new news / weekly wrap posts
 *
 * Each query is wrapped in its own try/catch so a missing table on a fresh
 * dev DB (news_posts and project_descriptions are recent) does not kill
 * the run.
 *
 * Output: one JSON log line to stdout with event ∈
 *   {indexnow_noop, indexnow_ok, indexnow_fail, indexnow_crash}
 * so the cron log under /var/log/karbonlens/indexnow.log stays jq-friendly.
 *
 * Run with: npx tsx scripts/indexnow-nightly.ts
 */

import { pingIndexNow } from '@/lib/seo/indexnow';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

type PathRow = { path: string | null };

async function main(): Promise<void> {
  const base = process.env.NEXTAUTH_URL ?? 'https://karbonlens.com';
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // postgres-js won't auto-serialize a JS Date in a raw sql`` template
  // (it throws TypeError [ERR_INVALID_ARG_TYPE] during Bind). ISO string
  // casts cleanly to timestamptz in postgres.
  const sinceIso = since.toISOString();

  const paths = new Set<string>();

  async function collect(
    label: string,
    query: ReturnType<typeof sql>,
  ): Promise<void> {
    try {
      const rows = (await db.execute(query)) as unknown as PathRow[];
      for (const r of rows) {
        if (r && typeof r.path === 'string' && r.path.length > 0) {
          paths.add(r.path);
        }
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: 'indexnow_query_failed',
          source: label,
          error: (err as Error).message,
        }),
      );
    }
  }

  await Promise.all([
    // 1. Projects whose row itself changed.
    collect(
      'projects_updated',
      sql`
        SELECT DISTINCT '/projects/' || p.slug AS path
        FROM projects p
        WHERE p.country = 'ID'
          AND p.slug IS NOT NULL
          AND p.updated_at >= ${sinceIso}
      `,
    ),
    // 2. Projects with fresh issuances.
    collect(
      'projects_issuances',
      sql`
        SELECT DISTINCT '/projects/' || p.slug AS path
        FROM projects p
        JOIN issuances i ON i.project_id = p.id
        WHERE p.country = 'ID'
          AND p.slug IS NOT NULL
          AND i.ingested_at >= ${sinceIso}
      `,
    ),
    // 3. Projects with fresh retirements.
    collect(
      'projects_retirements',
      sql`
        SELECT DISTINCT '/projects/' || p.slug AS path
        FROM projects p
        JOIN retirements r ON r.project_id = p.id
        WHERE p.country = 'ID'
          AND p.slug IS NOT NULL
          AND r.ingested_at >= ${sinceIso}
      `,
    ),
    // 4. Projects with fresh satellite alerts.
    collect(
      'projects_satellite_alerts',
      sql`
        SELECT DISTINCT '/projects/' || p.slug AS path
        FROM projects p
        JOIN satellite_alerts sa ON sa.project_id = p.id
        WHERE p.country = 'ID'
          AND p.slug IS NOT NULL
          AND sa.ingested_at >= ${sinceIso}
      `,
    ),
    // 5. Projects whose description was (re)generated.
    collect(
      'projects_descriptions',
      sql`
        SELECT DISTINCT '/projects/' || p.slug AS path
        FROM projects p
        JOIN project_descriptions pd ON pd.project_id = p.id
        WHERE p.country = 'ID'
          AND p.slug IS NOT NULL
          AND pd.generated_at >= ${sinceIso}
      `,
    ),
    // 6. New regulatory events. Slug collapses to "-" when both
    //    document_type and document_number are NULL — we pre-filter those
    //    rows and also post-filter malformed slugs below.
    collect(
      'regulatory_events',
      sql`
        SELECT DISTINCT '/regulatory/' ||
          LOWER(
            REPLACE(
              REPLACE(
                COALESCE(document_type, '') || '-' || COALESCE(document_number, ''),
                '/', '-'
              ),
              ' ', '-'
            )
          ) AS path
        FROM regulatory_events
        WHERE created_at >= ${sinceIso}
          AND document_type IS NOT NULL
          AND document_number IS NOT NULL
      `,
    ),
    // 7. New monthly price snapshots.
    collect(
      'idx_monthly_snapshots',
      sql`
        SELECT DISTINCT '/prices/' || TO_CHAR(period_month, 'YYYY-MM') AS path
        FROM idx_monthly_snapshots
        WHERE scraped_at >= ${sinceIso}
      `,
    ),
    // 8. New news posts (weekly wrap etc.).
    collect(
      'news_posts',
      sql`
        SELECT DISTINCT '/news/' || slug AS path
        FROM news_posts
        WHERE published_at >= ${sinceIso}
          AND slug IS NOT NULL
      `,
    ),
  ]);

  // Drop malformed paths defensively: the regulatory slug still collapses
  // to "<prefix>/-" if one of doc_type / doc_number is an empty string
  // (rather than NULL). Also drop any path ending in a trailing slash or
  // whitespace.
  const urls = Array.from(paths)
    .filter((p) => {
      if (!p) return false;
      const last = p.split('/').pop() ?? '';
      if (last.length === 0) return false;
      if (/-$/.test(last)) return false;
      if (/^-+$/.test(last)) return false;
      if (/\s$/.test(p)) return false;
      return true;
    })
    .map((p) => `${base}${p}`);

  if (urls.length === 0) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'indexnow_noop',
      }),
    );
    return;
  }

  const result = await pingIndexNow(urls);
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: result.ok ? 'indexnow_ok' : 'indexnow_fail',
      status: result.status,
      count: result.count,
      url_count: urls.length,
      sample: urls.slice(0, 5),
    }),
  );
}

main()
  .then(() => {
    // Ensure the postgres pool does not keep the process alive.
    process.exit(0);
  })
  .catch((e) => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'indexnow_crash',
        error: (e as Error).message,
      }),
    );
    process.exit(1);
  });
