/**
 * Skeleton state for the `/alerts` RSC. Rendered via Next.js Suspense
 * boundary during the DB fetch.
 */
export default function AlertsLoading() {
  return (
    <main className="kl-page" aria-busy="true">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">Notifications · personal inbox</p>
          <h1 className="kl-page-title">Alerts</h1>
        </div>
      </header>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="kl-card"
            style={{
              padding: 16,
              opacity: 0.6,
              background:
                'linear-gradient(90deg, var(--surface-2) 0%, var(--surface) 50%, var(--surface-2) 100%)',
              animation: 'pulse 1.4s ease-in-out infinite',
              minHeight: 64,
            }}
          >
            <div
              style={{
                height: 10,
                width: 120,
                borderRadius: 3,
                background: 'var(--surface-2)',
                marginBottom: 10,
              }}
            />
            <div
              style={{
                height: 12,
                width: '80%',
                borderRadius: 3,
                background: 'var(--surface-2)',
              }}
            />
          </div>
        ))}
      </section>
    </main>
  );
}
