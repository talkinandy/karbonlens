---
id: T13
title: Map integration (MapLibre) — explorer tab + detail panel
phase: 3
status: done
blocked_by: [T11, T12]
blocks: []
owner: tbd
effort_estimate: 6h
---

## 1. User story

As an authenticated analyst, I want an interactive satellite map on the projects explorer (as a tab) and on each project detail page (as a panel below the issuances table), so that I can visually locate projects across Indonesia, see deforestation alert density around each project buffer, and navigate from map to detail in one click.

---

## 2. Context & rationale

T03 created the `components/map/` directory stub. T11 built the `/projects` table view. T12 built the `/projects/[slug]` detail page with a map placeholder. T13 fills both placeholders with real MapLibre GL JS v5 maps.

MapLibre GL JS v5 is MIT-licensed and requires no token. Esri World Imagery tiles are public and free for display use. PostGIS geography columns (`projects.centroid`, `satellite_alerts.location`) return opaque text through Drizzle's `customType` — they must be serialized to GeoJSON on the server before being passed to the client.

This story is narrowly scoped to two surfaces: an explorer tab at `/projects?tab=map` and a detail panel at `/projects/[slug]#map`. A full `/map` screen (Map C in the design addendum) is deferred to v0.2.

---

## 3. Scope

### In scope

1. **Install MapLibre GL JS v5.**
   ```bash
   npm i maplibre-gl
   ```
   Pin `maplibre-gl` at v5+ in `package.json`. No MapBox token referenced anywhere.

2. **`components/map/MapLibreBase.tsx`** — client component (`"use client"`) that initialises a MapLibre `Map` instance inside a `div` ref. Props:
   - `center: [number, number]` — `[longitude, latitude]`
   - `zoom: number`
   - `children?: React.ReactNode` — slot for layer components (rendered after map is ready via context)
   - Exposes the MapLibre `Map` instance via a `MapContext` React context so child layer components can access it without prop drilling.
   - Must be dynamically imported everywhere it is used via `next/dynamic` with `ssr: false`. The component itself may be a normal client component; the `ssr: false` wrapper lives at each usage callsite.
   - Shows a loading skeleton (`animate-pulse bg-neutral-800`) while the map initialises.
   - On init failure, renders a fallback `<div>` with text "Map unavailable — try refresh".

3. **`components/map/EsriBaseLayer.tsx`** — client component consumed inside `MapLibreBase`. Adds the Esri World Imagery raster source and a `raster` style layer. Specific values:
   - Tile URL: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
   - Attribution: `"Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"`
   - Apply `filter: saturate(0.85)` via the raster layer `paint` property (`raster-saturation: -0.15` in MapLibre terms — equivalent to 85% saturation).
   - Tile size: 256.

4. **`components/map/ProjectCentroidLayer.tsx`** — client component. Props:
   - `features: GeoJSON.FeatureCollection` — centroids from `getProjectCentroidsFeatureCollection()`.
   - Adds a GeoJSON source and a `circle` layer. On click, opens a MapLibre `Popup` showing the project name, `integrity_score` (from `properties.score`; rendered as `"Score: 74"` or `"Score: —"` if null), and a "View detail →" link to `/projects/[slug]`.
   - Markers are tab-focusable (keyboard accessibility: `tabIndex={0}`, Enter/Space opens popup, Escape closes popup).
   - Skips features whose geometry is null (projects with NULL centroid in DB).

5. **`components/map/SatelliteAlertsLayer.tsx`** — client component. Props:
   - `features: GeoJSON.FeatureCollection` — alert points from `getProjectAlertsFeatureCollection()`.
   - Color-codes by `confidence` property: `high` → `#ef4444` (red), `nominal` → `#f97316` (orange), `low` → `#eab308` (yellow).
   - Enables MapLibre clustering (`cluster: true` on the GeoJSON source). At zoom < 8, clustered circles are shown. At zoom ≥ 8, individual points are shown.
   - Uses `cluster-count` symbol layer for cluster badge text.
   - **Cluster click:** Wire `map.on('click', clusterLayerId, ...)` to call `map.easeTo({ center: clusterCoordinates, zoom: currentZoom + 2 })`. Without this explicit handler, cluster circles are non-interactive by default. Exact pattern:
     ```ts
     map.on('click', 'alerts-clusters', (e) => {
       const features = map.queryRenderedFeatures(e.point, { layers: ['alerts-clusters'] });
       const clusterId = features[0].properties?.cluster_id;
       const source = map.getSource('alerts') as maplibregl.GeoJSONSource;
       source.getClusterExpansionZoom(clusterId, (err, zoom) => {
         if (err) return;
         map.easeTo({ center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 2 });
       });
     });
     ```
   - **Individual alert click:** Clicking a non-clustered alert point opens a MapLibre `Popup` showing `alertDate`, `confidence` (badge colour-coded), and `areaHa`.

