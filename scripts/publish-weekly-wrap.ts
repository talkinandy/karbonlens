/**
 * scripts/publish-weekly-wrap.ts — T33 Phase 4B publisher.
 *
 * Runnable via `npx tsx scripts/publish-weekly-wrap.ts`. Queries the last
 * 7 days of DB state, calls the deterministic composer, and inserts a
 * single `news_posts` row. If the composer decides the week is too quiet
 * to publish (see guardrail in `lib/composers/weekly-wrap.ts`), we log a
 * `weekly_wrap_skip` line and exit 0 — cron must never noise.
 *
 * Dedupe: the DB has `uq_news_posts_kind_date` on
 * `(kind, (published_at AT TIME ZONE 'UTC')::date)` — migration 007. A
 * second cron firing on the same UTC day hits ON CONFLICT and silently
 * no-ops. We log `weekly_wrap_duplicate` so operators can still see it
 * happened without it being an error.
 *
 * IndexNow ping: fire-and-forget, 10s timeout in `lib/seo/indexnow.ts`.
 * We include the new /news/[slug] URL + the /news index so Bing &
 * co. refresh both.
 */

import { sql } from 'drizzle-orm';

import { composeWeeklyWrap, type WeeklyWrapFacts } from '@/lib/composers/weekly-wrap';
import { db } from '@/lib/db';
import { newsPosts } from '@/lib/schema';
import { pingIndexNow } from '@/lib/seo/indexnow';

type IssuanceRow = {
  project_slug: string;
  project_name: string;
  registry_name: string;
  vintage_year: number;
  credits: string; // cast to text to avoid JS float precision loss over numeric
  issuance_date: string;
};

type AlertProjectRow = {
  slug: string;
  name_canonical: string;
  province: string | null;
  new_alert_count: number;
};

type RegulatoryRow = {
  slug: string;
  document_type: string | null;
  document_number: string | null;
  title: string;
  event_date: string;
  ministry: string | null;
  summary_en: string | null;
};

type PriceRow = {
  month_slug: string;
  total_volume_tco2e: string | null;
  avg_price_idr: string | null;
  total_value_idr: string | null;
};

type AlertTotalRow = { total: number };

// Convert a stringified numeric (or null) to number|null without losing
// the null signal. `null` → null; '0' → 0; '1234.56' → 1234.56.
function numOrNull(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function signedPct(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null) return null;
  if (prev === 0) return null; // undefined %, don't fabricate
  return ((curr - prev) / prev) * 100;
}

