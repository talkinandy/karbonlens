// TODO T11+: replace with db query
import { mockRegulatoryEvents } from "@/lib/mock-data";

const IMPORTANCE_PILL: Record<string, string> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

export default function RegulatoryPage() {
  const past = mockRegulatoryEvents.filter((e) => !e.isUpcoming);
  const upcoming = mockRegulatoryEvents.filter((e) => e.isUpcoming);

  return (
    <main className="kl-page">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">Regulatory timeline · Indonesia</p>
          <h1 className="kl-page-title">Regulatory</h1>
          <p className="kl-page-subtitle">
            Permenhut, Perpres, POJK, Kepmen, MoU, and IDXCarbon milestones
            affecting carbon-market operators.
          </p>
        </div>
      </header>

      <section style={{ marginBottom: 32 }}>
        <p className="kl-section-label">Recent</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {past.map((e) => (
            <article key={e.id} className="kl-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <p className="kl-section-label" style={{ marginBottom: 6 }}>
                    {e.eventDate} · {e.status}
                  </p>
                  <h2
                    style={{
                      fontFamily:
                        "var(--font-instrument-serif), Georgia, serif",
                      fontSize: 20,
                      margin: "0 0 8px",
                      lineHeight: 1.3,
                    }}
                  >
                    {e.title}
                  </h2>
                </div>
                <span
                  className={`kl-pill kl-pill--${IMPORTANCE_PILL[e.importance]}`}
                >
                  {e.importance}
                </span>
              </div>
              <p className="kl-page-subtitle" style={{ marginTop: 4 }}>
                {e.summary}
              </p>
              <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {e.tags.map((t) => (
                  <span key={t} className="kl-pill kl-pill--neutral">
                    {t}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <p className="kl-section-label">Upcoming</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {upcoming.map((e) => (
            <article key={e.id} className="kl-card">
              <p className="kl-section-label" style={{ marginBottom: 6 }}>
                {e.eventDate} · {e.status}
              </p>
              <h2
                style={{
                  fontFamily: "var(--font-instrument-serif), Georgia, serif",
                  fontSize: 18,
                  margin: "0 0 8px",
                }}
              >
                {e.title}
              </h2>
              <p className="kl-page-subtitle">{e.summary}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
