---
id: T25
title: Landing redesign with satellite map visual
phase: 5-polish
status: done
blocked_by: []
blocks: [T26]
owner: spec-writer
effort_estimate: 4h
---

## 1. User story

As a first-time visitor to karbonlens.com, I want to see an editorially compelling landing page
with a live satellite map of a real Indonesian carbon project, so that I immediately understand
what KarbonLens does and am compelled to explore the data without needing to sign in first.

## 2. Context & rationale

T18 shipped a stat-card grid that optimises for users who already know the product. The landing
is now the primary conversion surface — the whole site opened to guests (post-T18 auth change),
so the first impression must communicate the product's value to an international carbon buyer or
an Indonesian sustainability head who has never heard of the platform.

Andy's brief: "landing page like prototype where user can see map image on the front page of one
or several project. We need better visual and explanation when user first come to the website."

The prototype (`legacy/prototype/src/Landing.jsx`) nailed the layout — editorial dark split-hero
with a satellite map on the right, a live-data ticker, four pipeline cards, featured projects,
and "built for" persona cards. T25 promotes that design to the production Next.js app, replacing
the SVG-based `SatelliteMap` component with a real MapLibre view powered by the existing T13
MapLibre stack (MapLibreBase, EsriBaseLayer, SatelliteAlertsLayer) showing live Katingan data.

The content is now open to guests, so the primary CTAs are product exploration links. Sign-in
is surfaced as a secondary CTA ("save alerts") rather than the main gate.

Revalidation: `export const revalidate = 600` (10 min) in the page file. Because `auth()`
reads the session cookie, Next.js App Router marks this route as fully dynamic — the
`revalidate` export does not enable ISR on a dynamic route. Its purpose here is to emit a
`Cache-Control: s-maxage=600, stale-while-revalidate` header that a CDN layer can honour.
This is a CDN cache hint, not true ISR. The behaviour is acceptable for v0.1.

## 3. Scope

### In scope

#### 3.1 Hero split (`.lp-hero`)

Left column:

- **Kicker label** — `"Indonesia carbon market intelligence · Beta · Jakarta"` in IBM Plex Mono,
  with a green pulse dot on the left. Matches `lp-kicker` prototype style.
- **H1** — Instrument Serif 84 px (scaled down on mobile):
  ```
  Every credit,
  every policy,
  *one lens.*
  ```
  The phrase "one lens." is wrapped in `<em className="lp-h1-em">` which renders in
  `--success-fg` (green). Copy is verbatim from the prototype; Andy may request a change
  post-launch via a follow-up ticket (see §9).
- **EN tagline** (`lp-tag-en`) — "KarbonLens turns SRN-PPI, IDXCarbon, Verra, Sentinel, and
  JDIH into a single workspace for the people building — and buying from — Indonesia's carbon
  market."
- **ID tagline** (`lp-tag-id`) — "Platform intelijen pasar karbon Indonesia. Registri, harga,
  regulasi, dan pemantauan satelit dalam *satu layar*." (italic, smaller, `--text-3`).
- **Primary CTAs** (`lp-cta`):
  - `btn btn-primary` → `/projects` — label "Open the terminal →"
  - `btn` → `/regulatory?focus=permenhut-6-2026` — label "Read Permenhut 6/2026"
- **Auth-aware CTA behaviour** (reconciled with AC-8):
  - **If guest:** Primary CTA (`lp-cta`) shows `"Open the terminal →"` + `"Read Permenhut 6/2026"`.
    Below `lp-cta`, a secondary outline `btn` renders `"Sign in with Google to save alerts"`
    via `<SignInButton>`. This secondary CTA does NOT gate content.
  - **If signed in:** The primary CTA label changes to `"Open your dashboard →"` (same href
    `/projects`). The secondary auth button (`"Sign in with Google to save alerts"`) is NOT
    rendered. The `"Read Permenhut 6/2026"` button remains visible.
  This matches AC-8: signed-in users see primary CTA text "Open your dashboard →" and no
  sign-in button.
- **Hero stats strip** (`lp-hero-stats`) — three figures separated by a top border:
  1. `projectCount` — label "Projects tracked"
  2. `latestAvgPriceIdr` — label "IDTBS-RE avg · {latestPeriod}" (falls back to "IDXCarbon avg"
     if IDTBS-RE is not available separately)
  3. `vcusTradedYtd` (new field, see §3 data additions) — label "VCUs traded · YTD"

Right column:

- **Real MapLibre view** of Katingan Peatland, dynamically imported (`ssr: false`) via the new
  `SatelliteMapHero` client component. Use `dynamic({ ssr: false })` with a `<Suspense>` fallback
  placeholder (a skeleton div matching the map aspect ratio) — this is the chosen deferral
  pattern. If AC-11's 3-second Fast 3G target is not met in production, the first recommended
  optimisation is to add an IntersectionObserver trigger so MapLibre init is deferred until the
  hero is in the viewport.
  - Center: `[113.2, -1.8]` (lon, lat). Zoom: `9`.
  - Layers rendered inside MapLibreBase:
    - `EsriBaseLayer` (satellite imagery — same as T13 project detail map).
    - `ProjectCentroidLayer` for Katingan (single marker, sourced from `landingMapData`).
    - `SatelliteAlertsLayer` with `landingMapData.alerts` (last-90-day RADD alerts for Katingan,
      capped at 200 for landing page performance). No cluster labels at this zoom; clusters only
      visible if user zooms out.
    - A 10 km buffer polygon around the Katingan centroid, passed as `buffer` prop to
      `SatelliteAlertsLayer`.
  - Map controls: `NavigationControl` from `MapLibreBase` (inherited). No layer-panel sidebar
    (this is compact mode — single-column map only).
  - Fallback: if MapLibre fails to construct (WebGL unavailable / ad-blocker), a `MapErrorBoundary`
    class component (defined inside `SatelliteMapHero.tsx`) catches the error and renders:
    `<img src="/og-image.png" alt="Katingan Peatland satellite view" className="lp-map-fallback">`.
    Note: `MapLibreBase` catches constructor errors internally and does NOT re-throw or call an
    `onError` prop, so `SatelliteMapHero` must use a React Error Boundary around the `dynamic`
    import — not an `onError` callback. No changes to `components/map/*` are needed.
  - **Caption** underneath the map (`.lp-hero-caption`):
    `"Live monitoring · Katingan Peatland, Central Kalimantan · {katinganAlerts90d} satellite alerts in last 90 days"`
    where `katinganAlerts90d` is a server-fetched integer from `getLandingMapData()`.
    Note: the GFW scraper stores `alert_source = 'INTEGRATED'` (the integrated-alerts
    superset of RADD, GLAD-S2, GLAD-L, and DIST-ALERT). Do NOT filter by
    `alert_source = 'RADD'` — it would return zero rows. "Satellite alerts" is the
    correct brand-neutral term.
- Two-column layout collapses to stacked at ≤ 1100 px (breakpoint already defined in `lp-*` CSS).

#### 3.2 Ticker bar (`.lp-ticker`)

A horizontally divided band immediately below the hero, light `--surface-2` background.
Six items in a 6-column grid (collapses to 3-col at ≤ 1100 px, 2-col at ≤ 640 px):

| # | Label | Value source | Delta |
|---|-------|-------------|-------|
| 1 | IDTBS-RE | `latestAvgPriceIdr` (IDXCarbon avg, formatted as `Rp XX,XXX`) | `momDeltaPct` MoM if available, else flat |
| 2 | {month} volume | `latestVolumeTco2e` | MoM vs prior month (absolute tCO₂e diff) |
| 3 | Participants | `idxParticipantCount` (new field — `registered_participants`) | MoM vs prior month, else flat |
| 4 | Active alerts | `activeAlerts30d` (new field — sum of satellite_alerts last 30d across all projects) | WoW — count of new alerts in last 7d vs prior 7d |
| 5 | Median integrity score | `medianIntegrityScore` | flat (no prior) |
| 6 | Regulatory events tracked | `regulatoryEventCount` | flat |

Delta time-frames follow the data source granularity: rows 1–3 are sourced from
`idx_monthly_snapshots` (monthly granularity) so deltas are always MoM. Row 4 reads
`satellite_alerts` which has daily rows, so WoW is valid. Rows 5–6 are flat — no
prior window is available.

v0.2 note: `regulatory_events` currently has no `ingested_at` index so a "new this week"
delta for row 6 is not feasible. If a future spec adds one, a migration adding a `created_at`
index on `regulatory_events` will be required first.

Ticker items render `lp-ticker-item` > `lp-ti-label` + `lp-ti-value` + `lp-ti-delta.{tone}`.
Tone is `up` / `down` / `flat`. All values server-fetched; delta can be `flat` where week-over-week
data is unavailable. Items never show `null` — use `"—"` fallback text.

#### 3.3 Four data pipelines section