function logJson(obj: Record<string, unknown>): void {
  // One-line NDJSON per cron-log convention (see run_weekly_digest.sh).
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

async function main(): Promise<void> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  // postgres-js (the driver Drizzle wraps) doesn't auto-serialize a JS Date
  // when it's bound via a raw sql`` template — it needs an ISO string for
  // timestamptz columns. The typed drizzle-orm operator form (gte / eq) does
  // the conversion itself; raw sql`` templates don't.
  const windowStartIso = windowStart.toISOString();
  const windowEndIso = windowEnd.toISOString();

  const [
    issuanceRes,
    alertRes,
    regulatoryRes,
    priceRes,
    alertTotalRes,
  ] = await Promise.all([
    // ── newIssuances ───────────────────────────────────────────────────────
    // `credits` is numeric in the DB; we cast to text to keep full precision
    // across the JSON boundary. Parsed to Number when building the facts bundle.
    db.execute(sql`
      SELECT
        p.slug            AS project_slug,
        p.name_canonical  AS project_name,
        i.registry_name   AS registry_name,
        i.vintage_year    AS vintage_year,
        i.credits::text   AS credits,
        i.issuance_date::text AS issuance_date
      FROM issuances i
      JOIN projects p ON p.id = i.project_id
      WHERE p.country = 'ID'
        AND i.ingested_at >= ${windowStartIso}
        AND i.ingested_at <  ${windowEndIso}
      ORDER BY i.credits DESC NULLS LAST
      LIMIT 50
    `),

    // ── topAlertProjects (top 5 by new alert count) ────────────────────────
    db.execute(sql`
      SELECT
        p.slug            AS slug,
        p.name_canonical  AS name_canonical,
        p.province        AS province,
        COUNT(*)::int     AS new_alert_count
      FROM satellite_alerts sa
      JOIN projects p ON p.id = sa.project_id
      WHERE p.country = 'ID'
        AND sa.ingested_at >= ${windowStartIso}
        AND sa.ingested_at <  ${windowEndIso}
      GROUP BY p.id, p.slug, p.name_canonical, p.province
      ORDER BY new_alert_count DESC
      LIMIT 5
    `),

    // ── newRegulatoryEvents ────────────────────────────────────────────────
    // Slug derived from document_type + document_number; lowercased,
    // slashes and spaces rewritten to hyphens. regulatory_events has no
    // `ingested_at` column — `created_at` is the append time (confirmed
    // in schema.ts + migration).
    db.execute(sql`
      SELECT
        LOWER(
          REPLACE(
            REPLACE(COALESCE(document_type, '') || '-' || COALESCE(document_number, ''), '/', '-'),
            ' ',
            '-'
          )
        )                 AS slug,
        document_type     AS document_type,
        document_number   AS document_number,
        title             AS title,
        event_date::text  AS event_date,
        ministry          AS ministry,
        summary_en        AS summary_en
      FROM regulatory_events
      WHERE created_at >= ${windowStartIso}
        AND created_at <  ${windowEndIso}
      ORDER BY event_date DESC
    `),

    // ── newPriceMonth ──────────────────────────────────────────────────────
    // Most-recent snapshot whose scrape landed in the window. If present
    // we grab the prior month too for MoM deltas.
    db.execute(sql`
      WITH current AS (
        SELECT
          TO_CHAR(period_month, 'YYYY-MM') AS month_slug,
          period_month                     AS period_month,
          total_volume_tco2e::text         AS total_volume_tco2e,
          avg_price_idr::text              AS avg_price_idr,
          total_value_idr::text            AS total_value_idr
        FROM idx_monthly_snapshots
        WHERE scraped_at >= ${windowStartIso}
        ORDER BY period_month DESC
        LIMIT 1
      ),
      prior AS (
        SELECT
          s.total_volume_tco2e::text AS total_volume_tco2e,
          s.avg_price_idr::text      AS avg_price_idr
        FROM idx_monthly_snapshots s
        JOIN current c ON s.period_month < c.period_month
        ORDER BY s.period_month DESC
        LIMIT 1
      )
      SELECT
        c.month_slug            AS month_slug,
        c.total_volume_tco2e    AS total_volume_tco2e,
        c.avg_price_idr         AS avg_price_idr,
        c.total_value_idr       AS total_value_idr,
        p.total_volume_tco2e    AS prior_volume_tco2e,
        p.avg_price_idr         AS prior_avg_price_idr
      FROM current c
      LEFT JOIN prior p ON TRUE
    `),

    // ── alertTotalRow (all alerts, not just top 5) ─────────────────────────
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM satellite_alerts sa
      JOIN projects p ON p.id = sa.project_id
      WHERE p.country = 'ID'
        AND sa.ingested_at >= ${windowStartIso}
        AND sa.ingested_at <  ${windowEndIso}
    `),
  ]);

  // drizzle-orm/postgres-js returns rows as an array on the result — the
  // shape is a plain `unknown[]`. Cast at the edge.
  const issuanceRows = issuanceRes as unknown as IssuanceRow[];
  const alertRows = alertRes as unknown as AlertProjectRow[];
  const regulatoryRows = regulatoryRes as unknown as RegulatoryRow[];
  const priceRows = priceRes as unknown as Array<
    PriceRow & {
      prior_volume_tco2e: string | null;
      prior_avg_price_idr: string | null;
    }
  >;
  const alertTotalRows = alertTotalRes as unknown as AlertTotalRow[];

  const newIssuances = issuanceRows.map((r) => ({
    projectSlug: r.project_slug,
    projectName: r.project_name,
    registryName: r.registry_name,
    vintageYear: Number(r.vintage_year),
    credits: Number(r.credits),
    issuanceDate: r.issuance_date,
  }));

  const topAlertProjects = alertRows.map((r) => ({
    projectSlug: r.slug,
    projectName: r.name_canonical,
    province: r.province,
    newAlertCount: Number(r.new_alert_count),
  }));

  const newRegulatoryEvents = regulatoryRows.map((r) => ({
    slug: r.slug,
    documentType: r.document_type,
    documentNumber: r.document_number,
    title: r.title,
    eventDate: r.event_date,
    ministry: r.ministry,
    summaryEn: r.summary_en,
  }));

  const priceRow = priceRows[0] ?? null;
  const newPriceMonth = priceRow
    ? {
        monthSlug: priceRow.month_slug,
        totalVolumeTco2e: numOrNull(priceRow.total_volume_tco2e),
        avgPriceIdr: numOrNull(priceRow.avg_price_idr),
        totalValueIdr: numOrNull(priceRow.total_value_idr),
        momVolumePct: signedPct(
          numOrNull(priceRow.total_volume_tco2e),
          numOrNull(priceRow.prior_volume_tco2e),
        ),
        momPricePct: signedPct(
          numOrNull(priceRow.avg_price_idr),
          numOrNull(priceRow.prior_avg_price_idr),
        ),
      }
    : null;

  const totalNewIssuedCredits = newIssuances.reduce(
    (s, r) => s + (Number.isFinite(r.credits) ? r.credits : 0),
    0,
  );
  const totalNewAlerts = Number(alertTotalRows[0]?.total ?? 0);

  const facts: WeeklyWrapFacts = {
    windowStart,
    windowEnd,
    newIssuances,
    topAlertProjects,
    newRegulatoryEvents,
    newPriceMonth,
    totalNewIssuedCredits,
    totalNewAlerts,
  };

  const out = composeWeeklyWrap(facts);

  if (!out.shouldPublish) {
    logJson({ event: 'weekly_wrap_skip', reason: out.skipReason });
    return;
  }

  // Dedupe via ON CONFLICT DO NOTHING. Two unique constraints can fire:
  //   - `news_posts_slug_key` on slug
  //   - `uq_news_posts_kind_date` on (kind, (published_at AT TIME ZONE 'UTC')::date)
  // The Drizzle API for `onConflictDoNothing` only accepts column targets,
  // not the expression index. Calling it without a target delegates to
  // PostgreSQL's implicit form, which catches conflicts against ANY unique
  // index — exactly the silent no-op behaviour we want on double-fires.
  // `.returning()` is empty on conflict, which is our signal.
  const inserted = await db
    .insert(newsPosts)
    .values({
      slug: out.slug,
      kind: 'weekly_wrap',
      title: out.title,
      summary: out.summary,
      bodyMd: out.bodyMd,
      // Drizzle serialises Date → ISO string into jsonb.
      factsJson: out.factsJson as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: newsPosts.id, slug: newsPosts.slug });

  if (inserted.length === 0) {
    logJson({
      event: 'weekly_wrap_duplicate',
      reason: 'already published today',
      slug: out.slug,
    });
    return;
  }

  const base = process.env.NEXTAUTH_URL ?? 'https://karbonlens.com';
  const indexnow = await pingIndexNow([
    `${base}/news/${out.slug}`,
    `${base}/news`,
  ]);

  // SEO Phase 1 (B3): trigger /sitemap.xml revalidation so Bing/Google's
  // next sitemap fetch sees the new /news/<slug>. Fire-and-forget — if
  // the secret is missing or the endpoint is unreachable, the next ISR
  // tick (600s) catches up. Failure must not break the publish run.
  const revalidateSecret = process.env.SITEMAP_REVALIDATE_SECRET;
  let sitemapRevalidate: { ok: boolean; status: number } = { ok: false, status: 0 };
  if (revalidateSecret) {
    try {
      const res = await fetch(`${base}/api/internal/revalidate-sitemap`, {
        method: 'POST',
        headers: { authorization: `Bearer ${revalidateSecret}` },
        signal: AbortSignal.timeout(10_000),
      });
      sitemapRevalidate = { ok: res.ok, status: res.status };
    } catch {
      sitemapRevalidate = { ok: false, status: 0 };
    }
  }

  logJson({
    event: 'weekly_wrap_published',
    slug: out.slug,
    id: inserted[0].id,
    indexnow,
    sitemap_revalidate: sitemapRevalidate,
    alerts: totalNewAlerts,
    issuances: newIssuances.length,
    credits: totalNewIssuedCredits,
    regulatory: newRegulatoryEvents.length,
    price_month: newPriceMonth?.monthSlug ?? null,
  });
}

main()
  .then(() => {
    // Drizzle's postgres-js pool keeps the process alive until it's torn
    // down. A clean exit is cheaper than hanging on a timer.
    process.exit(0);
  })
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'weekly_wrap_fail',
        error: msg,
      }),
    );
    process.exit(1);
  });
