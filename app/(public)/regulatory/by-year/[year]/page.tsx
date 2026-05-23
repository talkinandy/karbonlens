/**
 * app/(public)/regulatory/by-year/[year]/page.tsx — SEO Phase 2D.
 *
 * Per-year roll-up of Indonesian carbon-market regulatory events.
 * Lists every event with event_date in the requested calendar year,
 * sorted newest-first within the year. Cross-links to per-event detail
 * pages at /regulatory/[slug].
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getRegulatoryEventsForYear,
  listRegulatoryYears,
  type RegulatoryEventRow,
} from '@/lib/queries/regulatory';
import { JsonLd } from '@/components/seo/JsonLd';

export const revalidate = 3600;

type Props = {
  params: Promise<{ year: string }>;
};

function parseYear(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1990 || n > new Date().getUTCFullYear() + 5) return null;
  return n;
}

function eventSlug(e: RegulatoryEventRow): string {
  return `${(e.documentType ?? '').toLowerCase().trim()}-${(e.documentNumber ?? '').toLowerCase().trim()}`
    .replace(/\//g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function generateStaticParams() {
  const years = await listRegulatoryYears();
  return years.map((y) => ({ year: String(y.year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const yearNum = parseYear(year);
  if (yearNum === null) {
    return { title: 'Year not found' };
  }
  const years = await listRegulatoryYears();
  const y = years.find((x) => x.year === yearNum);
  if (!y) {
    return { title: `${yearNum} — no Indonesian carbon-market regulations` };
  }
  const description = `${y.eventCount} Indonesian carbon-market regulatory event${y.eventCount === 1 ? '' : 's'} in ${yearNum}${
    y.topMinistries.length > 0 ? ` from ${y.topMinistries.join(', ')}` : ''
  }.`;
  return {
    title: `${yearNum} — Indonesian carbon-market regulations`,
    description,
    openGraph: {
      url: `/regulatory/by-year/${yearNum}`,
      title: `${yearNum} — Indonesian carbon-market regulations · KarbonLens`,
      description,
    },
    twitter: {
      title: `${yearNum} — Indonesian carbon-market regulations · KarbonLens`,
      description,
    },
    alternates: { canonical: `/regulatory/by-year/${yearNum}` },
  };
}

export default async function RegulatoryByYearPage({ params }: Props) {
  const { year } = await params;
  const yearNum = parseYear(year);
  if (yearNum === null) notFound();

  const [events, allYears] = await Promise.all([
    getRegulatoryEventsForYear(yearNum),
    listRegulatoryYears(),
  ]);

  if (events.length === 0) notFound();

  const url = `https://karbonlens.com/regulatory/by-year/${yearNum}`;
  const sortedYears = [...allYears].sort((a, b) => a.year - b.year);
  const idx = sortedYears.findIndex((y) => y.year === yearNum);
  const prevYear = idx > 0 ? sortedYears[idx - 1] : null;
  const nextYear = idx >= 0 && idx < sortedYears.length - 1 ? sortedYears[idx + 1] : null;

  // Build per-ministry rollup for the page summary.
  const ministryCounts = new Map<string, number>();
  for (const e of events) {
    if (!e.ministry) continue;
    ministryCounts.set(e.ministry, (ministryCounts.get(e.ministry) ?? 0) + 1);
  }
  const ministriesSorted = Array.from(ministryCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://karbonlens.com/' },
      { '@type': 'ListItem', position: 2, name: 'Regulatory', item: 'https://karbonlens.com/regulatory' },
      { '@type': 'ListItem', position: 3, name: 'By year', item: 'https://karbonlens.com/regulatory/by-year' },
      { '@type': 'ListItem', position: 4, name: String(yearNum), item: url },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${yearNum} — Indonesian carbon-market regulations`,
    description: `${events.length} regulatory event${events.length === 1 ? '' : 's'} in ${yearNum}.`,
    url,
    temporalCoverage: String(yearNum),
  };

  return (
    <main className="kl-page">
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <JsonLd data={collectionSchema} id="ld-collection" />

      <header className="kl-page-header" style={{ marginBottom: 28 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="kl-section-label">
            <Link href="/regulatory/by-year" style={{ textDecoration: 'none' }}>
              ← All years
            </Link>
          </p>
          <p className="kl-section-label" style={{ marginTop: 6, marginBottom: 6 }}>
            REGULATORY YEAR
          </p>
          <h1 className="kl-page-title" style={{ marginBottom: 8 }}>
            {yearNum}
          </h1>
          <p className="kl-page-subtitle" style={{ maxWidth: 720 }}>
            {events.length} Indonesian carbon-market regulatory event
            {events.length === 1 ? '' : 's'} in {yearNum}
            {ministriesSorted.length > 0 ? `, spanning ${ministriesSorted.length} ministr${ministriesSorted.length === 1 ? 'y' : 'ies'} or agencies.` : '.'}
          </p>
        </div>
      </header>

      <section
        style={{
          marginBottom: 28,
          padding: '20px 0',
          borderTop: '0.5px solid var(--border)',
          borderBottom: '0.5px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: ministriesSorted.length > 0 ? 16 : 0,
          }}
        >
          {prevYear ? (
            <Link href={`/regulatory/by-year/${prevYear.year}`}>
              ← {prevYear.year} ({prevYear.eventCount} event
              {prevYear.eventCount === 1 ? '' : 's'})
            </Link>
          ) : (
            <span />
          )}
          {nextYear ? (
            <Link href={`/regulatory/by-year/${nextYear.year}`}>
              {nextYear.year} ({nextYear.eventCount} event
              {nextYear.eventCount === 1 ? '' : 's'}) →
            </Link>
          ) : (
            <span />
          )}
        </div>
        {ministriesSorted.length > 0 ? (
          <div>
            <p
              className="kl-section-label"
              style={{ fontSize: 11, marginBottom: 6 }}
            >
              By ministry / agency
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                fontSize: 12,
              }}
            >
              {ministriesSorted.map(([name, count]) => (
                <li
                  key={name}
                  style={{
                    border: '0.5px solid var(--border)',
                    padding: '2px 8px',
                    borderRadius: 3,
                  }}
                >
                  {name} <span style={{ color: 'var(--text-3)' }}>· {count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Events</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {events.map((e) => (
          <li
            key={e.id}
            style={{
              padding: '14px 0',
              borderBottom: '0.5px solid var(--border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'baseline',
                flexWrap: 'wrap',
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-3)',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 90,
                }}
              >
                {e.eventDate}
              </span>
              {e.documentType || e.documentNumber ? (
                <span
                  style={{
                    fontSize: 12,
                    border: '0.5px solid var(--border)',
                    padding: '1px 6px',
                    borderRadius: 3,
                    color: 'var(--text-2)',
                  }}
                >
                  {[e.documentType, e.documentNumber].filter(Boolean).join(' ')}
                </span>
              ) : null}
              {e.ministry ? (
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {e.ministry}
                </span>
              ) : null}
              {e.importance ? (
                <span
                  className={`kl-pill ${
                    e.importance === 'high'
                      ? 'kl-pill--warning'
                      : e.importance === 'critical'
                        ? 'kl-pill--danger'
                        : 'kl-pill--neutral'
                  }`}
                  style={{ fontSize: 11 }}
                >
                  {e.importance}
                </span>
              ) : null}
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, margin: '4px 0' }}>
              <Link
                href={`/regulatory/${eventSlug(e)}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {e.title}
              </Link>
            </p>
            {e.summaryEn ? (
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--text-2)',
                  margin: 0,
                  maxWidth: 720,
                }}
              >
                {e.summaryEn.length > 240
                  ? e.summaryEn.slice(0, 240) + '…'
                  : e.summaryEn}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
