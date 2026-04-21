import Link from "next/link";
// TODO T11+: replace with db query
import { mockProjects } from "@/lib/mock-data";

export default function LandingPage() {
  const featured = mockProjects.slice(0, 3);

  return (
    <main className="kl-page">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">KarbonLens · v0.1 preview</p>
          <h1 className="kl-page-title" style={{ fontSize: 48, maxWidth: 720 }}>
            Indonesia&apos;s carbon market, in one terminal.
          </h1>
          <p className="kl-page-subtitle" style={{ maxWidth: 560, marginTop: 12 }}>
            Satellite MRV, prices, reversal alerts, and regulatory tracking —
            unified across Verra, SRN-PPI, Gold Standard, and IDXCarbon.
          </p>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 40 }}>
        <div className="kl-card">
          <p className="kl-stat-label">Indexed projects</p>
          <p className="kl-stat-value tnum">214</p>
          <p className="kl-stat-delta">Verra · SRN-PPI · Gold Standard · IDXCarbon</p>
        </div>
        <div className="kl-card">
          <p className="kl-stat-label">Satellite alerts (30d)</p>
          <p className="kl-stat-value tnum">1,842</p>
          <p className="kl-stat-delta">RADD · GLAD · VIIRS</p>
        </div>
        <div className="kl-card">
          <p className="kl-stat-label">Tracked regulations</p>
          <p className="kl-stat-value tnum">47</p>
          <p className="kl-stat-delta">Permenhut · Perpres · POJK · Kepmen</p>
        </div>
        <div className="kl-card">
          <p className="kl-stat-label">Monthly IDXCarbon value</p>
          <p className="kl-stat-value tnum">Rp 4.7B</p>
          <p className="kl-stat-delta">Jan 2026, ↓ 36% vs Dec</p>
        </div>
      </section>

      <section>
        <p className="kl-section-label">Featured projects</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {featured.map((p) => (
            <Link
              key={p.slug}
              href={`/projects/${p.slug}`}
              className="kl-card"
              style={{ display: "block" }}
            >
              <p className="kl-stat-label">{p.registriesShort}</p>
              <p style={{ fontFamily: "var(--font-instrument-serif), Georgia, serif", fontSize: 22, margin: "8px 0 4px" }}>
                {p.name}
              </p>
              <p className="kl-page-subtitle">
                {p.developer} · {p.province}
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, gap: 8 }}>
                <div>
                  <p className="kl-stat-label">Integrity score</p>
                  <p className="kl-stat-value tnum" style={{ fontSize: 20 }}>{p.score}</p>
                </div>
                <div>
                  <p className="kl-stat-label">Available</p>
                  <p className="kl-stat-value tnum" style={{ fontSize: 20 }}>{p.available}</p>
                </div>
              </div>
              <p style={{ marginTop: 16 }}>
                <span className={`kl-pill kl-pill--${p.status === "flagged" ? "danger" : p.status === "pipeline" ? "warning" : "success"}`}>
                  {p.status}
                </span>
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
