/**
 * lib/queries/landing-stats.ts — Drizzle query helpers for the public landing
 * page (T18).
 *
 * Ownership: T18. This is the only module that aggregates the cross-table
 * "hero stats" rendered on `/`. It must not be imported by client components.
 *
 * Cache contract: app/(public)/page.tsx declares `export const revalidate = 3600`.
 * This means Next.js ISR will serve the cached HTML for up to 1 hour before
 * triggering a background re-fetch. The function itself has no internal cache.
 *
 * v0.2 consideration: if operators need sub-15-minute freshness on the landing
 * (e.g., for ops-level GFW alert monitoring), reduce `revalidate` to 900.
 *
 * Failure mode: the entire `getLandingStats()` body is wrapped in try/catch.
 * On any error it logs `[T18] getLandingStats error:` and returns a
 * zero/null-filled `LandingStats` object. The landing page renders "—" for
 * null values and never returns HTTP 500.
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// Featured project slugs — the three flagship projects surfaced on the
// landing. These are the REAL DB slugs (reconciled during T05.1, T06.1).
// Keep in sync with `proxy.ts` PUBLIC_PROJECT_SLUGS (middleware bypass).
export const FEATURED_SLUGS = [
  'katingan-peatland-restoration-and-conservation-project',
  'rimba-raya-biodiversity-reserve-project',
  'sumatra-merang-peatland-project-smpp',
] as const;

export type FeaturedProject = {
  slug: string;
  nameCanonical: string;
  developer: string | null;
  province: string | null;
  projectType: string | null;
  integrityScore: number | null;
  registryNames: string[];
};

export type LandingStats = {
  // Projects
  projectCount: number;
  totalVcusIssued: string;            // formatted compact, e.g. "3.6M VCUs"
  totalVcusAvailable: string;         // formatted compact

  // IDXCarbon latest month
  latestPeriod: string | null;        // "Mar 2026"
  latestVolumeTco2e: string | null;   // "117k tCO₂e"
  latestAvgPriceIdr: string | null;   // "Rp 40,025"
  latestValueIdr: string | null;      // "Rp 4.7B"
  momDeltaPct: number | null;         // rounded 1dp; null if < 2 months

  // T25 ticker additions (MoM vs prior month — idx_monthly_snapshots is monthly)
  momVolumeDelta: number | null;      // absolute tCO2e diff vs prior month; null if < 2 months
  idxParticipantCount: number | null; // latest idx_monthly_snapshots.registered_participants
  momParticipantDelta: number | null; // absolute participant diff vs prior month
  vcusTradedYtd: string | null;       // formatted YTD volume from idx_monthly_snapshots

  // Integrity scores
  medianIntegrityScore: number | null;

  // Regulatory events
  regulatoryEventCount: number;

  // GFW alerts (90-day window) + 30d + 7d for WoW delta
  gfwAlerts90d: number;
  activeAlerts30d: number;            // T25: sum of satellite_alerts last 30d
  alerts7d: number;                   // T25: last 7 days count (for WoW delta)
  alertsPrior7d: number;              // T25: 8–14 days ago count (WoW comparator)

  // Data-source last-sync timestamps
  registriesLastSynced: Date | null;
  satelliteLastIngested: Date | null;
  idxLastScraped: Date | null;

  // Featured projects (static allow-list; see FEATURED_SLUGS)
  featuredProjects: FeaturedProject[];
};

// ─── Formatters (module-local, not exported) ────────────────────────────────

// Deterministic thousands-group formatter — DOES NOT use `toLocaleString`
// because Node's `Intl` implementation can be influenced by the process
// `LC_ALL` / `LANG` env vars (even when an explicit locale is passed),
// which on Netlify could silently flip our comma-grouped output to
// period-grouped (DE/IT-style). A regex-based grouping is env-independent.
function groupThousands(n: number): string {
  const rounded = Math.round(n);
  const s = String(Math.abs(rounded));
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded < 0 ? `-${grouped}` : grouped;
}

function formatVcus(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 VCUs';
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v.toFixed(1).replace(/\.0$/, '')}M VCUs`;
  }
  if (n >= 1_000) {
    return `${groupThousands(n / 1_000)}k VCUs`;
  }
  return `${groupThousands(n)} VCUs`;
}

function formatIdrCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return 'Rp 0';
  if (n >= 1_000_000_000) {
    const v = n / 1_000_000_000;
    return `Rp ${v.toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `Rp ${v.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 1_000) {
    return `Rp ${groupThousands(n / 1_000)}k`;
  }
  return `Rp ${groupThousands(n)}`;
}

function formatIdrFull(n: number): string {
  if (!Number.isFinite(n)) return 'Rp 0';
  return `Rp ${groupThousands(n)}`;
}

function formatVolume(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 tCO₂e';
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v.toFixed(1).replace(/\.0$/, '')}M tCO₂e`;
  }
  if (n >= 1_000) {
    return `${groupThousands(n / 1_000)}k tCO₂e`;
  }
  return `${groupThousands(n)} tCO₂e`;
}

function formatPeriod(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function zeroStats(): LandingStats {
  return {
    projectCount: 0,
    totalVcusIssued: '0 VCUs',
    totalVcusAvailable: '0 VCUs',
    latestPeriod: null,
    latestVolumeTco2e: null,
    latestAvgPriceIdr: null,
    latestValueIdr: null,
    momDeltaPct: null,
    momVolumeDelta: null,
    idxParticipantCount: null,
    momParticipantDelta: null,
    vcusTradedYtd: null,
    medianIntegrityScore: null,
    regulatoryEventCount: 0,
    gfwAlerts90d: 0,
    activeAlerts30d: 0,
    alerts7d: 0,
    alertsPrior7d: 0,
    registriesLastSynced: null,
    satelliteLastIngested: null,
    idxLastScraped: null,
    featuredProjects: [],
  };
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDateOrNull(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Single entry point used by `app/(public)/page.tsx`. Errors are caught and
 * converted to a zeroed stats object so the landing page is never a 500.
 */
