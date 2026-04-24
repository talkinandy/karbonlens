/**
 * app/(public)/news/page.tsx — weekly wrap index (T33 Phase 4B).
 *
 * Server-rendered list of every `news_posts` row in reverse-chronological
 * order. Posts are written out-of-band by the Monday 06:00 UTC cron
 * (`scripts/publish-weekly-wrap.ts`); this route is read-only.
 *
 * Styling reuses classes from `app/globals.css` — this file adds none.
 * Empty DBs (no migration 007, or the first Monday has not yet run) are
 * handled by `listNewsPosts` returning `[]`; we render a muted empty-state
 * card rather than 500.
 *
 * JSON-LD emitted: BreadcrumbList, CollectionPage (ItemList of the 25
 * newest posts), Blog (with up to 10 BlogPosting entries). Mirrors the
 * three-block pattern used by `/regulatory/[slug]`.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { JsonLd } from '@/components/seo/JsonLd';
import { listNewsPosts, type NewsPost } from '@/lib/queries/news';

const BASE = 'https://karbonlens.com';

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatDateShort(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = MONTHS_SHORT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export const metadata: Metadata = {
  title: 'News — Indonesian carbon market weekly wrap',
  description:
    'Weekly KarbonLens analysis of Indonesian carbon-market movements — issuances, satellite alerts, regulatory updates, and IDXCarbon prices.',
  openGraph: {
    title: 'News — Indonesian carbon market weekly wrap',
    description:
      'Weekly KarbonLens analysis of Indonesian carbon-market movements — issuances, satellite alerts, regulatory updates, and IDXCarbon prices.',
    url: '/news',
  },
  alternates: { canonical: '/news' },
};

export const revalidate = 3600;

export default async function NewsIndexPage() {
  const posts: NewsPost[] = await listNewsPosts(200);

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
        name: 'News',
        item: `${BASE}/news`,
      },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'KarbonLens weekly wrap',
    url: `${BASE}/news`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.slice(0, 25).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${BASE}/news/${p.slug}`,
        name: p.title,
      })),
    },
  };

  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'KarbonLens weekly wrap',
    url: `${BASE}/news`,
    publisher: {
      '@type': 'Organization',
      name: 'KarbonLens',
    },
    blogPost: posts.slice(0, 10).map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${BASE}/news/${p.slug}`,
      datePublished: p.publishedAt.toISOString(),
      description: p.summary,
    })),
  };

  return (
    <main className="kl-page">
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <header className="kl-page-header">
          <div>
            <h1 className="kl-page-title">
              Indonesia carbon market — weekly wrap
            </h1>
            <p
              className="kl-muted"
              style={{ marginTop: 8, maxWidth: 620, lineHeight: 1.5 }}
            >
              Every Monday: issuances, alerts, regulations, and price ticks
              from Indonesia&apos;s carbon market — compiled deterministically
              from the week&apos;s data refresh.
            </p>
          </div>
        </header>

        {posts.length === 0 ? (
          <div className="kl-card" style={{ textAlign: 'center' }}>
            <p className="kl-muted" style={{ margin: 0 }}>
              No posts yet. First wrap publishes after the next Monday data
              refresh.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {posts.map((p) => (
              <article key={p.id} className="kl-card">
                <p
                  className="kl-section-label"
                  style={{ marginBottom: 8 }}
                >
                  <time dateTime={p.publishedAt.toISOString()}>
                    {formatDateShort(p.publishedAt)}
                  </time>
                </p>
                <h2
                  style={{
                    fontFamily:
                      'var(--font-instrument-serif), Georgia, serif',
                    fontSize: 22,
                    fontWeight: 400,
                    lineHeight: 1.3,
                    margin: '0 0 8px',
                    letterSpacing: '-0.2px',
                  }}
                >
                  <Link
                    href={`/news/${p.slug}`}
                    style={{
                      color: 'var(--text)',
                      textDecoration: 'none',
                    }}
                  >
                    {p.title}
                  </Link>
                </h2>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'var(--text-2)',
                    margin: '0 0 12px',
                  }}
                >
                  {p.summary}
                </p>
                <Link
                  href={`/news/${p.slug}`}
                  style={{
                    fontFamily:
                      'var(--font-plex-mono), ui-monospace, monospace',
                    fontSize: 12,
                    color: 'var(--info-fg)',
                    textDecoration: 'none',
                  }}
                >
                  Read the wrap →
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>

      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <JsonLd data={collectionSchema} id="ld-collection" />
      <JsonLd data={blogSchema} id="ld-blog" />
    </main>
  );
}
