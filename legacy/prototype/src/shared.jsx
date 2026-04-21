// =========================================================
// KarbonLens — shared primitives (topnav, shell, tiny UI)
// =========================================================
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---------- router ----------
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash || '#/';
      setHash(h);
      try { localStorage.setItem('kl_last_route', h); } catch (e) {}
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash;
}

function navigate(to) {
  if (!to.startsWith('#')) to = '#' + to;
  if (window.location.hash !== to) window.location.hash = to;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ---------- topnav ----------
function TopNav({ current }) {
  const items = [
    { id: 'projects', label: 'Projects', href: '#/projects' },
    { id: 'prices',   label: 'Prices',   href: '#/prices' },
    { id: 'regulatory', label: 'Regulatory', href: '#/regulatory' },
    { id: 'alerts',   label: 'Alerts',   href: '#/alerts' },
  ];
  return (
    <header className="topnav">
      <div className="topnav-inner">
        <div className="brand" onClick={() => navigate('#/')}>
          <div className="brand-mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.3" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="7" cy="7" r="1.8" fill="currentColor"/>
            </svg>
          </div>
          <div className="brand-word">KarbonLens</div>
        </div>
        <nav className="nav-links">
          {items.map(it => (
            <a key={it.id}
               className={'nav-link ' + (current === it.id ? 'active' : '')}
               onClick={() => navigate(it.href)}>{it.label}</a>
          ))}
        </nav>
        <div className="nav-right">
          <div className="bell" onClick={() => navigate('#/alerts')} title="Alerts">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M8 2.5a3.5 3.5 0 013.5 3.5v2.2l1 2.3H3.5l1-2.3V6A3.5 3.5 0 018 2.5z"/>
              <path d="M6.5 12.5a1.5 1.5 0 003 0"/>
            </svg>
            <span className="dot"></span>
          </div>
          <span className="pro-badge">Pro</span>
          <div className="avatar">AR</div>
        </div>
      </div>
    </header>
  );
}

// ---------- shell (wraps each screen) ----------
function Shell({ current, children, variant }) {
  return (
    <div className={'shell ' + (variant === 'dark' ? 'shell-dark' : '')}>
      <TopNav current={current} />
      {children}
      <footer className="footer-bar">
        <div>© 2026 KarbonLens. Data from SRN-PPI, IDXCarbon, Verra, GFW, JDIH.</div>
        <div>Jakarta · Built for Indonesia's MRV era</div>
      </footer>
    </div>
  );
}

// ---------- tiny ui ----------
function Pill({ tone = 'neutral', children }) {
  return <span className={'pill pill-' + tone}><span className="pill-dot"/>{children}</span>;
}

function ScoreBadge({ score }) {
  const tone = score >= 75 ? 'high' : score >= 60 ? 'mid' : 'low';
  return <span className={'score-badge score-' + tone}>{score}</span>;
}

function Tag({ children }) {
  return <span className="tag">{children}</span>;
}

function statusToPill(status) {
  if (status === 'active')    return <Pill tone="success">Active</Pill>;
  if (status === 'pipeline')  return <Pill tone="info">Pipeline</Pill>;
  if (status === 'flagged')   return <Pill tone="warning">Flagged</Pill>;
  if (status === 'suspended') return <Pill tone="danger">Suspended</Pill>;
  return <Pill>{status}</Pill>;
}

// ---------- chart helpers (shared by screens) ----------
function pathFromPoints(pts, close) {
  if (!pts.length) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
  if (close) d += ` L ${pts[pts.length-1][0]} ${close} L ${pts[0][0]} ${close} Z`;
  return d;
}

// ---------- export to window ----------
Object.assign(window, {
  useHashRoute, navigate,
  TopNav, Shell,
  Pill, ScoreBadge, Tag, statusToPill,
  pathFromPoints,
});
