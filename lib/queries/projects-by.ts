/**
 * projects-by.ts — hub-page query helpers (T32 / Phase 3).
 *
 * Four canonical slice dimensions:
 *   - by-province / [slug]     — canonical province, expanded to raw variants
 *   - by-methodology / [slug]  — ILIKE match on the comma-joined methodology field
 *   - by-registry / [slug]     — JOIN on `registries.registry_name`
 *   - by-developer / [slug]    — slug-normalised match on `projects.developer`
 *
 * Each returns a lightweight `ProjectHubRow` (same shape across all four so
 * the shared `<ProjectHub>` component can render any of them). No join on
 * issuances/scores here — the existing T11 `getProjectsList` stays the
 * canonical path for the main explorer page; these helpers are intentionally
 * smaller and cheaper since hub pages typically render 5–30 rows.
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import {
  toCanonicalProvince,
  expandCanonicalToRaw,
} from '@/lib/display/province';

export type ProjectHubRow = {
  id: string;
  slug: string;
  nameCanonical: string;
  developer: string | null;
  province: string | null;
  canonicalProvince: string | null;
  projectType: string | null;
  methodology: string | null;
  hectares: string | null;
  status: string | null;
  integrityScore: string | null;
  totalVcusAvailable: string | null;
};

const SELECT_SHAPE = sql`
  p.id,
  p.slug,
  p.name_canonical,
  p.developer,
  p.province,
  p.project_type,
  p.methodology,
  p.hectares::text,
  p.status,
  p.total_vcus_available::text,
  (
    SELECT ps.integrity_score::text
    FROM project_scores ps
    WHERE ps.project_id = p.id
    ORDER BY ps.score_date DESC
    LIMIT 1
  ) AS integrity_score
`;

function mapRow(raw: Record<string, unknown>): ProjectHubRow {
  return {
    id: raw.id as string,
    slug: raw.slug as string,
    nameCanonical: raw.name_canonical as string,
    developer: (raw.developer as string | null) ?? null,
    province: (raw.province as string | null) ?? null,
    canonicalProvince: toCanonicalProvince(raw.province as string | null),
    projectType: (raw.project_type as string | null) ?? null,
    methodology: (raw.methodology as string | null) ?? null,
    hectares: (raw.hectares as string | null) ?? null,
    status: (raw.status as string | null) ?? null,
    integrityScore: (raw.integrity_score as string | null) ?? null,
    totalVcusAvailable: (raw.total_vcus_available as string | null) ?? null,
  };
}

// ─── by-province ─────────────────────────────────────────────────────────────

export async function getProjectsByCanonicalProvince(
  canonical: string,
): Promise<ProjectHubRow[]> {
  const rawVariants = expandCanonicalToRaw(canonical);
  if (rawVariants.length === 0) return [];
  try {
    const result = await db.execute(sql`
      SELECT ${SELECT_SHAPE}
      FROM projects p
      WHERE p.country = 'ID'
        AND p.province IN (${sql.join(
          rawVariants.map((v) => sql`${v}`),
          sql`, `,
        )})
      ORDER BY integrity_score DESC NULLS LAST, p.name_canonical
    `);
    return (result as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

// ─── by-methodology ──────────────────────────────────────────────────────────
// The `methodology` column can be a comma-joined list like "VM0007,VM0047".
// ILIKE with word boundaries isn't reliable in postgres, so we regex-match.

export async function getProjectsByMethodology(
  code: string,
): Promise<ProjectHubRow[]> {
  const upper = code.toUpperCase();
  try {
    const result = await db.execute(sql`
      SELECT ${SELECT_SHAPE}
      FROM projects p
      WHERE p.country = 'ID'
        AND UPPER(COALESCE(p.methodology, '')) ~ ('(^|[,[:space:]])' || ${upper} || '([,[:space:]]|$)')
      ORDER BY integrity_score DESC NULLS LAST, p.name_canonical
    `);
    return (result as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

export async function listDistinctMethodologies(): Promise<string[]> {
  try {
    const result = await db.execute(sql`
      SELECT DISTINCT unnest(regexp_split_to_array(UPPER(methodology), '[,[:space:]]+')) AS code
      FROM projects
      WHERE country = 'ID' AND methodology IS NOT NULL AND methodology <> ''
      ORDER BY code
    `);
    return (result as unknown as { code: string }[])
      .map((r) => r.code)
      .filter((c) => c && c !== '' && /^[A-Z]/.test(c));
  } catch {
    return [];
  }
}

// ─── by-registry ─────────────────────────────────────────────────────────────

export async function getProjectsByRegistry(
  registryName: string,
): Promise<ProjectHubRow[]> {
  try {
    const result = await db.execute(sql`
      SELECT ${SELECT_SHAPE}
      FROM projects p
      WHERE p.country = 'ID'
        AND EXISTS (
          SELECT 1 FROM registries r
          WHERE r.project_id = p.id
            AND LOWER(r.registry_name) = LOWER(${registryName})
        )
      ORDER BY integrity_score DESC NULLS LAST, p.name_canonical
    `);
    return (result as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

export async function listDistinctRegistries(): Promise<
  { name: string; count: number }[]
> {
  try {
    const result = await db.execute(sql`
      SELECT r.registry_name AS name, COUNT(DISTINCT r.project_id)::int AS count
      FROM registries r
      JOIN projects p ON p.id = r.project_id AND p.country = 'ID'
      WHERE r.registry_name IS NOT NULL AND r.registry_name <> ''
      GROUP BY r.registry_name
      ORDER BY count DESC, r.registry_name
    `);
    return (result as unknown as { name: string; count: number }[]).map((r) => ({
      name: r.name,
      count: Number(r.count),
    }));
  } catch {
    return [];
  }
}

// ─── by-developer ────────────────────────────────────────────────────────────
// `developer` is a free-text field; the slug is derived by `slugifyDeveloper`
// and the match is re-derived server-side so the URL → row path is
// deterministic.

export function slugifyDeveloper(developer: string): string {
  return developer
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function getProjectsByDeveloperSlug(
  slug: string,
): Promise<ProjectHubRow[]> {
  try {
    const result = await db.execute(sql`
      SELECT ${SELECT_SHAPE}
      FROM projects p
      WHERE p.country = 'ID'
        AND p.developer IS NOT NULL
        AND LOWER(REGEXP_REPLACE(p.developer, '[^a-zA-Z0-9]+', '-', 'g')) ~ ('(^|-)' || ${slug} || '(-|$)')
      ORDER BY integrity_score DESC NULLS LAST, p.name_canonical
    `);
    return (result as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

export async function listDistinctDevelopers(): Promise<
  { name: string; slug: string; count: number }[]
> {
  try {
    const result = await db.execute(sql`
      SELECT developer, COUNT(*)::int AS count
      FROM projects
      WHERE country = 'ID' AND developer IS NOT NULL AND developer <> ''
      GROUP BY developer
      ORDER BY count DESC, developer
    `);
    return (result as unknown as { developer: string; count: number }[]).map((r) => ({
      name: r.developer,
      slug: slugifyDeveloper(r.developer),
      count: Number(r.count),
    }));
  } catch {
    return [];
  }
}

// ─── by-province enumeration (used by sitemap + index page) ──────────────────

export async function listCanonicalProvinces(): Promise<
  { canonical: string; count: number }[]
> {
  try {
    const result = await db.execute(sql`
      SELECT province, COUNT(*)::int AS count
      FROM projects
      WHERE country = 'ID' AND province IS NOT NULL AND province <> ''
      GROUP BY province
    `);
    const rows = result as unknown as { province: string; count: number }[];
    const byCanonical = new Map<string, number>();
    for (const r of rows) {
      const canonical = toCanonicalProvince(r.province);
      if (!canonical) continue;
      byCanonical.set(canonical, (byCanonical.get(canonical) ?? 0) + Number(r.count));
    }
    return Array.from(byCanonical.entries())
      .map(([canonical, count]) => ({ canonical, count }))
      .sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical));
  } catch {
    return [];
  }
}

export function provinceCanonicalToSlug(canonical: string): string {
  return canonical
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function provinceSlugToCanonical(slug: string): string | null {
  // Lower → dash-normalise → match against the set of known canonicals.
  // We re-derive from the full province list; the lookup is O(N) with N~20.
  // Synchronous version can't touch the DB, so accept a precomputed list
  // and do the matching at the caller.
  return null; // kept as a placeholder — callers use listCanonicalProvinces()
}
