/**
 * app/(app)/projects/by-methodology/[slug]/page.tsx — T32 methodology hub.
 *
 * Slug → code mapping is pragmatic: Verra codes (VM0007, VMR0006) have no
 * punctuation, CDM consolidated codes (ACM0001, AM0014) likewise, but
 * small-scale CDM codes have a dotted form (AMS-III.H, AMS-I.D) and
 * afforestation/reforestation codes keep an internal hyphen (AR-ACM0003,
 * AR-AMS0007, AR-AM0014). The URL slug lowercases and replaces dots with
 * hyphens, so the inverse has to try both "as-is" and "last-hyphen-to-dot"
 * forms, falling back to the raw live-DB list for validation.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getProjectsByMethodology,
  listDistinctMethodologies,
} from '@/lib/queries/projects-by';
import { ProjectHub } from '@/components/projects/ProjectHub';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  METHODOLOGY_GLOSSES,
  METHODOLOGY_DEFAULT_GLOSS,
  methCodeToSlug,
} from '@/app/(app)/projects/by-methodology/page';

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * Convert a URL slug back to a methodology code. Tries:
 *   1. uppercase-as-is (covers VM0007, AR-ACM0003, ACM0001)
 *   2. swap inner hyphens for dots within an AMS- or similar prefix
 *      (covers AMS-III.H, AMS-I.D, AMS-III.AV, AMS-III.AJ)
 *   3. resolve against the live DB list of distinct codes — whichever
 *      of the candidates actually exists wins.
 *
 * If nothing matches the live list, returns the uppercase-as-is form so
 * the downstream query still runs (returns empty) and `notFound()` kicks
 * in cleanly.
 */
async function methSlugToCode(slug: string): Promise<{
  code: string;
  known: boolean;
}> {
  const upper = slug.toUpperCase();

  // Candidate A: literal uppercase (e.g. "VM0007", "AR-ACM0003").
  const candidates: string[] = [upper];

  // Candidate B: dotted variant — replace the *last* hyphen with a dot.
  // Works for "AMS-III-H" → "AMS-III.H" and "AMS-I-D" → "AMS-I.D".
  const lastHyphen = upper.lastIndexOf('-');
  if (lastHyphen !== -1 && lastHyphen > 0) {
    const dotted =
      upper.slice(0, lastHyphen) + '.' + upper.slice(lastHyphen + 1);
    candidates.push(dotted);
  }

  // Candidate C: replace *every* hyphen after the first with a dot — covers
  // hypothetical "AMS-III-AJ-SOMETHING" if that shape ever appears.
  if (upper.split('-').length > 2) {
    const parts = upper.split('-');
    const joined = parts[0] + '-' + parts.slice(1).join('.');
    candidates.push(joined);
  }

  const known = await listDistinctMethodologies();
  for (const c of candidates) {
    if (known.includes(c)) return { code: c, known: true };
  }
  return { code: upper, known: false };
}

export async function generateStaticParams() {
  const codes = await listDistinctMethodologies();
  return codes.map((code) => ({ slug: methCodeToSlug(code) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { code, known } = await methSlugToCode(slug);
  if (!known) {
    return { title: 'Methodology not found' };
  }
  const gloss = METHODOLOGY_GLOSSES[code] ?? METHODOLOGY_DEFAULT_GLOSS;
  const description = `Indonesian carbon projects registered under ${code}, the ${gloss}. Each listing links to a full dossier.`;
  return {
    title: `${code} — ${gloss} · Indonesian carbon projects`,
    description,
    openGraph: {
      url: `/projects/by-methodology/${slug}`,
      title: `${code} — ${gloss} · KarbonLens`,
      description,
    },
    twitter: {
      title: `${code} — ${gloss} · KarbonLens`,
      description,
    },
    alternates: { canonical: `/projects/by-methodology/${slug}` },
  };
}

export default async function ByMethodologyHubPage({ params }: Props) {
  const { slug } = await params;
  const { code, known } = await methSlugToCode(slug);

  const rows = await getProjectsByMethodology(code);
  if (rows.length === 0 && !known) notFound();

  const gloss = METHODOLOGY_GLOSSES[code] ?? METHODOLOGY_DEFAULT_GLOSS;
  const description = `Indonesian carbon projects registered under ${code}, the ${gloss}. Each listing links to a full dossier.`;
  const url = `https://karbonlens.com/projects/by-methodology/${slug}`;

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
      {
        '@type': 'ListItem',
        position: 4,
        name: code,
        item: url,
      },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${code} — ${gloss}`,
    description,
    url,
  };

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Projects using ${code}`,
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
        headingEyebrow="METHODOLOGY HUB"
        heading={`${code} — ${gloss}`}
        description={description}
        rows={rows}
        backHref="/projects/by-methodology"
        backLabel="All methodologies"
      />
    </>
  );
}