Section eyebrow: "Four data pipelines". Section H2: "Indonesia's carbon data / was never this legible."
Section lead paragraph (right column of `.lp-section-head`): "We ingest and reconcile the country's
fragmented registries and monitoring feeds every day — so your analyst doesn't have to."

Four `.lp-pipeline` cards in `.lp-pipeline-grid` (4-col, 2-col at ≤ 1100 px, 1-col at ≤ 640 px).
Numbers, live stat values, body copy:

| # | Title | Live stat | Stat label | Body | Link |
|---|-------|-----------|------------|------|------|
| 01 | Registries | `projectCount` (formatted with comma groups) | "projects indexed" | "SRN-PPI, IDXCarbon, Verra, Gold Standard and SRUK reconciled into one ledger. Every VCU traced from issuance to retirement, with Corresponding Adjustment flags." | `/projects` |
| 02 | Satellite MRV | "10 m" | "Sentinel-2 resolution" | "RADD deforestation alerts, VIIRS fire hotspots, Sentinel-1 radar and NDVI time-series — clipped to every project polygon. Reversal risk, priced in." | `/projects/katingan-peatland-restoration-and-conservation-project` |
| 03 | Prices | `latestVolumeTco2e` | "{latestPeriod} IDXCarbon volume" | "Every IDXCarbon negotiated and marketplace trade, enriched with credit type, vintage, and developer. A live ticker your desk can finally plan against." | `/prices` |
| 04 | Regulatory | "Permenhut 6/2026" | "freshly in force" | "JDIH-scraped policy timeline with plain-language summaries in Bahasa and English. Know what changes, when, and which of your assets it touches." | `/regulatory` |

Each card is a Next.js `<Link>` wrapping the `.lp-pipeline` div (or `<a>` inside, to preserve
keyboard navigation). `"Explore →"` in `lp-pipeline-cta` style appears at the bottom of each card.

Note (N-4): pipeline card 01 uses "projects indexed" as the stat label with `projectCount` as
the value. The prototype used "credits indexed" (a VCU count). This is a deliberate T25 change
— project count is the more legible top-line metric for a first-time visitor. Code reviewers
should not revert it to the prototype wording.

#### 3.4 Featured projects grid

Eyebrow: "Featured projects". H2: "Under the lens, right now." Right-column link: "Browse all {projectCount} →" → `/projects`.

