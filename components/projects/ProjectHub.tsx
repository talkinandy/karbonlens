/**
 * ProjectHub — shared renderer for the four hub-page surfaces (T32):
 *   /projects/by-province/[slug]
 *   /projects/by-methodology/[slug]
 *   /projects/by-registry/[slug]
 *   /projects/by-developer/[slug]
 *
 * Renders a page-level header (H1 + subtitle + count), a short
 * "What this is" paragraph, and a list of projects using the same
 * mobile-card / desktop-table toggle as the main explorer
 * (`ProjectsCards` + `ProjectsTable`).
 *
 * Each hub page passes:
 *   - `headingEyebrow`   — small mono label above H1 (e.g. "PROVINCE HUB")
 *   - `heading`          — H1 text (e.g. "Central Kalimantan")
 *   - `description`      — short intro paragraph (LLM-extractable answer lead)
 *   - `rows`             — the projects to render
 *   - `backHref`         — link up to the index ("Browse all provinces →")
 *   - `backLabel`        — label for that link
 *
 * The rows use the narrower `ProjectHubRow` shape (no issuance/retirement
 * columns) so we adapt them to the existing `ProjectRow` contract the
 * table/card components expect — the adapter below fills the missing
 * numeric columns with "—" placeholders and never shows them as "0".
 */

import Link from 'next/link';
import type { ProjectHubRow } from '@/lib/queries/projects-by';
import type { ProjectRow } from '@/lib/queries/projects-list';
import { ProjectsCards } from '@/components/projects/ProjectsCards';
import { ProjectsTable } from '@/components/projects/ProjectsTable';

type Props = {
  headingEyebrow: string;
  heading: string;
  description: string;
  rows: ProjectHubRow[];
  backHref: string;
  backLabel: string;
  /**
   * SEO Phase 2D — optional rich-context block rendered between the header
   * subtitle and the project table. Province and methodology hubs pass a
   * stats grid + auto-generated paragraph here; registry/developer hubs
   * leave it undefined so their rendering is unchanged.
   */
  richContext?: React.ReactNode;
};

function adaptRow(r: ProjectHubRow): ProjectRow {
  return {
    id: r.id,
    slug: r.slug,
    nameCanonical: r.nameCanonical,
    developer: r.developer,
    province: r.province,
    projectType: r.projectType,
    methodology: r.methodology,
    hectares: r.hectares,
    totalVcusIssued: null,
    totalVcusRetired: null,
    totalVcusAvailable: r.totalVcusAvailable,
    status: r.status,
    integrityScore: r.integrityScore,
    registryNames: [],
  };
}

export function ProjectHub({
  headingEyebrow,
  heading,
  description,
  rows,
  backHref,
  backLabel,
  richContext,
}: Props) {
  const count = rows.length;
  const adapted = rows.map(adaptRow);

  return (
    <main className="kl-page">
      <header className="kl-page-header" style={{ marginBottom: 28 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="kl-section-label">
            <Link href={backHref} style={{ textDecoration: 'none' }}>
              ← {backLabel}
            </Link>
          </p>
          <p
            className="kl-section-label"
            style={{ marginTop: 6, marginBottom: 6 }}
          >
            {headingEyebrow}
          </p>
          <h1 className="kl-page-title" style={{ marginBottom: 8 }}>
            {heading}
          </h1>
          <p className="kl-page-subtitle" style={{ maxWidth: 720 }}>
            {description}
          </p>
          <p
            className="kl-muted"
            style={{ marginTop: 12, fontSize: 13 }}
            aria-label="Project count"
          >
            {count === 0
              ? 'No projects match this category yet.'
              : `${count} Indonesian carbon project${count === 1 ? '' : 's'} in this category.`}
          </p>
        </div>
      </header>

      {richContext}

      {count > 0 ? (
        <>
          <div className="kl-projects-list-desktop">
            <ProjectsTable rows={adapted} />
          </div>
          <div className="kl-projects-list-mobile">
            <ProjectsCards rows={adapted} />
          </div>
        </>
      ) : (
        <div className="kl-card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="kl-muted">
            Check back after the next weekly refresh. In the meantime,{' '}
            <Link href="/projects" style={{ color: 'var(--info-fg)' }}>
              browse the full registry →
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}
