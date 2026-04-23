/**
 * project-description.ts — T30 read-only accessor for the AI-researched
 * narrative stored in `project_descriptions`.
 *
 * Populated out-of-band (see docs/runbooks/project-descriptions.md once it
 * lands); the runtime app never writes to this table. Returning `null`
 * for projects without a description is a load-bearing contract — the
 * renderer shows a quiet "not yet generated" state rather than throwing.
 */

import { db } from '@/lib/db';
import { projectDescriptions, type ProjectDescriptionCitation } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export type ProjectDescription = {
  projectId: string;
  summaryMd: string;
  detailMd: string;
  citations: ProjectDescriptionCitation[];
  confidence: string;
  confidenceReason: string | null;
  model: string;
  generatedAt: Date;
};

export async function getProjectDescription(
  projectId: string,
): Promise<ProjectDescription | null> {
  try {
    const rows = await db
      .select()
      .from(projectDescriptions)
      .where(eq(projectDescriptions.projectId, projectId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      projectId: row.projectId,
      summaryMd: row.summaryMd,
      detailMd: row.detailMd,
      citations: row.citations,
      confidence: row.confidence,
      confidenceReason: row.confidenceReason,
      model: row.model,
      generatedAt: row.generatedAt,
    };
  } catch {
    // Table may not yet exist in a fresh dev DB before migration 006 has run.
    // Returning null keeps the page rendering without the description.
    return null;
  }
}
