/**
 * app/(app)/projects/by-methodology/page.tsx — T32 methodology hub index.
 *
 * Server component. Lists every distinct methodology code appearing on an
 * Indonesian project, alongside a short human gloss (REDD+ framework,
 * A/R, improved cookstoves, etc.). The gloss table is inline at module
 * scope — it's a v0.1 narrative aid, not a normalised lookup, and the
 * values map to the public Verra/CDM methodology titles.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listDistinctMethodologies } from '@/lib/queries/projects-by';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'Browse Indonesian carbon projects by methodology',
  description:
    'Filter Indonesian carbon projects by Verra/CDM methodology — REDD+ (VM0007, VM0048), A/R (VM0047, AR-ACM0003), cookstoves, and more.',
  openGraph: {
    url: '/projects/by-methodology',
    title: 'Browse Indonesian carbon projects by methodology · KarbonLens',
    description:
      'Filter Indonesian carbon projects by Verra/CDM methodology — REDD+ (VM0007, VM0048), A/R (VM0047, AR-ACM0003), cookstoves, and more.',
  },
  twitter: {
    title: 'Browse Indonesian carbon projects by methodology · KarbonLens',
    description:
      'Filter Indonesian carbon projects by Verra/CDM methodology — REDD+ (VM0007, VM0048), A/R (VM0047, AR-ACM0003), cookstoves, and more.',
  },
};

export const METHODOLOGY_GLOSSES: Record<string, string> = {
  VM0007: 'REDD+ Methodology Framework (Verra)',
  VM0048: 'Consolidated REDD (Verra, 2023+)',
  VM0033: 'Tidal Wetland & Seagrass Restoration (Verra)',
  VM0047: 'Afforestation, Reforestation & Revegetation (Verra)',
  VM0010: 'Improved Forest Management — Logged to Protected (Verra)',
  VM0011:
    'Methodology for Calculating GHG Benefits from Preventing Planned Degradation (Verra, legacy)',
  VM0044: 'Biochar Utilization (Verra)',
  VM0051: 'Improved Management in Rice Production (Verra)',
  VMR0006: 'High-efficiency firewood cookstoves (Verra)',
  VMR0014: 'Electric and Hybrid Vehicles (Verra, AMS-III.C revision)',
  ACM0001: 'Landfill gas (CDM)',
  ACM0002: 'Grid-connected electricity from renewable sources (CDM)',
  ACM0007: 'Conversion from single-cycle to combined-cycle (CDM)',
  'AMS-III.H': 'Methane recovery in wastewater treatment (CDM small-scale)',
  'AMS-III.E': 'Avoidance of methane from biomass decay (CDM small-scale)',
  'AMS-III.F':
    'Avoidance of methane via biological treatment (CDM small-scale)',
  'AMS-III.AJ':
    'Recovery and recycling of materials from solid waste (CDM)',
  'AMS-III.AV': 'Low-GHG safe drinking water (CDM)',
  AM0009: 'Recovery of associated gas otherwise flared (CDM)',
  AM0014: 'A/R of degraded mangrove habitats (CDM)',
  AM0029: 'Grid-connected natural gas power plants (CDM)',
  AM0030: 'PFC emission reductions from aluminium smelting (CDM)',
  'AMS-I.D': 'Grid-connected renewable electricity, small-scale (CDM)',
  'AMS-I.F': 'Renewable electricity for captive use, small-scale (CDM)',
  'AR-ACM0003': 'A/R of lands except wetlands (CDM large-scale)',
  'AR-AMS0007': 'Small-scale A/R on lands other than wetlands (CDM)',
  'AR-AM0014': 'Mangrove A/R, large-scale (CDM)',
};

export const METHODOLOGY_DEFAULT_GLOSS = 'Verra/CDM methodology';

/** Slug-ify a methodology code for URL use. Dots become hyphens. */
export function methCodeToSlug(code: string): string {
  return code.toLowerCase().replace(/\./g, '-');
}

export default async function ByMethodologyIndexPage() {
  const codes = await listDistinctMethodologies();

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
        name: 'By methodology',
        item: 'https://karbonlens.com/projects/by-methodology',
      },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Indonesian carbon projects by methodology',
    description:
      'Index of Verra/CDM methodology codes in use on Indonesian carbon projects, each linking to a dedicated hub page.',
    url: 'https://karbonlens.com/projects/by-methodology',
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
            Projects by methodology
          </h1>
          <p className="kl-page-subtitle" style={{ maxWidth: 720 }}>
            Browse Indonesian carbon projects by the Verra or CDM methodology
            they register under. Methodology codes are the accounting rule
            book — they decide how emissions are measured, what counts as
            additionality, and how long the crediting period runs.
          </p>
        </div>
      </header>

      {codes.length === 0 ? (
        <div className="kl-card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="kl-muted">
            No methodology data available. Check back after the next weekly
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
          {codes.map((code) => {
            const gloss =
              METHODOLOGY_GLOSSES[code] ?? METHODOLOGY_DEFAULT_GLOSS;
            const slug = methCodeToSlug(code);
            return (
              <li key={code}>
                <Link
                  href={`/projects/by-methodology/${slug}`}
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
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {code}
                  </div>
                  <div
                    className="kl-muted"
                    style={{ fontSize: 13, lineHeight: 1.4 }}
                  >
                    {gloss}
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
