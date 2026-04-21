// TODO T11+: replace with db query
import { mockAlerts } from "@/lib/mock-data";

export default function AlertsPage() {
  return (
    <main className="kl-page">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">Notifications · personal inbox</p>
          <h1 className="kl-page-title">Alerts</h1>
          <p className="kl-page-subtitle">
            Reversal warnings, price thresholds, regulatory updates, news,
            retirements, and issuances on projects you track.
          </p>
        </div>
      </header>

      {mockAlerts.length === 0 ? (
        <section
          className="kl-card"
          style={{ padding: 40, textAlign: "center" }}
        >
          <p className="kl-stat-label" style={{ marginBottom: 16 }}>
            No notifications yet
          </p>
          <p
            style={{
              fontFamily: "var(--font-instrument-serif), Georgia, serif",
              fontSize: 22,
              lineHeight: 1.3,
              margin: "0 auto",
              maxWidth: 480,
            }}
          >
            Your alerts will appear here once the scrapers go live.
          </p>
          <p className="kl-page-subtitle" style={{ marginTop: 12 }}>
            Satellite alerts and IDXCarbon transactions populate weekly; new
            Permenhut / Perpres publications within 24 hours.
          </p>
        </section>
      ) : (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mockAlerts.map((a) => (
            <article key={a.id} className="kl-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <p className="kl-section-label">
                    {a.typeLabel} · {a.project} · {a.time}
                  </p>
                  <h2
                    style={{
                      fontFamily:
                        "var(--font-instrument-serif), Georgia, serif",
                      fontSize: 18,
                      margin: "0 0 8px",
                    }}
                  >
                    {a.title}
                  </h2>
                  <p className="kl-page-subtitle">{a.description}</p>
                </div>
                <span className={`kl-pill kl-pill--${a.severity}`}>
                  {a.typeLabel}
                </span>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
