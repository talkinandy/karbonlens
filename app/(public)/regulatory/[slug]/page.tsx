/**
 * app/(public)/regulatory/[slug]/page.tsx — per-regulation detail (T31).
 *
 * Public, server-rendered. Lives in the (public) route group so there is no
 * auth gate; the timeline at /regulatory is in (app) but the detail pages
 * here are open to crawlers and unauthenticated visitors. Mirrors the
 * pattern established by /methodology.
 *
 * Data layer: `getRegulatoryEventBySlug` runs a single COALESCE/LOWER/REPLACE
 * lookup keyed on the same slug formula used in `app/sitemap.ts`. Null →
 * `notFound()`.
 *
 * Three JSON-LD blocks emitted at the foot of <main>:
 *   - Article (with GovernmentOrganization author when ministry is present)
 *   - BreadcrumbList (Home → Regulatory → {docType docNumber})
 *   - FAQPage (4 server-derived Q/A pairs, see `buildFaqs`)
 *
 * Styling: this page deliberately does NOT touch app/globals.css — the T30
 * description-styling agent owns that file in parallel. Inline styles plus a
 * single dedicated `.kl-reg-tldr` className (project-wide CSS will pick it
 * up later if/when added).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/seo/JsonLd';
import {
  getRegulatoryEventBySlug,
  type RegulatoryDetail,
} from '@/lib/queries/regulatory-detail';

type Props = {
  params: Promise<{ slug: string }>;
};

const BASE = 'https://karbonlens.com';

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Format an ISO 'YYYY-MM-DD' date as e.g. "12 March 2026" without any TZ
 * coercion (mirrors the manual parsing in TimelineCard).
 */
