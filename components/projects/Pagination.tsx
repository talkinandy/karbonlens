/**
 * components/projects/Pagination.tsx — T11 Prev/Next pagination.
 *
 * Pure link-based (server-rendered) — no client JS. Receives pre-built hrefs
 * and current/total page numbers from the page server component. When
 * `totalPages <= 1` the caller should not render this at all (§3.7 rule:
 * "when total <= limit, hide the entire pagination row").
 *
 * All hrefs are built via `buildFilterUrl` upstream so they preserve the
 * current `tab`, filter, and sort params.
 */

import Link from 'next/link';

export type PaginationProps = {
  currentPage: number;
  totalPages: number;
  prevHref: string | null;
  nextHref: string | null;
};

export function Pagination({
  currentPage,
  totalPages,
  prevHref,
  nextHref,
}: PaginationProps) {
  return (
    <nav className="kl-pagination" aria-label="Projects pagination">
      <div>
        {prevHref ? (
          <Link href={prevHref} className="kl-btn kl-btn--secondary">
            ← Prev
          </Link>
        ) : (
          <span
            className="kl-btn kl-btn--secondary"
            aria-disabled="true"
            style={{ opacity: 0.4, cursor: 'not-allowed' }}
          >
            ← Prev
          </span>
        )}
      </div>
      <div>
        Page {currentPage} of {totalPages}
      </div>
      <div>
        {nextHref ? (
          <Link href={nextHref} className="kl-btn kl-btn--secondary">
            Next →
          </Link>
        ) : (
          <span
            className="kl-btn kl-btn--secondary"
            aria-disabled="true"
            style={{ opacity: 0.4, cursor: 'not-allowed' }}
          >
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
