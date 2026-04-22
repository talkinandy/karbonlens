/**
 * components/landing/DataSources.tsx — T18 "where the data comes from" row.
 *
 * Pure presentational server component. Renders three badges showing the max
 * `last_synced_at` / `ingested_at` / `scraped_at` across registries,
 * satellite alerts, and IDXCarbon snapshots respectively. Timestamps are
 * rendered as relative strings ("3 days ago") using a small local helper —
 * no external dependency. Null values fall back to "—" so the page never
 * shows errors.
 */

export type DataSourcesProps = {
  registriesLastSynced: Date | null;
  satelliteLastIngested: Date | null;
  idxLastScraped: Date | null;
};

function formatRelative(d: Date | null): string {
  if (!d) return '—';
  const now = Date.now();
  const then = d.getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const yr = Math.floor(day / 365);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

type Source = {
  label: string;
  action: string;
  ts: Date | null;
};

export function DataSources({
  registriesLastSynced,
  satelliteLastIngested,
  idxLastScraped,
}: DataSourcesProps) {
  const sources: Source[] = [
    { label: 'Verra registry', action: 'Last synced', ts: registriesLastSynced },
    { label: 'GFW alerts', action: 'Last ingested', ts: satelliteLastIngested },
    { label: 'IDXCarbon', action: 'Last scraped', ts: idxLastScraped },
  ];

  return (
    <section style={{ marginTop: 40 }}>
      <p className="kl-section-label">Data sources</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {sources.map((s) => (
          <div key={s.label} className="kl-card">
            <p className="kl-stat-label">{s.label}</p>
            <p
              style={{
                fontFamily: 'var(--font-instrument-serif), Georgia, serif',
                fontSize: 20,
                margin: '8px 0 4px',
              }}
            >
              {s.action}: {formatRelative(s.ts)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
