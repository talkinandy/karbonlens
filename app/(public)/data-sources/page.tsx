/**
 * app/(public)/data-sources/page.tsx — SEO Phase 2B (E-E-A-T).
 *
 * Lists every upstream data source KarbonLens ingests, with attribution,
 * licence, refresh cadence, and live last-fetched timestamps pulled from
 * the DB. Closes the audit's top E-E-A-T gap alongside /about (which
 * still needs Andy's bio + photo).
 *
 * Why this page exists for SEO:
 *   - Citation target: journalists and academic papers need a single URL
 *     to cite for "where does this data come from?"
 *   - E-E-A-T signal: Google's quality raters explicitly look for "About
 *     the data" / sources pages on data-intensive sites.
 *   - LLM extraction: AI search engines surface this content when users
 *     ask "where does KarbonLens get its data from?".
 *
 * Refresh: ISR 1 hour. The live timestamps are fresh enough at that
 * cadence; no point thrashing the cache.
 */

import type { Metadata } from 'next';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { JsonLd } from '@/components/seo/JsonLd';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Data sources',
  description:
    'Every upstream source KarbonLens reconciles into its Indonesian carbon-market intelligence terminal — Verra, Global Forest Watch, IDXCarbon, SRN-PPI, JDIH — with licence, refresh cadence, and live last-fetched timestamps.',
  openGraph: {
    url: '/data-sources',
    title: 'Data sources · KarbonLens',
    description:
      'Every upstream source KarbonLens reconciles — Verra, Global Forest Watch, IDXCarbon, SRN-PPI — with licence, refresh cadence, and last-fetched timestamps.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'KarbonLens data sources' }],
  },
  twitter: {
    title: 'Data sources · KarbonLens',
    description:
      'Every upstream source KarbonLens reconciles — Verra, Global Forest Watch, IDXCarbon, SRN-PPI — with licence, refresh cadence, and last-fetched timestamps.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: '/data-sources' },
};

type SourceTimestamps = {
  verra_latest_project: Date | null;
  verra_latest_issuance: Date | null;
  gfw_latest_alert: Date | null;
  idx_latest_snapshot: Date | null;
  regulatory_latest_event: Date | null;
  project_count: number;
  alert_count: number;
  issuance_count: number;
  registry_count: number;
};

async function getSourceFreshness(): Promise<SourceTimestamps> {
  // One round-trip CTE so the page render holds at most a single DB call.
  // Each scalar is defensively wrapped so a missing table on a fresh dev
  // DB does not 500 the page.
  try {
    const rows = (await db.execute(sql`
      SELECT
        (SELECT MAX(updated_at)   FROM projects WHERE country = 'ID')                AS verra_latest_project,
        (SELECT MAX(ingested_at)  FROM issuances)                                    AS verra_latest_issuance,
        (SELECT MAX(ingested_at)  FROM satellite_alerts)                             AS gfw_latest_alert,
        (SELECT MAX(scraped_at)   FROM idx_monthly_snapshots)                        AS idx_latest_snapshot,
        (SELECT MAX(event_date)   FROM regulatory_events WHERE is_upcoming = FALSE)  AS regulatory_latest_event,
        (SELECT COUNT(*)::int     FROM projects WHERE country = 'ID' AND slug IS NOT NULL) AS project_count,
        (SELECT COUNT(*)::int     FROM satellite_alerts)                             AS alert_count,
        (SELECT COUNT(*)::int     FROM issuances)                                    AS issuance_count,
        (SELECT COUNT(DISTINCT registry_name)::int FROM registries)                  AS registry_count
    `)) as unknown as Array<{
      verra_latest_project: string | Date | null;
      verra_latest_issuance: string | Date | null;
      gfw_latest_alert: string | Date | null;
      idx_latest_snapshot: string | Date | null;
      regulatory_latest_event: string | Date | null;
      project_count: number;
      alert_count: number;
      issuance_count: number;
      registry_count: number;
    }>;
    const r = rows[0];
    return {
      verra_latest_project: r?.verra_latest_project ? new Date(r.verra_latest_project) : null,
      verra_latest_issuance: r?.verra_latest_issuance ? new Date(r.verra_latest_issuance) : null,
      gfw_latest_alert: r?.gfw_latest_alert ? new Date(r.gfw_latest_alert) : null,
      idx_latest_snapshot: r?.idx_latest_snapshot ? new Date(r.idx_latest_snapshot) : null,
      regulatory_latest_event: r?.regulatory_latest_event ? new Date(r.regulatory_latest_event) : null,
      project_count: r?.project_count ?? 0,
      alert_count: r?.alert_count ?? 0,
      issuance_count: r?.issuance_count ?? 0,
      registry_count: r?.registry_count ?? 0,
    };
  } catch {
    return {
      verra_latest_project: null,
      verra_latest_issuance: null,
      gfw_latest_alert: null,
      idx_latest_snapshot: null,
      regulatory_latest_event: null,
      project_count: 0,
      alert_count: 0,
      issuance_count: 0,
      registry_count: 0,
    };
  }
}

