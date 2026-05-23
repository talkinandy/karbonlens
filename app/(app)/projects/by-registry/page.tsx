/**
 * app/(app)/projects/by-registry/page.tsx — T32 Phase 3 hub index.
 *
 * Server component. Enumerates every distinct carbon registry (Verra, Gold
 * Standard, CDM, SRN-PPI, IDXCarbon, …) that has at least one Indonesian
 * project, and renders a grid of link cards. Each card links to a per-
 * registry hub at `/projects/by-registry/[slug]`.
 *
 * Slug derivation is inline (`registryToSlug`) and shared structurally with
 * the per-registry page so URL <-> registry-name resolution is symmetric.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listDistinctRegistries } from '@/lib/queries/projects-by';
import { JsonLd } from '@/components/seo/JsonLd';

function registryToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const metadata: Metadata = {
  title: 'Browse Indonesian carbon projects by registry',
  description:
    "Verra, Gold Standard, CDM, SRN-PPI, IDXCarbon — filter projects by where they're registered.",
  openGraph: {
    url: '/projects/by-registry',
    title: 'Browse Indonesian carbon projects by registry · KarbonLens',
    description:
      "Verra, Gold Standard, CDM, SRN-PPI, IDXCarbon — filter projects by where they're registered.",
  },
  twitter: {
    title: 'Browse Indonesian carbon projects by registry · KarbonLens',
    description:
      "Verra, Gold Standard, CDM, SRN-PPI, IDXCarbon — filter projects by where they're registered.",
  },
  alternates: { canonical: '/projects/by-registry' },
};

export default async function ByRegistryIndexPage() {
  const registries = await listDistinctRegistries();

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
        name: 'By registry',
        item: 'https://karbonlens.com/projects/by-registry',
      },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Indonesian carbon projects by registry',
    description:
      'Index of carbon registries (Verra, Gold Standard, CDM, SRN-PPI, IDXCarbon) with Indonesian projects, each linking to a dedicated hub page.',
    url: 'https://karbonlens.com/projects/by-registry',
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
            Projects by registry
          </h1>
          <p className="kl-page-subtitle" style={{ maxWidth: 720 }}>
            Browse Indonesian carbon projects by the registry that issues
            their credits. Each hub lists every project on that registry with
            its integrity score, satellite alerts, and recent issuance
            history.
          </p>
        </div>
      </header>

      {registries.length === 0 ? (
        <div className="kl-card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="kl-muted">
            No registry data available. Check back after the next weekly
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
          {registries.map(({ name, count }) => {
            const slug = registryToSlug(name);
            return (
              <li key={name}>
                <Link
                  href={`/projects/by-registry/${slug}`}
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
