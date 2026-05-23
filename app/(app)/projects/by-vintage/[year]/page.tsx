/**
 * app/(app)/projects/by-vintage/[year]/page.tsx — SEO Phase 2D.
 *
 * Per-vintage-year detail page. Lists Indonesian carbon projects that
 * issued credits in the requested vintage year, sized by per-vintage
 * credit volume. Cross-links to:
 *   - per-project detail pages
 *   - the matching /prices/[YYYY-MM] page for IDXCarbon market context
 *     in the same year
 *   - the methodology hub for each project's primary methodology
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getProjectsByVintageYear,
  listVintageYears,
  type VintageProjectRow,
} from '@/lib/queries/projects-by';
import { JsonLd } from '@/components/seo/JsonLd';

export const revalidate = 3600;

type Props = {
  params: Promise<{ year: string }>;
};

function parseYear(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1990 || n > new Date().getUTCFullYear() + 1) return null;
  return n;
}

export async function generateStaticParams() {
  const vintages = await listVintageYears();
  return vintages.map((v) => ({ year: String(v.year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const yearNum = parseYear(year);
  if (yearNum === null) {
    return { title: 'Vintage not found' };
  }
  // Cheap existence check — listVintageYears() is cached at the route layer
  // by ISR; we hit it again here for the metadata path.
  const vintages = await listVintageYears();
  const v = vintages.find((x) => x.year === yearNum);
  if (!v) {
    return { title: `Vintage ${yearNum} — no data` };
  }
  const description = `${v.projectCount} Indonesian carbon project${v.projectCount === 1 ? '' : 's'} issued credits with vintage year ${yearNum}, totalling ${v.totalCredits.toLocaleString('en-ID')} tCO₂e.`;
  return {
    title: `${yearNum} vintage — Indonesian carbon credits`,
    description,
    openGraph: {
      url: `/projects/by-vintage/${yearNum}`,
      title: `${yearNum} vintage — Indonesian carbon credits · KarbonLens`,
      description,
    },
    twitter: {
      title: `${yearNum} vintage — Indonesian carbon credits · KarbonLens`,
      description,
    },
    alternates: { canonical: `/projects/by-vintage/${yearNum}` },
  };
}

function fmtCredits(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString('en-US');
}

export default async function ByVintageYearPage({ params }: Props) {
  const { year } = await params;
  const yearNum = parseYear(year);
  if (yearNum === null) notFound();

  const [rows, allVintages] = await Promise.all([
    getProjectsByVintageYear(yearNum),
    listVintageYears(),
  ]);

  if (rows.length === 0) notFound();

  const vintageStats = allVintages.find((v) => v.year === yearNum);
  const totalCredits = rows.reduce((acc, r) => acc + r.vintageCredits, 0);
  const totalIssuances = rows.reduce((acc, r) => acc + r.vintageIssuanceCount, 0);
  const description = `${rows.length} Indonesian carbon project${rows.length === 1 ? '' : 's'} issued credits with vintage year ${yearNum}, totalling ${fmtCredits(totalCredits)} tCO₂e across ${totalIssuances} issuance${totalIssuances === 1 ? '' : 's'}.`;
  const url = `https://karbonlens.com/projects/by-vintage/${yearNum}`;

  // Prev/next navigation across vintage years that have data.
  const sortedYears = [...allVintages].sort((a, b) => a.year - b.year);
  const idx = sortedYears.findIndex((v) => v.year === yearNum);
  const prevVintage = idx > 0 ? sortedYears[idx - 1] : null;
  const nextVintage = idx >= 0 && idx < sortedYears.length - 1 ? sortedYears[idx + 1] : null;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://karbonlens.com/' },
      { '@type': 'ListItem', position: 2, name: 'Projects', item: 'https://karbonlens.com/projects' },
      { '@type': 'ListItem', position: 3, name: 'By vintage', item: 'https://karbonlens.com/projects/by-vintage' },
      { '@type': 'ListItem', position: 4, name: String(yearNum), item: url },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${yearNum} vintage — Indonesian carbon credits`,
    description,
    url,
    temporalCoverage: String(yearNum),
  };

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Projects with ${yearNum} vintage credits`,
    itemListElement: rows.slice(0, 25).map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://karbonlens.com/projects/${r.slug}`,
      name: r.nameCanonical,
    })),
  };

  return (
    <main className="kl-page">
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <JsonLd data={collectionSchema} id="ld-collection" />
      <JsonLd data={itemListSchema} id="ld-itemlist" />

      <header className="kl-page-header" style={{ marginBottom: 28 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="kl-section-label">
            <Link href="/projects/by-vintage" style={{ textDecoration: 'none' }}>
              ← All vintage years
            </Link>
          </p>
          <p className="kl-section-label" style={{ marginTop: 6, marginBottom: 6 }}>
            VINTAGE
          </p>
          <h1 className="kl-page-title" style={{ marginBottom: 8 }}>
            {yearNum}
          </h1>
          <p className="kl-page-subtitle" style={{ maxWidth: 720 }}>
            {description}
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
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 14,
            marginBottom: 16,
          }}
        >
          <Stat label="Projects" value={rows.length.toLocaleString('en-US')} />
          <Stat label="Issuance rows" value={totalIssuances.toLocaleString('en-US')} />
          <Stat label="Total credits" value={`${fmtCredits(totalCredits)} tCO₂e`} />
          {vintageStats ? (
            <Stat
              label="Avg / project"
              value={`${fmtCredits(Math.round(totalCredits / rows.length))} tCO₂e`}
            />
          ) : null}
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.7, maxWidth: 720, marginBottom: 12 }}>
          Vintage {yearNum} reflects emissions reductions or removals that occurred
          during the {yearNum} calendar year. IDXCarbon market context for this
          year is available in the{' '}
          <Link href={`/prices/${yearNum}-01`}>/prices archive</Link> where
          KarbonLens has snapshot coverage. Vintage credits typically trade
          alongside same-or-newer-vintage credits in the secondary market; older
          vintages may attract a discount.
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {prevVintage ? (
            <Link href={`/projects/by-vintage/${prevVintage.year}`}>
              ← {prevVintage.year} ({prevVintage.projectCount} project
              {prevVintage.projectCount === 1 ? '' : 's'})
            </Link>
          ) : (
            <span />
          )}
          {nextVintage ? (
            <Link href={`/projects/by-vintage/${nextVintage.year}`}>
              {nextVintage.year} ({nextVintage.projectCount} project
              {nextVintage.projectCount === 1 ? '' : 's'}) →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </section>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>
        Projects with {yearNum} vintage credits
      </h2>
      <VintageProjectsTable rows={rows} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="kl-section-label"
        style={{ fontSize: 11, marginBottom: 2 }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 500,
          margin: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
    </div>
  );
}

function VintageProjectsTable({ rows }: { rows: VintageProjectRow[] }) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 13,
        marginBottom: 24,
      }}
    >
      <thead>
        <tr
          style={{
            borderBottom: '0.5px solid var(--border)',
            color: 'var(--text-3)',
            textAlign: 'left',
          }}
        >
          <th style={{ padding: '8px 12px 8px 0' }}>Project</th>
          <th style={{ padding: '8px 12px' }}>Methodology</th>
          <th style={{ padding: '8px 12px' }}>Province</th>
          <th
            style={{ padding: '8px 0 8px 12px', textAlign: 'right' }}
          >
            Credits (tCO₂e)
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            style={{
              borderBottom: '0.5px solid var(--border)',
            }}
          >
            <td style={{ padding: '10px 12px 10px 0' }}>
              <Link
                href={`/projects/${r.slug}`}
                style={{ color: 'var(--info-fg)', textDecoration: 'none' }}
              >
                {r.nameCanonical}
              </Link>
            </td>
            <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>
              {r.methodology ? (
                r.methodology.split(',').slice(0, 2).map((m, i, arr) => (
                  <span key={m}>
                    <Link
                      href={`/projects/by-methodology/${m.trim().toLowerCase().replace(/\./g, '-')}`}
                      style={{ color: 'inherit' }}
                    >
                      {m.trim()}
                    </Link>
                    {i < arr.length - 1 ? ', ' : ''}
                  </span>
                ))
              ) : (
                <span style={{ color: 'var(--text-3)' }}>—</span>
              )}
            </td>
            <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>
              {r.canonicalProvince ?? r.province ?? '—'}
            </td>
            <td
              style={{
                padding: '10px 0 10px 12px',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {r.vintageCredits.toLocaleString('en-ID')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
