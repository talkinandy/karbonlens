// TODO T11+: replace with db query
import {
  mockPriceSeries,
  mockPriceStats,
  mockTransactions,
} from "@/lib/mock-data";

export default function PricesPage() {
  return (
    <main className="kl-page">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">IDXCarbon · Jan 2026</p>
          <h1 className="kl-page-title">Price intelligence</h1>
          <p className="kl-page-subtitle">
            Monthly IDXCarbon snapshot — IDTBS, IDTBS-RE, IDNBS. Marketplace and
            negotiated transactions.
          </p>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {mockPriceStats.map((s) => (
          <div key={s.label} className="kl-card">
            <p className="kl-stat-label">{s.label}</p>
            <p className="kl-stat-value tnum">{s.value}</p>
            <p className="kl-stat-delta">{s.delta}</p>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 32 }}>
        <p className="kl-section-label">Series (Rp 000s / tCO₂e)</p>
        <div className="kl-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="kl-table">
            <thead>
              <tr>
                <th>Month</th>
                <th style={{ textAlign: "right" }}>IDTBS-RE</th>
                <th style={{ textAlign: "right" }}>IDTBS</th>
                <th style={{ textAlign: "right" }}>IDNBS</th>
              </tr>
            </thead>
            <tbody>
              {mockPriceSeries.map((p) => (
                <tr key={p.month}>
                  <td>{p.month}</td>
                  <td style={{ textAlign: "right" }}>
                    {p.idtbsRe !== null ? p.idtbsRe : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {p.idtbs !== null ? p.idtbs : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {p.idnbs !== null ? p.idnbs : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="kl-page-subtitle" style={{ marginTop: 12 }}>
          Chart component lands in T14. For T03 the data is rendered as a table.
        </p>
      </section>

      <section>
        <p className="kl-section-label">Recent transactions</p>
        <div className="kl-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="kl-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Market</th>
                <th>Credit type</th>
                <th>Project</th>
                <th style={{ textAlign: "right" }}>Volume</th>
                <th style={{ textAlign: "right" }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {mockTransactions.map((t) => (
                <tr key={`${t.date}-${t.project}`}>
                  <td>{t.date}</td>
                  <td>{t.market}</td>
                  <td>
                    <span className="kl-pill kl-pill--neutral">
                      {t.creditType}
                    </span>
                  </td>
                  <td>{t.project}</td>
                  <td style={{ textAlign: "right" }}>{t.volume}</td>
                  <td style={{ textAlign: "right" }}>{t.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