6. **Explorer map tab** (`/projects?tab=map`):
   - Renders when `searchParams.tab === 'map'`; the existing table renders when `tab` is absent or `'table'`.
   - Tab toggles update the URL (`?tab=table` / `?tab=map`) so the view is shareable.
   - Map shows all 64 project centroids as clickable markers via `ProjectCentroidLayer`.
   - Initial bounds fit Indonesia: approximately longitude 95–141, latitude −11 to 6 (`map.fitBounds([[95, -11], [141, 6]])`).
   - Clicking a marker opens a popup with project name + "View detail →" link to `/projects/[slug]`.

7. **Detail map panel** (`/projects/[slug]` — `#alerts` section):
   - Rendered inside the `<section id="alerts">` that T12 shipped. T13 replaces the `<div class="kl-map-placeholder">Map coming in T13</div>` element that T12 left inside that section. The `id="alerts"` anchor **must not be moved or removed** — T16 (notifications) deep-links to it.
   - T13 modifies `app/(app)/projects/[slug]/page.tsx` only inside the `kl-map-placeholder` div within `<section id="alerts">`. No other markup in the file may be changed.
   - Center: project centroid. Initial zoom: fit ~30 km around centroid (approximately zoom 10).
   - Layers: `EsriBaseLayer` + `SatelliteAlertsLayer` (last 90 days of alerts for this project) + a filled polygon representing the 10 km buffer (GeoJSON polygon from `getProjectBufferFeatureCollection()`).
   - Buffer polygon layer: fill colour `rgba(59, 130, 246, 0.15)`, stroke `#3b82f6`, stroke width 1.5px.
   - If the project centroid is NULL, render a `<div>` with text "No location data available for this project."
   - **Alert cap UI:** When `alertsGeoJSON.properties?.truncated` is true, render a notice directly below the map container:
     ```
     Showing 5,000 of {total} alerts — <a href="/projects/[slug]/alerts">see all in alerts inbox</a>
     ```
     The `ALERTS_MAP_LIMIT` constant is imported from `lib/queries/map-geojson.ts` to format the "5,000" figure programmatically rather than hardcoding it.

8. **Server-side GeoJSON helper** — `lib/queries/map-geojson.ts`. Three exported async functions (all run server-side only; must not be imported by client components directly):

   - **`getProjectCentroidsFeatureCollection()`** — queries all projects with a non-null centroid. Uses PostGIS `ST_AsGeoJSON(centroid::geometry)::jsonb` to serialize. Returns a `GeoJSON.FeatureCollection` where each feature has:
     ```ts
     {
       type: "Feature",
       geometry: { type: "Point", coordinates: [lon, lat] },
       properties: { slug: string, name: string, score: number | null }
     }
     ```
     Score is joined from `project_scores` (latest row per project, ordered by `score_date DESC LIMIT 1`). If no score row exists, `score` is `null`.

   - **`getProjectAlertsFeatureCollection(projectId: string, days = 90)`** — queries `satellite_alerts` where `project_id = projectId` and `alert_date >= NOW() - INTERVAL '${days} days'`. Uses `ST_AsGeoJSON(location::geometry)::jsonb`. Applies `LIMIT ALERTS_MAP_LIMIT` (see constant below). Returns a `GeoJSON.FeatureCollection` where each feature has:
     ```ts
     {
       type: "Feature",
       geometry: { type: "Point", coordinates: [lon, lat] },
       properties: { alertDate: string, confidence: "high" | "nominal" | "low", areaHa: number }
     }
     ```
     When the total matching rows exceeds `ALERTS_MAP_LIMIT`, include a top-level `properties` object on the FeatureCollection indicating the cap:
     ```ts
     {
       type: "FeatureCollection",
       properties: { truncated: true, total: N },  // N = COUNT(*) of uncapped result
       features: [...]  // capped at ALERTS_MAP_LIMIT
     }
     ```
     When the result is not capped, `properties` is `null` or omitted. The total count is obtained via a parallel `SELECT COUNT(*)` query in the same function (not a second round-trip — run both queries concurrently with `Promise.all`).

     **`ALERTS_MAP_LIMIT` constant** — defined at the top of `lib/queries/map-geojson.ts`:
     ```ts
     export const ALERTS_MAP_LIMIT = 5000;
     ```
     This value is exported so the UI can reference it in the truncation message (see §3 item 7 and the detail map panel below).

   - **`getProjectBufferFeatureCollection(projectId: string)`** — queries the project's centroid and `buffer_km`. Uses `ST_AsGeoJSON(ST_Buffer(centroid::geometry, buffer_km * 1000 / 111320.0))::jsonb` (approximate degree-based buffer — sufficient for v0.1). Returns a single-feature `GeoJSON.FeatureCollection` whose geometry is a Polygon.

   All three functions throw if called with an invalid `projectId` that doesn't exist. They return an empty FeatureCollection (not null) when there are no matching rows.

