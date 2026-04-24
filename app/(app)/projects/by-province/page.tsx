/**
 * app/(app)/projects/by-province/page.tsx — T32 Phase 3 hub index.
 *
 * Server component. Enumerates every canonical Indonesian province with at
 * least one carbon project and renders a grid of link cards, one per
 * canonical label. Feeds the crawl-depth story for LLM/SEO (each card links
 * to a dedicated `/projects/by-province/[slug]` hub page with its own
 * `CollectionPage` + `ItemList` JSON-LD).
 *
 * The canonicalization table lives in `lib/display/province.ts`; T32 added
 * Lampung, Central Papua, West Papua, Riau Islands, and the "Multiple
 * provinces" sentinel on top of the original T29 17. Counts here reflect
 * raw-string rollup (e.g. "Sumatera Utara" + "North Sumatra Province" both
 * roll up under "North Sumatra").
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  listCanonicalProvinces,
  provinceCanonicalToSlug,
} from '@/lib/queries/projects-by';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'Browse Indonesian carbon projects by province',
  description:
    'Filter 200+ Indonesian carbon projects by province — Central Kalimantan, Riau, West Java, and more.',
  openGraph: {
    url: '/projects/by-province',
    title: 'Browse Indonesian carbon projects by province · KarbonLens',
    description:
      'Filter 200+ Indonesian carbon projects by province — Central Kalimantan, Riau, West Java, and more.',
  },
  twitter: {
    title: 'Browse Indonesian carbon projects by province · KarbonLens',
    description:
      'Filter 200+ Indonesian carbon projects by province — Central Kalimantan, Riau, West Java, and more.',
  },
};

export default async function ByProvinceIndexPage() {
  const provinces = await listCanonicalProvinces();

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
        name: 'By province',
        item: 'https://karbonlens.com/projects/by-province',
      },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Indonesian carbon projects by province',
    description:
      'Index of Indonesian provinces with carbon projects, each linking to a dedicated hub page.',
    url: 'https://karbonlens.com/projects/by-province',
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
            Projects by province
          </h1>
          <p className="kl-page-subtitle" style={{ maxWidth: 720 }}>
            Browse Indonesian carbon projects by the province where they
            operate. Each hub lists every project in that province with its
            integrity score, satellite alerts, and registry status.
          </p>
        </div>
      </header>

      {provinces.length === 0 ? (
        <div className="kl-card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="kl-muted">
            No province data available. Check back after the next weekly
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
          {provinces.map(({ canonical, count }) => {
            const slug = provinceCanonicalToSlug(canonical);
            return (
              <li key={canonical}>
                <Link
                  href={`/projects/by-province/${slug}`}
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
                    {canonical}
                  </div>
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
