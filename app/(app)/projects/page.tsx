/**
 * app/(app)/projects/page.tsx — T11 Projects explorer (server component).
 *
 * Ownership: T11. Replaces the T03 mock-data scaffold. Reads `searchParams`,
 * invokes the Drizzle helper (`lib/queries/projects-list`), and composes the
 * page from the T11-owned presentational components:
 *
 *   - <StatsStrip>      (server, presentational)
 *   - <FilterChips>     (server, server-rendered <Link> hrefs)
 *   - <SortControl>     (client leaf — uses `useRouter` — per OQ-4)
 *   - <ProjectsTable>   (server, presentational)
 *   - <Pagination>      (server, server-rendered <Link> hrefs)
 *   - <EmptyState>      (server, presentational)
 *   - loading.tsx       (co-located, picked up by Next.js App Router streaming)
 *
 * URL contract (§3.3):
 *   - `province` / `type` / `status` — repeated-key multi-value. `type`
 *     maps internally to `projectType` in the query helper.
 *   - `sort` — single value; fallback to `score_desc` on unknown input.
 *   - `page` — positive integer; fallback to 1.
 *   - `limit` — positive integer capped at 100; default 20.
 *   - `tab` — 'table' | 'map'; fallback to 'table'. T13 fills the map branch.
 *
 * Tab preservation (§3.3, critical for T13 compat): every `<Link>` href on
 * this page is built via `buildFilterUrl`, which carries forward the current
 * `?tab=...` value so filter/sort/pagination interactions never drop the map
 * tab. T13 fills the `{tab === 'map'}` branch below with a narrow change —
 * the stub div is sized to prevent a layout shift on switch.
 *
 * Middleware-level auth (T05) already blocks unauthenticated requests to
 * `/projects`. This page assumes a signed-in session and does not re-gate.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getProjectsList,
  getProvinceOptions,
  getProjectTypeOptions,
  getStatusOptions,
  type ProjectsListSort,
} from '@/lib/queries/projects-list';

// T26 — page-level metadata. Short title → title template in app/layout.tsx
// renders "Projects · KarbonLens" in browser tab + og:title.
export const metadata: Metadata = {
  title: 'Projects',
  description:
    '64 Indonesian carbon projects — integrity scores, satellite alerts, issuance history.',
  openGraph: {
    url: '/projects',
    title: 'Projects · KarbonLens',
    description:
      '64 Indonesian carbon projects — integrity scores, satellite alerts, issuance history.',
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
    title: 'Projects · KarbonLens',
    description:
      '64 Indonesian carbon projects — integrity scores, satellite alerts, issuance history.',
    images: ['/og-image.png'],
  },
};
import { getProjectCentroidsFeatureCollection } from '@/lib/queries/map-geojson';
import { ProjectsTable } from '@/components/projects/ProjectsTable';
import { FilterChips } from '@/components/projects/FilterChips';
import { SortControl } from '@/components/projects/SortControl';
import { StatsStrip } from '@/components/projects/StatsStrip';
import { Pagination } from '@/components/projects/Pagination';
import { EmptyState } from '@/components/projects/EmptyState';
// T13 — client shell that dynamically imports MapLibre with ssr:false.
// (next/dynamic { ssr:false } must be invoked inside a client component in
// Next 16's App Router; the shell handles that for this server page.)
import { MapExplorerTabClient } from '@/components/map/MapExplorerTabClient';
import { buildFilterUrl } from '@/lib/url/build-filter-url';

const PATHNAME = '/projects';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const VALID_SORTS: ProjectsListSort[] = [
  'score_desc',
  'score_asc',
  'hectares_desc',
  'name_asc',
];

function toArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x !== '');
  return v === '' ? [] : [v];
}

function parseSort(raw: string | string[] | undefined): ProjectsListSort {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v && (VALID_SORTS as string[]).includes(v)) return v as ProjectsListSort;
  return 'score_desc';
}

function parseInt1(
  raw: string | string[] | undefined,
  fallback: number,
  cap?: number,
): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return cap ? Math.min(n, cap) : n;
}

function parseTab(raw: string | string[] | undefined): 'table' | 'map' {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'map' ? 'map' : 'table';
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // ── Parse search params (all malformed values silently fall back) ────────
  // URL param `type` maps to internal `projectType` on the query helper.
  const province = toArray(sp.province);
  const projectType = toArray(sp.type);
  const status = toArray(sp.status);
  const sort = parseSort(sp.sort);
  const page = parseInt1(sp.page, 1);
  const limit = parseInt1(sp.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const tab = parseTab(sp.tab);

  // Kick the three option queries off in parallel with the list query.
  const [result, provinceOptions, typeOptions, statusOptions] = await Promise.all([
    getProjectsList({
      province,
      projectType,
      status,
      sort,
      page,
      limit,
    }),
    getProvinceOptions(),
    getProjectTypeOptions(),
    getStatusOptions(),
  ]);

  const { rows, stats } = result;
  const totalPages = Math.max(1, Math.ceil(stats.totalMatching / limit));
  const showPagination = stats.totalMatching > limit;

  // T13 — fetch centroids only when the map tab is active; avoid extra query
  // on the (vastly more common) table pageload.
  const centroidsGeoJSON =
    tab === 'map' ? await getProjectCentroidsFeatureCollection() : null;

  // Tab toggle hrefs. Switching tabs clears `page` (a T13 map doesn't need
  // to preserve the table's cursor) but retains filters and sort.
  const tabTableHref = buildFilterUrl(PATHNAME, sp, {
    set: { tab: 'table' },
    remove: ['page'],
  });
  const tabMapHref = buildFilterUrl(PATHNAME, sp, {
    set: { tab: 'map' },
    remove: ['page'],
  });

  // "Clear all filters" — wipes every filter but preserves tab (map users
  // should stay on the map after clearing).
  const clearFiltersHref = buildFilterUrl(
    PATHNAME,
    {},
    tab === 'map' ? { set: { tab: 'map' } } : {},
  );

  const prevHref =
    page > 1
      ? buildFilterUrl(PATHNAME, sp, { set: { page: String(page - 1) } })
      : null;
  const nextHref =
    page < totalPages
      ? buildFilterUrl(PATHNAME, sp, { set: { page: String(page + 1) } })
      : null;

  return (
    <main className="kl-page">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">Registry · v0.1</p>
          <h1 className="kl-page-title">Projects explorer</h1>
          <p className="kl-page-subtitle">
            Indonesian carbon projects across Verra, SRN-PPI, Gold Standard,
            and IDXCarbon. Click any row for the full dossier.
          </p>
        </div>
      </header>

      <StatsStrip stats={stats} />

      {/* Tab row — Table (T11) vs Map (T13 will fill). */}
      <div className="kl-tab-row" role="tablist">
        <Link
          href={tabTableHref}
          className={`kl-tab${tab === 'table' ? ' is-active' : ''}`}
          role="tab"
          aria-selected={tab === 'table'}
        >
          Table
        </Link>
        <Link
          href={tabMapHref}
          className={`kl-tab${tab === 'map' ? ' is-active' : ''}`}
          role="tab"
          aria-selected={tab === 'map'}
        >
          Map
        </Link>
      </div>

      {/* Toolbar: filters on the left, sort on the right. */}
      <div className="kl-toolbar">
        <div style={{ flex: 1, minWidth: 280 }}>
          <FilterChips
            options={{
              province: provinceOptions,
              type: typeOptions,
              status: statusOptions,
            }}
            active={{ province, type: projectType, status }}
            searchParams={sp}
            pathname={PATHNAME}
          />
        </div>
        <SortControl
          currentSort={sort}
          searchParams={sp}
          pathname={PATHNAME}
        />
      </div>

      {/* Body — map (T13) or table (T11 default). */}
      {tab === 'map' ? (
        <div className="kl-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ height: '60vh', minHeight: 480 }}>
            <MapExplorerTabClient features={centroidsGeoJSON!} />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState clearFiltersHref={clearFiltersHref} />
      ) : (
        <>
          <ProjectsTable rows={rows} />
          {showPagination ? (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              prevHref={prevHref}
              nextHref={nextHref}
            />
          ) : null}
        </>
      )}
    </main>
  );
}
