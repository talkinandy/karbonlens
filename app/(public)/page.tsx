/**
 * app/(public)/page.tsx — public landing (T18).
 *
 * Route is dynamic because auth() reads the session cookie to branch the hero
 * CTA ("Open dashboard →" vs <SignInButton>). The ISR path would require
 * splitting the stats section into a client island that hydrates post-auth;
 * deferred to v0.2 if landing page load time becomes a concern.
 * See T18 spec §3.2 for the trade-off rationale.
 *
 * All hero numbers are live from the DB. The DB-down fallback returns a
 * zeroed `LandingStats`, which this page renders as "—" plus a banner.
 */

import { auth } from '@/lib/auth';
import {
  getLandingStats,
  isLikelyDbDown,
} from '@/lib/queries/landing-stats';
import { HeroSection } from '@/components/landing/HeroSection';
import { StatCard } from '@/components/landing/StatCard';
import { FeaturedProjects } from '@/components/landing/FeaturedProjects';
import { DataSources } from '@/components/landing/DataSources';

// Route is dynamic because auth() reads session cookie. See T18 spec §3.2 for the tradeoff.

export default async function LandingPage() {
  const [stats, session] = await Promise.all([getLandingStats(), auth()]);
  const dbDown = isLikelyDbDown(stats);

  return (
    <main className="kl-page">
      <HeroSection session={session} />

      {dbDown ? (
        <div
          className="kl-card"
          role="status"
          style={{
            background: 'var(--warning-bg)',
            color: 'var(--warning-fg)',
            border: 'none',
            marginBottom: 24,
          }}
        >
          We couldn&apos;t reach the database to load live stats. Showing
          zeroed placeholders — refresh the page to retry.
        </div>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 40,
        }}
      >
        <StatCard
          label="Indonesian projects tracked"
          value={stats.projectCount}
          sublabel="Verra · SRN-PPI · Gold Standard · IDXCarbon"
        />
        <StatCard label="Credits issued" value={stats.totalVcusIssued} />
        <StatCard
          label="Credits available"
          value={stats.totalVcusAvailable}
        />
        <StatCard
          label="IDXCarbon avg price"
          value={stats.latestAvgPriceIdr}
          sublabel={stats.latestPeriod}
          trend={
            stats.momDeltaPct === null ? null : { pct: stats.momDeltaPct }
          }
        />
        <StatCard
          label="IDXCarbon volume"
          value={stats.latestVolumeTco2e}
          sublabel={stats.latestValueIdr ?? undefined}
        />
        <StatCard
          label="Median integrity score"
          value={stats.medianIntegrityScore}
        />
        <StatCard
          label="GFW alerts (90d)"
          value={stats.gfwAlerts90d}
          sublabel={`${stats.regulatoryEventCount} tracked regulations`}
        />
      </section>

      <FeaturedProjects projects={stats.featuredProjects} />

      <DataSources
        registriesLastSynced={stats.registriesLastSynced}
        satelliteLastIngested={stats.satelliteLastIngested}
        idxLastScraped={stats.idxLastScraped}
      />
    </main>
  );
}