function fmtIsoDate(d: Date | null): string {
  if (!d) return '—';
  return d.toISOString().slice(0, 10);
}

function fmtRelativeDays(d: Date | null): string {
  if (!d) return '';
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export default async function DataSourcesPage() {
  const ts = await getSourceFreshness();

  const dataCatalogSchema = {
    '@context': 'https://schema.org',
    '@type': 'DataCatalog',
    name: 'KarbonLens Indonesian Carbon Market Datasets',
    description:
      'Reconciled Indonesian carbon-market intelligence — projects, issuances, satellite alerts, monthly prices, and regulatory events — sourced from Verra, Global Forest Watch, IDXCarbon, SRN-PPI, and JDIH.',
    url: 'https://karbonlens.com/data-sources',
    publisher: {
      '@type': 'Organization',
      name: 'KarbonLens',
      url: 'https://karbonlens.com',
    },
    dataset: [
      {
        '@type': 'Dataset',
        name: 'Indonesian Verra/VCS project registry',
        url: 'https://karbonlens.com/projects/by-registry/verra',
        description: 'Verra-registered Indonesian carbon projects with hectares, methodology, status, and issuance history.',
        citation: 'Source: Verra Registry (registry.verra.org)',
      },
      {
        '@type': 'Dataset',
        name: 'Satellite forest-loss alerts on Indonesian carbon project polygons',
        url: 'https://karbonlens.com/projects',
        description: 'GFW Integrated Alerts (RADD, GLAD-S2, GLAD-L) intersected with each project polygon, weekly.',
        citation: 'Source: Global Forest Watch Integrated Alerts API',
      },
      {
        '@type': 'Dataset',
        name: 'IDXCarbon monthly price snapshots',
        url: 'https://karbonlens.com/prices',
        description: 'Indonesia Carbon Exchange monthly volume, value, and average price per tCO₂e.',
        citation: 'Source: IDXCarbon monthly reports (idxcarbon.co.id)',
      },
      {
        '@type': 'Dataset',
        name: 'Indonesian carbon-market regulatory timeline',
        url: 'https://karbonlens.com/regulatory',
        description: 'Bilingual EN/ID timeline of laws, ministerial regulations, and presidential decrees governing the Indonesian carbon market.',
        citation: 'Source: JDIH (jdih.kemenkeu.go.id / jdih.menlhk.go.id) + manual curation',
      },
    ],
    license: 'https://karbonlens.com/terms',
    isAccessibleForFree: true,
  };

  return (
    <main className="kl-page" aria-labelledby="data-sources-h">
      <article style={{ maxWidth: 760, margin: '0 auto' }}>
        <header style={{ marginBottom: 32 }}>
          <p className="kl-section-label">About the data</p>
          <h1 id="data-sources-h" className="kl-page-title">
            Data sources
          </h1>
          <p className="kl-page-subtitle">
            KarbonLens reconciles {ts.project_count.toLocaleString()} Indonesian projects,{' '}
            {ts.issuance_count.toLocaleString()} issuance rows, and{' '}
            {ts.alert_count.toLocaleString()} satellite alerts from{' '}
            {ts.registry_count.toLocaleString()} registries plus public regulatory and market
            data. Every figure on the site traces back to a source listed below.
          </p>
        </header>

        <Section
          id="verra"
          title="Verra Registry"
          subtitle="VCS-registered Indonesian carbon projects + issuance history"
          source="registry.verra.org"
          sourceUrl="https://registry.verra.org/app/search/VCS/Registered+project"
          cadence="Weekly, Mondays 03:00 UTC"
          licence="Public registry data; Verra Terms of Use permit derived analysis with attribution."
          lastFetched={ts.verra_latest_project}
          lastIssuance={ts.verra_latest_issuance}
          usage={[
            'Project records (slug, name, methodology, hectares, status)',
            'Registry cross-references in /projects/by-registry/verra',
            'Issuance + retirement history feeding integrity scoring',
          ]}
        />

        <Section
          id="gfw"
          title="Global Forest Watch — Integrated Alerts API"
          subtitle="Satellite deforestation alerts (RADD, GLAD-S2, GLAD-L) intersected with project polygons"
          source="data-api.globalforestwatch.org"
          sourceUrl="https://www.globalforestwatch.org/help/developers/"
          cadence="Weekly, Mondays 03:30 UTC"
          licence="RADD: Wageningen University, attribution required. GLAD: University of Maryland, attribution required. API access requires free GFW developer key."
          lastFetched={ts.gfw_latest_alert}
          usage={[
            'Per-project alert layer driving the reversal-risk sub-score (35 % of integrity composite)',
            'Polygon-intersected at ingest time so only alerts inside the project buffer count',
            'Cross-referenced against ICVCM Core Carbon Principle quality checks',
          ]}
        />

        <Section
          id="idxcarbon"
          title="IDXCarbon monthly market reports"
          subtitle="Indonesia Carbon Exchange — volume, value, average price per tCO₂e"
          source="idxcarbon.co.id"
          sourceUrl="https://idxcarbon.co.id/data-monthly"
          cadence="Monthly, 1st of month 04:00 UTC (after report publication)"
          licence="Public market data. IDXCarbon publishes monthly PDFs; KarbonLens parses, archives the source PDFs, and exposes structured snapshots."
          lastFetched={ts.idx_latest_snapshot}
          usage={[
            'Monthly snapshots powering the /prices index and detail pages',
            'Year-on-year and month-on-month deltas in the weekly Market Wrap',
            'Cross-referenced with SRN-PPI registered-units totals for market depth',
          ]}
        />

        <Section
          id="srn-ppi"
          title="SRN-PPI — Indonesia National Climate Registry"
          subtitle="Cross-reference for projects registered with KLHK for domestic compliance trading"
          source="srn.menlhk.go.id"
          sourceUrl="https://srn.menlhk.go.id/"
          cadence="Manual cross-reference at project ingest (no automated scraper in v0.1)"
          licence="Public registry data published by KLHK."
          usage={[
            'Linked from /projects/by-registry/srn-ppi where the cross-reference exists',
            'Marks credits eligible for IDXCarbon trading under POJK 14/2023',
            'See /glossary/srn-ppi for the regulatory context',
          ]}
        />

        <Section
          id="jdih"
          title="JDIH — Indonesian legal document repositories"
          subtitle="Regulatory timeline: laws (UU), government regulations (PP), presidential regulations (Perpres), ministerial regulations (Permen*)"
          source="jdih.menlhk.go.id, jdih.kemenkeu.go.id, peraturan.go.id"
          sourceUrl="https://peraturan.go.id/"
          cadence="Manual curation (v0.1). Automated ingest planned for v0.2."
          licence="Public legal documents."
          lastFetched={ts.regulatory_latest_event}
          usage={[
            'Bilingual EN/ID summaries on /regulatory',
            'Linked from project detail pages where a regulation directly governs the project',
            'Drives the weekly Market Wrap regulatory section',
          ]}
        />

        <h2 style={{ fontSize: 18, marginTop: 40, marginBottom: 12 }}>
          Secondary / infrastructure sources
        </h2>
        <p className="kl-page-subtitle" style={{ marginBottom: 16 }}>
          Not data sources for the registry per se, but services KarbonLens depends on.
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          <li>
            <strong>Sentinel-1 SAR</strong> (European Space Agency, Copernicus programme) — the
            radar imagery underpinning RADD alerts. Consumed indirectly via GFW; KarbonLens does
            not access Sentinel imagery directly. See{' '}
            <a href="/glossary/radd">/glossary/radd</a>.
          </li>
          <li>
            <strong>Sentinel-2 optical imagery</strong> (ESA, Copernicus) — underpins GLAD-S2 alerts.
            Same access pattern as Sentinel-1.
          </li>
          <li>
            <strong>Google OAuth</strong> — sign-in identity provider. No carbon data passes
            through Google; OAuth is used solely to authenticate users.
          </li>
          <li>
            <strong>Resend</strong> — transactional email delivery (weekly digest, system alerts).
            No project or alert data is transmitted via email beyond what the recipient has
            already opted into.
          </li>
        </ul>

        <h2 style={{ fontSize: 18, marginTop: 40, marginBottom: 12 }}>
          Licence and attribution
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.7 }}>
          KarbonLens is an open-source project licensed under{' '}
          <a href="https://www.apache.org/licenses/LICENSE-2.0">Apache 2.0</a>. The application
          code is at{' '}
          <a href="https://github.com/talkinandy/karbonlens" target="_blank" rel="noopener noreferrer">
            github.com/talkinandy/karbonlens
          </a>
          . Derivative datasets and visualisations on the site are made available under the
          underlying source licences (see each section above); attribution to KarbonLens is
          appreciated where re-use is significant. Site Terms of Use are at{' '}
          <a href="/terms">/terms</a>.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 40, marginBottom: 12 }}>
          Reproducing our work
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.7 }}>
          The integrity scoring methodology — including every weight, bucket threshold, and
          override — is documented at <a href="/methodology">/methodology</a>. Version history
          is at <a href="/methodology/changelog">/methodology/changelog</a>. The ingestion code
          lives in a separate private repository (<code>karbonlens-ingest</code>) so this
          public application repository stays focused on the read-side surface; researchers
          interested in the ingest pipeline can email{' '}
          <a href="mailto:hello@karbonlens.com">hello@karbonlens.com</a>.
        </p>

        <p
          className="kl-muted"
          style={{ marginTop: 40, fontSize: 12, color: 'var(--text-3)' }}
        >
          Last refreshed: {fmtIsoDate(new Date())} · Snapshot cached for 1 hour.
        </p>

        <JsonLd id="ld-data-catalog" data={dataCatalogSchema} />
      </article>
    </main>
  );
}

