/**
 * app/(app)/projects/loading.tsx — T11 skeleton state.
 *
 * Picked up automatically by Next.js App Router streaming while the server
 * components on `page.tsx` await their DB queries. Structure matches the
 * rendered page so nothing shifts when the real content streams in:
 *
 *   - page header bar (title height)
 *   - stats strip bar (single ~24 px row)
 *   - filter + sort row bar (~40 px — §3.8 calls this out as required)
 *   - 20-row <table> skeleton matching ProjectsTable's column count
 *
 * Uses Tailwind's `animate-pulse` utility and the `.kl-skeleton` helper class
 * declared in `app/globals.css` (added by T11).
 */

const COLUMN_COUNT = 10;
const SKELETON_ROWS = 20;

export default function ProjectsLoading() {
  return (
    <main className="kl-page" aria-busy="true" aria-label="Loading projects">
      <header className="kl-page-header">
        <div style={{ width: '100%', maxWidth: 520 }}>
          <div
            className="kl-skeleton animate-pulse"
            style={{ height: 12, width: 120, marginBottom: 12 }}
          />
          <div
            className="kl-skeleton animate-pulse"
            style={{ height: 32, width: '100%', marginBottom: 10 }}
          />
          <div
            className="kl-skeleton animate-pulse"
            style={{ height: 14, width: '80%' }}
          />
        </div>
      </header>

      {/* Stats strip placeholder */}
      <div
        className="kl-skeleton animate-pulse"
        style={{ height: 24, width: '100%', marginBottom: 16 }}
      />

      {/* Filter + sort row placeholder — sized to prevent layout shift */}
      <div
        className="kl-skeleton animate-pulse"
        style={{ height: 40, width: '100%', marginBottom: 16 }}
      />

      {/* Table skeleton — 20 rows of ghosted cells */}
      <div className="kl-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="kl-table">
          <thead>
            <tr>
              {Array.from({ length: COLUMN_COUNT }).map((_, i) => (
                <th key={i}>
                  <div
                    className="kl-skeleton animate-pulse"
                    style={{ height: 12, width: '60%' }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKELETON_ROWS }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: COLUMN_COUNT }).map((_, c) => (
                  <td key={c}>
                    <div
                      className="kl-skeleton animate-pulse"
                      style={{ height: 12, width: c === 0 ? '80%' : '60%' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
