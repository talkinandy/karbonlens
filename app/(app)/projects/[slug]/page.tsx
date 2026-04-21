import { notFound } from "next/navigation";
import Link from "next/link";
// TODO T11+: replace with db query
import { mockProjects } from "@/lib/mock-data";

type Props = { params: Promise<{ slug: string }> };

export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params;
  const project = mockProjects.find((p) => p.slug === slug);

  if (!project) {
    notFound();
  }

  const breakdown = project.breakdown ?? {
    validation: 0,
    reversal: 0,
    community: 0,
    transparency: 0,
  };

  return (
    <main className="kl-page">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">
            <Link href="/projects">← Projects</Link> · {project.registriesShort}
          </p>
          <h1 className="kl-page-title">{project.name}</h1>
          <p className="kl-page-subtitle">
            {project.developer} · {project.province} ·{" "}
            {project.hectares.toLocaleString()} ha
          </p>
        </div>
        <div className="kl-page-actions">
          <span
            className={`kl-pill kl-pill--${
              project.status === "flagged"
                ? "danger"
                : project.status === "pipeline"
                  ? "warning"
                  : "success"
            }`}
          >
            {project.status}
          </span>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div className="kl-card">
          <p className="kl-stat-label">Integrity score</p>
          <p className="kl-stat-value tnum">{project.score}</p>
          <p className="kl-stat-delta">v1 methodology</p>
        </div>
        <div className="kl-card">
          <p className="kl-stat-label">Issued</p>
          <p className="kl-stat-value tnum">{project.issued ?? "—"}</p>
          <p className="kl-stat-delta">VCUs to date</p>
        </div>
        <div className="kl-card">
          <p className="kl-stat-label">Retired</p>
          <p className="kl-stat-value tnum">{project.retired ?? "—"}</p>
          <p className="kl-stat-delta">Cumulative</p>
        </div>
        <div className="kl-card">
          <p className="kl-stat-label">Available</p>
          <p className="kl-stat-value tnum">{project.available}</p>
          <p className="kl-stat-delta">Last vintage {project.lastVintage ?? "—"}</p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <p className="kl-section-label">Score breakdown</p>
        <div
          className="kl-card"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 24,
          }}
        >
          <div>
            <p className="kl-stat-label">Validation recency</p>
            <p className="kl-stat-value tnum" style={{ fontSize: 22 }}>
              {breakdown.validation}
            </p>
          </div>
          <div>
            <p className="kl-stat-label">Reversal risk</p>
            <p className="kl-stat-value tnum" style={{ fontSize: 22 }}>
              {breakdown.reversal}
            </p>
          </div>
          <div>
            <p className="kl-stat-label">Community flags</p>
            <p className="kl-stat-value tnum" style={{ fontSize: 22 }}>
              {breakdown.community}
            </p>
          </div>
          <div>
            <p className="kl-stat-label">Transparency</p>
            <p className="kl-stat-value tnum" style={{ fontSize: 22 }}>
              {breakdown.transparency}
            </p>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <p className="kl-section-label">Issuance history</p>
        <div className="kl-card">
          {project.issuances && project.issuances.length > 0 ? (
            <table className="kl-table">
              <thead>
                <tr>
                  <th>Vintage</th>
                  <th style={{ textAlign: "right" }}>Credits (M)</th>
                </tr>
              </thead>
              <tbody>
                {project.issuances.map((i) => (
                  <tr key={i.year}>
                    <td>{i.year}</td>
                    <td style={{ textAlign: "right" }}>{i.value.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="kl-page-subtitle">
              No issuances recorded. Pipeline projects populate this section once
              the first vintage is issued.
            </p>
          )}
        </div>
      </section>

      <section>
        <p className="kl-section-label">Issuances detail</p>
        <div className="kl-card">
          <p className="kl-page-subtitle">
            Full issuance + retirement detail lands in T11 with live registry data.
          </p>
        </div>
      </section>
    </main>
  );
}
