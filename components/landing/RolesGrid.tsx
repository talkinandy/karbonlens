/**
 * components/landing/RolesGrid.tsx — T25 "Built for" persona cards.
 *
 * Four editorial persona cards matching PRD §2 roles:
 *   International Buyers & Brokers · Corporate Sustainability (Indonesia) ·
 *   Climate Researchers & NGOs · Journalists & Policy Analysts.
 *
 * Per T25 §3.5. No live data — purely static copy.
 */

type Role = {
  num: string;
  title: string;
  body: string;
};

const ROLES: Role[] = [
  {
    num: '01',
    title: 'International Buyers & Brokers',
    body: "Shortlist Indonesian credits by vintage, methodology, reversal risk, and CA authorization. No PDF scraping — every Verra and SRN-PPI record in one place.",
  },
  {
    num: '02',
    title: 'Corporate Sustainability (Indonesia)',
    body: "Benchmark your company's offset portfolio against 200+ live projects. Show the board the numbers behind your ESG commitments.",
  },
  {
    num: '03',
    title: 'Climate Researchers & NGOs',
    body: 'Primary-source data with full citation coverage. RADD, SRN-PPI, IDXCarbon, JDIH — deduplicated, versioned, and queryable.',
  },
  {
    num: '04',
    title: 'Journalists & Policy Analysts',
    body: 'Policy timelines, credit flows, and satellite anomalies in plain language. One screen beats six spreadsheets.',
  },
];

export function RolesGrid() {
  return (
    <section className="lp-section">
      <div className="lp-section-head">
        <div>
          <div className="lp-eyebrow">Built for</div>
          <h2 className="lp-h2">The people moving the market.</h2>
        </div>
      </div>
      <div className="lp-roles-grid">
        {ROLES.map((r) => (
          <div key={r.num} className="lp-role">
            <div className="lp-role-num">{r.num}</div>
            <div className="lp-role-title">{r.title}</div>
            <p className="lp-role-body">{r.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