function Section({
  id,
  title,
  subtitle,
  source,
  sourceUrl,
  cadence,
  licence,
  lastFetched,
  lastIssuance,
  usage,
}: {
  id: string;
  title: string;
  subtitle: string;
  source: string;
  sourceUrl: string;
  cadence: string;
  licence: string;
  lastFetched?: Date | null;
  lastIssuance?: Date | null;
  usage: string[];
}) {
  return (
    <section id={id} style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 20, marginBottom: 4 }}>{title}</h2>
      <p className="kl-muted" style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-2)' }}>
        {subtitle}
      </p>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '6px 14px',
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        <dt style={{ color: 'var(--text-3)' }}>Source</dt>
        <dd>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
            {source}
          </a>
        </dd>
        <dt style={{ color: 'var(--text-3)' }}>Refresh</dt>
        <dd>{cadence}</dd>
        <dt style={{ color: 'var(--text-3)' }}>Licence</dt>
        <dd>{licence}</dd>
        {lastFetched !== undefined ? (
          <>
            <dt style={{ color: 'var(--text-3)' }}>Last fetched</dt>
            <dd style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtIsoDate(lastFetched)}{' '}
              <span style={{ color: 'var(--text-3)' }}>({fmtRelativeDays(lastFetched)})</span>
            </dd>
          </>
        ) : null}
        {lastIssuance !== undefined && lastIssuance !== null ? (
          <>
            <dt style={{ color: 'var(--text-3)' }}>Latest issuance ingest</dt>
            <dd style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtIsoDate(lastIssuance)}{' '}
              <span style={{ color: 'var(--text-3)' }}>({fmtRelativeDays(lastIssuance)})</span>
            </dd>
          </>
        ) : null}
      </dl>
      <ul style={{ listStyle: 'disc', paddingLeft: 22, fontSize: 14, lineHeight: 1.6 }}>
        {usage.map((u, i) => (
          <li key={i}>{u}</li>
        ))}
      </ul>
    </section>
  );
}
