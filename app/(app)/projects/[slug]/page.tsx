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

import { getProjectDetail } from '@/lib/queries/project-detail';
import { getProjectSummary } from '@/lib/queries/project-summary';
import {
  getProjectAlertsFeatureCollection,
  getProjectBufferFeatureCollection,
  getProjectCentroidCoords,
} from '@/lib/queries/map-geojson';
import { METHODOLOGY_VERSION, WEIGHTS } from '@/lib/score';

import { AlertsSummary } from '@/components/projects/detail/AlertsSummary';
import { IssuancesTable } from '@/components/projects/detail/IssuancesTable';
import { RegistryList } from '@/components/projects/detail/RegistryList';
import { ScoreCard } from '@/components/projects/detail/ScoreCard';
import { SectionHero } from '@/components/projects/detail/SectionHero';
// T13 — client shell; mounts MapLibre with ssr:false into the #map anchor.
import { ProjectDetailMapClient } from '@/components/map/ProjectDetailMapClient';

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
    </main>
  );
}
