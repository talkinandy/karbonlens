/**
 * components/landing/FeaturedProjects.tsx — T25 "Featured projects" grid.
 *
 * Renders the three flagship projects (Katingan, Rimba Raya, Sumatra Merang)
 * as `.lp-feat` editorial cards in a 3-column grid (2-col at <= 1100 px,
 * 1-col at <= 640 px — see globals.css media queries). Each card is a
 * `<Link>` to `/projects/{slug}` and contains:
 *   - Thumbnail with an SVG placeholder (boundary polygon + alert dots) —
 *     T26 replaces this with a real satellite image per story spec.
 *   - Type chip (projectType or "REDD+").
 *   - Name, meta line (developer · province), and a 3-stat row
 *     (Score / Status / Registry).
 *
 * Preserves the `FeaturedProject[]` prop interface that T18 established so
 * T26 can slot thumbnail URLs in later without breaking callers.
 *
 * Per T25 §3.4.
 */

import Link from 'next/link';
import type { FeaturedProject } from '@/lib/queries/landing-stats';

export type FeaturedProjectsProps = {
  projects: FeaturedProject[];
  totalCount: number;
};

function PlaceholderThumb({ slug }: { slug: string }) {
  const gradId = `lfg-${slug}`;
  return (
    <svg
      viewBox="0 0 200 120"
      preserveAspectRatio="xMidYMid slice"
      className="lp-feat-svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f3a2c" />
          <stop offset="0.5" stopColor="#2d5a3a" />
          <stop offset="1" stopColor="#26463a" />
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill={`url(#${gradId})`} />
      <circle cx="50" cy="30" r="30" fill="rgba(0,0,0,0.2)" />
      <circle cx="160" cy="90" r="35" fill="rgba(0,0,0,0.18)" />
      <path
        d="M -10 70 C 40 55, 90 85, 140 65 S 210 70, 220 75"
        stroke="#224a62"
        strokeWidth="3"
        fill="none"
        opacity="0.85"
      />
      <path
        d="M 30 45 L 70 30 L 120 35 L 160 45 L 175 75 L 150 100 L 100 95 L 60 95 L 30 80 Z"
        fill="rgba(79,184,156,0.12)"
        stroke="#4FB89C"
        strokeWidth="1.2"
      />
      <circle cx="80" cy="55" r="2.5" fill="#E2625B" />
      <circle cx="115" cy="62" r="2.5" fill="#E2625B" />
      <circle cx="140" cy="78" r="2" fill="#F0B04E" />
    </svg>
  );
}

export function FeaturedProjects({
  projects,
  totalCount,
}: FeaturedProjectsProps) {
  return (
    <section className="lp-section">
      <div className="lp-section-head">
        <div>
          <div className="lp-eyebrow">Featured projects</div>
          <h2 className="lp-h2">Under the lens, right now.</h2>
        </div>
        <Link href="/projects" className="lp-section-link">
          Browse all {totalCount.toLocaleString('en-US')} →
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="kl-card">
          <p className="kl-page-subtitle" style={{ margin: 0 }}>
            Featured projects coming soon.
          </p>
        </div>
      ) : (
        <div className="lp-featured-grid">
          {projects.map((p) => {
            const chipText =
              (p.projectType && p.projectType.trim()) || 'REDD+';
            const meta = [p.developer, p.province]
              .filter((x): x is string => Boolean(x))
              .join(' · ');
            const scoreText =
              p.integrityScore === null
                ? '—'
                : String(Math.round(p.integrityScore));
            const statusText = p.projectType ? 'Active' : '—';
            const registryText =
              p.registryNames.length > 0 ? p.registryNames[0] : '—';

            return (
              <Link
                key={p.slug}
                href={`/projects/${p.slug}`}
                className="lp-feat"
              >
                <div className="lp-feat-thumb">
                  <PlaceholderThumb slug={p.slug} />
                  <div className="lp-feat-chip">{chipText}</div>
                </div>
                <div className="lp-feat-body">
                  <div className="lp-feat-name">{p.nameCanonical}</div>
                  <div className="lp-feat-meta">{meta || '—'}</div>
                  <div className="lp-feat-row">
                    <div>
                      <div className="lp-feat-stat-l">Score</div>
                      <div className="lp-feat-stat-v">{scoreText}</div>
                    </div>
                    <div>
                      <div className="lp-feat-stat-l">Status</div>
                      <div className="lp-feat-stat-v">{statusText}</div>
                    </div>
                    <div>
                      <div className="lp-feat-stat-l">Registry</div>
                      <div className="lp-feat-stat-v mono">{registryText}</div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