9. **Update T11's `app/(app)/projects/page.tsx`** — narrow change only: add a tab bar (Table / Map) and render the map container when `tab === 'map'`. Do not refactor T11's query logic or filter bar. Coordinate with T11 implementer: T13 merges after T11.

10. **Update T12's `app/(app)/projects/[slug]/page.tsx`** — narrow change only: replace the map placeholder `<div>` with the detail map panel. Pass `centroid`, `projectId`, and `bufferKm` props. Do not refactor T12's query logic, stat cards, or issuances chart. Coordinate with T12 implementer: T13 merges after T12.

11. **Loading skeleton:** The `MapLibreBase` component shows an `animate-pulse bg-neutral-800 rounded` placeholder div (same height as the map container) while MapLibre JS is loading. The skeleton disappears once the `map.on('load', ...)` event fires.

12. **Keyboard accessibility:**
    - The map container `div` must have `tabIndex={0}` so it can receive keyboard focus. MapLibre's built-in keyboard handler (enabled by default) then provides arrow-key pan and +/- zoom when the container is focused. Do **not** set `keyboard: false` in the MapLibre constructor options.
    - The map container must have `role="application"` and `aria-label="Satellite map of Indonesian carbon projects"` (explorer) or `aria-label="Satellite map of [project name]"` (detail panel). Do not use `role="region"` — `application` is correct for interactive widget regions.
    - Marker popups are reachable via keyboard (tab focus on marker elements; Enter/Space opens popup).
    - Escape key closes any open popup (`map.on('keydown', ...)` or popup-level handler).

### Out of scope (explicit non-goals)

- Full `/map` screen (Map C from design addendum) — deferred to v0.2.
- Polygon drawing or editing — v0.2.
- Real project boundary polygons from PDD documents — v0.2.
- Layer toggle UI for forest cover, peatland, fire alerts — v0.2.
- Timeline scrubber on alerts — v0.2.
- Street basemap toggle (Map B design addendum) — v0.2.
- Offline tile caching — never.
- MapBox token — never (MapLibre is free; Esri tiles are public).

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Build exits 0 (SSR-safe import)**
```
Given maplibre-gl is installed and all map components use next/dynamic with ssr: false
When `npm run build` is run
Then the process exits 0 with no TypeScript or module resolution errors
```

**AC-2: Explorer map tab renders (manual verification)**
```
Given an authenticated session
When GET /projects?tab=map is requested
Then the response HTML contains a MapLibre container element
And (in browser) 64 marker elements are visible on the Indonesia map
Note: Full marker count verification requires a browser; HTTP-level check confirms
      the container is present. Document as "verified manually in browser" in PR description.
```

**AC-3: Detail map panel renders for Katingan**
```
Given an authenticated session
When GET /projects/katingan-peatland is requested
Then the response HTML contains the id="alerts" section element
And the kl-map-placeholder div is replaced by the MapLibre container
And (in browser) MapLibre renders with Esri satellite tiles
And the 10 km buffer polygon is visible around Katingan's centroid
And at least some alert points are visible (Katingan has 428 alerts in DB)
Note: Visual verification required in browser; document as manual check in PR.
```

