/**
 * components/projects/ProjectsTable.tsx — T11 presentational table.
 *
 * Ownership: T11. Pure server component. Receives `rows: ProjectRow[]` and
 * renders the `.kl-table` layout defined in `legacy/prototype/styles.css`.
 *
 * Columns (per T11 §3.4): Project (name + developer sub-line), Province,
 * Project Type, Methodology, Hectares, Issued, Retired, Available, Status,
 * Score. No "Registries" column — that moves to the T12 detail view.
 *
 * Status badge color is delegated to `lib/display/status.ts` so T11 and T12
 * stay visually consistent; when T06.1 changes the raw status strings only
 * the shared helper needs updating. See §3.5.
 */

import Link from 'next/link';
import type { ProjectRow } from '@/lib/queries/projects-list';
import { displayStatus, type StatusBadge } from '@/lib/display/status';

export type ProjectsTableProps = {
  rows: ProjectRow[];
};

const BADGE_TO_PILL: Record<StatusBadge, string> = {
  active: 'kl-pill kl-pill--success',
  pipeline: 'kl-pill kl-pill--info',
  suspended: 'kl-pill kl-pill--danger',
  flagged: 'kl-pill kl-pill--warning',
  unknown: 'kl-pill kl-pill--neutral',
};

/**
 * Compact number formatter — "32.5 M" for ≥1e6, "307 k" for ≥1e3, raw for
 * smaller. Uses BigInt for the initial parse so very large `numeric` strings
 * survive the Number conversion (v0.1 projects can hit ~10⁹ VCUs; `parseInt`
 * would truncate mantissa). See §7 edge case (vi).
 */
function formatCompact(raw: string | null): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  // numeric columns come through as decimal strings. We parse with Number for
  // the display format (a small fractional loss at ≥1e15 is acceptable since
  // the rendered form is "X.X M" — never the full mantissa).
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

/**
 * Hectares formatter — round to nearest integer per OQ-2 decision.
 */
function formatHectares(raw: string | null): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('en-ID')} ha`;
}

function formatDash(value: string | null): string {
  return value === null || value === undefined || value === '' ? '—' : value;
}

export function ProjectsTable({ rows }: ProjectsTableProps) {
  return (
    <div className="kl-card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="kl-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Province</th>
            <th>Project Type</th>
            <th>Methodology</th>
            <th style={{ textAlign: 'right' }}>Hectares</th>
            <th style={{ textAlign: 'right' }}>Issued</th>
            <th style={{ textAlign: 'right' }}>Retired</th>
            <th style={{ textAlign: 'right' }}>Available</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const status = displayStatus(p.status);
            const pillClass = BADGE_TO_PILL[status.badge];
            return (
              <tr key={p.id}>
                <td>
                  <Link
                    href={`/projects/${p.slug}`}
                    style={{ fontWeight: 500 }}
                  >
                    {p.nameCanonical}
                  </Link>
                  {p.developer ? (
                    <div className="kl-page-subtitle">{p.developer}</div>
                  ) : null}
                </td>
                <td>{p.province ?? 'Unknown'}</td>
                <td>{formatDash(p.projectType)}</td>
                <td>{formatDash(p.methodology)}</td>
                <td style={{ textAlign: 'right' }} className="tnum">
                  {formatHectares(p.hectares)}
                </td>
                <td style={{ textAlign: 'right' }} className="tnum">
                  {formatCompact(p.totalVcusIssued)}
                </td>
                <td style={{ textAlign: 'right' }} className="tnum">
                  {formatCompact(p.totalVcusRetired)}
                </td>
                <td style={{ textAlign: 'right' }} className="tnum">
                  {formatCompact(p.totalVcusAvailable)}
                </td>
                <td>
                  <span className={pillClass}>{status.label}</span>
                </td>
                <td
                  style={{ textAlign: 'right', fontWeight: 500 }}
                  className="tnum"
                >
                  {p.integrityScore === null || p.integrityScore === ''
                    ? '—'
                    : Math.round(Number(p.integrityScore)).toString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
