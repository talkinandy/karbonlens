/**
 * app/(public)/page.tsx — public landing (T25 redesign).
 *
 * Editorial dark split-hero with a live MapLibre view of the Katingan
 * Peatland project on the right, a six-item live-data ticker, four data
 * pipeline cards, featured projects grid, "Built for" persona cards, and
 * a data-freshness footer strip.
 *
 * Route remains dynamic — `auth()` reads the session cookie so the hero
 * primary CTA can branch between "Open the terminal →" and "Open your
 * dashboard →" (AC-8). The `revalidate` export below is a CDN
 * `stale-while-revalidate` hint; Next.js does not enable ISR on dynamic
 * routes (see T25 spec §2, N-2 audit note).
 *
 * Data layer: `getLandingStats()` (T18 + T25 extensions) and
 * `getLandingMapData()` (T25) run in parallel. Both catch internally and
 * fall through to zeroed / undefined structures if the DB is down — the
 * page never returns HTTP 500.
 *
 * Metadata: NOT declared here. T26 owns `generateMetadata` / `export const
 * metadata` for this route.
 */

import { auth } from '@/lib/auth';
import {
  getLandingStats,
  isLikelyDbDown,
} from '@/lib/queries/landing-stats';
import { getLandingMapData } from '@/lib/queries/landing-map';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturedProjects } from '@/components/landing/FeaturedProjects';
import { DataFreshness } from '@/components/landing/DataFreshness';
import { Ticker } from '@/components/landing/Ticker';
import { PipelinesGrid } from '@/components/landing/PipelinesGrid';
import { RolesGrid } from '@/components/landing/RolesGrid';
import LandingHeroMap from '@/components/landing/LandingHeroMap';

// CDN cache hint — Next.js App Router leaves the route fully dynamic
// because auth() reads request cookies. See T25 spec §2.
export const revalidate = 600;

// Katingan Peatland hero centre — lon, lat.
const KATINGAN_CENTER: [number, number] = [113.2, -1.8];
const KATINGAN_ZOOM = 9;

export default async function LandingPage() {
  const [stats, mapData, session] = await Promise.all([
    getLandingStats(),
    getLandingMapData(),
    auth(),
  ]);

  const dbDown = isLikelyDbDown(stats);

  return (
    <main>
      {/* ============ HERO ============ */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <HeroSection session={session} stats={stats} />

          <div className="lp-hero-right">
            <LandingHeroMap
              center={KATINGAN_CENTER}
              zoom={KATINGAN_ZOOM}
              centroid={mapData.katinganCentroid}
              alerts={mapData.alerts}
              buffer={mapData.katinganBuffer}
            />
            <div className="lp-hero-caption">
              Live monitoring ·{' '}
              <span className="mono">
                Katingan Peatland, Central Kalimantan
              </span>{' '}
              · {mapData.katinganAlerts90d.toLocaleString('en-US')} satellite
              alerts in last 90 days
            </div>
          </div>
        </div>
      </section>

      {dbDown ? (
        <div
          role="status"
          style={{
            maxWidth: 1320,
            margin: '0 auto',
            padding: '12px 32px',
            background: 'var(--warning-bg)',
            color: 'var(--warning-fg)',
            fontSize: 13,
          }}
        >
          We couldn&apos;t reach the database to load live stats. Showing
          zeroed placeholders — refresh the page to retry.
        </div>
      ) : null}

      {/* ============ TICKER ============ */}
      <Ticker stats={stats} />

      {/* ============ FOUR DATA PIPELINES ============ */}
      <PipelinesGrid stats={stats} />

      {/* ============ FEATURED PROJECTS ============ */}
      <FeaturedProjects
        projects={stats.featuredProjects}
        totalCount={stats.projectCount}
      />

      {/* ============ BUILT FOR ============ */}
      <RolesGrid />

      {/* ============ FRESHNESS FOOTER ============ */}
      <DataFreshness
        registriesLastSynced={stats.registriesLastSynced}
        satelliteLastIngested={stats.satelliteLastIngested}
        idxLastScraped={stats.idxLastScraped}
      />
    </main>
  );
}