**AC-10: Alert cap indicator shown when truncated**
```
Given a project whose satellite alerts for the last 90 days exceed ALERTS_MAP_LIMIT (5000)
When the detail map panel is rendered
Then the FeatureCollection has properties.truncated === true and properties.total === N
And the UI renders "Showing 5,000 of N alerts — see all in alerts inbox" below the map
And the "see all in alerts inbox" text is an anchor link to /projects/[slug]/alerts
```

**AC-4: Marker click opens popup with project name**
```
Given the explorer map is loaded in a browser at /projects?tab=map
When a project centroid marker is clicked
Then a MapLibre popup appears
And the popup contains the project's canonical name
And the popup contains a link that navigates to /projects/[slug] on click
```

**AC-5: Esri tiles load (manual network check)**
```
Given the map is rendered in a browser
When the browser DevTools Network tab is open
Then requests to server.arcgisonline.com return HTTP 200
And no requests to api.mapbox.com are made
Note: Manual network tab verification. Document result in PR description.
```

**AC-6: GeoJSON helper returns valid FeatureCollection**
```
Given the database has 64 projects with centroids
When getProjectCentroidsFeatureCollection() is called (e.g. via a one-off server script)
Then the result has type "FeatureCollection"
And features.length equals 64
And each feature has geometry.type === "Point"
And each feature has geometry.coordinates as [number, number]
And each feature has properties.slug, properties.name present and non-null
```

**AC-7: TypeScript compiles clean**
```
Given all map components and lib/queries/map-geojson.ts are in place
When `npx tsc --noEmit` is run
Then the process exits 0 with no type errors
```

**AC-8: Alert clustering by zoom level (manual verification)**
```
Given the detail map is loaded in a browser with SatelliteAlertsLayer active
When the map is at zoom < 8
Then alert points are grouped into cluster circles with a count badge
When the map is zoomed to >= 8
Then individual alert points are shown, color-coded by confidence
Note: Manual browser verification. Document in PR description.
```

**AC-9: No MapBox token references**
```
Given the full repository
When `grep -r "mapbox" . --include="*.ts" --include="*.tsx" --include="*.json" \
      --exclude-dir=node_modules -i` is run
Then no matches are returned outside of node_modules
And no MAPBOX_TOKEN or similar env var is present in .env.example
```

---

## 5. Inputs and outputs

### Inputs

- `DATABASE_URL` (existing env var from T04)
- `projects` table: `centroid GEOGRAPHY(POINT, 4326)`, `buffer_km NUMERIC`, `slug`, `name_canonical`
- `satellite_alerts` table: `location GEOGRAPHY(POINT, 4326)`, `alert_date`, `confidence`, `area_ha`, `project_id`
- `project_scores` table: `integrity_score`, `score_date`, `project_id`
- T11's `app/(app)/projects/page.tsx` (modified in place with tab bar)
- T12's `app/(app)/projects/[slug]/page.tsx` (modified in place to mount map panel)

### Outputs

New files created:
```
components/map/MapLibreBase.tsx
components/map/EsriBaseLayer.tsx
components/map/ProjectCentroidLayer.tsx
components/map/SatelliteAlertsLayer.tsx
lib/queries/map-geojson.ts
```

Modified files:
```
package.json                                 — add maplibre-gl dependency
app/(app)/projects/page.tsx                  — add tab bar + map branch (narrow change)
app/(app)/projects/[slug]/page.tsx           — replace map placeholder with panel (narrow change)
```

No new env vars. No new migrations. No new API routes (GeoJSON data flows via server component props, not an API route).

---

## 6. Dependencies and interactions

### Upstream (what this story needs)

| Story | What T13 needs |
|---|---|
| T11 | `app/(app)/projects/page.tsx` with working DB query; T13 adds tab bar only |
| T12 | `app/(app)/projects/[slug]/page.tsx` with working DB query and `#map` placeholder; T13 replaces placeholder |
| T03 | `components/map/` directory stub |
| T04 | Drizzle client (`lib/db.ts`) and schema for raw SQL geography queries |

### Downstream (what depends on this story)

None within v0.1. T23 (live deploy) transitively depends on all screens being complete.

### Merge order

T13 must merge **after** both T11 and T12 are merged into `feature/v0.1-impl`. T13's branch is based on `feature/v0.1-impl` post-T11-T12. The implementer must rebase onto the latest `feature/v0.1-impl` before opening the T13 PR to avoid conflicts on the two page files.

### File ownership

