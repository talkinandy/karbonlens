/**
 * lib/queries/projects-list.ts — Drizzle query helpers for the projects
 * explorer (T11).
 *
 * Ownership: T11. This is the ONLY file that queries the `projects` table
 * for list views. It must not be called from client components.
 *
 * Contract: see `docs/stories/T11-projects-explorer.md` §3.1 – §3.2.
 * - `getProjectsList({...})`: the paginated + filtered list, plus stats
 *   computed inside the same SQL round-trip so the filter predicate stays
 *   consistent (no TOCTOU window).
 * - `getProvinceOptions()`, `getProjectTypeOptions()`, `getStatusOptions()`:
 *   distinct-value helpers that populate the filter chips.
 *
 * `'Unknown'` province is a UI-only sentinel mapped to `province IS NULL` —
 * see §3.1 "Unknown province sentinel" and §7 edge case (i).
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export type ProjectsListSort =
  | 'score_desc'
  | 'score_asc'
  | 'issuance_desc'
  | 'hectares_desc'
  | 'name_asc';

export type ProjectsListParams = {
  province?: string[];
  projectType?: string[];
  status?: string[];
  sort?: ProjectsListSort;
  page?: number;
  limit?: number;
};

export type ProjectRow = {
  id: string;
  slug: string;
  nameCanonical: string;
  developer: string | null;
  province: string | null;
  projectType: string | null;
  methodology: string | null;
  hectares: string | null;
  totalVcusIssued: string | null;
  totalVcusRetired: string | null;
  totalVcusAvailable: string | null;
  status: string | null;
  integrityScore: string | null;
  registryNames: string[];
};

export type ProjectsStats = {
  totalMatching: number;
  totalProjectCount: number;
  sumAvailableVcus: string;
  medianIntegrityScore: number | null;
};

export type ProjectsListResult = {
  rows: ProjectRow[];
  total: number;
  stats: ProjectsStats;
};

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function clampLimit(limit: number | undefined): number {
  const n = Math.floor(limit ?? DEFAULT_LIMIT);
  if (Number.isNaN(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function clampPage(page: number | undefined): number {
  const n = Math.floor(page ?? 1);
  if (Number.isNaN(n) || n <= 0) return 1;
  return n;
}

/**
 * Build the ORDER BY fragment for the requested sort. NULL scores sort last
 * under score_desc/score_asc so projects without a score today go to the end.
 */
function buildOrderBy(sort: ProjectsListSort) {
  switch (sort) {
    case 'score_desc':
      return sql`integrity_score DESC NULLS LAST, name_canonical ASC`;
    case 'score_asc':
      return sql`integrity_score ASC NULLS LAST, name_canonical ASC`;
    case 'issuance_desc':
      return sql`total_vcus_issued DESC NULLS LAST, name_canonical ASC`;
    case 'hectares_desc':
      return sql`hectares DESC NULLS LAST, name_canonical ASC`;
    case 'name_asc':
      return sql`name_canonical ASC`;
    default:
      return sql`integrity_score DESC NULLS LAST, name_canonical ASC`;
  }
}

/**
 * Main paginated query. Implemented with a single `sql`-tagged statement that
 * wraps the filtered set in a CTE and emits the page, the total count, the
 * sum of available VCUs, the median score, and the unfiltered project count
 * in a single round trip. `registries` are aggregated in a lateral subquery.
 *
 * 'Unknown' province is stripped from the bound array and handled by a
 * compound predicate so it maps to `province IS NULL` (see §7 edge case i).
 */
