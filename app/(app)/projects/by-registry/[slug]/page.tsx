/**
 * app/(app)/projects/by-registry/[slug]/page.tsx — T32 Phase 3.
 *
 * Per-registry hub. Resolves the URL slug back to a registry name by
 * iterating `listDistinctRegistries()` (the same source that drives the
 * index page and `generateStaticParams` below) and matching with the
 * inline `registryToSlug` helper.  This guarantees URL <-> name
 * symmetry without a separate slug column on the registries table.
 *
 * Glosses are short (1–2 sentence) intros chosen to read well as the
 * answer-lead snippet for LLM crawlers; the fall-back text covers any
 * future registry that joins the system without requiring a code edit.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  listDistinctRegistries,
  getProjectsByRegistry,
} from '@/lib/queries/projects-by';
import { ProjectHub } from '@/components/projects/ProjectHub';
import { JsonLd } from '@/components/seo/JsonLd';

function registryToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const REGISTRY_GLOSS: Record<string, string> = {
  Verra:
    "The Verified Carbon Standard (VCS) is the world's largest voluntary GHG registry. Indonesian Verra projects span REDD+, ARR, IFM, blue carbon, and industrial methodologies.",
  'Gold Standard':
    'Gold Standard (GS) certifies high-integrity voluntary emission reductions, with a strong focus on community co-benefits alongside carbon.',
  CDM: "The UN's Clean Development Mechanism — the Kyoto-era compliance pathway. Most Indonesian CDM crediting periods have expired; listed here for market provenance.",
  'SRN-PPI':
    "Indonesia's national carbon registry — Sistem Registri Nasional Pengendalian Perubahan Iklim. Since the Oct 2025 Verra MRA, Indonesian VCS projects dual-register here.",
  IDXCarbon:
    "Indonesia's domestic carbon exchange, operated by the Indonesia Stock Exchange (IDX). Lists SPE-GRK units and imported VCS credits.",
};

function describeRegistry(name: string): string {
  return (
    REGISTRY_GLOSS[name] ??
    `Indonesian carbon projects registered with ${name}. Each dossier links to the authoritative registry page plus integrity scoring, satellite alerts, and recent issuance history.`
  );
}

async function resolveRegistry(
  slug: string,
): Promise<{ name: string } | null> {
  const all = await listDistinctRegistries();
  const match = all.find((r) => registryToSlug(r.name) === slug);
  return match ? { name: match.name } : null;
}

export async function generateStaticParams() {
  const registries = await listDistinctRegistries();
  return registries.map((r) => ({ slug: registryToSlug(r.name) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveRegistry(slug);
  if (!resolved) {
    return { title: 'Registry not found' };
  }
  const title = `${resolved.name} — Indonesian carbon projects`;
  const description = describeRegistry(resolved.name);
  return {
    title,
    description,
    openGraph: {
      url: `/projects/by-registry/${slug}`,
      title: `${title} · KarbonLens`,
      description,
    },
    twitter: {
      title: `${title} · KarbonLens`,
      description,
    },
    alternates: { canonical: `/projects/by-registry/${slug}` },
  };
}

export default async function ByRegistrySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolveRegistry(slug);
  if (!resolved) notFound();
  const { name } = resolved;

  const rows = await getProjectsByRegistry(name);
  const description = describeRegistry(name);
  const url = `https://karbonlens.com/projects/by-registry/${slug}`;

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
    name: `Indonesian carbon projects on ${name}`,
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
        headingEyebrow="REGISTRY HUB"
        heading={name}
        description={description}
        rows={rows}
        backHref="/projects/by-registry"
        backLabel="All registries"
      />
    </>
  );
}
