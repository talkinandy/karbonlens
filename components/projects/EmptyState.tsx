/**
 * components/projects/EmptyState.tsx — T11 zero-results card.
 *
 * Rendered in place of `<ProjectsTable>` when the filter predicate matches
 * zero rows (§3.6). The "Clear filters" link preserves the current `tab`
 * param so the user stays on the map tab if that is where they were
 * filtering.
 */

import Link from 'next/link';

export type EmptyStateProps = {
  clearFiltersHref: string;
};

export function EmptyState({ clearFiltersHref }: EmptyStateProps) {
  return (
    <div className="kl-card">
      <div className="kl-empty-state">
        <p>No projects match these filters.</p>
        <Link href={clearFiltersHref} className="kl-btn kl-btn--secondary">
          Clear filters
        </Link>
      </div>
    </div>
  );
}