T13 is the **sole owner** of:
- `components/map/MapLibreBase.tsx`
- `components/map/EsriBaseLayer.tsx`
- `components/map/ProjectCentroidLayer.tsx`
- `components/map/SatelliteAlertsLayer.tsx`
- `lib/queries/map-geojson.ts`

T13 makes **narrow, coordinated changes** to (T11 and T12 own these files; T13 implementer must not refactor logic outside the map-related sections):

- **`app/(app)/projects/page.tsx`** — add tab bar and map branch only. Cross-story contract with T11:
  - T11's spec (§3.3) declares the page as a Next.js server component with no `'use client'` directive. T13 must preserve this. Only the `MapLibreBase` wrapper (and descendants) use `next/dynamic` with `ssr: false`; the page component itself remains a server component.
  - T11's `searchParams` shape includes `tab?: 'table' | 'map'` (deferred in T11 §4 "Out of scope: Map tab on `/projects` — T13"). T13 reads `searchParams.tab` and renders `<ProjectsTable>` when `tab` is absent or `'table'`, and the explorer map panel when `tab === 'map'`. Cross-reference T11 §3.3 for the full `searchParams` parsing rules.
  - Concrete render slot (server component, GeoJSON fetched server-side):
    ```tsx
    {resolvedSearchParams.tab === 'map' ? (
      <Suspense fallback={<div className="animate-pulse bg-neutral-800 rounded h-[60vh]" />}>
        <MapExplorerTab features={centroidsGeoJSON} />
      </Suspense>
    ) : (
      <ProjectsTable rows={rows} />
    )}
    ```
    `centroidsGeoJSON` is fetched via `getProjectCentroidsFeatureCollection()` in the server component, passed as a prop. Only `MapExplorerTab` (and `MapLibreBase` inside it) is dynamically imported with `ssr: false`.

- **`app/(app)/projects/[slug]/page.tsx`** — replace the `kl-map-placeholder` div inside `<section id="alerts">` only. T13 modifies only that specific `<div>` element. The `id="alerts"` attribute on the parent `<section>` must not be renamed or removed — T16 (notifications bell + inbox) deep-links to `#alerts`. Cross-reference T12 §3.2 for the exact placeholder HTML.

T13 adds `maplibre-gl` to `package.json`. No other `package.json` changes.

---

## 7. Edge cases and failure modes

**Project with NULL centroid.** `getProjectCentroidsFeatureCollection()` filters `WHERE centroid IS NOT NULL` — null-centroid projects are silently excluded from the map. The detail page checks for null centroid before mounting the map panel and renders "No location data available for this project." instead. Total expected null-centroid projects in v0.1: ~0 (T06 seeds centroids for all 64 active projects), but the defensive check is required.

**Alert outside project buffer.** T07 filters alerts via geostore intersection, so all alerts in DB should be within the buffer. If one appears outside (data anomaly), it is displayed without special treatment — no client-side filtering needed. The detail map zoom (~30 km) will show it.

**MapLibre fails to load (network/CDN issue).** `MapLibreBase` wraps the `new Map()` call in try/catch. On failure, it renders a fallback `<div className="flex items-center justify-center bg-neutral-900 text-neutral-400">Map unavailable — try refresh</div>` at the same height as the map container.

**Slow Esri tile server.** The map renders as soon as MapLibre initialises (vector style is empty). Raster tiles stream in as they load. The loading skeleton is shown during MapLibre init only, not during tile streaming. Users see a partially-tiled map, which is acceptable.

**Esri rate limiting unkeyed clients.** Esri occasionally throttles unregistered clients under high load. Acceptable for v0.1 (low traffic). Mitigation in v0.2: register an Esri developer API key (free tier) or switch to a self-hosted tile source.

**MapLibre CSS not loaded.** `maplibre-gl/dist/maplibre-gl.css` must be imported in the `MapLibreBase` component file (not in `globals.css`) to keep the import co-located with the component. Forgetting this causes invisible or broken map controls.

**Mobile viewport.** The map container uses `w-full h-[50vh] md:h-[60vh]`. Touch pan and pinch-zoom are handled natively by MapLibre. No special mobile code is required beyond responsive height. The sidebar overlay from Map C (v0.2) does not apply here.

**`next/dynamic` and TypeScript types.** Dynamically imported components lose prop type inference. Export the component's `Props` type from the source file and import it at the callsite for explicit type annotation on the `DynamicComponent` variable.

