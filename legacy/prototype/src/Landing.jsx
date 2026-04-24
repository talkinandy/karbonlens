// =========================================================
// Landing — editorial dark split-hero
// =========================================================
function Landing() {
  const { projects, priceStats } = window.KL_DATA;
  const featured = projects.filter(p => ['katingan-peatland','rimba-raya','pertamina-lahendong','bukit-tigapuluh'].includes(p.id));

  return (
    <Shell current="landing">
      {/* ============ HERO ============ */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-hero-left">
            <div className="lp-kicker">
              <span className="lp-kicker-dot"/>
              <span>Indonesia carbon market intelligence</span>
              <span className="lp-kicker-sep">·</span>
              <span>Beta · Jakarta</span>
            </div>
            <h1 className="lp-h1">
              Every credit,<br/>
              every policy,<br/>
              <em className="lp-h1-em">one lens.</em>
            </h1>
            <p className="lp-tag-en">
              KarbonLens turns SRN-PPI, IDXCarbon, Verra, Sentinel, and JDIH into a single
              workspace for the people building — and buying from — Indonesia's carbon market.
            </p>
            <p className="lp-tag-id">
              Platform intelijen pasar karbon Indonesia. Registri, harga, regulasi, dan pemantauan satelit dalam satu layar.
            </p>
            <div className="lp-cta">
              <button className="btn btn-primary" onClick={() => navigate('#/projects')}>
                Open the terminal
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 2 }}>
                  <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" fill="none"/>
                </svg>
              </button>
              <button className="btn" onClick={() => navigate('#/regulatory')}>
                Read Permenhut 6/2026
              </button>
            </div>
            <div className="lp-hero-stats">
              <div><div className="lp-hs-v">214</div><div className="lp-hs-l">Projects tracked</div></div>
              <div><div className="lp-hs-v">{priceStats.avgPrice}</div><div className="lp-hs-l">IDTBS-RE avg · Jan</div></div>
              <div><div className="lp-hs-v">3.2 Mt</div><div className="lp-hs-l">VCUs traded · YTD</div></div>
            </div>
          </div>

          <div className="lp-hero-right">
            <SatelliteMap mode="full" project={window.KL_DATA.projects[0]} />
            <div className="lp-hero-caption">
              Live monitoring · <span className="mono">Katingan Peatland, Central Kalimantan</span> · 5 RADD alerts in last 90 days
            </div>
          </div>
        </div>
      </section>

      {/* ============ TICKER ============ */}
      <section className="lp-ticker">
        <div className="lp-ticker-inner">
          <TickerItem label="IDTBS-RE"   value="Rp 64,100" delta="+4.2%" tone="up"/>
          <TickerItem label="IDTBS"      value="Rp 37,500" delta="-2.1%" tone="down"/>
          <TickerItem label="IDNBS"      value="Rp 38,000" delta="+0.0%" tone="flat"/>
          <TickerItem label="Jan volume" value="117k t"    delta="-38%"  tone="down"/>
          <TickerItem label="Participants" value="132"     delta="+4"    tone="up"/>
          <TickerItem label="Active alerts" value="17"     delta="3 new" tone="flat"/>
        </div>
      </section>

      {/* ============ PIPELINES ============ */}
      <section className="lp-section">
        <div className="lp-section-head">
          <div>
            <div className="lp-eyebrow">Four data pipelines</div>
            <h2 className="lp-h2">Indonesia's carbon data<br/>was never this legible.</h2>
          </div>
          <p className="lp-section-lead">
            We ingest and reconcile the country's fragmented registries and monitoring feeds every day —
            so your analyst doesn't have to.
          </p>
        </div>

        <div className="lp-pipeline-grid">
          <Pipeline num="01" title="Registries" stat="48,291"  statLabel="credits indexed"
            body="SRN-PPI, IDXCarbon, Verra, Gold Standard and SRUK reconciled into one ledger. Every VCU traced from issuance to retirement, with Corresponding Adjustment flags."
            href="#/projects"/>
          <Pipeline num="02" title="Satellite MRV" stat="10 m"  statLabel="Sentinel-2 resolution"
            body="RADD deforestation alerts, VIIRS fire hotspots, Sentinel-1 radar and NDVI time-series — clipped to every project polygon. Reversal risk, priced in."
            href="#/projects/katingan-peatland"/>
          <Pipeline num="03" title="Prices" stat={priceStats.volume}  statLabel="Jan IDXCarbon volume"
            body="Every IDXCarbon negotiated and marketplace trade, enriched with credit type, vintage, and developer. A live ticker your desk can finally plan against."
            href="#/prices"/>
          <Pipeline num="04" title="Regulatory" stat="Permenhut 6/2026"  statLabel="freshly in force"
            body="JDIH-scraped policy timeline with plain-language summaries in Bahasa and English. Know what changes, when, and which of your assets it touches."
            href="#/regulatory"/>
        </div>
      </section>

      {/* ============ FEATURED PROJECTS ============ */}
      <section className="lp-section">
        <div className="lp-section-head">
          <div>
            <div className="lp-eyebrow">Featured projects</div>
            <h2 className="lp-h2">Under the lens, right now.</h2>
          </div>
          <a className="lp-section-link" onClick={() => navigate('#/projects')}>Browse all 214 →</a>
        </div>

        <div className="lp-featured-grid">
          {featured.map(p => <FeaturedCard key={p.id} project={p}/>)}
        </div>
      </section>

      {/* ============ BUILT FOR ============ */}
      <section className="lp-section lp-roles">
        <div className="lp-section-head">
          <div>
            <div className="lp-eyebrow">Built for</div>
            <h2 className="lp-h2">The people moving the market.</h2>
          </div>
        </div>
        <div className="lp-roles-grid">
          <RoleCard role="Developers" body="Benchmark your project against 213 peers. Show buyers the numbers behind your score." num="01"/>
          <RoleCard role="Corporates" body="Shortlist credits by vintage, methodology, reversal risk and CA authorization. No more PDF scraping." num="02"/>
          <RoleCard role="Banks & VCs" body="Diligence deal-flow pre-investment. Price, permanence, policy — in one report." num="03"/>
          <RoleCard role="Regulators" body="Live dashboard of SRN-PPI activity, issuance pipelines, and news sentiment across projects." num="04"/>
        </div>
      </section>

      {/* ============ METHODOLOGY EDITORIAL STRIP ============ */}
      <section className="lp-method">
        <div className="lp-method-inner">
          <div className="lp-eyebrow">Methodology</div>
          <h2 className="lp-method-h">
            We score every project on <em>four axes</em> — <span className="lp-method-fade">validation, reversal risk, community, transparency</span> — and show our work.
          </h2>
          <div className="lp-method-stats">
            <div><div className="lp-ms-v">4</div><div className="lp-ms-l">scoring axes</div></div>
            <div><div className="lp-ms-v">18</div><div className="lp-ms-l">upstream data sources</div></div>
            <div><div className="lp-ms-v">24 h</div><div className="lp-ms-l">refresh cadence</div></div>
            <div><div className="lp-ms-v">100%</div><div className="lp-ms-l">citation coverage</div></div>
          </div>
        </div>
      </section>

      {/* ============ CLOSING CTA ============ */}
      <section className="lp-closer">
        <div className="lp-closer-inner">
          <h2 className="lp-closer-h">The terminal your carbon desk<br/>didn't know it was waiting for.</h2>
          <p className="lp-closer-sub">Start with the live map. Open any project. Read the policy. All in the browser.</p>
          <div className="lp-cta">
            <button className="btn btn-primary" onClick={() => navigate('#/projects')}>Open the terminal</button>
            <button className="btn" onClick={() => navigate('#/prices')}>See live prices</button>
          </div>
        </div>
      </section>
    </Shell>
  );
}

