/**
 * components/projects/ProjectsCards.tsx — mobile-first card list.
 *
 * Rendered at ≤768px in place of ProjectsTable. A phone user reads each
 * project as a scannable card rather than sideways-scrolling a 10-column
 * spreadsheet.
 *
 * Layout per card:
 *   ┌─────────────────────────────────────┐
 *   │ Project name (serif)         [74]  │   ← score badge, colored
 *   │ Developer · Province               │
 *   │ [Type]                             │
 *   │ Available 12 k · [Status pill]     │
 *   └─────────────────────────────────────┘
 *
 * Whole card is a <Link> to /projects/[slug].
 */

import Link from 'next/link';
import type { ProjectRow } from '@/lib/queries/projects-list';
import { displayStatus, type StatusBadge } from '@/lib/display/status';
import { ScoreBadge } from './ScoreBadge';

export type ProjectsCardsProps = {
  rows: ProjectRow[];
};

const BADGE_TO_PILL: Record<StatusBadge, string> = {
  active: 'kl-pill kl-pill--success',
  pipeline: 'kl-pill kl-pill--info',
  suspended: 'kl-pill kl-pill--danger',
  flagged: 'kl-pill kl-pill--warning',
  unknown: 'kl-pill kl-pill--neutral',
};

function formatCompact(raw: string | null): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} M`;
  }
  if (abs >= 1_000) {
    return `${Math.round(n / 1_000)} k`;
  }
  return Math.round(n).toLocaleString('en-ID');
}

export function ProjectsCards({ rows }: ProjectsCardsProps) {
  return (
    <ul className="kl-projects-cards" aria-label="Projects">
      {rows.map((p) => {
        const status = displayStatus(p.status);
        const pillClass = BADGE_TO_PILL[status.badge];
        const metaParts: string[] = [];
        if (p.developer) metaParts.push(p.developer);
        if (p.province) metaParts.push(p.province);

        return (
          <li key={p.id} className="kl-projects-card">
            <Link
              href={`/projects/${p.slug}`}
              className="kl-projects-card-link"
              aria-label={`${p.nameCanonical} — integrity score ${p.integrityScore ?? 'unknown'}`}
            >
              <div className="kl-projects-card-top">
                <div className="kl-projects-card-name">{p.nameCanonical}</div>
                <ScoreBadge score={p.integrityScore} />
              </div>

              {metaParts.length > 0 ? (
                <div className="kl-projects-card-meta">
                  {metaParts.join(' · ')}
                </div>
              ) : null}

              <div className="kl-projects-card-footer">
                {p.projectType ? (
                  <span className="kl-projects-card-type">{p.projectType}</span>
                ) : null}
                <span className="kl-projects-card-avail">
                  <span className="kl-projects-card-avail-label">Available</span>{' '}
                  <span className="tnum">{formatCompact(p.totalVcusAvailable)}</span>
                </span>
                <span className={pillClass}>{status.label}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
