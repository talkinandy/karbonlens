// =========================================================
// Regulatory — policy timeline
// =========================================================
function Regulatory() {
  const { regulatory } = window.KL_DATA;
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? regulatory : regulatory.filter(r => r.importance === filter);

  return (
    <Shell current="regulatory">
      <div className="page" data-screen-label="05 Regulatory">
        <div className="page-header">
          <div>
            <h1 className="page-title">Regulatory</h1>
            <p className="page-subtitle">Policy timeline · scraped from JDIH, KLH, Kemenhut · plain-language summaries.</p>
          </div>
          <div className="page-actions">
            <select className="select" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All importance</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
            </select>
            <button className="btn btn-sm">Subscribe</button>
          </div>
        </div>

        <div className="card card-pad-lg">
          {filtered.map((r, i) => (
            <div key={i} className="timeline-item">
              <div>
                <div className="timeline-date">{r.date}</div>
                <div className="timeline-date-status">{r.status}</div>
                <div style={{ marginTop: 8 }}>
                  <Pill tone={r.importance === 'critical' ? 'danger' : r.importance === 'high' ? 'warning' : 'info'}>
                    {r.importanceLabel}
                  </Pill>
                </div>
              </div>
              <div>
                <h3 className="timeline-title">{r.title}</h3>
                <p className="timeline-desc">{r.desc}</p>
                <div className="timeline-meta">
                  {r.tags.map(t => <Tag key={t}>{t}</Tag>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

window.Regulatory = Regulatory;
