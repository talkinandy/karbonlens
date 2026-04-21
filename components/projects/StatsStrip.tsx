/**
 * components/projects/StatsStrip.tsx — T11 stats header.
 *
 * Renders the "Showing X of N projects · Y VCUs available · Median score: Z"
 * line above the filter toolbar. Pure presentational — receives pre-computed
 * `ProjectsStats` from `lib/queries/projects-list`, which derives all values
 * in a single CTE (no TOCTOU between the filtered count and the list page).
 *
 * Numbers are always live from the query — the denominator is never the
 * hardcoded literal `64`, so adding projects to the DB updates the strip with
 * no code change.
 */

import type { ProjectsStats } from '@/lib/queries/projects-list';

export type StatsStripProps = {
  stats: ProjectsStats;
};

function formatCompactVcu(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return '0 VCUs available';
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} M VCUs available`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000).toLocaleString('en-ID')} k VCUs available`;
  }
  return `${Math.round(n).toLocaleString('en-ID')} VCUs available`;
}

export function StatsStrip({ stats }: StatsStripProps) {
  const showingText = `Showing ${stats.totalMatching.toLocaleString('en-ID')} of ${stats.totalProjectCount.toLocaleString('en-ID')} projects`;
  const vcuText = formatCompactVcu(stats.sumAvailableVcus);
  const medianText =
    stats.medianIntegrityScore === null
      ? 'Median score: —'
      : `Median score: ${Math.round(stats.medianIntegrityScore)}`;

  return (
    <div className="kl-stats-strip" role="status" aria-live="polite">
      <span>
        <strong>{showingText}</strong>
      </span>
      <span>{vcuText}</span>
      <span>{medianText}</span>
    </div>
  );
}
