/**
 * app/(app)/projects/[slug]/page.tsx — project detail (T12).
 *
 * All DB reads live in `lib/queries/project-detail.ts`. Opened up 2026-04-22:
 * every section (hero, score, registry list, issuances, retirements, alerts
 * summary + map, methodology) renders for every visitor. Only personalised
 * surfaces require sign-in (see `proxy.ts` matcher: /alerts + /admin only).
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { auth } from '@/lib/auth';
import { getProjectDetail } from '@/lib/queries/project-detail';
import { getProjectDescription } from '@/lib/queries/project-description';
import { getProjectSummary } from '@/lib/queries/project-summary';
import {
  getProjectAlertsFeatureCollection,
  getProjectBufferFeatureCollection,
  getProjectCentroidCoords,
} from '@/lib/queries/map-geojson';
import { METHODOLOGY_VERSION, WEIGHTS } from '@/lib/score';

import { AlertsSummary } from '@/components/projects/detail/AlertsSummary';
import { IssuancesTable } from '@/components/projects/detail/IssuancesTable';
import { ProjectDescription } from '@/components/projects/detail/ProjectDescription';
import { RegistryList } from '@/components/projects/detail/RegistryList';
import { ScoreCard } from '@/components/projects/detail/ScoreCard';
import { SectionHero } from '@/components/projects/detail/SectionHero';
// T13 — client shell; mounts MapLibre with ssr:false into the #map anchor.
import { ProjectDetailMapClient } from '@/components/map/ProjectDetailMapClient';
// T31 — answer-first JSON-LD (Dataset + BreadcrumbList) for LLM extraction.
import { JsonLd } from '@/components/seo/JsonLd';
import { displayStatus } from '@/lib/display/status';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ISSUANCE_PAGE_SIZE = 20;

function parsePage(raw: string | string[] | undefined): number {
  if (!raw) return 1;
  const val = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(val ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function fmtCredits(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('en-ID');
}

/**
 * T26 — per-project dynamic metadata.
 *
 * Uses the lightweight `getProjectSummary` helper instead of the full
 * `getProjectDetail` payload. Unknown slug → returns default metadata (the
 * render body handles the 404 via `notFound()`); never throw from
 * `generateMetadata`, which would bypass the not-found page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectSummary(slug);
  if (!project) return {};

  const scoreText = project.score != null ? project.score.toFixed(1) : '—';
  const hectaresSegment = project.hectares
    ? ` · ${project.hectares.toLocaleString('en-ID')} ha`
    : '';
  const description = `${project.projectType ?? 'Carbon'} project in ${project.province ?? 'Indonesia'} · Score ${scoreText}${hectaresSegment}`;

  // Note on og:image: Next.js 16 auto-injects `og:image` + `twitter:image` from
  // the colocated `opengraph-image.tsx` + `twitter-image.tsx` file-convention
  // routes at this same segment. Those routes serve at hashed paths
  // (e.g. `/projects/[slug]/opengraph-image-<hash>`), and Next 16 emits the
  // correct hashed URL in the meta tags. Passing an explicit
  // `images: ['/projects/.../opengraph-image']` here would override that with
  // the bare (non-hashed) path, which 404s at runtime. Leave `images` off and
  // let the file-convention do its job.
  return {
    title: project.name,
    description,
    openGraph: {
      title: project.name,
      description,
      url: `/projects/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: project.name,
      description,
    },
    alternates: { canonical: `/projects/${slug}` },
  };
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const detail = await getProjectDetail(slug);
  if (!detail) {
    notFound();
  }

  // T30 — AI-researched narrative. Runs in parallel with the session read
  // so the auth check doesn't block the description fetch.
  const [description, session] = await Promise.all([
    getProjectDescription(detail.project.id),
    auth(),
  ]);
  const isAuthed = !!session?.user?.id;

  const issuancePage = parsePage(sp.issuance_page);
  const issuanceCount = detail.issuances.length;

  // T13 — map data. Fetched server-side so MapLibre gets its GeoJSON via
  // props (no extra HTTP round-trip). Three parallel queries; the full
  // payload is bounded by ALERTS_MAP_LIMIT (5 000 points).
  // Opened up 2026-04-22: available to all visitors (no auth gate).
  const [mapCentroid, mapAlerts, mapBuffer] = await Promise.all([
    getProjectCentroidCoords(detail.project.id),
    getProjectAlertsFeatureCollection(detail.project.id),
    getProjectBufferFeatureCollection(detail.project.id),
  ]);

  const integrityScoreNumeric =
    detail.score?.integrityScore !== undefined &&
    detail.score?.integrityScore !== null
      ? Number(detail.score.integrityScore)
      : null;

  const components = detail.score?.components ?? null;
  const inputs = components?.inputs;

  // T31 — Build the typed facts object the description renders as a key-facts
  // table. We also reuse a few of these values to populate the Dataset
  // JSON-LD below (variableMeasured, spatialCoverage, dateModified).
  const statusBadge = displayStatus(detail.project.status);
  const hectaresValue = detail.project.hectares
    ? Number(detail.project.hectares)
    : null;
  const integrityScoreRounded =
    integrityScoreNumeric !== null ? Math.round(integrityScoreNumeric) : null;
  const latestVintageYear = detail.issuances[0]?.vintageYear ?? null;
  const registryIds = detail.registries
    .map((r) => `${r.registryName} ${r.externalId}`)
    .join(', ');
  const facts = {
    nameCanonical: detail.project.nameCanonical,
    developer: detail.project.developer,
    province: detail.project.province,
    projectType: detail.project.projectType,
    methodology: detail.project.methodology,
    hectares: hectaresValue,
    status: detail.project.status,
    statusLabel: statusBadge.label,
    statusPillClass: `kl-pill ${
      statusBadge.badge === 'active'
        ? 'kl-pill--success'
        : statusBadge.badge === 'pipeline'
          ? 'kl-pill--info'
          : statusBadge.badge === 'suspended'
            ? 'kl-pill--danger'
            : statusBadge.badge === 'flagged'
              ? 'kl-pill--warning'
              : 'kl-pill--neutral'
    }`,
    integrityScore: integrityScoreRounded,
    latestVintageYear,
    registryIds: registryIds || null,
    generatedAt: description?.generatedAt ?? null,
    scoreComponents: components,
  };

  // T31 — Dataset schema. Each project page is a discoverable carbon-project
  // dossier. Variables use schema.org PropertyValue so LLMs and dataset
  // crawlers can ingest the headline numbers without parsing the page.
  const variableMeasured = [
    {
      "@type": "PropertyValue",
      name: "Integrity score",
      value: integrityScoreRounded ?? undefined,
      minValue: 0,
      maxValue: 100,
    },
    {
      "@type": "PropertyValue",
      name: "Hectares",
      value: hectaresValue ?? undefined,
      unitText: "ha",
    },
    {
      "@type": "PropertyValue",
      name: "Methodology",
      value: detail.project.methodology ?? undefined,
    },
    {
      "@type": "PropertyValue",
      name: "Status",
      value: detail.project.status ?? undefined,
    },
  ].filter((v) => v.value !== undefined);

  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${detail.project.nameCanonical} — Carbon project dossier`,
    description:
      description?.summaryMd ||
      `${detail.project.nameCanonical} — integrity score, issuance history, and satellite alerts.`,
    url: `https://karbonlens.com/projects/${slug}`,
    identifier: detail.project.id,
    isPartOf: {
      "@type": "DataCatalog",
      name: "KarbonLens Indonesian Carbon Project Registry",
      url: "https://karbonlens.com/projects",
    },
    creator: {
      "@type": "Organization",
      name: "KarbonLens",
      url: "https://karbonlens.com",
    },
    license: "https://karbonlens.com/terms",
    spatialCoverage: {
      "@type": "Place",
      name: detail.project.province || "Indonesia",
      address: {
        "@type": "PostalAddress",
        addressRegion: detail.project.province,
        addressCountry: "ID",
      },
    },
    temporalCoverage: detail.score?.scoreDate
      ? `2009-01-01/${detail.score.scoreDate}`
      : "2009-01-01/..",
    variableMeasured,
    keywords: [
      "Indonesian carbon market",
      detail.project.projectType,
      detail.project.methodology,
      detail.project.province,
    ]
      .filter(Boolean)
      .join(", "),
    dateModified: description?.generatedAt?.toISOString().slice(0, 10),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://karbonlens.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Projects",
        item: "https://karbonlens.com/projects",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: detail.project.nameCanonical,
        item: `https://karbonlens.com/projects/${slug}`,
      },
    ],
  };

  return (
    <main className="kl-page">
      <SectionHero
        name={detail.project.nameCanonical}
        developer={detail.project.developer}
        province={detail.project.province}
        hectares={detail.project.hectares}
        status={detail.project.status}
        registryNames={detail.registries.map((r) => r.registryName)}
      />

      <ProjectDescription
        description={description}
        isAuthed={isAuthed}
        projectSlug={slug}
        facts={facts}
      />

      <ScoreCard
        integrityScore={integrityScoreNumeric}
        scoreDate={detail.score?.scoreDate ?? null}
        components={components}
      />

      <RegistryList rows={detail.registries} />

      <IssuancesTable
            rows={detail.issuances}
            page={issuancePage}
            pageSize={ISSUANCE_PAGE_SIZE}
            totalRows={issuanceCount}
            slug={detail.project.slug}
          />

          <section style={{ marginBottom: 32 }}>
            <p className="kl-section-label">Retirements</p>
            <div className="kl-card">
              <p className="kl-stat-value tnum" style={{ fontSize: 22 }}>
                {Number(detail.retirementsTotal) > 0
                  ? `${fmtCredits(detail.retirementsTotal)} tCO₂e`
                  : '—'}
              </p>
              <p className="kl-stat-label">Total retired</p>

              {detail.retirementsBeneficiaries.length > 0 ? (
                <ul style={{ marginTop: 12, paddingLeft: 18 }}>
                  {detail.retirementsBeneficiaries.map((b, i) => (
                    <li
                      key={`${b.beneficiaryName ?? 'unknown'}-${i}`}
                      className="kl-page-subtitle"
                    >
                      {b.beneficiaryName ?? 'Unknown beneficiary'} —{' '}
                      {fmtCredits(b.credits)} tCO₂e
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="kl-page-subtitle" style={{ marginTop: 12 }}>
                  No retirements recorded.
                </p>
              )}
            </div>
          </section>

          <AlertsSummary
            alerts={detail.alerts}
            slug={detail.project.slug}
            mapSlot={
              mapCentroid && mapAlerts && mapBuffer ? (
                <ProjectDetailMapClient
                  centroid={mapCentroid}
                  projectName={detail.project.nameCanonical}
                  projectSlug={detail.project.slug}
                  alerts={mapAlerts}
                  buffer={mapBuffer}
                />
              ) : null
            }
          />

          <section style={{ marginBottom: 32 }}>
            <p className="kl-section-label">Score methodology</p>
            <div className="kl-card">
              <p
                className="kl-page-subtitle"
                style={{ marginBottom: 8, fontSize: 13 }}
              >
                Score computed {detail.score?.scoreDate ?? '—'} from inputs:
                alerts last 90 days ({inputs?.alerts_90d_count ?? 0}),
                high-confidence alerts ({inputs?.high_conf_count ?? 0}),
                registries ({inputs?.registry_count ?? detail.registries.length}),
                years since validation (
                {inputs?.years_since_validation ?? 'unknown'}).
              </p>
              <p className="kl-muted" style={{ fontSize: 12 }}>
                Methodology {METHODOLOGY_VERSION}. Weights: validation recency{' '}
                {Math.round(WEIGHTS.validation_recency * 100)}%, reversal risk{' '}
                {Math.round(WEIGHTS.reversal_risk * 100)}%, community flags{' '}
                {Math.round(WEIGHTS.community_flags * 100)}%, transparency{' '}
                {Math.round(WEIGHTS.transparency * 100)}%.{' '}
                <a href="/methodology" className="kl-link">
                  See full methodology →
                </a>
              </p>
            </div>
          </section>

      <JsonLd data={datasetSchema} id="ld-dataset" />
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
    </main>
  );
}