function TickerItem({ label, value, delta, tone }) {
  return (
    <div className="lp-ticker-item">
      <div className="lp-ti-label">{label}</div>
      <div className="lp-ti-value">{value}</div>
      <div className={'lp-ti-delta ' + tone}>{delta}</div>
    </div>
  );
}

function Pipeline({ num, title, stat, statLabel, body, href }) {
  return (
    <div className="lp-pipeline" onClick={() => navigate(href)}>
      <div className="lp-pipeline-num">{num}</div>
      <div className="lp-pipeline-title">{title}</div>
      <div className="lp-pipeline-stat">{stat}</div>
      <div className="lp-pipeline-stat-label">{statLabel}</div>
      <p className="lp-pipeline-body">{body}</p>
      <span className="lp-pipeline-cta">Explore →</span>
    </div>
  );
}

function FeaturedCard({ project }) {
  const p = project;
  return (
    <div className="lp-feat" onClick={() => navigate('#/projects/' + p.id)}>
      <div className="lp-feat-thumb">
        <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" className="lp-feat-svg">
          <defs>
            <linearGradient id={'lfg-'+p.id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0"   stopColor="#1f3a2c"/>
              <stop offset="0.5" stopColor="#2d5a3a"/>
              <stop offset="1"   stopColor="#26463a"/>
            </linearGradient>
          </defs>
          <rect width="200" height="120" fill={`url(#lfg-${p.id})`}/>
          <circle cx="50" cy="30" r="30" fill="rgba(0,0,0,0.2)"/>
          <circle cx="160" cy="90" r="35" fill="rgba(0,0,0,0.18)"/>
          <path d="M -10 70 C 40 55, 90 85, 140 65 S 210 70, 220 75" stroke="#224a62" strokeWidth="3" fill="none" opacity="0.85"/>
          {/* boundary polygon */}
          <path d="M 30 45 L 70 30 L 120 35 L 160 45 L 175 75 L 150 100 L 100 95 L 60 95 L 30 80 Z"
                fill="rgba(79,184,156,0.12)" stroke="#4FB89C" strokeWidth="1.2"/>
          {/* alert dots */}
          <circle cx="80" cy="55" r="2.5" fill="#E2625B"/>
          <circle cx="115" cy="62" r="2.5" fill="#E2625B"/>
          <circle cx="140" cy="78" r="2" fill="#F0B04E"/>
        </svg>
        <div className="lp-feat-chip">{p.type}</div>
      </div>
      <div className="lp-feat-body">
        <div className="lp-feat-name">{p.shortName}</div>
        <div className="lp-feat-meta">{p.developer} · {p.provinceShort || p.province}</div>
        <div className="lp-feat-row">
          <div>
            <div className="lp-feat-stat-l">Score</div>
            <div className="lp-feat-stat-v">{p.score}</div>
          </div>
          <div>
            <div className="lp-feat-stat-l">Available</div>
            <div className="lp-feat-stat-v">{p.available}</div>
          </div>
          <div>
            <div className="lp-feat-stat-l">Registry</div>
            <div className="lp-feat-stat-v mono">{p.registriesShort}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleCard({ role, body, num }) {
  return (
    <div className="lp-role">
      <div className="lp-role-num">{num}</div>
      <div className="lp-role-title">{role}</div>
      <p className="lp-role-body">{body}</p>
    </div>
  );
}

window.Landing = Landing;
