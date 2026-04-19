// =========================================================
// ProjectDetail — per-project dossier
// =========================================================
function ProjectDetail({ projectId }) {
  const project = window.KL_DATA.projects.find(p => p.id === projectId);
  if (!project) {
    return (
      <Shell current="projects">
        <div className="page">
          <div className="breadcrumb">
            <a onClick={() => navigate('#/projects')}>Projects</a> / not found
          </div>
          <h1 className="page-title">Project not found</h1>
          <p className="page-subtitle">No project matches "{projectId}".</p>
        </div>
      </Shell>
    );
  }

  const p = project;
  const b = p.breakdown || { validation: 78, reversal: 65, community: 72, transparency: 74 };

  // VCU bar chart sizing
  const barMax = Math.max(...(p.issuances || [{value:1}]).map(i => i.value));

  return (
    <Shell current="projects">
      <div className="page" data-screen-label={'03 Project — ' + p.shortName}>
        <div className="breadcrumb">
          <a onClick={() => navigate('#/projects')}>Projects</a> / {p.shortName}
        </div>

        <div className="page-header">
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              {statusToPill(p.status)}
              <span className="tag">{p.type}</span>
              {(p.registries || []).map(r => <span key={r} className="tag">{r}</span>)}
            </div>
            <h1 className="page-title">{p.name}</h1>
            <p className="page-subtitle">{p.developer} · {p.province} · {p.hectares ? p.hectares.toLocaleString() + ' ha' : 'Non-forestry'}</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-sm">Set alert</button>
            <button className="btn btn-primary btn-sm">+ Watchlist</button>
          </div>
        </div>

        {/* top stat row */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">KarbonLens score</div>
            <div className="stat-value">{p.score}<span style={{ fontSize: 14, color: 'var(--text-3)' }}> / 100</span></div>
            <div className="stat-delta neutral">{p.score >= 75 ? 'High quality' : p.score >= 60 ? 'Moderate' : 'Watch closely'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">VCUs issued</div>
            <div className="stat-value tnum">{p.issued || '—'}</div>
            <div className="stat-delta neutral">cumulative</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">VCUs retired</div>
            <div className="stat-value tnum">{p.retired || '—'}</div>
            <div className="stat-delta neutral">{p.retired ? '89% of issued' : ''}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Available</div>
            <div className="stat-value success tnum">{p.available}</div>
            <div className="stat-delta neutral">vintage ≤ {p.lastVintage || 2024}</div>
          </div>
        </div>

        {/* satellite viewer */}
        <div style={{ marginBottom: 24 }}>
          <div className="section-label">Satellite monitoring</div>
          <SatelliteMap mode="full" project={p}/>
        </div>

        {/* two-col */}
        <div className="detail-two-col">
          {/* Score breakdown */}
          <div className="card card-pad-lg">
            <div className="section-label" style={{ marginBottom: 14 }}>Score breakdown</div>
            {[
              { k: 'validation',   label: 'Validation & verification', v: b.validation },
              { k: 'reversal',     label: 'Reversal risk (inverse)',   v: b.reversal },
              { k: 'community',    label: 'Community & benefit-sharing', v: b.community },
              { k: 'transparency', label: 'Transparency & disclosure', v: b.transparency },
            ].map(r => (
              <div key={r.k}>
                <div className="score-row">
                  <div className="score-row-label">{r.label}</div>
                  <div className="score-row-value tnum">{r.v}/100</div>
                </div>
                <div className="score-track">
                  <div className={'score-fill ' + (r.v >= 75 ? 'success' : r.v >= 60 ? 'info' : 'warning')}
                       style={{ width: r.v + '%' }}/>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 14, fontStyle: 'italic' }}>
              Methodology: 4 axes weighted 30/30/20/20. Last computed 6 h ago.
            </div>
          </div>

          {/* VCU issuances */}
          <div className="card card-pad-lg">
            <div className="section-label" style={{ marginBottom: 14 }}>VCU issuances by vintage</div>
            {p.issuances ? (
              <div>
                {p.issuances.map(i => (
                  <div key={i.year} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                    <div className="tnum" style={{ fontSize: 12, color: 'var(--text-2)' }}>{i.year}</div>
                    <div style={{ height: 12, background: 'var(--surface-2)', borderRadius: 2 }}>
                      <div style={{ width: (i.value / barMax * 100) + '%', height: '100%', background: 'var(--chart-teal)', borderRadius: 2 }}/>
                    </div>
                    <div className="tnum" style={{ fontSize: 12, textAlign: 'right', fontWeight: 500 }}>{i.value}M</div>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10, fontStyle: 'italic' }}>
                  VCUs issued by Verra per vintage year. Last vintage: {p.lastVintage}.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '20px 0' }}>
                No issuances to date — project is in {p.status}.
              </div>
            )}
          </div>
        </div>

        {/* news feed */}
        {p.news && (
          <div className="card card-pad-lg" style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ marginBottom: 14 }}>News & signals</div>
            {p.news.map((n, i) => (
              <div key={i} className={'news-item ' + n.sentiment}>
                <div className="news-item-title">{n.title}</div>
                <div className="news-item-meta">{n.source} · {n.daysAgo}d ago</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

window.ProjectDetail = ProjectDetail;
