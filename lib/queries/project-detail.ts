/**
 * lib/queries/project-detail.ts — T12 project detail page data loader.
 *
 * Owns every DB read for `app/(app)/projects/[slug]/page.tsx`. The page
 * component calls `getProjectDetail(slug)` exactly once per request; a null
 * return triggers `notFound()` upstream.
 *
 * Query plan: the project-row lookup must complete first (to derive `projectId`
 * for the remaining five queries). The remaining five run in parallel via
 * `Promise.all`. Six queries total; no N+1.
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  issuances,
  projects,
  projectScores,
  registries,
  retirements,
  satelliteAlerts,
} from '@/lib/schema';
import type { ScoreComponents } from '@/lib/score';

export type ProjectRow = typeof projects.$inferSelect;
export type RegistryRow = typeof registries.$inferSelect;

export type IssuanceRow = {
  vintageYear: number;
  credits: string;
  issuanceDate: string;
  serialStart: string | null;
  serialEnd: string | null;
};

export type ScoreRow = {
  scoreDate: string;
  integrityScore: string | null;
  components: ScoreComponents | null;
};

export type BeneficiaryRow = {
  beneficiaryName: string | null;
  credits: string;
  n: number;
};

export type AlertSummary = {
  total90d: number;
  highConf: number;
  nominalConf: number;
};

export type ProjectDetail = {
  project: ProjectRow;
  score: ScoreRow | null;
  registries: RegistryRow[];
  issuances: IssuanceRow[];
  retirementsTotal: string;
  retirementsBeneficiaries: BeneficiaryRow[];
  alerts: AlertSummary;
};

export async function getProjectDetail(
  slug: string,
): Promise<ProjectDetail | null> {
  // Stage 1 — resolve the project row; bail out fast if no match.
  const projectResult = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);

  const project = projectResult[0];
  if (!project) {
    return null;
  }

  const projectId = project.id;

  // Stage 2 — five parallel queries keyed on projectId.
  const [
    scoreRows,
    registryRows,
    issuanceRows,
    retirementBeneficiaryRows,
    retirementTotalRows,
    alertRows,
  ] = await Promise.all([
    db
      .select({
        scoreDate: projectScores.scoreDate,
        integrityScore: projectScores.integrityScore,
        components: projectScores.components,
      })
      .from(projectScores)
      .where(eq(projectScores.projectId, projectId))
      .orderBy(desc(projectScores.scoreDate))
      .limit(1),

    db
      .select()
      .from(registries)
      .where(eq(registries.projectId, projectId))
      .orderBy(registries.registryName),

    db
      .select({
        vintageYear: issuances.vintageYear,
        credits: issuances.credits,
        issuanceDate: issuances.issuanceDate,
        serialStart: issuances.serialStart,
        serialEnd: issuances.serialEnd,
      })
      .from(issuances)
      .where(eq(issuances.projectId, projectId))
      .orderBy(desc(issuances.vintageYear), desc(issuances.issuanceDate)),

    db
      .select({
        beneficiaryName: retirements.beneficiaryName,
        credits: sql<string>`COALESCE(SUM(${retirements.credits}), 0)::text`,
        n: sql<number>`COUNT(*)::int`,
      })
      .from(retirements)
      .where(eq(retirements.projectId, projectId))
      .groupBy(retirements.beneficiaryName)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(3),

    db
      .select({
        total: sql<string>`COALESCE(SUM(${retirements.credits}), 0)::text`,
      })
      .from(retirements)
      .where(eq(retirements.projectId, projectId)),

    db
      .select({
        total90d: sql<number>`COUNT(*)::int`,
        highConf: sql<number>`COUNT(*) FILTER (WHERE ${satelliteAlerts.confidence} = 'high')::int`,
        nominalConf: sql<number>`COUNT(*) FILTER (WHERE ${satelliteAlerts.confidence} = 'nominal')::int`,
      })
      .from(satelliteAlerts)
      .where(
        and(
          eq(satelliteAlerts.projectId, projectId),
          gte(
            satelliteAlerts.alertDate,
            sql`CURRENT_DATE - INTERVAL '90 days'`,
          ),
        ),
      ),
  ]);

  const scoreRow = scoreRows[0] ?? null;
  const alertsRow = alertRows[0] ?? {
    total90d: 0,
    highConf: 0,
    nominalConf: 0,
  };
  const retirementTotal = retirementTotalRows[0]?.total ?? '0';

  return {
    project,
    score: scoreRow,
    registries: registryRows,
    issuances: issuanceRows.map((r) => ({
      vintageYear: r.vintageYear,
      credits: r.credits,
      issuanceDate: r.issuanceDate,
      serialStart: r.serialStart,
      serialEnd: r.serialEnd,
    })),
    retirementsTotal: retirementTotal,
    retirementsBeneficiaries: retirementBeneficiaryRows,
    alerts: {
      total90d: Number(alertsRow.total90d ?? 0),
      highConf: Number(alertsRow.highConf ?? 0),
      nominalConf: Number(alertsRow.nominalConf ?? 0),
    },
  };
}
