/**
 * components/landing/DataFreshness.tsx — T25 footer-strip.
 *
 * Replaces the T18 DataSources component (kept in place as @deprecated per
 * T25 §5). Renders three "last synced" relative timestamps for:
 *   Verra/SRN-PPI · GFW/Sentinel · IDXCarbon
 * followed by a link grid of public destinations.
 *
 * Relative-time formatting is computed server-side using a small helper
 * below — NOT client-side Date.now() — to avoid hydration mismatch between
 * server render and client hydration. Null timestamps render "—".
 *
 * Per T25 §3.6.
 */

import Link from 'next/link';

export type DataFreshnessProps = {
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

type Row = {
  label: string;
  ts: Date | null;
};

const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: '/projects', label: 'Projects' },
  { href: '/prices', label: 'Prices' },
  { href: '/regulatory', label: 'Regulatory' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/api/auth/signin', label: 'Admin login' },
  { href: '/about', label: 'About' },
];

export function DataFreshness({
  registriesLastSynced,
  satelliteLastIngested,
  idxLastScraped,
}: DataFreshnessProps) {
  const rows: Row[] = [
    { label: 'Verra / SRN-PPI', ts: registriesLastSynced },
    { label: 'GFW / Sentinel', ts: satelliteLastIngested },
    { label: 'IDXCarbon', ts: idxLastScraped },
  ];

  return (
    <section className="lp-freshness" aria-label="Data freshness and footer">
      <div className="lp-freshness-inner">
        <div className="lp-freshness-timestamps">
          {rows.map((r) => (
            <div key={r.label}>
              <span className="lp-eyebrow">{r.label}</span>
              <span>
                · synced <strong>{formatRelative(r.ts)}</strong>
              </span>
            </div>
          ))}
        </div>
        <div className="lp-freshness-link-row">
          {FOOTER_LINKS.map((l, i) => (
            <span key={l.href}>
              <Link href={l.href}>{l.label}</Link>
              {i < FOOTER_LINKS.length - 1 ? <span aria-hidden="true"> · </span> : null}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
