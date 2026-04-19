// =========================================================
// Projects — filterable registry table
// =========================================================
function Projects() {
  const { projects } = window.KL_DATA;
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [registry, setRegistry] = useState('all');

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (type !== 'all' && p.type !== type) return false;
      if (status !== 'all' && p.status !== status) return false;
      if (registry !== 'all' && !(p.registries || []).includes(registry)) return false;
      if (q) {
        const s = (p.name + ' ' + p.developer + ' ' + p.province).toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [q, type, status, registry, projects]);

  return (
    <Shell current="projects">
      <div className="page" data-screen-label="02 Projects">
        <div className="page-header">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-subtitle">All 214 indexed projects across SRN-PPI, IDXCarbon, Verra, Gold Standard.</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-sm">Export CSV</button>
            <button className="btn btn-primary btn-sm">+ Watchlist</button>
          </div>
        </div>

        <div className="filter-bar">
          <input className="input" placeholder="Search project, developer, province…"
                 value={q} onChange={e => setQ(e.target.value)}/>
          <select className="select" value={type} onChange={e => setType(e.target.value)}>
            <option value="all">All types</option>
            <option value="REDD+">REDD+</option>
            <option value="Peatland">Peatland</option>
            <option value="Blue Carbon">Blue Carbon</option>
            <option value="Geothermal">Geothermal</option>
            <option value="Gas power">Gas power</option>
            <option value="Hydro">Hydro</option>
          </select>
          <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pipeline">Pipeline</option>
            <option value="flagged">Flagged</option>
            <option value="suspended">Suspended</option>
          </select>
          <select className="select" value={registry} onChange={e => setRegistry(e.target.value)}>
            <option value="all">All registries</option>
            <option value="Verra">Verra</option>
            <option value="SRN-PPI">SRN-PPI</option>
            <option value="IDXCarbon">IDXCarbon</option>
          </select>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{filtered.length}</span> of {projects.length} projects
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Click any row to open project detail →</div>
          </div>
          <div style={{ padding: '0 16px' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Province</th>
                  <th className="right">Hectares</th>
                  <th>Status</th>
                  <th className="right">Score</th>
                  <th className="right">Available</th>
                  <th>Registry</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => navigate('#/projects/' + p.id)}>
                    <td>
                      <div className="row-name">{p.shortName}</div>
                      <div className="row-sub">{p.developer}</div>
                    </td>
                    <td><span className="tag">{p.type}</span></td>
                    <td style={{ color: 'var(--text-2)' }}>{p.provinceShort || p.province}</td>
                    <td className="right tnum">{p.hectares ? p.hectares.toLocaleString() : '—'}</td>
                    <td>{statusToPill(p.status)}</td>
                    <td className="right"><ScoreBadge score={p.score}/></td>
                    <td className="right tnum">{p.available}</td>
                    <td style={{ color: 'var(--text-2)', fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11 }}>{p.registriesShort}</td>
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

window.Projects = Projects;
