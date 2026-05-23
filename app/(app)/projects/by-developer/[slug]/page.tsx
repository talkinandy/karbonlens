/**
 * app/(app)/projects/by-developer/[slug]/page.tsx — T32 Phase 3.
 *
 * Per-developer hub. Resolves the URL slug back to the developer's free-
 * text name by iterating `listDistinctDevelopers()` (which carries the
 * canonical slug derived via `slugifyDeveloper`) — preserving original
 * casing for the H1.
 *
 * The "Multiple Proponents" bucket — a Verra/CDM placeholder for
 * consortium / multi-proponent projects (LPHD village forests, grouped
 * POME biogas) — gets bespoke description text since "developed by
 * Multiple Proponents" reads oddly.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  listDistinctDevelopers,
  getProjectsByDeveloperSlug,
} from '@/lib/queries/projects-by';
import { ProjectHub } from '@/components/projects/ProjectHub';
import { JsonLd } from '@/components/seo/JsonLd';

const MULTI_PROPONENTS_LABEL = 'Multiple Proponents';
const MULTI_PROPONENTS_DESCRIPTION =
  "Indonesian carbon projects registered with 'Multiple Proponents' — consortium arrangements where the Verra/CDM listing names no single lead proponent. Common for LPHD village-forest REDD+ and grouped POME biogas.";

async function resolveDeveloper(
  slug: string,
): Promise<{ name: string; count: number } | null> {
  const all = await listDistinctDevelopers();
  const match = all.find((d) => d.slug === slug);
  return match ? { name: match.name, count: match.count } : null;
}

function describeDeveloper(name: string, count: number): string {
  if (name === MULTI_PROPONENTS_LABEL) return MULTI_PROPONENTS_DESCRIPTION;
  return `Indonesian carbon projects developed by ${name}. ${count} project${count === 1 ? '' : 's'} in the registry.`;
}

export async function generateStaticParams() {
  const developers = await listDistinctDevelopers();
  return developers.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveDeveloper(slug);
  if (!resolved) {
    return { title: 'Developer not found' };
  }
  const title = `${resolved.name} — Indonesian carbon projects`;
  const description = describeDeveloper(resolved.name, resolved.count);
  return {
    title,
    description,
    openGraph: {
      url: `/projects/by-developer/${slug}`,
      title: `${title} · KarbonLens`,
      description,
    },
    twitter: {
      title: `${title} · KarbonLens`,
      description,
    },
    alternates: { canonical: `/projects/by-developer/${slug}` },
  };
}

export default async function ByDeveloperSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolveDeveloper(slug);
  if (!resolved) notFound();
  const { name, count } = resolved;

  const rows = await getProjectsByDeveloperSlug(slug);
  const description = describeDeveloper(name, count);
  const url = `https://karbonlens.com/projects/by-developer/${slug}`;

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
      {
        '@type': 'ListItem',
        position: 4,
        name,
        item: url,
      },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${name} — Indonesian carbon projects`,
    description,
    url,
  };

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Indonesian carbon projects developed by ${name}`,
    numberOfItems: Math.min(rows.length, 25),
    itemListElement: rows.slice(0, 25).map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: r.nameCanonical,
      url: `https://karbonlens.com/projects/${r.slug}`,
    })),
  };

  return (
    <>
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <JsonLd data={collectionSchema} id="ld-collection" />
      <JsonLd data={itemListSchema} id="ld-itemlist" />
      <ProjectHub
        headingEyebrow="DEVELOPER HUB"
        heading={name}
        description={description}
        rows={rows}
        backHref="/projects/by-developer"
        backLabel="All developers"
      />
    </>
  );
}
