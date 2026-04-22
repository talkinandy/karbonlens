/**
 * lib/queries/project-summary.ts — T26 lightweight hero fields only.
 *
 * Used by `app/(app)/projects/[slug]/opengraph-image.tsx` to render the
 * per-project dynamic OG image without pulling the full T12 payload
 * (issuances, retirements, alerts) into every crawler request. A single SQL
 * round-trip joining `projects` with the latest `project_scores` row by
 * `score_date`.
 *
 * Runs on the Node runtime (see opengraph-image.tsx note). `postgres-js`
 * is Node-only; do not import this from an Edge runtime handler.
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, projectScores } from '@/lib/schema';

export type ProjectSummaryStatusBadge =
  | 'active'
  | 'pipeline'
  | 'suspended'
  | 'flagged'
  | null;

export type ProjectSummary = {
  name: string;
  score: number | null;
  province: string | null;
  hectares: number | null;
  statusBadge: ProjectSummaryStatusBadge;
  // Extra field (not in the original spec shape) used by
  // `generateMetadata` in app/(app)/projects/[slug]/page.tsx to render a
  // one-liner description without a second query. OG image renderer ignores it.
  projectType: string | null;
};

// Map the free-text `projects.status` column onto the closed set of badge
// labels used by the OG image. Unknown / empty values fall through to `null`
// so the renderer can render a neutral pill.
function toStatusBadge(raw: string | null): ProjectSummaryStatusBadge {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === 'active' || v === 'registered') return 'active';
  if (v === 'pipeline' || v === 'under validation' || v === 'listed') {
    return 'pipeline';
  }
  if (v === 'suspended' || v === 'withdrawn') return 'suspended';
  if (v === 'flagged') return 'flagged';
  return null;
}

export async function getProjectSummary(
  slug: string,
): Promise<ProjectSummary | null> {
  // Single query: LEFT JOIN on the latest score row per project. Subquery
  // selects the max score_date per project, then joins back into project_scores.
  const rows = await db
    .select({
      name: projects.nameCanonical,
      score: projectScores.integrityScore,
      province: projects.province,
      hectares: projects.hectares,
      status: projects.status,
      projectType: projects.projectType,
      scoreDate: projectScores.scoreDate,
    })
    .from(projects)
    .leftJoin(projectScores, eq(projectScores.projectId, projects.id))
    .where(eq(projects.slug, slug))
    .orderBy(desc(projectScores.scoreDate))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    name: row.name,
    score: row.score != null ? Number(row.score) : null,
    province: row.province ?? null,
    hectares: row.hectares != null ? Number(row.hectares) : null,
    statusBadge: toStatusBadge(row.status ?? null),
    projectType: row.projectType ?? null,
  };
}