`.lp-featured-grid` — **3-col** at ≥ 1100 px (overrides the prototype's 4-col default);
2-col at ≤ 1100 px; 1-col at ≤ 640 px.
Populated from FEATURED_SLUGS (3 flagship slugs: Katingan, Rimba Raya, Sumatra Merang).
The grid uses `grid-template-columns: repeat(3, 1fr)` — not the prototype's `repeat(4, 1fr)` —
to avoid an unbalanced empty column. A fourth project may be added to FEATURED_SLUGS in a
follow-up; the grid will auto-expand via CSS grid without layout changes.

Each `.lp-feat` card:

- **Thumbnail** (`.lp-feat-thumb`, 16:9 aspect ratio): an SVG placeholder with green gradient
  background, a simplified boundary polygon, and confidence-coded alert dots — identical in
  structure to the prototype's `FeaturedCard` SVG. This placeholder is replaced by a real
  static satellite thumbnail in T26.
- **Type chip** (`.lp-feat-chip`) — `projectType` or "REDD+".
- **Body** (`.lp-feat-body`):
  - `.lp-feat-name` — `nameCanonical` in Instrument Serif.
  - `.lp-feat-meta` — `"{developer} · {province}"`.
  - `.lp-feat-row` (3-col sub-grid):
    - Score / `integrityScore` rounded to integer, or "—".
    - Status / derived from `projectType` e.g. "Active".
    - Registry / first `registryNames[0]` or "—".

Entire card is a `<Link href="/projects/{slug}">`.

EDIT `components/landing/FeaturedProjects.tsx` — replace internal card markup with the
`lp-feat-*` class hierarchy; preserve the props interface (`FeaturedProject[]`).

#### 3.5 "Built for" section

Eyebrow: "Built for". H2: "The people moving the market."

`.lp-roles-grid` — 4-col → 2-col → 1-col breakpoints.

Four persona cards (`.lp-role`):

| # | Role | Blurb |
|---|------|-------|
| 01 | International Buyers & Brokers | "Shortlist Indonesian credits by vintage, methodology, reversal risk, and CA authorization. No PDF scraping — every Verra and SRN-PPI record in one place." |
| 02 | Corporate Sustainability (Indonesia) | "Benchmark your company's offset portfolio against 200+ live projects. Show the board the numbers behind your ESG commitments." |
| 03 | Climate Researchers & NGOs | "Primary-source data with full citation coverage. RADD, SRN-PPI, IDXCarbon, JDIH — deduplicated, versioned, and queryable." |
| 04 | Journalists & Policy Analysts | "Policy timelines, credit flows, and satellite anomalies in plain language. One screen beats six spreadsheets." |

#### 3.6 Data freshness footer strip

Replaces the existing `<DataSources>` component (which can be deprecated/deleted).

`.lp-freshness` — full-width bar, `--surface-2` background, `border-top: 0.5px solid var(--border)`.
Three "last-synced" relative timestamps:
```
Verra / SRN-PPI  ·  synced {relative(registriesLastSynced)}
GFW / Sentinel   ·  synced {relative(satelliteLastIngested)}
IDXCarbon        ·  synced {relative(idxLastScraped)}
```
"Relative" = "X minutes ago" / "X hours ago" / "X days ago", computed server-side using a small
utility function — not client-side `Date.now()` to avoid hydration mismatch.

Link grid row below the timestamps: `Projects · Prices · Regulatory · Methodology · Admin login · About`.

### Out of scope (explicit non-goals)

- Real IDTBS-RE ticker prices as a separate data point from IDXCarbon (ticker item 1 uses the
  existing `latestAvgPriceIdr` field; a dedicated IDTBS-RE feed is a v0.2 concern).
- Interactive layer toggles on the landing hero map (compact mode — no sidebar panel, no base
  imagery selector — those live in the T13 project detail map).
- Thumbnail satellite images per featured project card (deferred to T26 — placeholder SVG now).
- Pricing / paywall section (removed from prototype; not part of v0.1).
- Methodology editorial strip from prototype (out of scope for T25; add in T26 if needed).
- CHANGELOG entry / TASKS.md flip (handled by the merge agent post-review per README lifecycle).

## 4. Acceptance criteria (Gherkin)

**AC-1: HTTP 200**
```
Given the landing page is deployed
When  curl -sI https://karbonlens.com/ is run
Then  the response status line is "HTTP/... 200"
```

**AC-2: H1 and taglines present in HTML**
```
Given the landing page is rendered
When  the HTML body is searched
Then  "one lens" appears in the H1 element
And   "satu layar" appears in the ID tagline paragraph
```

**AC-3: MapLibre canvas rendered**
```
Given a browser with WebGL support loads the landing page
When  the JavaScript has initialised
Then  an element with class "maplibregl-canvas" is present inside the hero right column
```

**AC-4: Ticker has exactly 6 items**
```
Given the landing page HTML is inspected
When  elements with class "lp-ticker-item" are counted
Then  the count is 6
```

**AC-5: Pipeline cards — 4 cards with live numbers**
```
Given the landing page is rendered with a live DB
When  the pipelines section is inspected
Then  exactly 4 elements with class "lp-pipeline" are present
And   the "01 Registries" card stat matches the live projectCount (not 0 if DB is up)
And   the "03 Prices" card stat label contains the most recent IDXCarbon period month
```

**AC-6: Featured projects grid — 3 or 4 cards, all linked**
```
Given the landing page has projects in the DB matching FEATURED_SLUGS
When  elements with class "lp-feat" are inspected
Then  there are 3 or 4 cards
And   each card's anchor href matches /projects/<slug>
```

**AC-7: Data freshness block — 3 timestamps**
```
Given the landing page is rendered with a live DB
When  the freshness footer is inspected
Then  at least 3 relative-time strings ("ago") are present
And   each is associated with one of: Verra/SRN-PPI, GFW/Sentinel, IDXCarbon
```

**AC-8: Signed-in visitor sees landing; CTA text changes**
```
Given a Google-authenticated session exists
When  the authenticated user visits /
Then  they are NOT redirected (HTTP 200)
And   the primary CTA text is "Open your dashboard →"
And   the "Sign in with Google to save alerts" button is NOT present
```

**AC-9: Build succeeds**
```
Given the T25 code is merged into feature/v0.1-impl
When  npm run build is executed
Then  the exit code is 0
And   the / route is marked as dynamic in the Next.js build output (expected due to auth())
```

**AC-10: Mobile layout — no horizontal overflow**
```
Given a 320 px-wide viewport
When  the landing page is rendered
Then  the hero left and right columns are stacked vertically (not side by side)
And   no horizontal scrollbar appears (document.body.scrollWidth ≤ 320)
```

**AC-11: Map code-split and loads within 3 seconds**
```
Given the Next.js .next/static/chunks directory is inspected after build
When  chunk file names are examined
Then  a separate chunk containing "maplibre" or "SatelliteMapHero" exists
     (confirming dynamic import split)
And   in a Lighthouse / WebPageTest run with a Fast 3G profile, the MapLibre canvas
     is interactive within 3 seconds of navigation start (progressive enhancement —
     page content is visible before map renders)
```

## 5. Inputs & outputs

### Inputs

- DB tables: `projects`, `project_scores`, `satellite_alerts`, `idx_monthly_snapshots`,
  `regulatory_events`, `registries`.
- `NEXT_PUBLIC_ESRI_BASEMAP_URL` (env var, already defined for T13 EsriBaseLayer).
- `NEXTAUTH_SECRET` / `NEXTAUTH_URL` (already present).

### Outputs — files created or edited

#### New files

| Path | Purpose |
|------|---------|
| `components/landing/SatelliteMapHero.tsx` | Client component — wraps MapLibreBase + EsriBaseLayer + SatelliteAlertsLayer for the landing hero. Accepts `landingMapData`, renders map or static image fallback via error boundary. |
| `components/landing/Ticker.tsx` | Server component — renders `.lp-ticker-inner` with 6 `TickerItem` sub-components. |
| `components/landing/PipelineCard.tsx` | Server component — single `.lp-pipeline` card. |
| `components/landing/PersonaCard.tsx` | Server component — single `.lp-role` card. |
| `components/landing/DataFreshness.tsx` | Server component — `.lp-freshness` bar + link grid. |
| `lib/queries/landing-map.ts` | Server-only. Exports `getLandingMapData()` → `LandingMapData`. See §5 data additions. |

#### Edited files

| Path | Change |
|------|--------|
| `app/(public)/page.tsx` | Full replacement — Server Component using new layout. `export const revalidate = 600`. |
| `components/landing/HeroSection.tsx` | Replace T18 markup with `lp-hero` left-column only; move auth CTA logic to secondary position. |
| `components/landing/FeaturedProjects.tsx` | Replace card markup with `lp-feat-*` CSS class hierarchy; keep `FeaturedProject[]` prop interface. |
| `components/landing/StatCard.tsx` | Keep as-is (used inside `lp-hero-stats` strip — may be replaced by inline markup; evaluate during implementation). |
| `lib/queries/landing-stats.ts` | Additive — new exported fields on `LandingStats` type and in `getLandingStats()` SQL. |
| `app/globals.css` | Additive only — append the T25-scoped `lp-*` class blocks listed below. Budget: **< 300 new lines** (excluding out-of-scope methodology and closer blocks). No existing class is removed or overridden. Font-family references must use `var(--font-instrument-serif)` and `var(--font-ibm-plex-mono)` (not bare font names from the prototype). |

**Exact class list to add** (ported from `legacy/prototype/styles.css`, sections noted below;
exclude `.lp-method`, `.lp-method-inner`, `.lp-method-h`, `.lp-method-fade`,
`.lp-method-stats`, `.lp-ms-v`, `.lp-ms-l`, `.lp-closer`, `.lp-closer-inner`,
`.lp-closer-h`, `.lp-closer-sub` — those are out of scope for T25):

| Block | Classes |
|---|---|
| Hero | `.lp-hero`, `.lp-hero-inner`, `.lp-kicker`, `.lp-kicker-dot`, `.lp-kicker-sep`, `.lp-h1`, `.lp-h1-em`, `.lp-tag-en`, `.lp-tag-id`, `.lp-cta`, `.lp-hero-stats`, `.lp-hs-v`, `.lp-hs-l`, `.lp-hero-right`, `.lp-hero-caption` |
| Ticker | `.lp-ticker`, `.lp-ticker-inner`, `.lp-ticker-item`, `.lp-ti-label`, `.lp-ti-value`, `.lp-ti-delta` (+ `.up`, `.down`, `.flat` modifier rules) |
| Generic section | `.lp-section`, `.lp-section-head`, `.lp-eyebrow`, `.lp-h2`, `.lp-section-lead`, `.lp-section-link` |
| Pipelines | `.lp-pipeline-grid`, `.lp-pipeline`, `.lp-pipeline-num`, `.lp-pipeline-title`, `.lp-pipeline-stat`, `.lp-pipeline-stat-label`, `.lp-pipeline-body`, `.lp-pipeline-cta` |
| Featured grid | `.lp-featured-grid`, `.lp-feat`, `.lp-feat-thumb`, `.lp-feat-svg`, `.lp-feat-chip`, `.lp-feat-body`, `.lp-feat-name`, `.lp-feat-meta`, `.lp-feat-row`, `.lp-feat-stat-l`, `.lp-feat-stat-v` (+ `.mono` modifier) |
| Roles | `.lp-roles-grid`, `.lp-role`, `.lp-role-num`, `.lp-role-title`, `.lp-role-body` |
| Freshness (new — not in prototype) | `.lp-freshness`, `.lp-freshness-inner`, `.lp-freshness-timestamps`, `.lp-freshness-link-row` |
| Map fallback (new — not in prototype) | `.lp-map-fallback` |
| Responsive `@media` blocks | `@media (max-width: 1100px)` and `@media (max-width: 640px)` rules for the above classes only — omit lp-method/lp-closer lines from those blocks |

Estimated line count after trimming out-of-scope blocks and adding the two new blocks:
~260–280 lines (comfortably under the 300-line budget).

#### Components retired (do not delete — leave in place, but no longer imported)

- `components/landing/DataSources.tsx` — superseded by `DataFreshness.tsx`. Remove its import
  from `app/(public)/page.tsx`. File stays to avoid breaking any other references; add a JSDoc
  `@deprecated` comment pointing to `DataFreshness`.

### Data additions to `lib/queries/landing-stats.ts`

Add to `LandingStats` type and `getLandingStats()` aggregate query:

```typescript
// Ticker additions
activeAlerts30d: number;       // satellite_alerts WHERE alert_date >= NOW() - 30d (all projects)
idxParticipantCount: number | null;  // latest idx_monthly_snapshots.registered_participants; null if no rows
vcusTradedYtd: string | null;  // SUM(total_volume_tco2e) from idx_monthly_snapshots WHERE period_month >= Jan 1 current year; formatted with formatVolume()
```

Add to `zeroStats()` accordingly.

`idxParticipantCount` reads `idx_monthly_snapshots.registered_participants` (confirmed present
in `001_init.sql` line 112, type `INT`; populated by the IDXCarbon scraper). Column is NOT
`participant_count`. Query the latest row: `SELECT registered_participants FROM
idx_monthly_snapshots ORDER BY period_month DESC LIMIT 1`. Fallback: `null` if table is empty.

### New file: `lib/queries/landing-map.ts`

```typescript
export type LandingMapData = {
  katinganCentroid: GeoJSON.Feature<GeoJSON.Point> | undefined;  // from projects table
  katinganBuffer: GeoJSON.Feature<GeoJSON.Polygon> | undefined;  // 10 km buffer — computed via PostGIS ST_Buffer
  alerts: GeoJSON.FeatureCollection<GeoJSON.Point>;  // last-90d satellite alerts (alert_source='INTEGRATED'), project_id = katingan, LIMIT 200
  katinganAlerts90d: number;  // exact count (pre-cap) for caption
};

export async function getLandingMapData(): Promise<LandingMapData>;
```

Implementation notes:

- Katingan slug: `'katingan-peatland-restoration-and-conservation-project'` (from FEATURED_SLUGS).
- Centroid: `SELECT ST_AsGeoJSON(centroid)::json FROM projects WHERE slug = $1`.
- Buffer: `SELECT ST_AsGeoJSON(ST_Buffer(centroid::geography, 10000)::geometry)::json FROM projects WHERE slug = $1`.
  (10,000 metres = 10 km; use `::geography` so buffer is in metres, not degrees.)
- Alerts: `SELECT id, alert_date, confidence, area_ha, ST_AsGeoJSON(location)::json AS geom FROM satellite_alerts WHERE project_id = (SELECT id FROM projects WHERE slug = $1) AND alert_date >= NOW() - INTERVAL '90 days' ORDER BY alert_date DESC LIMIT 200`. No `alert_source` filter — the scraper writes `'INTEGRATED'` (GFW integrated-alerts superset); filtering by `'RADD'` would return zero rows.
- Wrap in try/catch; on error return `{ katinganCentroid: undefined, katinganBuffer: undefined, alerts: emptyFeatureCollection, katinganAlerts90d: 0 }`. Use `undefined` (not `null`) to match the `SatelliteAlertsLayer` prop type `buffer?: BufferCollection`.
- GeoJSON feature properties for each alert: `{ alertDate, confidence, areaHa }` — matches what `SatelliteAlertsLayer` already reads.

## 6. Dependencies & interactions

- **Blocked by**: none (all T13 map infrastructure is in place).
- **Blocks**: T26 (project thumbnail images for featured cards).
- **Uses (read-only)**: T13 (`MapLibreBase`, `EsriBaseLayer`, `SatelliteAlertsLayer`,
  `ProjectCentroidLayer`); T18 (`LandingStats`, `FEATURED_SLUGS`, `FeaturedProject` type).
- **Middleware (T08/proxy.ts)**: `/` is in the public bypass list; no change needed.
- **Auth (T05)**: `auth()` still called in page to branch the secondary CTA. Route remains
  dynamic. `revalidate = 600` is compatible with dynamic routes in Next.js App Router (the page
  is server-rendered per request but can be cached by the edge/CDN if `Cache-Control` headers
  permit — acceptable for v0.1).

### Cross-story coordination

**T24 (`/methodology` route):** The `DataFreshness.tsx` footer includes a `/methodology` link.
If T24 has not landed when T25 ships, this link will 404. This is a known and accepted ordering
dependency for v0.1 — the link is included so T25's footer is not silently incomplete when T24
ships. No conditional rendering based on T24 status.

**T26 (landing metadata + project thumbnails):** T25 must NOT add `export const metadata` or
`generateMetadata` to `app/(public)/page.tsx`. T26 owns all per-page metadata via
`generateMetadata`. Featured project card thumbnails are SVG placeholders in T25; T26 replaces
them with real satellite images. T25 preserves the `FeaturedProject[]` prop interface so T26's
change is additive.

**No `export const metadata` in page.tsx:** enforced as a DoD item (see §8).

### File ownership

This story exclusively owns:

```
app/(public)/page.tsx
components/landing/SatelliteMapHero.tsx  (new)
components/landing/Ticker.tsx            (new)
components/landing/PipelineCard.tsx      (new)
components/landing/PersonaCard.tsx       (new)
components/landing/DataFreshness.tsx     (new)
components/landing/HeroSection.tsx       (edit)
components/landing/FeaturedProjects.tsx  (edit)
lib/queries/landing-stats.ts             (edit — additive fields only)
lib/queries/landing-map.ts              (new)
app/globals.css                          (edit — additive .lp-* classes only)
```

Do **not** touch: `components/map/*`, `lib/queries/map-geojson-types.ts`, `lib/auth.ts`.

## 7. Edge cases & failure modes

**(i) Katingan has 0 alerts in the 90-day window**
Caption renders: "Live monitoring · Katingan Peatland, Central Kalimantan · 0 satellite alerts in last 90 days".
`SatelliteAlertsLayer` receives an empty FeatureCollection — no points rendered, no error.

**(ii) DB is completely down**
`getLandingStats()` and `getLandingMapData()` both catch and return zero/null structs.
Page renders with "—" for all numeric stats; featured projects grid shows the
`projects.length === 0` empty state ("Featured projects coming soon."); freshness timestamps
show "—" instead of relative times. No HTTP 500.

**(iii) MapLibre fails to load (adblock / WebGL disabled / JS off)**
`SatelliteMapHero` wraps the `dynamic(...)` import in a thin `MapErrorBoundary` class component
(defined inside `components/landing/SatelliteMapHero.tsx` — no changes to `components/map/*`).
`MapLibreBase` catches constructor errors internally and renders a "Map unavailable" div — it
does NOT re-throw or call an `onError` prop. Therefore `SatelliteMapHero` cannot rely on an
`onError` signal from `MapLibreBase`; the React Error Boundary catches errors that propagate
from the `dynamic` import wrapper boundary. When the boundary catches, it renders:
```html
<img src="/og-image.png" alt="Katingan Peatland satellite view" class="lp-map-fallback" />
```
`lp-map-fallback` CSS: `width: 100%; border-radius: var(--radius-lg); aspect-ratio: 16/9; object-fit: cover;`.
If JS is entirely off (SSR only), the `dynamic(..., { ssr: false })` import renders nothing
server-side — the right column will be blank until hydration. Add a `<noscript>` block inside
`components/landing/SatelliteMapHero.tsx` (not in `app/layout.tsx`, which is not T25-owned and
affects all routes). The `<noscript>` should render the same
`<img src="/og-image.png" alt="Katingan Peatland satellite view" className="lp-map-fallback" />`
as the error boundary fallback.

**(iv) Bot / crawler (Googlebot, Twitterbot)**
Server render delivers full HTML: H1, taglines, ticker values, pipeline cards, featured project
links, persona blurbs, and freshness timestamps. The map canvas is absent in SSR output (by
design — `ssr: false`). This is acceptable progressive enhancement; all text content needed
for SEO and social cards is in the SSR payload.

**(v) `idx_monthly_snapshots` table is empty (no snapshots yet ingested)**
The column `registered_participants` is confirmed present in `001_init.sql` (no schema guard
needed). If the table has no rows, the query returns no result; `idxParticipantCount` falls back
to `null` — ticker item 3 renders "—". No `information_schema` check required.

**(vi) `vcusTradedYtd` is 0 at the start of a new year (no snapshots yet)**
`formatVolume(0)` returns `"0 tCO₂e"`. Ticker item displays "0 tCO₂e" — not hidden.

## 8. Definition of done

- [ ] All 11 acceptance criteria pass (manual verification + build check).
- [ ] Story's files landed in `feature/v0.1-impl` (no conflicts with parallel T26 work).
- [ ] `npm run build` exits 0; no TypeScript errors; no ESLint errors.
- [ ] CHANGELOG entry added under `[Unreleased]`: `T25 — Landing redesign with satellite map visual`.
- [ ] `TASKS.md` status flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.
- [ ] `app/globals.css` diff is additive only — CI reviewer confirms no existing selectors removed; new `lp-*` lines ≤ 300.
- [ ] `DataSources.tsx` has `@deprecated` JSDoc comment; is not imported anywhere.
- [ ] Hero caption uses "satellite alerts" (not "RADD alerts") — confirmed in rendered HTML.
- [ ] All `getLandingMapData` and `getLandingStats` queries reference `registered_participants` (not `participant_count`).
- [ ] Ticker delta labels are MoM for IDXCarbon-sourced items (rows 1–3) and WoW for alerts (row 4).
- [ ] `globals.css` new block contains exactly the classes enumerated in §5 — no lp-method/lp-closer rules added.
- [ ] `SatelliteMapHero` contains a `MapErrorBoundary` class component (no modifications to `components/map/*`).
- [ ] No `export const metadata` and no `generateMetadata` in `app/(public)/page.tsx` (T26 owns metadata).
- [ ] OQ-4 (Permenhut 6/2026 slug) resolved: implementer has confirmed the live `regulatory_events` slug before ship.
- [ ] `/methodology` link present in `DataFreshness.tsx` footer (temporarily 404s until T24 lands — known and accepted).

## 9. Open questions

1. **H1 copy** — **CLOSED.** Keep verbatim "Every credit, every policy, *one lens.*" Revisit
   post-launch based on conversion data if needed.

2. **Featured projects — 3 or 4 cards?** — **CLOSED.** 3 cards (Katingan, Rimba Raya, Sumatra
   Merang), 3-column grid (`repeat(3, 1fr)`). A fourth project may be added in a follow-up
   ticket; the CSS grid will accommodate it without layout changes.

3. **`idxParticipantCount` column name** — **CLOSED.** Column exists as `registered_participants`
   (INT) in `idx_monthly_snapshots` (confirmed in `001_init.sql` line 112). No schema migration
   needed. Query reads `registered_participants`, not `participant_count`.

4. **Permenhut 6/2026 regulatory event ID** — **OPEN.** The second CTA links to
   `/regulatory?focus=permenhut-6-2026`. Implementer must query `regulatory_events` to confirm
   the exact slug or `document_number` before hardcoding the query param. This is a DoD blocker
   — do not ship with a placeholder that cannot be resolved to a live row.

## 10. References

- Prototype source: `legacy/prototype/src/Landing.jsx` (lines 1–244).
- Prototype SatelliteMap: `legacy/prototype/src/SatelliteMap.jsx` — compact mode (no sidebar,
  no layer toggles). T25 replaces SVG with real MapLibre.
- Prototype CSS: `legacy/prototype/styles.css` lines 1118–1588 (all `.lp-*` classes).
- T13 map spec: `docs/stories/T13-map-integration.md` — MapLibreBase, EsriBaseLayer,
  SatelliteAlertsLayer (reused as-is).
- T18 landing spec: `docs/stories/T18-landing-page.md` — stat cards and data layer being replaced.
- Current `lib/queries/landing-stats.ts` — existing LandingStats type being extended.
- Current `app/(public)/page.tsx` — T18 implementation being replaced.
- Design tokens: `app/globals.css` (existing `.kl-*` classes and CSS custom properties).
