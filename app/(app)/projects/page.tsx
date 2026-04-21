import Link from "next/link";
// TODO T11+: replace with db query
import { mockProjects } from "@/lib/mock-data";

export default function ProjectsPage() {
  return (
    <main className="kl-page">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">Registry · v0.1</p>
          <h1 className="kl-page-title">Projects explorer</h1>
          <p className="kl-page-subtitle">
            Indonesian carbon projects across Verra, SRN-PPI, Gold Standard, and
            IDXCarbon. Click any row for the full dossier.
          </p>
        </div>
        <div className="kl-page-actions">
          <span className="kl-pill kl-pill--neutral">Filters — coming soon</span>
        </div>
      </header>

      <div className="kl-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="kl-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Type</th>
              <th>Province</th>
              <th>Registries</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Score</th>
              <th style={{ textAlign: "right" }}>Available</th>
            </tr>
          </thead>
          <tbody>
            {mockProjects.map((p) => (
              <tr key={p.slug}>
                <td>
                  <Link href={`/projects/${p.slug}`} style={{ fontWeight: 500 }}>
                    {p.shortName}
                  </Link>
                  <div className="kl-page-subtitle">{p.developer}</div>
                </td>
                <td>{p.type}</td>
                <td>{p.provinceShort}</td>
                <td>
                  <span className="kl-pill kl-pill--neutral">
                    {p.registriesShort}
                  </span>
                </td>
                <td>
                  <span
                    className={`kl-pill kl-pill--${
                      p.status === "flagged"
                        ? "danger"
                        : p.status === "pipeline"
                          ? "warning"
                          : p.status === "suspended"
                            ? "danger"
                            : "success"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td style={{ textAlign: "right", fontWeight: 500 }}>{p.score}</td>
                <td style={{ textAlign: "right" }}>{p.available}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