export async function getLandingStats(): Promise<LandingStats> {
  try {
    const [aggregates, idxRows, featuredRows] = await Promise.all([
      // 1. Projects aggregates + median score + regulatory events count +
      //    GFW alerts (90d) + registries/satellite/idx timestamps.
      db.execute(sql`
        WITH project_agg AS (
          SELECT
            COUNT(*)::int                                                 AS project_count,
            COALESCE(SUM(total_vcus_issued), 0)::numeric                  AS total_issued,
            COALESCE(SUM(total_vcus_issued - total_vcus_retired), 0)::numeric AS total_available
          FROM projects
          WHERE country = 'ID'
        ),
        score_agg AS (
          SELECT
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY integrity_score)  AS median_score
          FROM project_scores
          WHERE score_date = CURRENT_DATE
        ),
        reg_agg AS (
          SELECT COUNT(*)::int AS reg_count FROM regulatory_events
        ),
        alerts_agg AS (
          SELECT
            COUNT(*) FILTER (WHERE alert_date >= (NOW() - INTERVAL '90 days')::date)::int AS alerts_90d,
            COUNT(*) FILTER (WHERE alert_date >= (NOW() - INTERVAL '30 days')::date)::int AS alerts_30d,
            COUNT(*) FILTER (WHERE alert_date >= (NOW() - INTERVAL '7 days')::date)::int  AS alerts_7d,
            COUNT(*) FILTER (
              WHERE alert_date >= (NOW() - INTERVAL '14 days')::date
                AND alert_date <  (NOW() - INTERVAL '7 days')::date
            )::int AS alerts_prior_7d
          FROM satellite_alerts
        ),
        ytd_agg AS (
          SELECT COALESCE(SUM(total_volume_tco2e), 0)::numeric AS ytd_volume
          FROM idx_monthly_snapshots
          WHERE period_month >= date_trunc('year', CURRENT_DATE)
        ),
        registries_ts AS (
          SELECT MAX(last_synced_at) AS ts FROM registries
        ),
        satellite_ts AS (
          SELECT MAX(ingested_at) AS ts FROM satellite_alerts
        ),
        idx_ts AS (
          SELECT MAX(scraped_at) AS ts FROM idx_monthly_snapshots
        )
        SELECT
          (SELECT project_count FROM project_agg)     AS project_count,
          (SELECT total_issued FROM project_agg)      AS total_issued,
          (SELECT total_available FROM project_agg)   AS total_available,
          (SELECT median_score FROM score_agg)        AS median_score,
          (SELECT reg_count FROM reg_agg)             AS reg_count,
          (SELECT alerts_90d FROM alerts_agg)         AS alerts_90d,
          (SELECT alerts_30d FROM alerts_agg)         AS alerts_30d,
          (SELECT alerts_7d FROM alerts_agg)          AS alerts_7d,
          (SELECT alerts_prior_7d FROM alerts_agg)    AS alerts_prior_7d,
          (SELECT ytd_volume FROM ytd_agg)            AS ytd_volume,
          (SELECT ts FROM registries_ts)              AS registries_ts,
          (SELECT ts FROM satellite_ts)               AS satellite_ts,
          (SELECT ts FROM idx_ts)                     AS idx_ts
      `),

      // 2. IDXCarbon — latest two rows to compute MoM delta.
      db.execute(sql`
        SELECT
          period_month,
          total_volume_tco2e,
          total_value_idr,
          avg_price_idr,
          registered_participants
        FROM idx_monthly_snapshots
        ORDER BY period_month DESC
        LIMIT 2
      `),

      // 3. Featured projects — static allow-list with today's score + registry names.
      db.execute(sql`
        SELECT
          p.slug,
          p.name_canonical,
          p.developer,
          p.province,
          p.project_type,
          ps.integrity_score,
          COALESCE(
            (
              SELECT array_agg(DISTINCT r.registry_name ORDER BY r.registry_name)
              FROM registries r
              WHERE r.project_id = p.id
            ),
            ARRAY[]::text[]
          ) AS registry_names
        FROM projects p
        LEFT JOIN project_scores ps
          ON ps.project_id = p.id
         AND ps.score_date = CURRENT_DATE
        WHERE p.slug IN (${sql.join(
          FEATURED_SLUGS.map((s) => sql`${s}`),
          sql`, `,
        )})
      `),
    ]);

    const aggRow = (aggregates as unknown as Array<Record<string, unknown>>)[0] ?? {};
    const projectCount = Number(aggRow.project_count ?? 0) || 0;
    const totalIssuedN = Number(aggRow.total_issued ?? 0) || 0;
    const totalAvailableN = Number(aggRow.total_available ?? 0) || 0;
    const medianScore = toNumberOrNull(aggRow.median_score);
    const regCount = Number(aggRow.reg_count ?? 0) || 0;
    const alerts90d = Number(aggRow.alerts_90d ?? 0) || 0;
    const alerts30d = Number(aggRow.alerts_30d ?? 0) || 0;
    const alerts7d = Number(aggRow.alerts_7d ?? 0) || 0;
    const alertsPrior7d = Number(aggRow.alerts_prior_7d ?? 0) || 0;
    const ytdVolumeN = Number(aggRow.ytd_volume ?? 0) || 0;
    const registriesLastSynced = toDateOrNull(aggRow.registries_ts);
    const satelliteLastIngested = toDateOrNull(aggRow.satellite_ts);
    const idxLastScraped = toDateOrNull(aggRow.idx_ts);

    const idxList = idxRows as unknown as Array<Record<string, unknown>>;
    const latest = idxList[0];
    const previous = idxList[1];

    let latestPeriod: string | null = null;
    let latestVolumeTco2e: string | null = null;
    let latestAvgPriceIdr: string | null = null;
    let latestValueIdr: string | null = null;
    let momDeltaPct: number | null = null;
    let momVolumeDelta: number | null = null;
    let idxParticipantCount: number | null = null;
    let momParticipantDelta: number | null = null;

    if (latest) {
      const period = latest.period_month;
      latestPeriod = period ? formatPeriod(period as string | Date) : null;

      const vol = toNumberOrNull(latest.total_volume_tco2e);
      latestVolumeTco2e = vol !== null ? formatVolume(vol) : null;

      const avg = toNumberOrNull(latest.avg_price_idr);
      latestAvgPriceIdr = avg !== null ? formatIdrFull(avg) : null;

      const val = toNumberOrNull(latest.total_value_idr);
      latestValueIdr = val !== null ? formatIdrCompact(val) : null;

      idxParticipantCount = toNumberOrNull(latest.registered_participants);

      if (previous) {
        const prevAvg = toNumberOrNull(previous.avg_price_idr);
        if (avg !== null && prevAvg !== null && prevAvg !== 0) {
          momDeltaPct = Math.round(((avg - prevAvg) / prevAvg) * 1000) / 10;
        }
        const prevVol = toNumberOrNull(previous.total_volume_tco2e);
        if (vol !== null && prevVol !== null) {
          momVolumeDelta = Math.round(vol - prevVol);
        }
        const prevPart = toNumberOrNull(previous.registered_participants);
        if (idxParticipantCount !== null && prevPart !== null) {
          momParticipantDelta = Math.round(idxParticipantCount - prevPart);
        }
      }
    }

    // YTD volume — formatted or null if no rows this year.
    const vcusTradedYtd = ytdVolumeN > 0 ? formatVolume(ytdVolumeN) : null;

    const featuredMap = new Map<string, FeaturedProject>();
    for (const raw of featuredRows as unknown as Array<Record<string, unknown>>) {
      const slug = String(raw.slug);
      featuredMap.set(slug, {
        slug,
        nameCanonical: String(raw.name_canonical ?? ''),
        developer: (raw.developer as string | null) ?? null,
        province: (raw.province as string | null) ?? null,
        projectType: (raw.project_type as string | null) ?? null,
        integrityScore: toNumberOrNull(raw.integrity_score),
        registryNames: Array.isArray(raw.registry_names)
          ? (raw.registry_names as string[])
          : [],
      });
    }
    // Preserve the FEATURED_SLUGS order; drop any missing.
    const featuredProjects = FEATURED_SLUGS
      .map((s) => featuredMap.get(s))
      .filter((p): p is FeaturedProject => Boolean(p));

    return {
      projectCount,
      totalVcusIssued: formatVcus(totalIssuedN),
      totalVcusAvailable: formatVcus(totalAvailableN),
      latestPeriod,
      latestVolumeTco2e,
      latestAvgPriceIdr,
      latestValueIdr,
      momDeltaPct,
      momVolumeDelta,
      idxParticipantCount,
      momParticipantDelta,
      vcusTradedYtd,
      medianIntegrityScore: medianScore === null ? null : Math.round(medianScore),
      regulatoryEventCount: regCount,
      gfwAlerts90d: alerts90d,
      activeAlerts30d: alerts30d,
      alerts7d,
      alertsPrior7d,
      registriesLastSynced,
      satelliteLastIngested,
      idxLastScraped,
      featuredProjects,
    };
  } catch (err) {
    console.error('[T18] getLandingStats error:', err);
    return zeroStats();
  }
}

/**
 * Exposed for the landing page banner — true when `getLandingStats` returned
 * the zeroed fallback because the DB was unreachable. The callers reads the
 * count: if projectCount is 0 AND the other aggregates are also zero, we
 * assume DB-down. (Valid empty DB is indistinguishable; v0.1 ships with 64
 * projects so this heuristic is good enough until v0.2.)
 */
export function isLikelyDbDown(stats: LandingStats): boolean {
  return (
    stats.projectCount === 0 &&
    stats.regulatoryEventCount === 0 &&
    stats.gfwAlerts90d === 0 &&
    stats.registriesLastSynced === null &&
    stats.idxLastScraped === null
  );
}
