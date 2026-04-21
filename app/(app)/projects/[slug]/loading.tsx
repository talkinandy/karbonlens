/**
 * Loading skeleton for /projects/[slug] — matches the page's structural
 * scaffolding (hero, score card with four bar rows, registries table stub).
 */

export default function LoadingProjectDetail() {
  return (
    <main className="kl-page" aria-busy="true" aria-live="polite">
      <header className="kl-page-header">
        <div style={{ flex: 1 }}>
          <div
            className="kl-skeleton"
            style={{ height: 12, width: 140, marginBottom: 10 }}
          />
          <div
            className="kl-skeleton"
            style={{ height: 28, width: '60%', marginBottom: 8 }}
          />
          <div
            className="kl-skeleton"
            style={{ height: 14, width: '40%' }}
          />
        </div>
        <div
          className="kl-skeleton"
          style={{ height: 22, width: 90 }}
        />
      </header>

      <section style={{ marginBottom: 32 }}>
        <div
          className="kl-skeleton"
          style={{ height: 14, width: 120, marginBottom: 8 }}
        />
        <div className="kl-card">
          <div
            className="kl-skeleton"
            style={{ height: 40, width: 160, marginBottom: 20 }}
          />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div
                className="kl-skeleton"
                style={{ height: 12, width: '40%', marginBottom: 8 }}
              />
              <div
                className="kl-skeleton"
                style={{ height: 6, width: '100%' }}
              />
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <div
          className="kl-skeleton"
          style={{ height: 14, width: 100, marginBottom: 8 }}
        />
        <div
          className="kl-skeleton"
          style={{ height: 140, width: '100%' }}
        />
      </section>
    </main>
  );
}
