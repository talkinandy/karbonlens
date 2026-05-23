/**
 * app/(public)/regulatory/by-year/page.tsx — SEO Phase 2D.
 *
 * Index of years that have at least one regulatory event in the
 * Indonesian carbon-market regulatory timeline. Each card links to
 * /regulatory/by-year/[YYYY] with the per-year roll-up.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listRegulatoryYears } from '@/lib/queries/regulatory';
import { JsonLd } from '@/components/seo/JsonLd';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Indonesian carbon-market regulations by year',
  description:
    'Index of years with significant Indonesian carbon-market regulatory events — laws, presidential regulations, and ministerial regulations.',
  openGraph: {
    url: '/regulatory/by-year',
    title: 'Indonesian carbon-market regulations by year · KarbonLens',
    description:
      'Index of years with significant Indonesian carbon-market regulatory events.',
  },
  twitter: {
    title: 'Indonesian carbon-market regulations by year · KarbonLens',
    description:
      'Index of years with significant Indonesian carbon-market regulatory events.',
  },
  alternates: { canonical: '/regulatory/by-year' },
};

export default async function RegulatoryByYearIndexPage() {
  const years = await listRegulatoryYears();
  const total = years.reduce((acc, y) => acc + y.eventCount, 0);

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://karbonlens.com/' },
      { '@type': 'ListItem', position: 2, name: 'Regulatory', item: 'https://karbonlens.com/regulatory' },
      { '@type': 'ListItem', position: 3, name: 'By year', item: 'https://karbonlens.com/regulatory/by-year' },
    ],
  };

  return (
    <main className="kl-page">
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />

      <header className="kl-page-header" style={{ marginBottom: 28 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="kl-section-label">
            <Link href="/regulatory" style={{ textDecoration: 'none' }}>
              ← Regulatory timeline
            </Link>
          </p>
          <h1 className="kl-page-title">Regulations by year</h1>
          <p className="kl-page-subtitle" style={{ maxWidth: 720 }}>
            Significant Indonesian carbon-market regulatory events grouped
            by calendar year — laws (UU), presidential regulations (Perpres),
            and ministerial regulations (Permen*, POJK). Years are listed
            newest-first.
          </p>
          <p className="kl-muted" style={{ marginTop: 12, fontSize: 13 }}>
            {years.length} year{years.length === 1 ? '' : 's'} ·{' '}
            {total} regulatory event{total === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {years.length === 0 ? (
        <div className="kl-card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="kl-muted">No regulatory events yet.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {years.map((y) => (
            <Link
              key={y.year}
              href={`/regulatory/by-year/${y.year}`}
              style={{
                display: 'block',
                padding: 16,
                border: '0.5px solid var(--border)',
                borderRadius: 6,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <p className="kl-section-label" style={{ fontSize: 11, marginBottom: 4 }}>
                Year
              </p>
              <p
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  margin: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {y.year}
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-3)',
                  margin: '6px 0 4px',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {y.eventCount} event{y.eventCount === 1 ? '' : 's'}
              </p>
              {y.topMinistries.length > 0 ? (
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--text-3)',
                    margin: 0,
                  }}
                >
                  {y.topMinistries.join(' · ')}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
