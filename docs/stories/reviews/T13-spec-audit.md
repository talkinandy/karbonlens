# T13 Spec Audit — Map integration (MapLibre)

**Auditor:** adversarial spec-auditor
**Date:** 2026-04-19
**Story:** `docs/stories/T13-map-integration.md`
**Verdict:** CONDITIONAL PASS — 0 hard blockers, 4 required fixes before implementation starts

---

## Summary

The spec is well-structured and internally consistent. SSR safety, PostGIS serialization approach, and Esri attribution are handled correctly. Four issues require resolution before the implementer begins; none are blockers that invalidate the spec's design, but two will cause production pain if left unaddressed.

---

## Findings

### F-1 — REQUIRED: Alert payload cap missing (highest risk)

**Severity:** Required fix (functional regression risk)

`getProjectAlertsFeatureCollection(projectId, days = 90)` has no row limit. Architecture §13 records `satellite_alerts=0` as of 2026-04-19 but T07 Phase B is pending and will ingest alerts for all 64 projects. Per the spec's own AC-3, Katingan has 428 alerts; T12 §2 context describes the DB as holding 247k satellite alerts total. For Mangrove Aceh or other high-density projects, a 90-day window could return 10,000–35,000 rows, producing a raw GeoJSON payload of 3–4 MB embedded in the initial HTML (T13 §9 OQ-4 explicitly acknowledges the prop-passing model). At that size the page will time out on slow connections and inflate First Contentful Paint significantly.

**Required fix:** Add `LIMIT 5000` (configurable constant) to `getProjectAlertsFeatureCollection`. When the result is capped, include a `capped: true, totalCount: number` field on the FeatureCollection `properties` object so the UI can render "Showing 5,000 of 35,596 alerts — refine with time filter". Add an OQ for the definitive limit value.

---

### F-2 — REQUIRED: Cross-story merge conflict path under-specified

**Severity:** Required fix (merge-time integration risk)

T13 §6 "Merge order" correctly states T13 merges after T11 and T12. However, the "File ownership" table still lists `app/(app)/projects/page.tsx` and `app/(app)/projects/[slug]/page.tsx` as files T13 "makes narrow, coordinated changes to" without prescribing a safe integration contract.

T11 owns `projects/page.tsx` as a server component (no `'use client'`). T13 must add a dynamically-imported map tab into that same file. The spec says "coordinate with T11 implementer" but gives no structural contract — no prop interface, no render-slot shape, and no explicit statement that the page must remain a server component after T13's edit.

The detail page (`[slug]/page.tsx`) is similarly underspecified: T12 §3.2 specifies the placeholder as `<div class="kl-map-placeholder">Map coming in T13</div>` inside `id="alerts"`, but T13 §3 item 7 says the detail panel is "below the issuances table, at the `#map` anchor T12 left as a placeholder." T12 has no `#map` anchor — it has `id="alerts"`. This is a direct contradiction.

**Required fix:**
1. Replace "coordinate with implementer" language with a concrete slot contract: T11 renders `{searchParams.tab === 'map' ? <Suspense><MapExplorerTab features={centroidsGeoJSON} /></Suspense> : <ProjectsTable ... />}`. The GeoJSON fetch happens in the server component; only the MapLibre wrapper is dynamically imported.
2. Align §3 item 7 with T12's actual anchor: replace "`#map` anchor T12 left" with "`id=\"alerts\"` section T12 left a `kl-map-placeholder` div inside". The detail map panel replaces that specific `<div>` element; the `id="alerts"` anchor must not be moved.

---

### F-3 — REQUIRED: Cluster click behavior unspecified

**Severity:** Required fix (UX completeness)

`SatelliteAlertsLayer` spec defines cluster rendering (badge count at zoom < 8) but does not specify what happens when a user clicks a cluster circle. MapLibre's default is to do nothing — the implementer must explicitly wire `map.on('click', clusterLayerId, ...)` to call `map.easeTo({ center, zoom: zoom + 2 })`. Without this, clustering is visually present but non-interactive, which is confusing UX.

**Required fix:** Add to `SatelliteAlertsLayer` spec: "Clicking a cluster circle eases the map to zoom +2 centered on the cluster (`map.easeTo({ center: clusterCoordinates, zoom: currentZoom + 2 })`). Clicking an individual alert point opens a popup showing `alertDate`, `confidence`, and `areaHa`."

---

