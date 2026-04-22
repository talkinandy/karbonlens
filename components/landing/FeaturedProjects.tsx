/**
 * components/landing/FeaturedProjects.tsx — T18 landing "Featured projects"
 * grid.
 *
 * Pure presentational server component. Receives the static three-project
 * allow-list (Katingan, Rimba Raya, Sumatra Merang) resolved from real DB
 * rows by `getLandingStats`. If the DB is down the array is empty and we
 * render a placeholder message per spec §7 edge case (ii).
 */

import Link from 'next/link';
import type { FeaturedProject } from '@/lib/queries/landing-stats';

export type FeaturedProjectsProps = {
  projects: FeaturedProject[];
};

export function FeaturedProjects({ projects }: FeaturedProjectsProps) {
  return (
    <section>
      <p className="kl-section-label">Featured projects</p>
      {projects.length === 0 ? (
        <div className="kl-card">
          <p className="kl-page-subtitle" style={{ margin: 0 }}>
            Featured projects coming soon.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {projects.map((p) => {
            const registriesShort = p.registryNames.length
              ? p.registryNames.join(' · ')
              : '—';
            const primaryRegistry = p.registryNames[0] ?? null;
            const subtitle = [p.developer, p.province]
              .filter((x): x is string => Boolean(x))
              .join(' · ');

            return (
              <Link
                key={p.slug}
                href={`/projects/${p.slug}`}
                className="kl-card"
                style={{ display: 'block' }}
              >
                <p className="kl-stat-label">{registriesShort}</p>
                <p
                  style={{
                    fontFamily:
                      'var(--font-instrument-serif), Georgia, serif',
                    fontSize: 22,
                    margin: '8px 0 4px',
                  }}
                >
                  {p.nameCanonical}
                </p>
                <p className="kl-page-subtitle">{subtitle || '—'}</p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 16,
                    gap: 8,
                  }}
                >
                  <div>
                    <p className="kl-stat-label">Integrity score</p>
                    <p
                      className="kl-stat-value tnum"
                      style={{ fontSize: 20 }}
                    >
                      {p.integrityScore === null
                        ? '—'
                        : Math.round(p.integrityScore)}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p className="kl-stat-label">Primary registry</p>
                    <p
                      className="kl-stat-value tnum"
                      style={{ fontSize: 20 }}
                    >
                      {primaryRegistry ?? '—'}
                    </p>
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
