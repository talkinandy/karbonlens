/**
 * components/landing/LatestNews.tsx — "Latest" news section for the homepage.
 *
 * Surfaces the most recent news_posts (market reports, briefs, editorial) with
 * author bylines + links to /news, so the homepage actually exposes the content
 * the autopilot publishes (and gives those pages internal links for SEO).
 */

import Link from 'next/link';
import { getAuthor } from '@/lib/authors';
import type { NewsPost } from '@/lib/queries/news';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function LatestNews({ posts }: { posts: NewsPost[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="lp-section">
      <div className="lp-section-head">
        <div>
          <div className="lp-eyebrow">Latest</div>
          <h2 className="lp-h2">From the KarbonLens desk.</h2>
        </div>
        <Link href="/news" className="lp-section-link">
          All news →
        </Link>
      </div>

      <div className="lp-featured-grid">
        {posts.map((p) => (
          <Link
            key={p.id}
            href={`/news/${p.slug}`}
            className="kl-card"
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
          >
            <p className="kl-section-label" style={{ marginBottom: 8 }}>
              <time dateTime={p.publishedAt.toISOString()}>{fmtDate(p.publishedAt)}</time>
              {' · By '}
              {getAuthor(p.authorSlug).name}
            </p>
            <h3
              style={{
                fontFamily: 'var(--font-instrument-serif), Georgia, serif',
                fontSize: 20,
                fontWeight: 400,
                lineHeight: 1.3,
                margin: '0 0 8px',
                letterSpacing: '-0.2px',
                color: 'var(--text)',
              }}
            >
              {p.title}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-2)', margin: 0 }}>
              {p.summary}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
