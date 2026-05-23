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
 * Metadata: `export const metadata` (T26) declared below after imports.
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';

import {
  getLandingStats,
  isLikelyDbDown,
} from '@/lib/queries/landing-stats';
import { getLandingMapData } from '@/lib/queries/landing-map';
import { HeroSection } from '@/components/landing/HeroSection';
import { HeroCtaSlot, HeroCtaFallback } from '@/components/landing/HeroCtaSlot';
import { FeaturedProjects } from '@/components/landing/FeaturedProjects';
import { DataFreshness } from '@/components/landing/DataFreshness';
import { Ticker } from '@/components/landing/Ticker';
import { PipelinesGrid } from '@/components/landing/PipelinesGrid';
import { RolesGrid } from '@/components/landing/RolesGrid';
import LandingHeroMap from '@/components/landing/LandingHeroMap';

// SEO Phase 1: the auth-aware hero CTA is wrapped in <Suspense fallback={
// <HeroCtaFallback />}> so crawlers index the guest CTA first. This route
// is structurally ready for a Next 16 cacheComponents rollout; until that
// flips on, public caching is handled at the nginx layer (see runbook §5).
export const revalidate = 600;

// Katingan Peatland hero centre — lon, lat.
const KATINGAN_CENTER: [number, number] = [113.2, -1.8];
const KATINGAN_ZOOM = 9;

// T26 — landing-page metadata. `title` uses the full string (not just
// "KarbonLens") so the `%s · KarbonLens` template in app/layout.tsx is bypassed
// and the OG title matches the landing hero.
export const metadata: Metadata = {
  title: "KarbonLens — Indonesia's carbon market, in one terminal",
  description:
    'Satellite MRV, prices, reversal alerts, and regulatory tracking — unified across Verra, SRN-PPI, Gold Standard, and IDXCarbon.',
  openGraph: {
    url: '/',
    title: "KarbonLens — Indonesia's carbon market, in one terminal",
    description:
      'Satellite MRV, prices, reversal alerts, and regulatory tracking — unified across Verra, SRN-PPI, Gold Standard, and IDXCarbon.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: "KarbonLens — Indonesia's carbon market, in one terminal",
      },
    ],
  },
  twitter: {
    title: "KarbonLens — Indonesia's carbon market, in one terminal",
    description:
      'Satellite MRV, prices, reversal alerts, and regulatory tracking — unified across Verra, SRN-PPI, Gold Standard, and IDXCarbon.',
    images: ['/og-image.png'],
  },
};

export default async function LandingPage() {
  const [stats, mapData] = await Promise.all([
    getLandingStats(),
    getLandingMapData(),
  ]);

  const dbDown = isLikelyDbDown(stats);

  const ctaSlot = (
    <Suspense fallback={<HeroCtaFallback />}>
      <HeroCtaSlot />
    </Suspense>
  );

  return (
    <main>
      {/* ============ HERO ============ */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <HeroSection ctaSlot={ctaSlot} stats={stats} />

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