### F-4 — REQUIRED: Zoom/pan keyboard accessibility gap

**Severity:** Required fix (accessibility)

§3 item 12 specifies keyboard focus for marker popups (tab, Enter/Space, Escape) and sets `role="region"` on the container. However, MapLibre's zoom (+/-) and pan (arrow keys) controls are only keyboard-accessible if the map container itself receives focus — not automatic when the `<div>` receives a tab stop. The spec is silent on whether the map container is `tabIndex={0}` and whether native MapLibre keyboard nav is enabled or suppressed.

**Required fix:** Add to §3 item 12: "The map container `div` must have `tabIndex={0}` to receive keyboard focus. MapLibre's built-in keyboard handler (enabled by default) provides arrow-key pan and +/- zoom when the container is focused. Do not set `keyboard: false` in the MapLibre constructor options."

---

## Non-blocking observations

**N-1 — Rebase discipline:** §6 states the implementer "must rebase onto the latest `feature/v0.1-impl` before opening the T13 PR." Given both T11 and T12 modify `projects/page.tsx` and `[slug]/page.tsx` respectively, the rebase will surface conflicts. The spec should add: "Run `npm run build` and `npx tsc --noEmit` after rebase and before opening the PR to catch any import breakage."

**N-2 — `ST_Buffer` degree approximation:** §7 correctly documents the `buffer_km * 1000 / 111320.0` approximation. For Indonesian latitudes (−11° to 6°), the error is ≤ 1% — acceptable. No action needed.

**N-3 — `maplibre-gl.css` import location:** §7 correctly co-locates the CSS import in `MapLibreBase.tsx` rather than `globals.css`. Good; no action needed.

**N-4 — Esri rate limiting (OQ-1):** Correctly flagged and deferred. No action needed for v0.1.

**N-5 — Bundle size:** maplibre-gl v5 is ~400 KB gzipped. Acceptable for v0.1 with `next/dynamic ssr: false`. No action needed.

**N-6 — PostGIS serialization path:** Using raw SQL `ST_AsGeoJSON(col::geometry)::jsonb` correctly sidesteps the Drizzle `customType` returning raw WKB hex. The `geographyPoint` customType in `lib/schema.ts` confirms `data: string` — auditor confirms T13's SQL approach is the right escape hatch.

**N-7 — Architecture §6 lists `/api/map/projects` route:** `docs/architecture.md` §6 documents a `GET /api/map/projects` API route. T13 explicitly does NOT create an API route, passing GeoJSON via server component props instead (OQ-4). This divergence is intentional and documented in OQ-4. No conflict, but the architecture doc should be updated post-T13 to reflect the actual implementation approach.

---

## Cross-story verification matrix

| Concern | T11 | T12 | T13 | Status |
|---|---|---|---|---|
| `projects/page.tsx` remains server component after T13 edit | Yes (§3.3, no `'use client'`) | n/a | Spec says "narrow change only" but no enforcement contract | Gap — see F-2 |
| `[slug]/page.tsx` map placeholder anchor | n/a | `id="alerts"` with `kl-map-placeholder` div | References nonexistent `#map` anchor | Contradiction — see F-2 |
| T12 `#alerts` anchor preserved after T13 replaces placeholder | n/a | Contractual (T13 and T16 deep-link) | Silent — T13 replaces the div but doesn't confirm anchor preservation | Add explicit statement |
| T11 leaves room for T13 tab bar | Yes — §2 "Map tab on /projects — T13" explicitly deferred | n/a | Spec relies on this deferral | Clean |
| T12 leaves room for T13 map panel | Yes — §3.2 `kl-map-placeholder` div specified | Yes — §6 Blocks: T13 | Spec references wrong anchor | Contradiction — see F-2 |

---

## Verdict

**CONDITIONAL PASS.** Four required fixes (F-1 through F-4) must be applied to the spec before implementation. No hard blockers that require redesign. The most consequential risk is F-1 (unbounded alert payload) followed by F-2 (T12 anchor contradiction, which will cause a concrete bug during T13 implementation when the implementer looks for `#map` and finds `id="alerts"` instead). Apply fixes, update the spec, then proceed.

**Blocking count:** 0 hard blockers / 4 required spec fixes
**Top finding:** F-1 — missing `LIMIT` on `getProjectAlertsFeatureCollection` risks 3–4 MB GeoJSON payloads for high-density projects post-T07 Phase B ingestion.
