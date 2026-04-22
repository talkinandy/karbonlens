/**
 * app/admin/queue/loading.tsx — T21 skeleton for the match-queue list.
 *
 * Rendered automatically by the Next.js App Router while the page's server
 * component awaits its DB query. Layout mirrors the final page (header +
 * three row cards) so content swap does not shift vertically.
 */

const SKELETON_ROWS = 3;

export default function AdminQueueLoading() {
  return (
    <main className="kl-page" aria-busy="true" aria-label="Loading match queue">
      <header className="kl-page-header" style={{ paddingTop: 16 }}>
        <div
          className="kl-skeleton animate-pulse"
          style={{ height: 12, width: 180, marginBottom: 10 }}
        />
        <div
          className="kl-skeleton animate-pulse"
          style={{ height: 24, width: 220, marginBottom: 8 }}
        />
        <div
          className="kl-skeleton animate-pulse"
          style={{ height: 12, width: '70%' }}
        />
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <div key={i} className="kl-card" style={{ padding: 16 }}>
            <div
              className="kl-skeleton animate-pulse"
              style={{ height: 14, width: 160, marginBottom: 14 }}
            />
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
            >
              <div>
                <div
                  className="kl-skeleton animate-pulse"
                  style={{ height: 16, width: '80%', marginBottom: 8 }}
                />
                <div
                  className="kl-skeleton animate-pulse"
                  style={{ height: 12, width: '60%', marginBottom: 6 }}
                />
                <div
                  className="kl-skeleton animate-pulse"
                  style={{ height: 12, width: '50%' }}
                />
              </div>
              <div>
                <div
                  className="kl-skeleton animate-pulse"
                  style={{ height: 16, width: '80%', marginBottom: 8 }}
                />
                <div
                  className="kl-skeleton animate-pulse"
                  style={{ height: 12, width: '60%', marginBottom: 6 }}
                />
                <div
                  className="kl-skeleton animate-pulse"
                  style={{ height: 12, width: '50%' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
