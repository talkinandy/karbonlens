/**
 * app/(public)/glossary/[term]/page.tsx — per-term glossary page (T32, Phase 3).
 *
 * Server component. Resolves the slug via `getTermBySlug` and 404s on miss.
 * Layout mirrors the regulatory detail page (T31): eyebrow + H1 + aliases
 * line + cream/green TL;DR card + paragraphed long explainer + authority
 * link + related-term pills.
 *
 * Four JSON-LD blocks:
 *   - DefinedTerm (with `inDefinedTermSet` pointing back at /glossary)
 *   - BreadcrumbList (Home → Glossary → {term})
 *   - Article (headline=term, articleBody=long, KarbonLens publisher)
 *   - FAQPage (2 server-derived Q/A pairs from short + last paragraph)
 *
 * `generateStaticParams` enumerates every term in the GLOSSARY array so
 * Next builds the static HTML at build time. No globals.css edits — reuses
 * `.kl-page`, `.kl-page-title`, `.kl-section-label`, `.kl-card`, `.kl-pill`,
 * `.kl-muted`, plus a small dedicated `.kl-glossary-tldr` className that
 * follows the same shape as `.kl-reg-tldr`.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/seo/JsonLd';
import {
  GLOSSARY,
  getTermBySlug,
  type GlossaryTerm,
} from '@/lib/data/glossary';

type Props = {
  params: Promise<{ term: string }>;
};

const BASE = 'https://karbonlens.com';

const CATEGORY_LABEL: Record<GlossaryTerm['category'], string> = {
  methodology: 'Methodology',
  registry: 'Registry',
  regulation: 'Regulation',
  market: 'Market',
  technical: 'Technical',
};

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

/**
 * Split the long explainer on blank lines into paragraphs. Empty input
 * returns a single-element array containing the empty string so the
 * caller can render it without a guard.
 */
function paragraphs(long: string): string[] {
  return long
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function lastParagraph(long: string): string {
  const parts = paragraphs(long);
  return parts[parts.length - 1] ?? long;
}

export async function generateStaticParams(): Promise<{ term: string }[]> {
  return GLOSSARY.map((t) => ({ term: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { term: slug } = await params;
  const t = getTermBySlug(slug);
  if (!t) return {};

  const title = truncate(`${t.term} — ${t.short}`, 70);
  const description = truncate(t.long.replace(/\s+/g, ' ').trim(), 160);

  return {
    title,
    description,
    alternates: { canonical: `/glossary/${t.slug}` },
    openGraph: {
      title,
      description,
      url: `/glossary/${t.slug}`,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function GlossaryTermPage({ params }: Props) {
  const { term: slug } = await params;
  const t = getTermBySlug(slug);
  if (!t) {
    notFound();
  }

  const paras = paragraphs(t.long);
  const last = lastParagraph(t.long);

  // Resolve related slugs to actual terms (silently drop any unknown
  // slug so a typo never crashes the render).
  const related =
    t.relatedTerms
      ?.map((rs) => getTermBySlug(rs))
      .filter((x): x is GlossaryTerm => x !== null) ?? [];

  // ── Schemas ────────────────────────────────────────────────────────────────
  const definedTermSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: t.term,
    description: t.short,
    url: `${BASE}/glossary/${t.slug}`,
    termCode: t.term,
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      name: 'KarbonLens glossary',
      url: `${BASE}/glossary`,
    },
  };
  if (t.aliases) definedTermSchema.alternateName = t.aliases;
  if (t.authoritySource) {
    definedTermSchema.sameAs = t.authoritySource.url;
  }

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
      {
        '@type': 'ListItem',
        position: 3,
        name: t.term,
        item: `${BASE}/glossary/${t.slug}`,
      },
    ],
  };

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: t.term,
    description: t.short,
    articleBody: t.long,
    inLanguage: 'en',
    url: `${BASE}/glossary/${t.slug}`,
    author: {
      '@type': 'Organization',
      name: 'KarbonLens',
      url: BASE,
    },
    publisher: {
      '@type': 'Organization',
      name: 'KarbonLens',
      url: BASE,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE}/brand/karbonlens-mark.svg`,
      },
    },
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What is ${t.term}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: t.short,
        },
      },
      {
        '@type': 'Question',
        name: 'How does it relate to Indonesian carbon markets?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: last,
        },
      },
    ],
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="kl-page">
      <article style={{ maxWidth: 760, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <p className="kl-section-label" style={{ marginBottom: 8 }}>
            <Link
              href="/glossary"
              style={{
                color: 'var(--text-3)',
                textDecoration: 'none',
              }}
            >
              ← Glossary
            </Link>
          </p>
          <p
            className="kl-section-label"
            style={{
              marginBottom: 6,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
              letterSpacing: '0.06em',
              color: 'var(--text-3)',
            }}
          >
            {CATEGORY_LABEL[t.category]}
          </p>
          <h1 className="kl-page-title" style={{ marginBottom: 8 }}>
            {t.term}
          </h1>
          {t.aliases && t.aliases.length > 0 ? (
            <p
              className="kl-muted"
              style={{ margin: '0 0 12px', fontSize: 13 }}
            >
              Also known as: {t.aliases.join(', ')}
            </p>
          ) : null}
        </header>

        <section
          className="kl-glossary-tldr"
          style={{
            border: '0.5px solid var(--border)',
            borderLeft: '4px solid var(--success-fg, #2f7a48)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '18px 20px',
            marginBottom: 28,
            background: 'var(--surface, transparent)',
          }}
        >
          <p className="kl-section-label" style={{ marginBottom: 8 }}>
            TL;DR
          </p>
          <p
            style={{
              fontFamily: 'var(--font-instrument-serif), Georgia, serif',
              fontSize: 18,
              lineHeight: 1.5,
              color: 'var(--text)',
              margin: 0,
            }}
          >
            {t.short}
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <p className="kl-section-label" style={{ marginBottom: 12 }}>
            Full explainer
          </p>
          {paras.map((p, i) => (
            <p
              key={i}
              style={{
                fontSize: 15,
                lineHeight: 1.65,
                color: 'var(--text)',
                margin: '0 0 14px',
              }}
            >
              {p}
            </p>
          ))}
        </section>

        {t.authoritySource ? (
          <section style={{ marginBottom: 28 }}>
            <p className="kl-section-label" style={{ marginBottom: 8 }}>
              Authoritative source
            </p>
            <a
              href={t.authoritySource.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily:
                  'var(--font-plex-mono), ui-monospace, monospace',
                fontSize: 13,
                color: 'var(--info-fg)',
                textDecoration: 'underline',
                overflowWrap: 'anywhere',
              }}
            >
              {t.authoritySource.title} →
            </a>
          </section>
        ) : null}

        {related.length > 0 ? (
          <section style={{ marginBottom: 28 }}>
            <p className="kl-section-label" style={{ marginBottom: 8 }}>
              Related terms
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {related.map((rt) => (
                <li key={rt.slug}>
                  <Link
                    href={`/glossary/${rt.slug}`}
                    className="kl-pill kl-pill--neutral"
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    {rt.term}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>

      <JsonLd data={definedTermSchema} id="ld-definedterm" />
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <JsonLd data={articleSchema} id="ld-article" />
      <JsonLd data={faqSchema} id="ld-faq" />
    </main>
  );
}