**PostGIS buffer in degrees vs metres.** `ST_Buffer` on a `geometry` (not `geography`) type operates in the CRS units (degrees for EPSG:4326). The helper uses the approximation `buffer_km * 1000 / 111320.0` to convert km to degrees at the equator. This is accurate to within ~2% for Indonesian latitudes. Do not use `ST_Buffer` on the raw `geography` type — cast to `geometry` first, as noted in the query.

---

## 8. Definition of done

- [ ] All ten acceptance criteria pass (AC-2, AC-3, AC-4, AC-5, AC-8, AC-10 documented as manual browser verification in PR description)
- [ ] `npm run build` exits 0
- [ ] `npx tsc --noEmit` exits 0
- [ ] `grep -r "mapbox" . --include="*.ts" --include="*.tsx" --exclude-dir=node_modules -i` returns no matches
- [ ] `components/map/` contains all four new files
- [ ] `lib/queries/map-geojson.ts` exists with all three exported functions and the `ALERTS_MAP_LIMIT = 5000` exported constant
- [ ] `package.json` lists `maplibre-gl` at v5+ in `dependencies`
- [ ] T11 and T12 page files updated with map integration; no unrelated lines changed in those files
- [ ] Story landed in `feature/v0.1-impl` after T11 and T12 are merged
- [ ] CHANGELOG entry added under `[Unreleased]`: `T13 — Map integration (MapLibre): explorer tab + detail panel`
- [ ] `TASKS.md` T13 status flipped to `done`
- [ ] This story's frontmatter `status` set to `done`

---

## 9. Open questions

**OQ-1: Esri URL stability and rate limiting.**
Esri sometimes rate-limits unauthenticated clients on popular endpoints. For v0.1 with low traffic this is acceptable. For v0.2, Andy should register a free Esri developer key (ArcGIS Location Platform free tier: 2M tile requests/month) or evaluate an alternative raster source (e.g. USGS National Map). No action needed for v0.1.

**OQ-2: Explorer tab URL persistence.**
Recommendation: tab state lives in the URL query param (`?tab=map`), making filtered+tabbed views shareable. Alternative (client-side only toggle) would lose the state on hard refresh and prevent link sharing. Proceeding with URL-based approach unless Andy objects.

**OQ-3: ST_Buffer precision.**
`ST_Buffer` with the default 32 segments produces a polygon with 32 vertices — visually a smooth circle at the scales used here. Sufficient for v0.1. No action needed.

**OQ-4: GeoJSON API route vs server component props.**
Current design passes GeoJSON as server component props (fetched in the page's `async` server component, then JSON-serialized into the component tree). This avoids an extra HTTP round-trip. The tradeoff is that the map data is bundled into the initial HTML payload (~64 features × ~100 bytes each ≈ 6 KB for explorer; capped at 5,000 alerts × ~80 bytes ≈ 400 KB for detail). Explorer payload is within acceptable limits for v0.1; the alert cap introduced by F-1 keeps the detail payload manageable. If detail page alert counts grow significantly post-T07, move to a client-side fetch via `/api/projects/[id]/alerts` in v0.2. Accepted for v0.1.

**OQ-5: Definitive value for `ALERTS_MAP_LIMIT`.**
The cap of 5,000 is based on an estimate of ~80 bytes per alert GeoJSON feature, yielding a ~400 KB embedded payload — acceptable for v0.1. Post T07 Phase B ingestion, Andy should verify whether high-density projects (Mangrove Aceh, South Kalimantan) exceed 5,000 alerts in a 90-day window. If so, consider reducing to 2,000 or switching to a v0.2 client-side API route. No action needed before implementation; constant is exported and easily changed.

---

## 10. References

- `docs/architecture.md` §3 — `projects.centroid GEOGRAPHY(POINT, 4326)`, `satellite_alerts.location GEOGRAPHY(POINT, 4326)`
- `docs/TASKS.md` T13 — original task specification
- `docs/stories/T03-nextjs-bootstrap.md` — `components/map/` directory stub
- MapLibre GL JS v5 docs: https://maplibre.org/maplibre-gl-js/docs/
- Esri World Imagery tile service: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer
- PostGIS `ST_AsGeoJSON`: https://postgis.net/docs/ST_AsGeoJSON.html
- PostGIS `ST_Buffer`: https://postgis.net/docs/ST_Buffer.html
- Next.js dynamic imports (`ssr: false`): https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading#skipping-ssr
