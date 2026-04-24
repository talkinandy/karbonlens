// =========================================================
// Alerts — inbox
// =========================================================
function Alerts() {
  const [alerts, setAlerts] = useState(window.KL_DATA.alerts);
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.type === filter);
  const unread = alerts.filter(a => !a.read).length;

  const toggleRead = (id) => setAlerts(list => list.map(a => a.id === id ? { ...a, read: !a.read } : a));
  const markAll = () => setAlerts(list => list.map(a => ({ ...a, read: true })));

  const types = [
    ['all', 'All', alerts.length],
    ['reversal', 'Reversal', alerts.filter(a => a.type === 'reversal').length],
    ['price', 'Price', alerts.filter(a => a.type === 'price').length],
    ['regulatory', 'Regulatory', alerts.filter(a => a.type === 'regulatory').length],
    ['news', 'News', alerts.filter(a => a.type === 'news').length],
    ['retirement', 'Retirement', alerts.filter(a => a.type === 'retirement').length],
    ['issuance', 'Issuance', alerts.filter(a => a.type === 'issuance').length],
  ];

  return (
    <Shell current="alerts">
      <div className="page" data-screen-label="06 Alerts">
        <div className="page-header">
          <div>
            <h1 className="page-title">Alerts</h1>
            <p className="page-subtitle">
              {unread > 0 ? <><span style={{ color: 'var(--info-fg)', fontWeight: 500 }}>{unread} unread</span> · </> : null}
              Reversal warnings, price thresholds, regulatory updates, news signals.
            </p>
          </div>
          <div className="page-actions">
            <button className="btn btn-sm" onClick={markAll}>Mark all read</button>
            <button className="btn btn-primary btn-sm">+ New alert rule</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          {types.map(([id, label, n]) => (
            <button key={id}
                    className={'range-pill ' + (filter === id ? 'active' : '')}
                    onClick={() => setFilter(id)}
                    style={{ background: filter === id ? 'var(--surface)' : 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
              {label} <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>{n}</span>
            </button>
          ))}
        </div>

        <div className="card card-pad-lg">
          {filtered.map(a => (
            <div key={a.id} className="alert-row" onClick={() => toggleRead(a.id)}>
              <div className={'alert-status-dot ' + (a.read ? '' : 'unread')}/>
              <div>
                <div className="alert-top-row">
                  <Pill tone={a.severity === 'danger' ? 'danger' : a.severity === 'warning' ? 'warning' : a.severity === 'success' ? 'success' : 'info'}>
                    {a.typeLabel}
                  </Pill>
                  <span className="alert-project">· {a.project}</span>
                </div>
                <div className="alert-title" style={{ fontWeight: a.read ? 400 : 500 }}>{a.title}</div>
                <div className="alert-desc">{a.desc}</div>
              </div>
              <div className="alert-time">{a.time}</div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

window.Alerts = Alerts;
