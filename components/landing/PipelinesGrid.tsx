/**
 * components/landing/PipelinesGrid.tsx — T25 "Four data pipelines" section.
 *
 * Four editorial cards (Registries, Satellite MRV, Prices, Regulatory). Each
 * card is a `<Link>` wrapping an `.lp-pipeline` div with a monospace number,
 * serif title, large stat, stat label, body copy, and "Explore →" CTA.
 *
 * Stat values are live where sensible:
 *   - Registries: formatted projectCount
 *   - Satellite MRV: fixed "10 m" (Sentinel-2 resolution is a product fact)
 *   - Prices: latestVolumeTco2e + "{Month} IDXCarbon volume" label
 *   - Regulatory: fixed "Permenhut 6/2026" / "freshly in force"
 *
 * Per T25 §3.3.
 */

import Link from 'next/link';
import type { LandingStats } from '@/lib/queries/landing-stats';

function groupThousands(n: number): string {
  const rounded = Math.round(n);
  const s = String(Math.abs(rounded));
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded < 0 ? `-${grouped}` : grouped;
}

type Pipeline = {
  num: string;
  title: string;
  stat: string;
  statLabel: string;
  body: string;
  href: string;
};

export function PipelinesGrid({ stats }: { stats: LandingStats }) {
  const volumeMonth = stats.latestPeriod
    ? stats.latestPeriod.split(' ')[0]
    : 'Latest';

  const pipelines: Pipeline[] = [
    {
      num: '01',
      title: 'Registries',
      stat: groupThousands(stats.projectCount),
      statLabel: 'projects indexed',
      body: 'SRN-PPI, IDXCarbon, Verra, Gold Standard and SRUK reconciled into one ledger. Every VCU traced from issuance to retirement, with Corresponding Adjustment flags.',
      href: '/projects',
    },
    {
      num: '02',
      title: 'Satellite MRV',
      stat: '10 m',
      statLabel: 'Sentinel-2 resolution',
      body: 'RADD deforestation alerts, VIIRS fire hotspots, Sentinel-1 radar and NDVI time-series — clipped to every project polygon. Reversal risk, priced in.',
      href: '/projects/katingan-peatland-restoration-and-conservation-project',
    },
    {
      num: '03',
      title: 'Prices',
      stat: stats.latestVolumeTco2e ?? '—',
      statLabel: `${volumeMonth} IDXCarbon volume`,
      body: 'Every IDXCarbon negotiated and marketplace trade, enriched with credit type, vintage, and developer. A live ticker your desk can finally plan against.',
      href: '/prices',
    },
    {
      num: '04',
      title: 'Regulatory',
      stat: 'Permenhut 6/2026',
      statLabel: 'freshly in force',
      body: 'JDIH-scraped policy timeline with plain-language summaries in Bahasa and English. Know what changes, when, and which of your assets it touches.',
      href: '/regulatory',
    },
  ];

  return (
    <section className="lp-section">
      <div className="lp-section-head">
        <div>
          <div className="lp-eyebrow">Four data pipelines</div>
          <h2 className="lp-h2">
            Indonesia&apos;s carbon data
            <br />
            was never this legible.
          </h2>
        </div>
        <p className="lp-section-lead">
          We ingest and reconcile the country&apos;s fragmented registries and
          monitoring feeds every day — so your analyst doesn&apos;t have to.
        </p>
      </div>

      <div className="lp-pipeline-grid">
        {pipelines.map((p) => (
          <Link key={p.num} href={p.href} className="lp-pipeline">
            <div className="lp-pipeline-num">{p.num}</div>
            <div className="lp-pipeline-title">{p.title}</div>
            <div className="lp-pipeline-stat">{p.stat}</div>
            <div className="lp-pipeline-stat-label">{p.statLabel}</div>
            <p className="lp-pipeline-body">{p.body}</p>
            <span className="lp-pipeline-cta">Explore →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
