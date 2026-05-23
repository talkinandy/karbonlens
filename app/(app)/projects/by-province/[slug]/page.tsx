/**
 * app/(app)/projects/by-province/[slug]/page.tsx — T32 province hub.
 *
 * Slug resolution: iterates `listCanonicalProvinces()` and picks the
 * canonical whose `provinceCanonicalToSlug(canonical) === slug`. Any
 * mismatch → 404. This keeps the slug↔canonical contract inside the
 * projects-by helpers — we don't hardcode the canonical list here.
 *
 * Pre-rendered at build via `generateStaticParams`; page count is small
 * (~22 provinces) so the static set is cheap.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getProjectsByCanonicalProvince,
  getProvinceHubStats,
  listCanonicalProvinces,
  provinceCanonicalToSlug,
} from '@/lib/queries/projects-by';
import { ProjectHub } from '@/components/projects/ProjectHub';
import { HubRichContext } from '@/components/projects/HubRichContext';
import { JsonLd } from '@/components/seo/JsonLd';

type Props = {
  params: Promise<{ slug: string }>;
};

async function resolveCanonical(slug: string): Promise<string | null> {
  const provinces = await listCanonicalProvinces();
  for (const { canonical } of provinces) {
    if (provinceCanonicalToSlug(canonical) === slug) return canonical;
  }
  return null;
}

function describeProvince(canonical: string): string {
  if (canonical === 'Multiple provinces') {
    return 'Cross-island Indonesian carbon projects whose footprint spans multiple provinces.';
  }
  return `Indonesian carbon projects located in ${canonical}. Each listing links to a full project dossier with integrity score, issuance history, satellite alerts, and regulatory status.`;
}

export async function generateStaticParams() {
  const provinces = await listCanonicalProvinces();
  return provinces.map(({ canonical }) => ({
    slug: provinceCanonicalToSlug(canonical),
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const canonical = await resolveCanonical(slug);
  if (!canonical) {
    return { title: 'Province not found' };
  }
  const description = describeProvince(canonical);
  const firstSentence = description.split('. ')[0] + '.';
  return {
    title: `${canonical} — Indonesian carbon projects`,
    description: firstSentence,
    openGraph: {
      url: `/projects/by-province/${slug}`,
      title: `${canonical} — Indonesian carbon projects · KarbonLens`,
      description: firstSentence,
    },
    twitter: {
      title: `${canonical} — Indonesian carbon projects · KarbonLens`,
      description: firstSentence,
    },
  };
}

export default async function ByProvinceHubPage({ params }: Props) {
  const { slug } = await params;
  const canonical = await resolveCanonical(slug);
  if (!canonical) notFound();

  const [rows, stats] = await Promise.all([
    getProjectsByCanonicalProvince(canonical),
    getProvinceHubStats(canonical),
  ]);
  const description = describeProvince(canonical);
  const url = `https://karbonlens.com/projects/by-province/${slug}`;

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
      {
        '@type': 'ListItem',
        position: 4,
        name: canonical,
        item: url,
      },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${canonical} — Indonesian carbon projects`,
    description,
    url,
  };

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Carbon projects in ${canonical}`,
    itemListElement: rows.slice(0, 25).map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://karbonlens.com/projects/${r.slug}`,
      name: r.nameCanonical,
    })),
  };

  return (
    <>
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <JsonLd data={collectionSchema} id="ld-collection" />
      <JsonLd data={itemListSchema} id="ld-itemlist" />
      <ProjectHub
        headingEyebrow="PROVINCE HUB"
        heading={canonical}
        description={description}
        rows={rows}
        backHref="/projects/by-province"
        backLabel="All provinces"
        richContext={
          <HubRichContext kind="province" label={canonical} slug={slug} stats={stats} />
        }
      />
    </>
  );
}
