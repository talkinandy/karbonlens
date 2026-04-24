// =========================================================
// Prices — IDXCarbon snapshot
// =========================================================
function Prices() {
  const { priceStats, priceSeries, transactions } = window.KL_DATA;
  const [range, setRange] = useState('6M');

  // chart sizing
  const CW = 800, CH = 260, PX = 50, PY = 20;
  const ys = Object.values(priceSeries).filter(Array.isArray).flat().filter(v => v != null);
  const yMin = 30, yMax = 70;
  const months = priceSeries.months;
  const xAt = i => PX + (i / (months.length - 1)) * (CW - PX - 20);
  const yAt = v => PY + (1 - (v - yMin) / (yMax - yMin)) * (CH - PY - 30);

  const seriesDef = [
    { id: 'IDTBS-RE', color: 'var(--chart-blue)',  stroke: '#378ADD' },
    { id: 'IDTBS',    color: 'var(--chart-teal)',  stroke: '#1D9E75' },
    { id: 'IDNBS',    color: 'var(--chart-amber)', stroke: '#BA7517' },
  ];

  return (
    <Shell current="prices">
      <div className="page" data-screen-label="04 Prices">
        <div className="page-header">
          <div>
            <h1 className="page-title">Prices</h1>
            <p className="page-subtitle">IDXCarbon · live compliance & voluntary trade data · Jan 2026 snapshot.</p>
          </div>
          <div className="page-actions">
            <div className="range-pills">
              {['1M','3M','6M','1Y','All'].map(r => (
                <button key={r} className={'range-pill ' + (range === r ? 'active' : '')}
                        onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
            <button className="btn btn-sm">Export</button>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">January value</div>
            <div className="stat-value tnum">{priceStats.janValue}</div>
            <div className="stat-delta down">{priceStats.janValueDelta}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Volume</div>
            <div className="stat-value tnum">{priceStats.volume}</div>
            <div className="stat-delta down">{priceStats.volumeDelta}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg price</div>
            <div className="stat-value tnum">{priceStats.avgPrice}</div>
            <div className="stat-delta neutral">{priceStats.avgPriceDelta}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Participants</div>
            <div className="stat-value tnum">{priceStats.participants}</div>
            <div className="stat-delta up">{priceStats.participantsDelta}</div>
          </div>
        </div>

        <div className="card card-pad-lg" style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ marginBottom: 4 }}>Price series · Rp '000 per tCO₂e</div>
          <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {/* gridlines */}
            {[30,40,50,60,70].map(v => (
              <g key={v}>
                <line x1={PX} y1={yAt(v)} x2={CW-20} y2={yAt(v)} stroke="var(--border)" strokeWidth="0.5"/>
                <text x={PX-8} y={yAt(v)+3} fontSize="10" textAnchor="end" fill="var(--text-3)">{v}k</text>
              </g>
            ))}
            {/* x labels */}
            {months.map((m,i) => (
              <text key={m} x={xAt(i)} y={CH-8} fontSize="10" textAnchor="middle" fill="var(--text-3)">{m}</text>
            ))}
            {/* series */}
            {seriesDef.map(s => {
              const vals = priceSeries[s.id];
              const pts = vals.map((v,i) => v == null ? null : [xAt(i), yAt(v)]).filter(Boolean);
              return (
                <g key={s.id}>
                  <path d={pathFromPoints(pts)} fill="none" stroke={s.stroke} strokeWidth="1.8" strokeLinejoin="round"/>
                  {pts.map(([x,y],i) => <circle key={i} cx={x} cy={y} r="3" fill={s.stroke}/>)}
                </g>
              );
            })}
          </svg>
          <div className="legend">
            {seriesDef.map(s => (
              <div key={s.id} className="legend-item">
                <span className="legend-line" style={{ background: s.stroke }}/>
                <span>{s.id}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border)' }}>
            <div className="section-label" style={{ margin: 0 }}>Recent transactions</div>
          </div>
          <div style={{ padding: '0 16px' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Market</th>
                  <th>Credit type</th>
                  <th>Project</th>
                  <th className="right">Volume</th>
                  <th className="right">Price</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t,i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-2)' }}>{t.date}</td>
                    <td><span className="tag">{t.market}</span></td>
                    <td style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12 }}>{t.creditType}</td>
                    <td>{t.project}</td>
                    <td className="right tnum">{t.volume}</td>
                    <td className="right tnum" style={{ fontWeight: 500 }}>{t.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}

window.Prices = Prices;
