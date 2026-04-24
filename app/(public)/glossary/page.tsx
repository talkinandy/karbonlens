/**
 * app/(public)/glossary/page.tsx — KarbonLens glossary index (T32, Phase 3).
 *
 * Server component, no DB. Reads the hardcoded `GLOSSARY` array from
 * `lib/data/glossary.ts`, groups by category, and renders one card per
 * term with a link to `/glossary/${slug}`.
 *
 * Two JSON-LD blocks emitted at the foot:
 *   - BreadcrumbList (Home → Glossary)
 *   - DefinedTermSet (the full glossary, used by LLM answer engines and
 *     Google's structured-data understanding to recognise the page as a
 *     dictionary surface).
 *
 * Styling: reuses existing `.kl-page`, `.kl-page-title`, `.kl-section-label`,
 * `.kl-card`, `.kl-pill`, `.kl-muted`. No edits to globals.css.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { JsonLd } from '@/components/seo/JsonLd';
import {
  GLOSSARY,
  listTerms,
  type GlossaryTerm,
} from '@/lib/data/glossary';

const BASE = 'https://karbonlens.com';

const CATEGORY_ORDER: GlossaryTerm['category'][] = [
  'methodology',
  'registry',
  'regulation',
  'market',
  'technical',
];

const CATEGORY_LABEL: Record<GlossaryTerm['category'], string> = {
  methodology: 'Methodologies',
  registry: 'Registries',
  regulation: 'Regulation',
  market: 'Market & frameworks',
  technical: 'Technical terms',
};

const CATEGORY_BLURB: Record<GlossaryTerm['category'], string> = {
  methodology:
    'Verra and CDM methodologies that govern how project credits are quantified and verified.',
  registry: 'National and international registries that issue and track carbon units.',
  regulation:
    'Indonesian legal instruments — presidential, ministerial, and agency-level — that shape the carbon market.',
  market:
    'Market frameworks, certification overlays, and the underlying activity classes traded as credits.',
  technical: 'Engineering and feedstock terms that show up in project documents.',
};

export const metadata: Metadata = {
  title: 'Glossary — Indonesian carbon-market terms',
  description:
    "VM0007, SRN-PPI, POME, Permenhut — plain-language definitions of the methodologies, registries, and regulations that shape Indonesia's carbon market.",
  alternates: { canonical: '/glossary' },
  openGraph: {
    title: 'Glossary — Indonesian carbon-market terms',
    description:
      "Plain-language definitions of the methodologies, registries, and regulations that shape Indonesia's carbon market.",
    url: '/glossary',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Glossary — Indonesian carbon-market terms',
    description:
      "Plain-language definitions of the methodologies, registries, and regulations that shape Indonesia's carbon market.",
  },
};

export default function GlossaryIndexPage() {
  const terms = listTerms();
  const grouped = new Map<GlossaryTerm['category'], GlossaryTerm[]>();
  for (const t of terms) {
    const arr = grouped.get(t.category) ?? [];
    arr.push(t);
    grouped.set(t.category, arr);
  }

  // ── Schemas ────────────────────────────────────────────────────────────────
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${BASE}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Glossary',
        item: `${BASE}/glossary`,
      },
    ],
  };

  const definedTermSetSchema = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'KarbonLens glossary',
    url: `${BASE}/glossary`,
    description:
      "Plain-language definitions of the methodologies, registries, regulations, and market terms that appear across KarbonLens project pages.",
    hasDefinedTerm: GLOSSARY.map((t) => ({
      '@type': 'DefinedTerm',
      name: t.term,
      description: t.short,
      url: `${BASE}/glossary/${t.slug}`,
      ...(t.aliases ? { alternateName: t.aliases } : {}),
      termCode: t.term,
    })),
  };

  return (
    <main className="kl-page">
      <article style={{ maxWidth: 880, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 className="kl-page-title">
            Glossary — Indonesian carbon-market terms
          </h1>
          <p
            style={{
              marginTop: 12,
              maxWidth: 640,
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--text-2)',
            }}
          >
            Plain-language definitions of the methodologies, registries,
            regulations, and market terms that appear across KarbonLens
            project pages. Updated as the market evolves.
          </p>
        </header>

        {CATEGORY_ORDER.map((cat) => {
          const items = grouped.get(cat);
          if (!items || items.length === 0) return null;
          return (
            <section key={cat} style={{ marginBottom: 36 }}>
              <h2
                style={{
                  fontSize: 18,
                  letterSpacing: '-0.1px',
                  margin: '0 0 4px',
                }}
              >
                {CATEGORY_LABEL[cat]}
              </h2>
              <p
                className="kl-muted"
                style={{ margin: '0 0 16px', fontSize: 13 }}
              >
                {CATEGORY_BLURB[cat]}
              </p>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: 12,
                }}
              >
                {items.map((t) => (
                  <li key={t.slug}>
                    <Link
                      href={`/glossary/${t.slug}`}
                      className="kl-card"
                      style={{
                        display: 'block',
                        textDecoration: 'none',
                        color: 'inherit',
                        height: '100%',
                      }}
                    >
                      <p
                        className="kl-section-label"
                        style={{ marginBottom: 6 }}
                      >
                        {cat}
                      </p>
                      <p
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          margin: '0 0 6px',
                          color: 'var(--text)',
                        }}
                      >
                        {t.term}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: 'var(--text-2)',
                        }}
                      >
                        {t.short}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </article>

      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <JsonLd data={definedTermSetSchema} id="ld-definedtermset" />
    </main>
  );
}
