/**
 * IssuancesTable — issuances card (#issuances anchor).
 *
 * Server-rendered pagination via `?issuance_page=N` (20 rows/page). The parent
 * server component slices the full row array before passing it in here.
 */

import Link from 'next/link';
import type { IssuanceRow } from '@/lib/queries/project-detail';

type Props = {
  rows: IssuanceRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  slug: string;
};

function fmtCredits(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('en-ID');
}

export function IssuancesTable({
  rows,
  page,
  pageSize,
  totalRows,
  slug,
}: Props) {
  if (totalRows === 0) {
    return (
      <section id="issuances" style={{ marginBottom: 32 }}>
        <p className="kl-section-label">Issuances</p>
        <div className="kl-card">
          <p className="kl-page-subtitle">
            Pipeline — no issuances recorded.
          </p>
        </div>
      </section>
    );
  }

  const pageStart = (page - 1) * pageSize;
  const pageRows = rows.slice(pageStart, pageStart + pageSize);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <section id="issuances" style={{ marginBottom: 32 }}>
      <p className="kl-section-label">Issuances</p>
      <div className="kl-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="kl-table-scroll">
        <table className="kl-table">
          <thead>
            <tr>
              <th>Vintage</th>
              <th style={{ textAlign: 'right' }}>Credits (tCO₂e)</th>
              <th>Issuance date</th>
              <th>Serial range</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={`${r.vintageYear}-${r.issuanceDate}-${i}`}>
                <td className="tnum">{r.vintageYear}</td>
                <td className="tnum" style={{ textAlign: 'right' }}>
                  {fmtCredits(r.credits)}
                </td>
                <td>{r.issuanceDate}</td>
                <td>
                  {r.serialStart && r.serialEnd
                    ? `${r.serialStart} – ${r.serialEnd}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 12,
          }}
        >
          <span className="kl-muted">
            Page {page} of {totalPages} · {totalRows} issuances
          </span>
          {page > 1 && (
            <Link
              href={`/projects/${slug}?issuance_page=${page - 1}#issuances`}
              className="kl-link"
            >
              ← Previous
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/projects/${slug}?issuance_page=${page + 1}#issuances`}
              className="kl-link"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
