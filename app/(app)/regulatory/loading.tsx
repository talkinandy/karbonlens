/**
 * Loading skeleton for the regulatory timeline (T15 §3.6).
 *
 * Renders the page shell (header + filter-bar placeholder + 4 card skeletons)
 * so the layout doesn't shift when the DB query resolves. No animations —
 * consistent with the "terminal, not marketing site" design philosophy
 * (HANDOFF §Design brief).
 */

export default function RegulatoryLoading() {
  return (
    <main className="kl-page" aria-busy="true" aria-live="polite">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">Regulatory timeline · Indonesia</p>
          <h1 className="kl-page-title">Regulatory</h1>
          <p className="kl-page-subtitle">Loading regulatory events…</p>
        </div>
      </header>

      {/* Filter-bar placeholder */}
      <div
        aria-hidden="true"
        style={{
          height: 140,
          marginBottom: 24,
          background: 'var(--surface)',
          border: '0.5px solid var(--border)',
          borderRadius: 'var(--radius-md)',
        }}
      />

      {/* Card skeletons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="kl-card"
            style={{
              height: 120,
              borderLeft: '4px solid var(--border-strong)',
            }}
          />
        ))}
      </div>
    </main>
  );
}
