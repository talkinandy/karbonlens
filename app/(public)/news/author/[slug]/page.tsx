/**
 * app/(public)/news/author/[slug]/page.tsx — author profile (E-E-A-T, WS1).
 *
 * One page per named author (lib/authors.ts): bio, role, and their posts.
 * Gives every byline a real destination and a Person/ProfilePage JSON-LD
 * block — the "who's behind it" signal Google and AI answer engines weigh for
 * YMYL-adjacent market-intelligence content.
 *
 * Dynamic + ISR-cached (revalidate 3600), matching /news/[slug]: the (public)
 * layout reads cookies for auth, which breaks the SSG prerender path, so we do
 * not use generateStaticParams. Unknown slugs 404.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/seo/JsonLd';
import { AUTHORS, authorPath, type Author } from '@/lib/authors';
import { listNewsPostsByAuthor, type NewsPost } from '@/lib/queries/news';

type Props = {
  params: Promise<{ slug: string }>;
};

const BASE = 'https://karbonlens.com';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDateShort(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = MONTHS_SHORT[d.getUTCMonth()];
  return `${day} ${month} ${d.getUTCFullYear()}`;
}

function resolveAuthor(slug: string): Author | null {
  return Object.prototype.hasOwnProperty.call(AUTHORS, slug) ? AUTHORS[slug] : null;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const author = resolveAuthor(slug);
  if (!author) return {};
  const title = `${author.name} — ${author.jobTitle}`;
  return {
    title,
    description: author.bio,
    openGraph: { title, description: author.bio, url: authorPath(slug), type: 'profile' },
    twitter: { card: 'summary', title, description: author.bio },
    alternates: { canonical: authorPath(slug) },
  };
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  const author = resolveAuthor(slug);
  if (!author) {
    notFound();
  }

  const posts: NewsPost[] = await listNewsPostsByAuthor(author.slug, 100);

  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: author.name,
    jobTitle: author.jobTitle,
    description: author.bio,
    url: `${BASE}${authorPath(author.slug)}`,
    worksFor: { '@type': 'Organization', name: 'KarbonLens', url: BASE },
    ...(author.sameAs && author.sameAs.length > 0 ? { sameAs: author.sameAs } : {}),
  };

  const profileSchema = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: personSchema,
    url: `${BASE}${authorPath(author.slug)}`,
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'News', item: `${BASE}/news` },
      {
        '@type': 'ListItem',
        position: 3,
        name: author.name,
        item: `${BASE}${authorPath(author.slug)}`,
      },
    ],
  };

  return (
    <main className="kl-page">
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <p className="kl-section-label" style={{ marginBottom: 12 }}>
            <Link href="/news" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>
              ← All posts
            </Link>
          </p>
          <h1 className="kl-page-title" style={{ marginBottom: 6 }}>
            {author.name}
          </h1>
          <p className="kl-muted" style={{ fontSize: 13, margin: '0 0 14px' }}>
            {author.jobTitle}
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-2)', margin: 0 }}>
            {author.bio}
          </p>
        </header>

        <h2
          className="kl-section-label"
          style={{ margin: '8px 0 12px' }}
        >
          {posts.length > 0
            ? `Posts by ${author.name}`
            : `No posts by ${author.name} yet`}
        </h2>

        {posts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {posts.map((p) => (
              <article key={p.id} className="kl-card">
                <p className="kl-section-label" style={{ marginBottom: 8 }}>
                  <time dateTime={p.publishedAt.toISOString()}>
                    {formatDateShort(p.publishedAt)}
                  </time>
                </p>
                <h3
                  style={{
                    fontFamily: 'var(--font-instrument-serif), Georgia, serif',
                    fontSize: 20,
                    fontWeight: 400,
                    lineHeight: 1.3,
                    margin: '0 0 8px',
                    letterSpacing: '-0.2px',
                  }}
                >
                  <Link
                    href={`/news/${p.slug}`}
                    style={{ color: 'var(--text)', textDecoration: 'none' }}
                  >
                    {p.title}
                  </Link>
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'var(--text-2)',
                    margin: 0,
                  }}
                >
                  {p.summary}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      <JsonLd data={profileSchema} id="ld-profile" />
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
    </main>
  );
}