export async function getProjectsList(
  params: ProjectsListParams = {},
): Promise<ProjectsListResult> {
  const limit = clampLimit(params.limit);
  const page = clampPage(params.page);
  const offset = (page - 1) * limit;
  const sort: ProjectsListSort = params.sort ?? 'score_desc';

  // Province filter — peel off the Unknown sentinel before binding.
  const provinceArr = params.province ?? [];
  const hasUnknown = provinceArr.includes('Unknown');
  const namedProvinces = provinceArr.filter((p) => p !== 'Unknown');
  const projectTypes = (params.projectType ?? []).filter((v) => v !== '');
  const statuses = (params.status ?? []).filter((v) => v !== '');

  // Assemble the WHERE predicate. Country is always 'ID' for the v0.1 scope.
  //
  // IN-list construction: we intentionally use `col IN (v1, v2, ...)` via
  // `sql.join([...], sql`, `)` instead of `col = ANY(ARRAY[...])`. The
  // `postgres.js` driver does not auto-coerce a JS string[] bound as a single
  // $N placeholder into Postgres `text[]`, so `ANY($1)` fails with "malformed
  // array literal". The `sql.join` form expands each value to its own bound
  // placeholder ($1, $2, ...) and is both safe (still parameterised, not
  // string-concatenated) and dialect-portable.
  const predicates = [sql`country = 'ID'`];

  if (namedProvinces.length > 0 && hasUnknown) {
    predicates.push(
      sql`(province IN (${sql.join(
        namedProvinces.map((p) => sql`${p}`),
        sql`, `,
      )}) OR province IS NULL)`,
    );
  } else if (namedProvinces.length > 0) {
    predicates.push(
      sql`province IN (${sql.join(
        namedProvinces.map((p) => sql`${p}`),
        sql`, `,
      )})`,
    );
  } else if (hasUnknown) {
    predicates.push(sql`province IS NULL`);
  }

  if (projectTypes.length > 0) {
    predicates.push(
      sql`project_type IN (${sql.join(
        projectTypes.map((t) => sql`${t}`),
        sql`, `,
      )})`,
    );
  }

  if (statuses.length > 0) {
    predicates.push(
      sql`status IN (${sql.join(
        statuses.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }

  const whereClause = sql.join(predicates, sql` AND `);
  const orderBy = buildOrderBy(sort);

  // Single round-trip. The `filtered` CTE joins today's score row and applies
  // the filter predicate; subsequent CTEs derive stats and the unfiltered
  // denominator. The outer SELECT paginates.
  const query = sql`
    WITH filtered AS (
      SELECT
        p.id,
        p.slug,
        p.name_canonical,
        p.developer,
        p.province,
        p.project_type,
        p.methodology,
        p.hectares,
        p.total_vcus_issued,
        p.total_vcus_retired,
        p.total_vcus_available,
        p.status,
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
      WHERE ${whereClause}
    ),
    stats AS (
      SELECT
        COUNT(*)::int                                         AS total_matching,
        COALESCE(SUM(total_vcus_available), 0)::text          AS sum_available_vcus,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY integrity_score) AS median_integrity_score
      FROM filtered
    ),
    total_count AS (
      SELECT COUNT(*)::int AS total_project_count
      FROM projects
      WHERE country = 'ID'
    ),
    page AS (
      SELECT *
      FROM filtered
      ORDER BY ${orderBy}
      LIMIT ${limit}
      OFFSET ${offset}
    )
    SELECT
      (SELECT json_agg(row_to_json(page_row)) FROM page page_row) AS rows_json,
      (SELECT total_matching FROM stats)                          AS total_matching,
      (SELECT sum_available_vcus FROM stats)                      AS sum_available_vcus,
      (SELECT median_integrity_score FROM stats)                  AS median_integrity_score,
      (SELECT total_project_count FROM total_count)               AS total_project_count
  `;

  const result = await db.execute(query);
  const row = (result as unknown as { rows_json: unknown }[])[0] ?? null;

  if (!row) {
    return {
      rows: [],
      total: 0,
      stats: {
        totalMatching: 0,
        totalProjectCount: 0,
        sumAvailableVcus: '0',
        medianIntegrityScore: null,
      },
    };
  }

  const r = row as unknown as {
    rows_json: Array<Record<string, unknown>> | null;
    total_matching: number | string;
    sum_available_vcus: string | null;
    median_integrity_score: string | number | null;
    total_project_count: number | string;
  };

  const rawRows = r.rows_json ?? [];
  const rows: ProjectRow[] = rawRows.map((raw) => ({
    id: String(raw.id),
    slug: String(raw.slug),
    nameCanonical: String(raw.name_canonical),
    developer: (raw.developer as string | null) ?? null,
    province: (raw.province as string | null) ?? null,
    projectType: (raw.project_type as string | null) ?? null,
    methodology: (raw.methodology as string | null) ?? null,
    hectares: (raw.hectares as string | null) ?? null,
    totalVcusIssued: (raw.total_vcus_issued as string | null) ?? null,
    totalVcusRetired: (raw.total_vcus_retired as string | null) ?? null,
    totalVcusAvailable: (raw.total_vcus_available as string | null) ?? null,
    status: (raw.status as string | null) ?? null,
    integrityScore:
      raw.integrity_score === null || raw.integrity_score === undefined
        ? null
        : String(raw.integrity_score),
    registryNames: Array.isArray(raw.registry_names)
      ? (raw.registry_names as string[])
      : [],
  }));

  const totalMatching = Number(r.total_matching) || 0;
  const totalProjectCount = Number(r.total_project_count) || 0;
  const sumAvailableVcus = r.sum_available_vcus ?? '0';
  const medianIntegrityScore =
    r.median_integrity_score === null || r.median_integrity_score === undefined
      ? null
      : Number(r.median_integrity_score);

  return {
    rows,
    total: totalMatching,
    stats: {
      totalMatching,
      totalProjectCount,
      sumAvailableVcus,
      medianIntegrityScore,
    },
  };
}

/**
 * Distinct province values. NULL maps to the string `'Unknown'` so the chip
 * group can offer a filter for projects with no province recorded.
 */
export async function getProvinceOptions(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT COALESCE(province, 'Unknown') AS province
    FROM projects
    WHERE country = 'ID'
    ORDER BY province
  `);
  return (result as unknown as { province: string }[]).map((r) => r.province);
}

/**
 * Distinct project_type values, NULLs excluded.
 */
export async function getProjectTypeOptions(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT project_type
    FROM projects
    WHERE country = 'ID' AND project_type IS NOT NULL
    ORDER BY project_type
  `);
  return (result as unknown as { project_type: string }[]).map(
    (r) => r.project_type,
  );
}

/**
 * Distinct status values, NULLs excluded. Live list — self-updating as the
 * scrapers add new status strings.
 */
export async function getStatusOptions(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT status
    FROM projects
    WHERE country = 'ID' AND status IS NOT NULL
    ORDER BY status
  `);
  return (result as unknown as { status: string }[]).map((r) => r.status);
}
