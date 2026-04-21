// =========================================================
// SatelliteMap — dark satellite viewer with toggleable layers
// Props:
//   mode:         'compact' (landing hero, no side panel) | 'full' (project detail)
//   project:      project data (centroid / alerts / hectares) — optional
//   defaultLayers: object of layer id → bool (default all on)
// =========================================================
function SatelliteMap({ mode = 'full', project, defaultLayers }) {
  const isCompact = mode === 'compact';

  // layers & state
  const [base, setBase] = useState('truecolor'); // truecolor | ndvi | radar
  const [layers, setLayers] = useState({
    boundary: true,
    alerts: true,
    hotspots: !isCompact,
    radd: true,
    community: !isCompact,
    graticule: !isCompact,
  });
  const [callout, setCallout] = useState(null); // alert callout
  const [opacity, setOpacity] = useState(100);

  // live HUD "acquired" timestamp — freezes first render to stay stable
  const acq = useMemo(() => new Date(Date.now() - 1000 * 60 * 63), []);
  const acqLabel = acq.toISOString().slice(0,16).replace('T',' ') + 'Z';

  // view params — 800 × 520 canvas internal coords
  const W = 800, H = 520;

  // fake alerts (if no project passed)
  const alerts = (project && project.alerts) || [
    { x: 210, y: 180, conf: 'high',    ha: 1.8, date: '18 Jan 2026' },
    { x: 285, y: 215, conf: 'high',    ha: 0.7, date: '12 Jan 2026' },
    { x: 420, y: 170, conf: 'high',    ha: 2.4, date: '04 Jan 2026' },
    { x: 490, y: 235, conf: 'nominal', ha: 0.4, date: '29 Dec 2025' },
    { x: 355, y: 300, conf: 'nominal', ha: 0.9, date: '21 Dec 2025' },
    { x: 560, y: 310, conf: 'high',    ha: 1.3, date: '14 Dec 2025' },
  ];
  const fireHotspots = [
    { x: 270, y: 165 }, { x: 295, y: 172 }, { x: 278, y: 158 },
    { x: 575, y: 295 }, { x: 585, y: 303 },
  ];
  const communityPoints = [
    { x: 180, y: 340, label: 'Mendawai' },
    { x: 380, y: 395, label: 'Katingan Hulu' },
    { x: 595, y: 360, label: 'Tumbang Samba' },
  ];

  // boundary polygon (evocative of a real Katingan / Kalimantan peatland shape)
  const boundary = [
    [95,180],[145,135],[215,118],[285,128],[360,112],[430,122],
    [510,108],[580,135],[640,175],[670,235],[685,305],[665,370],
    [600,410],[510,420],[430,395],[360,418],[285,410],[215,385],
    [155,360],[110,310],[82,245]
  ];
  // buffer ring (5-km style)
  const buffer = boundary.map(([x,y]) => {
    const cx = 380, cy = 270;
    const dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx,dy);
    return [x + dx/len * 14, y + dy/len * 14];
  });

  const toggleLayer = (k) => setLayers(p => ({ ...p, [k]: !p[k] }));

  // ---------- base colors per mode ----------
  const baseFill = {
    truecolor: 'url(#truecolorGrad)',
    ndvi: 'url(#ndviGrad)',
    radar: 'url(#radarGrad)',
  }[base];

  // stipple patterns (peat / cleared) layered on true-color
  const peatStipple = 'url(#peatPattern)';

  return (
    <div className={'sat-viewer ' + (isCompact ? 'sat-compact' : '')}>
      {/* ======= Top toolbar ======= */}
      <div className="sat-toolbar">
        <div className="sat-toolbar-group">
          <span className="sat-toolbar-label">Base</span>
          <div className="sat-segmented">
            {[
              ['truecolor','True color'],
              ['ndvi','NDVI'],
              ['radar','Sentinel-1'],
            ].map(([id,label]) => (
              <button key={id}
                      className={'sat-seg-btn ' + (base === id ? 'active' : '')}
                      onClick={() => setBase(id)}>{label}</button>
            ))}
          </div>
        </div>

        {!isCompact && (
          <div className="sat-toolbar-group">
            <span className="sat-toolbar-label">Opacity</span>
            <input type="range" min="40" max="100" value={opacity}
                   onChange={e => setOpacity(+e.target.value)} className="sat-opacity"/>
            <span className="sat-pill-mono">{opacity}%</span>
          </div>
        )}

        <div className="sat-toolbar-group" style={{ marginLeft: 'auto' }}>
          <span className="sat-pill-mono">Sentinel-2 L2A</span>
          <span className="sat-pill-mono">10 m / px</span>
        </div>
      </div>

      {/* ======= Stage (layers + map) ======= */}
      <div className="sat-stage" style={isCompact ? { gridTemplateColumns: '1fr' } : null}>
        {!isCompact && (
          <aside className="sat-layers">
            <div className="sat-section-label">Observation</div>
            {[
              { id: 'boundary', label: 'Project boundary', swatch: '#4FB89C', count: '149.8k ha' },
              { id: 'graticule', label: 'Graticule', swatch: 'rgba(255,255,255,0.25)', count: '1°' },
            ].map(l => (
              <LayerToggle key={l.id} layer={l} active={layers[l.id]} onToggle={() => toggleLayer(l.id)} />
            ))}

            <div className="sat-section-label" style={{ marginTop: 14 }}>Deforestation & fire</div>
            {[
              { id: 'alerts',   label: 'RADD alerts (90-day)', swatch: '#E2625B', count: alerts.length },
              { id: 'radd',     label: 'GFW tree-cover loss',  swatch: '#F0B04E', count: '12' },
              { id: 'hotspots', label: 'VIIRS fire hotspots',  swatch: '#F28C28', count: fireHotspots.length },
            ].map(l => (
              <LayerToggle key={l.id} layer={l} active={layers[l.id]} onToggle={() => toggleLayer(l.id)} />
            ))}

            <div className="sat-section-label" style={{ marginTop: 14 }}>Social & context</div>
            {[
              { id: 'community', label: 'Community points', swatch: '#8AB8E8', count: communityPoints.length },
            ].map(l => (
              <LayerToggle key={l.id} layer={l} active={layers[l.id]} onToggle={() => toggleLayer(l.id)} />
            ))}

            <div className="sat-meta">
              <div className="sat-meta-row"><span>Centroid</span><span>1°48′S 113°12′E</span></div>
              <div className="sat-meta-row"><span>Acquired</span><span>{acqLabel}</span></div>
              <div className="sat-meta-row"><span>Cloud cover</span><span>6.2%</span></div>
              <div className="sat-meta-row"><span>Provider</span><span>ESA Copernicus</span></div>
            </div>
          </aside>
        )}

        {/* ======= Map canvas ======= */}
        <div className="sat-map-wrap">
          <svg className="sat-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
            <defs>
              {/* true-color peat palette */}
              <linearGradient id="truecolorGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0"   stopColor="#1f3a2c"/>
                <stop offset="0.4" stopColor="#2d5a3a"/>
                <stop offset="0.7" stopColor="#3f6f3f"/>
                <stop offset="1"   stopColor="#26463a"/>
              </linearGradient>
              {/* NDVI palette: red→yellow→green */}
              <linearGradient id="ndviGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0"   stopColor="#6b2e1f"/>
                <stop offset="0.35" stopColor="#c9a34c"/>
                <stop offset="0.7" stopColor="#3d8f46"/>
                <stop offset="1"   stopColor="#1f5c2e"/>
              </linearGradient>
              {/* radar grayscale */}
              <linearGradient id="radarGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#1a1f1c"/>
                <stop offset="0.5" stopColor="#3c423f"/>
                <stop offset="1" stopColor="#6b7370"/>
              </linearGradient>
              {/* river */}
              <linearGradient id="riverGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#1a3446"/>
                <stop offset="0.5" stopColor="#224a62"/>
                <stop offset="1" stopColor="#1a3446"/>
              </linearGradient>
              {/* peat texture pattern */}
              <pattern id="peatPattern" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect width="8" height="8" fill="rgba(0,0,0,0)"/>
                <circle cx="2" cy="2" r="0.5" fill="rgba(255,255,255,0.06)"/>
                <circle cx="6" cy="5" r="0.4" fill="rgba(255,255,255,0.04)"/>
              </pattern>
              {/* clip for inside boundary only */}
              <clipPath id="clipBoundary">
                <path d={pathFromPoints(boundary) + ' Z'}/>
              </clipPath>
              {/* alert pulse glow */}
              <radialGradient id="alertGlow">
                <stop offset="0"   stopColor="rgba(226,98,91,0.85)"/>
                <stop offset="0.5" stopColor="rgba(226,98,91,0.25)"/>
                <stop offset="1"   stopColor="rgba(226,98,91,0)"/>
              </radialGradient>
              <radialGradient id="fireGlow">
                <stop offset="0"   stopColor="rgba(242,140,40,0.9)"/>
                <stop offset="1"   stopColor="rgba(242,140,40,0)"/>
              </radialGradient>
            </defs>

            {/* base fill */}
            <rect x="0" y="0" width={W} height={H} fill={baseFill} opacity={opacity/100}/>

            {/* subtle terrain noise — scattered darker blobs */}
            {base === 'truecolor' && (
              <g opacity="0.5">
                {[[120,90,60],[540,80,80],[650,400,70],[120,450,55],[720,260,50],[380,480,65]].map(([x,y,r],i) => (
                  <circle key={i} cx={x} cy={y} r={r} fill="rgba(0,0,0,0.18)"/>
                ))}
              </g>
            )}

            {/* river — always on */}
            <path d="M -10 265 C 120 240, 220 300, 340 275 S 560 250, 700 295 L 810 300"
                  stroke="url(#riverGrad)" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.85"/>
            <path d="M 340 275 C 360 310, 380 350, 360 420"
                  stroke="url(#riverGrad)" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7"/>

            {/* peat texture inside boundary for true-color */}
            {base === 'truecolor' && (
              <g clipPath="url(#clipBoundary)">
                <rect x="0" y="0" width={W} height={H} fill={peatStipple}/>
                {/* a couple of cleared patches near alerts */}
                <ellipse cx="215" cy="180" rx="22" ry="14" fill="rgba(180,140,80,0.35)"/>
                <ellipse cx="425" cy="170" rx="28" ry="16" fill="rgba(180,140,80,0.35)"/>
                <ellipse cx="560" cy="310" rx="18" ry="12" fill="rgba(180,140,80,0.30)"/>
              </g>
            )}

            {/* graticule */}
            {layers.graticule && (
              <g stroke="rgba(255,255,255,0.08)" strokeWidth="0.6">
                {[130,260,390].map(y => <line key={'h'+y} x1="0" y1={y} x2={W} y2={y}/>)}
                {[200,400,600].map(x => <line key={'v'+x} x1={x} y1="0" x2={x} y2={H}/>)}
              </g>
            )}

            {/* buffer zone (5km) */}
            {layers.boundary && (
              <path d={pathFromPoints(buffer) + ' Z'}
                    fill="none" stroke="rgba(79,184,156,0.30)" strokeWidth="1"
                    strokeDasharray="3 3"/>
            )}

            {/* project boundary */}
            {layers.boundary && (
              <path d={pathFromPoints(boundary) + ' Z'}
                    fill="rgba(79,184,156,0.08)"
                    stroke="#4FB89C" strokeWidth="1.6"/>
            )}

            {/* tree-cover loss polygons (GFW) */}
            {layers.radd && (
              <g opacity="0.85">
                {[
                  [180,200,14,10],[300,160,10,7],[420,180,16,11],[540,295,10,8],[610,340,13,9],
                ].map(([x,y,w,h],i) => (
                  <rect key={i} x={x-w/2} y={y-h/2} width={w} height={h}
                        fill="rgba(240,176,78,0.35)" stroke="#F0B04E" strokeWidth="0.8"/>
                ))}
              </g>
            )}

            {/* fire hotspots */}
            {layers.hotspots && fireHotspots.map((h,i) => (
              <g key={'f'+i}>
                <circle cx={h.x} cy={h.y} r="18" fill="url(#fireGlow)"/>
                <circle cx={h.x} cy={h.y} r="2.8" fill="#F28C28"/>
              </g>
            ))}

            {/* RADD alerts */}
            {layers.alerts && alerts.map((a,i) => (
              <g key={'a'+i} style={{ cursor: 'pointer' }}
                 onClick={() => setCallout({ ...a, index: i })}>
                <circle cx={a.x} cy={a.y} r="22" fill="url(#alertGlow)" className="sat-pulse">
                  <animate attributeName="r" values="14;26;14" dur="2.4s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.9;0.2;0.9" dur="2.4s" repeatCount="indefinite"/>
                </circle>
                <circle cx={a.x} cy={a.y} r={a.conf === 'high' ? 4.5 : 3.5}
                        fill={a.conf === 'high' ? '#E2625B' : '#F0B04E'}
                        stroke="#FFF" strokeWidth="0.9"/>
              </g>
            ))}

            {/* community points */}
            {layers.community && communityPoints.map((c,i) => (
              <g key={'c'+i}>
                <rect x={c.x-4} y={c.y-4} width="8" height="8" fill="#8AB8E8" stroke="#FFF" strokeWidth="0.8"/>
                <text x={c.x+10} y={c.y+3} fill="rgba(255,255,255,0.78)"
                      fontSize="10" fontFamily="IBM Plex Mono, ui-monospace, monospace">{c.label}</text>
              </g>
            ))}

            {/* reticle (crosshair on centroid) */}
            <g stroke="rgba(255,255,255,0.45)" strokeWidth="0.8">
              <circle cx="380" cy="270" r="16" fill="none"/>
              <line x1="380" y1="246" x2="380" y2="294"/>
              <line x1="356" y1="270" x2="404" y2="270"/>
            </g>

            {/* scalebar — bottom-right */}
            <g transform={`translate(${W-140}, ${H-30})`}>
              <rect x="0" y="0" width="60" height="4" fill="#FFF"/>
              <rect x="60" y="0" width="60" height="4" fill="rgba(0,0,0,0.5)" stroke="#FFF" strokeWidth="0.6"/>
              <text x="0" y="-4" fill="rgba(255,255,255,0.75)" fontSize="9"
                    fontFamily="IBM Plex Mono, ui-monospace, monospace">0</text>
              <text x="56" y="-4" fill="rgba(255,255,255,0.75)" fontSize="9"
                    fontFamily="IBM Plex Mono, ui-monospace, monospace">5</text>
              <text x="116" y="-4" fill="rgba(255,255,255,0.75)" fontSize="9"
                    fontFamily="IBM Plex Mono, ui-monospace, monospace">10 km</text>
            </g>

            {/* north arrow */}
            <g transform="translate(40,50)">
              <circle cx="0" cy="0" r="14" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6"/>
              <path d="M 0 -9 L 4 6 L 0 3 L -4 6 Z" fill="#FFF"/>
              <text x="0" y="-16" fill="rgba(255,255,255,0.7)" fontSize="9" textAnchor="middle"
                    fontFamily="IBM Plex Mono, ui-monospace, monospace">N</text>
            </g>
          </svg>

          {/* project label HUD (top-left) */}
          <div className="sat-hud">
            <div className="sat-hud-kicker">Observation · live</div>
            <div className="sat-hud-title">{(project && project.name) || 'Katingan Peatland Restoration'}</div>
            <div className="sat-hud-sub">Central Kalimantan · 149.8k ha · REDD+</div>
          </div>

          {/* callout on alert click */}
          {callout && (
            <div className="sat-callout" style={{
              left: Math.min(callout.x + 30, W - 260),
              top: Math.max(callout.y - 80, 12)
            }}>
              <div className="sat-callout-head">
                <Pill tone={callout.conf === 'high' ? 'danger' : 'warning'}>
                  {callout.conf === 'high' ? 'RADD high-confidence' : 'RADD nominal'}
                </Pill>
                <button className="sat-callout-close" onClick={() => setCallout(null)}>×</button>
              </div>
              <div className="sat-callout-title">Canopy loss detected</div>
              <div className="sat-callout-meta">
                <div><span>Area</span><span>{callout.ha || 1.2} ha</span></div>
                <div><span>Detected</span><span>{callout.date || '14 Jan 2026'}</span></div>
                <div><span>Source</span><span>Sentinel-1 · WUR</span></div>
                <div><span>Inside polygon</span><span>Yes</span></div>
              </div>
            </div>
          )}

          {/* bottom legend */}
          <div className="sat-legend">
            {base === 'ndvi' ? (
              <div className="sat-legend-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span className="sat-legend-label">NDVI</span>
                <div className="sat-legend-bar" style={{
                  background: 'linear-gradient(to right, #6b2e1f 0%, #c9a34c 40%, #3d8f46 70%, #1f5c2e 100%)'
                }}/>
                <div className="sat-legend-scale">
                  <span>-0.2</span><span>0</span><span>+0.5</span><span>+0.9</span>
                </div>
              </div>
            ) : (
              <>
                <div className="sat-legend-item">
                  <span className="sat-legend-dot" style={{ background: '#E2625B' }}/>
                  <span>RADD alert · high</span>
                </div>
                <div className="sat-legend-item">
                  <span className="sat-legend-dot" style={{ background: '#F0B04E' }}/>
                  <span>RADD · nominal</span>
                </div>
                <div className="sat-legend-item">
                  <span className="sat-legend-square" style={{ background: '#4FB89C' }}/>
                  <span>Project boundary</span>
                </div>
                {layers.hotspots && (
                  <div className="sat-legend-item">
                    <span className="sat-legend-dot" style={{ background: '#F28C28' }}/>
                    <span>Fire hotspot</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* footer strip */}
      <div className="sat-footer">
        <div>ESA Copernicus · Sentinel-2 · WUR RADD · GFW</div>
        <div>1°48′03.4″S · 113°12′47.1″E · UTM 49S</div>
      </div>
    </div>
  );
}

function LayerToggle({ layer, active, onToggle }) {
  return (
    <button className={'sat-layer-toggle ' + (active ? 'active' : '')} onClick={onToggle}>
      <span className="sat-layer-swatch" style={{ background: layer.swatch }}/>
      <span className="sat-layer-label">{layer.label}</span>
      <span className="sat-layer-count">{layer.count}</span>
      <span className="sat-layer-check">{active ? '●' : '○'}</span>
    </button>
  );
}

window.SatelliteMap = SatelliteMap;