function formatDateLong(iso: string): string {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Status string derived purely from event_date vs today. Matches what the
 * Key Facts table renders.
 */
function effectiveStatus(eventDateISO: string, isUpcoming: boolean): string {
  if (isUpcoming) return 'Upcoming (forecast)';
  return eventDateISO > todayISO() ? 'Upcoming' : 'Effective';
}

function firstSentence(s: string): string {
  // Stop at the first '.', '?', or '!' followed by whitespace or end-of-string.
  const m = s.match(/^([^.!?]+[.!?])(\s|$)/);
  return (m ? m[1] : s).trim();
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

function docHeading(d: RegulatoryDetail): string {
  const parts = [d.documentType, d.documentNumber].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' ') : d.title;
}

function buildFaqs(d: RegulatoryDetail): { q: string; a: string }[] {
  const heading = docHeading(d);
  const summary = d.summaryEn ?? d.summaryId ?? d.title;
  const dateLong = formatDateLong(d.eventDate);
  const status = effectiveStatus(d.eventDate, d.isUpcoming);

  return [
    {
      q: `What is ${heading}?`,
      a: firstSentence(summary),
    },
    {
      q: 'Who issued it?',
      a: d.ministry
        ? `${d.ministry} (Government of Indonesia).`
        : 'Issuer not recorded.',
    },
    {
      q: 'When did it take effect?',
      a: `${dateLong} — ${status}.`,
    },
    {
      q: 'Where can I read the full text?',
      a: d.documentUrl
        ? d.documentUrl
        : 'The official document is not publicly linked yet.',
    },
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getRegulatoryEventBySlug(slug);
  if (!detail) return {};

  const heading = docHeading(detail);
  const title = `${heading}: ${detail.title} · Indonesian carbon regulation`;
  const description = detail.summaryEn
    ? truncate(detail.summaryEn, 160)
    : truncate(detail.title, 160);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/regulatory/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: { canonical: `/regulatory/${slug}` },
  };
}

export default async function RegulatoryDetailPage({ params }: Props) {
  const { slug } = await params;
  const detail = await getRegulatoryEventBySlug(slug);
  if (!detail) {
    notFound();
  }

  const heading = docHeading(detail);
  const dateLong = formatDateLong(detail.eventDate);
  const status = effectiveStatus(detail.eventDate, detail.isUpcoming);
  const faqs = buildFaqs(detail);

  // ── Schemas ──────────────────────────────────────────────────────────────
  const articleSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${heading}: ${detail.title}`,
    datePublished: detail.eventDate,
    dateModified: detail.eventDate,
    author: detail.ministry
      ? {
          '@type': 'GovernmentOrganization',
          name: detail.ministry,
        }
      : {
          '@type': 'Organization',
          name: 'KarbonLens',
        },
    publisher: {
      '@type': 'Organization',
      name: 'KarbonLens',
      url: 'https://karbonlens.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://karbonlens.com/brand/karbonlens-mark.svg',
      },
    },
    articleSection: 'Carbon regulation',
    inLanguage: 'en',
    url: `${BASE}/regulatory/${slug}`,
  };
  if (detail.summaryEn) {
    articleSchema.description = truncate(detail.summaryEn, 300);
  }
  if (detail.tags.length > 0) {
    articleSchema.keywords = detail.tags.join(', ');
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
        name: 'Regulatory',
        item: `${BASE}/regulatory`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: heading,
        item: `${BASE}/regulatory/${slug}`,
      },
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="kl-page">
      <article style={{ maxWidth: 760, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <p
            className="kl-section-label"
            style={{ marginBottom: 8 }}
          >
            <Link
              href="/regulatory"
              style={{
                color: 'var(--text-3)',
                textDecoration: 'none',
              }}
            >
              ← Regulatory timeline
            </Link>
          </p>
          <h1 className="kl-page-title" style={{ marginBottom: 8 }}>
            {heading}
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-instrument-serif), Georgia, serif',
              fontSize: 22,
              lineHeight: 1.35,
              fontStyle: 'italic',
              color: 'var(--text-2)',
              margin: '0 0 16px',
            }}
          >
            {detail.title}
          </p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 4,
            }}
          >
            {detail.ministry ? (
              <span className="kl-pill kl-pill--neutral">
                {detail.ministry}
              </span>
            ) : null}
            {detail.importance ? (
              <span className="kl-pill kl-pill--info">
                {detail.importance}
              </span>
            ) : null}
            {detail.tags.map((t) => (
              <span key={t} className="kl-pill kl-pill--neutral">
                {t}
              </span>
            ))}
          </div>
        </header>

        {detail.summaryEn ? (
          <section
            className="kl-reg-tldr"
            style={{
              border: '0.5px solid var(--border)',
              borderLeft: '4px solid var(--info-fg)',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '18px 20px',
              marginBottom: 28,
              background: 'var(--surface, transparent)',
            }}
          >
            <p
              className="kl-section-label"
              style={{ marginBottom: 8 }}
            >
              TL;DR
            </p>
            <p
              style={{
                fontFamily:
                  'var(--font-instrument-serif), Georgia, serif',
                fontSize: 18,
                lineHeight: 1.5,
                color: 'var(--text)',
                margin: 0,
              }}
            >
              {detail.summaryEn}
            </p>
          </section>
        ) : null}

        <section style={{ marginBottom: 28 }}>
          <p className="kl-section-label" style={{ marginBottom: 12 }}>
            Key facts
          </p>
          <dl
            className="kl-reg-facts"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(140px, 1fr) 2fr',
              gap: '8px 16px',
              margin: 0,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <dt style={{ color: 'var(--text-3)' }}>Ministry</dt>
            <dd style={{ margin: 0, color: 'var(--text)' }}>
              {detail.ministry ?? '—'}
            </dd>

            <dt style={{ color: 'var(--text-3)' }}>Document type</dt>
            <dd style={{ margin: 0, color: 'var(--text)' }}>
              {detail.documentType ?? '—'}
            </dd>

            <dt style={{ color: 'var(--text-3)' }}>Document number</dt>
            <dd style={{ margin: 0, color: 'var(--text)' }}>
              {detail.documentNumber ?? '—'}
            </dd>

            <dt style={{ color: 'var(--text-3)' }}>Event date</dt>
            <dd style={{ margin: 0, color: 'var(--text)' }}>
              <time dateTime={detail.eventDate}>{dateLong}</time>
            </dd>

            <dt style={{ color: 'var(--text-3)' }}>Importance</dt>
            <dd style={{ margin: 0, color: 'var(--text)' }}>
              {detail.importance ?? '—'}
            </dd>

            <dt style={{ color: 'var(--text-3)' }}>Status</dt>
            <dd style={{ margin: 0, color: 'var(--text)' }}>{status}</dd>
          </dl>
        </section>

        {detail.summaryEn ? (
          <section style={{ marginBottom: 28 }}>
            <p className="kl-section-label" style={{ marginBottom: 8 }}>
              Summary (English)
            </p>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.65,
                color: 'var(--text)',
                margin: 0,
              }}
            >
              {detail.summaryEn}
            </p>
          </section>
        ) : null}

        {detail.summaryId ? (
          <section style={{ marginBottom: 28 }}>
            <p className="kl-section-label" style={{ marginBottom: 8 }}>
              Ringkasan (Bahasa Indonesia)
            </p>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.65,
                color: 'var(--text)',
                margin: 0,
              }}
            >
              {detail.summaryId}
            </p>
          </section>
        ) : null}

        <section style={{ marginBottom: 28 }}>
          <p className="kl-section-label" style={{ marginBottom: 8 }}>
            Primary source
          </p>
          {detail.documentUrl ? (
            <a
              href={detail.documentUrl}
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
              View the official document →
            </a>
          ) : (
            <p
              className="kl-muted"
              style={{ margin: 0, fontSize: 13 }}
            >
              The official document is not publicly linked yet.
            </p>
          )}
        </section>

        <section style={{ marginBottom: 28 }}>
          <p className="kl-section-label" style={{ marginBottom: 12 }}>
            FAQ
          </p>
          <dl style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {faqs.map((f) => (
              <div key={f.q} style={{ marginBottom: 14 }}>
                <dt
                  style={{
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 4,
                  }}
                >
                  {f.q}
                </dt>
                <dd
                  style={{
                    margin: 0,
                    color: 'var(--text-2)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {f.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </article>

      <JsonLd data={articleSchema} id="ld-article" />
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <JsonLd data={faqSchema} id="ld-faq" />
    </main>
  );
}
