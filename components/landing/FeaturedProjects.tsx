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

/**
 * Seeded pseudo-random generator — same slug always renders the same
 * thumbnail. Lightweight FNV-1a hash + LCG.
 */
function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function seededRand(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

/** Score-bucket palette. Reuses chart tokens from the design brief. */
function paletteForScore(score: number | null): {
  gradFrom: string;
  gradMid: string;
  gradTo: string;
  polyStroke: string;
  polyFill: string;
} {
  const s = score ?? 50;
  if (s >= 80)
    return {
      gradFrom: '#12332a',
      gradMid: '#1D9E75',
      gradTo: '#0F6E56',
      polyStroke: '#4FB89C',
      polyFill: 'rgba(79,184,156,0.14)',
    };
  if (s >= 60)
    return {
      gradFrom: '#112537',
      gradMid: '#1d5a85',
      gradTo: '#185FA5',
      polyStroke: '#7FBEEB',
      polyFill: 'rgba(127,190,235,0.14)',
    };
  if (s >= 40)
    return {
      gradFrom: '#382315',
      gradMid: '#7a4a17',
      gradTo: '#854F0B',
      polyStroke: '#D8A563',
      polyFill: 'rgba(216,165,99,0.14)',
    };
  return {
    gradFrom: '#3a1818',
    gradMid: '#8a2f2f',
    gradTo: '#A32D2D',
    polyStroke: '#E89C9C',
    polyFill: 'rgba(232,156,156,0.14)',
  };
}

/**
 * Deterministic per-project satellite-thumbnail stand-in. Derives:
 *   - gradient palette from integrityScore bucket
 *   - polygon boundary geometry from a slug-seeded PRNG
 *   - alert-dot count (2–5) and positions from the same seed
 * Every card renders a visually-distinct image. T25 v0.1 stand-in for a
 * real satellite tile; v0.2 follow-up replaces with cached satellite
 * thumbs (ROADMAP item).
 */
function PlaceholderThumb({
  slug,
  score,
}: {
  slug: string;
  score: number | null;
}) {
  const gradId = `lfg-${slug}`;
  const rand = seededRand(hashSlug(slug));
  const pal = paletteForScore(score);

  // Deterministic polygon with 7 points on a rough ellipse with jitter.
  const cx = 100,
    cy = 60;
  const rx = 60,
    ry = 30;
  const points: [number, number][] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.3;
    const jitter = 0.8 + rand() * 0.45;
    points.push([
      cx + Math.cos(angle) * rx * jitter,
      cy + Math.sin(angle) * ry * jitter,
    ]);
  }
  const polygonPath =
    'M ' + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ') + ' Z';

  // 2–5 alert dots, deterministic inside the polygon rough bounds.
  const dotCount = 2 + Math.floor(rand() * 4);
  const dots = Array.from({ length: dotCount }, () => {
    const t = rand();
    const u = rand();
    const angle = t * Math.PI * 2;
    const r = Math.sqrt(u);
    return {
      x: cx + Math.cos(angle) * rx * 0.55 * r,
      y: cy + Math.sin(angle) * ry * 0.55 * r,
      hi: rand() > 0.35,
    };
  });

  // River-ish curve with a slug-seeded phase shift.
  const phase = rand() * 40;
  const curveD = `M -10 ${70 + phase * 0.2} C 40 ${55 + phase * 0.3}, 90 ${85 - phase * 0.2}, 140 ${65 + phase * 0.15} S 210 ${70 + phase * 0.1}, 220 ${75 + phase * 0.1}`;

  // Two background shadow blobs, position-jittered.
  const shadow1 = { cx: 30 + rand() * 60, cy: 20 + rand() * 40, r: 28 + rand() * 16 };
  const shadow2 = { cx: 130 + rand() * 50, cy: 70 + rand() * 30, r: 30 + rand() * 18 };

  return (
    <svg
      viewBox="0 0 200 120"
      preserveAspectRatio="xMidYMid slice"
      className="lp-feat-svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={pal.gradFrom} />
          <stop offset="0.5" stopColor={pal.gradMid} />
          <stop offset="1" stopColor={pal.gradTo} />
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill={`url(#${gradId})`} />
      <circle cx={shadow1.cx} cy={shadow1.cy} r={shadow1.r} fill="rgba(0,0,0,0.22)" />
      <circle cx={shadow2.cx} cy={shadow2.cy} r={shadow2.r} fill="rgba(0,0,0,0.18)" />
      <path
        d={curveD}
        stroke="#224a62"
        strokeWidth="3"
        fill="none"
        opacity="0.85"
      />
      <path d={polygonPath} fill={pal.polyFill} stroke={pal.polyStroke} strokeWidth="1.3" />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x.toFixed(1)}
          cy={d.y.toFixed(1)}
          r={d.hi ? 2.6 : 2}
          fill={d.hi ? '#E2625B' : '#F0B04E'}
        />
      ))}
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
                  <PlaceholderThumb slug={p.slug} score={p.integrityScore} />
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
