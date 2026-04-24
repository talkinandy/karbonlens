/**
 * app/(app)/projects/by-developer/page.tsx — T32 Phase 3 hub index.
 *
 * Server component. Enumerates every distinct project developer with at
 * least one Indonesian project and renders a grid of link cards, one per
 * developer. The slug for each card is supplied directly by
 * `listDistinctDevelopers()` (which calls `slugifyDeveloper` server-side)
 * so the URL <-> developer mapping stays canonical.
 *
 * "Multiple Proponents" — a Verra/CDM placeholder used when no single lead
 * proponent is named (common for LPHD village-forest REDD+ and grouped POME
 * biogas projects) — is included as a regular tile but with a callout
 * subtitle so users understand it is a consortium bucket, not a single
 * organisation.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listDistinctDevelopers } from '@/lib/queries/projects-by';
import { JsonLd } from '@/components/seo/JsonLd';

const MULTI_PROPONENTS_LABEL = 'Multiple Proponents';
const MULTI_PROPONENTS_SUBTITLE = 'Consortium / multi-proponent projects';

export const metadata: Metadata = {
  title: 'Browse Indonesian carbon projects by developer',
  description:
    "PT Rimba Makmur Utama, InfiniteEARTH, Forest Carbon, Fairatmos, KIS Group — filter projects by who's building them.",
  openGraph: {
    url: '/projects/by-developer',
    title: 'Browse Indonesian carbon projects by developer · KarbonLens',
    description:
      "PT Rimba Makmur Utama, InfiniteEARTH, Forest Carbon, Fairatmos, KIS Group — filter projects by who's building them.",
  },
  twitter: {
    title: 'Browse Indonesian carbon projects by developer · KarbonLens',
    description:
      "PT Rimba Makmur Utama, InfiniteEARTH, Forest Carbon, Fairatmos, KIS Group — filter projects by who's building them.",
  },
};

export default async function ByDeveloperIndexPage() {
  const developers = await listDistinctDevelopers();

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://karbonlens.com/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Projects',
        item: 'https://karbonlens.com/projects',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'By developer',
        item: 'https://karbonlens.com/projects/by-developer',
      },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Indonesian carbon projects by developer',
    description:
      'Index of project developers with Indonesian carbon projects, each linking to a dedicated hub page.',
    url: 'https://karbonlens.com/projects/by-developer',
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
          <h1 className="kl-page-title" style={{ marginBottom: 8 }}>
            Projects by developer
          </h1>
          <p className="kl-page-subtitle" style={{ maxWidth: 720 }}>
            Browse Indonesian carbon projects by the developer or proponent
            organisation building them. Each hub lists every project under that
            developer with its integrity score, satellite alerts, and registry
            status.
          </p>
        </div>
      </header>

      {developers.length === 0 ? (
        <div className="kl-card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="kl-muted">
            No developer data available. Check back after the next weekly
            refresh.
          </p>
        </div>
      ) : (
        <ul
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {developers.map(({ name, slug, count }) => {
            const isMulti = name === MULTI_PROPONENTS_LABEL;
            return (
              <li key={slug}>
                <Link
                  href={`/projects/by-developer/${slug}`}
                  className="kl-card"
                  style={{
                    display: 'block',
                    padding: 16,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      marginBottom: 4,
                    }}
                  >
                    {name}
                  </div>
                  {isMulti ? (
                    <div
                      className="kl-muted"
                      style={{ fontSize: 12, marginBottom: 4 }}
                    >
                      {MULTI_PROPONENTS_SUBTITLE}
                    </div>
                  ) : null}
                  <div
                    className="kl-muted"
                    style={{ fontSize: 13 }}
                    aria-label={`${count} project${count === 1 ? '' : 's'}`}
                  >
                    {count} project{count === 1 ? '' : 's'}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
