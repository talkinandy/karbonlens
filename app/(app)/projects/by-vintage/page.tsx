/**
 * app/(app)/projects/by-vintage/page.tsx — SEO Phase 2D programmatic hub index.
 *
 * Server component. Enumerates every issuance vintage year present in the
 * DB and renders a grid of link cards, one per year, sized by total
 * credits issued. Feeds the crawl-depth story (each card links to a
 * dedicated `/projects/by-vintage/[year]` page).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listVintageYears } from '@/lib/queries/projects-by';
import { JsonLd } from '@/components/seo/JsonLd';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Browse Indonesian carbon credits by vintage year',
  description:
    'Indonesian carbon credit issuances grouped by vintage year — the calendar year in which the underlying emissions reduction or removal occurred.',
  openGraph: {
    url: '/projects/by-vintage',
    title: 'Browse Indonesian carbon credits by vintage year · KarbonLens',
    description:
      'Indonesian carbon credit issuances grouped by vintage year — the calendar year in which the underlying emissions reduction or removal occurred.',
  },
  twitter: {
    title: 'Browse Indonesian carbon credits by vintage year · KarbonLens',
    description:
      'Indonesian carbon credit issuances grouped by vintage year.',
  },
  alternates: { canonical: '/projects/by-vintage' },
};

function fmtBigInt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return n.toLocaleString('en-US');
}

export default async function ByVintageIndexPage() {
  const vintages = await listVintageYears();
  const totalCredits = vintages.reduce((acc, v) => acc + v.totalCredits, 0);

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://karbonlens.com/' },
      { '@type': 'ListItem', position: 2, name: 'Projects', item: 'https://karbonlens.com/projects' },
      { '@type': 'ListItem', position: 3, name: 'By vintage', item: 'https://karbonlens.com/projects/by-vintage' },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Indonesian carbon credits by vintage year',
    description: `Issuances of Indonesian carbon credits grouped by vintage year, ${vintages.length} years covered, ${fmtBigInt(totalCredits)} tCO₂e total.`,
    url: 'https://karbonlens.com/projects/by-vintage',
  };

  return (
    <main className="kl-page">
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <JsonLd data={collectionSchema} id="ld-collection" />

      <header className="kl-page-header" style={{ marginBottom: 28 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="kl-section-label">
            <Link href="/projects" style={{ textDecoration: 'none' }}>
              ← Projects explorer
            </Link>
          </p>
          <h1 className="kl-page-title">Indonesian carbon credits by vintage year</h1>
          <p className="kl-page-subtitle" style={{ maxWidth: 720 }}>
            A credit&apos;s vintage is the calendar year during which the underlying
            emissions reduction or removal took place — distinct from the year it
            was issued or sold. Pick a year to see which Indonesian projects
            issued credits for it, alongside the IDXCarbon market context.
          </p>
          <p
            className="kl-muted"
            style={{ marginTop: 12, fontSize: 13 }}
          >
            {vintages.length} vintage year{vintages.length === 1 ? '' : 's'} ·{' '}
            {fmtBigInt(totalCredits)} tCO₂e total credits issued
          </p>
        </div>
      </header>

      {vintages.length === 0 ? (
        <div className="kl-card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="kl-muted">
            No issuance data yet — check back after the next weekly registry refresh.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          {vintages.map((v) => (
            <Link
              key={v.year}
              href={`/projects/by-vintage/${v.year}`}
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
                Vintage
              </p>
              <p
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  margin: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {v.year}
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-3)',
                  margin: '6px 0 0',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {v.projectCount} project{v.projectCount === 1 ? '' : 's'} ·{' '}
                {fmtBigInt(v.totalCredits)} tCO₂e
              </p>
            </Link>
          ))}
        </div>
      )}

      <p
        className="kl-muted"
        style={{ marginTop: 32, fontSize: 13 }}
      >
        Vintage matters because (a) older vintages generally command lower
        prices, reflecting concerns about whether the original reduction is
        still genuinely additional; (b) ICVCM CCP-eligibility and CORSIA
        eligibility are vintage-bracketed; (c) many corporate buyers prefer
        credits with vintages close to the year of the emissions they&apos;re
        offsetting. See <Link href="/glossary/vintage">/glossary/vintage</Link>{' '}
        for the full definition.
      </p>
    </main>
  );
}
