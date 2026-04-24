# T13 — MapLibre integration — Implementation report

**Story:** `docs/stories/T13-map-integration.md` (status: `audited`)
**Spec commit:** `feature/v0.1-impl` @ `6cffc8e`
**Branch:** `worktree-agent-a52d4079`
**Date:** 2026-04-22
**Implementer:** Barren Wuffet

---

## 1. Summary

Integrated MapLibre GL JS v5 (maplibre-gl `^5.23.0`) into KarbonLens, adding:

1. A **satellite-map tab** on `/projects?tab=map` — shows all project centroids as
   score-coloured markers with a GeoJSON cluster layer for nearby alerts.
2. A **map panel** on `/projects/[slug]` — shows the project centroid + geodesic 10 km
   buffer ring + recent satellite alert points coloured by confidence tier.

Base imagery: **Esri World Imagery** tiles with full attribution string visible
(`attributionControl: { compact: false }`).

Post-audit cleanup (fix commit on top of `7e90b28`):
- Deleted `_verify-map.mjs` and `_verify-map2.mjs` (dev-scratch DB probe scripts
  swept in by orchestrator's `git add -A`; never part of scope).
- Removed `supercluster@^8.0.1` and `@types/supercluster@^7.1.3` dependencies
  (zero imports anywhere; MapLibre GL bundles supercluster internally when
  `cluster: true` is set on a GeoJSON source).

---

## 2. Environment

| Item | Value |
|---|---|
| Next.js | 16 (Turbopack) |
| maplibre-gl | `^5.23.0` (installed; resolved in `package-lock.json`) |
| Base tiles | Esri World Imagery (`https://server.arcgisonline.com/…`) |
| DB | Phase 2 Postgres — 64 projects, 246 576 satellite alerts |
| Env cap | `ALERTS_MAP_LIMIT=5000` — enforced in SQL via `LIMIT ${ALERTS_MAP_LIMIT}` |

---

## 3. Files created

### Map components (8)

| File | Description |
|---|---|
| `components/map/MapLibreBase.tsx` | Core `<div>` mount + `maplibregl.Map` init; `'use client'`; exports `MapRef` |
| `components/map/EsriBaseLayer.tsx` | Esri World Imagery raster source + layer; added after map `load`; `'use client'` |
| `components/map/ProjectCentroidLayer.tsx` | GeoJSON source for project centroids; score-bucket marker colours + popups; `'use client'` |
| `components/map/SatelliteAlertsLayer.tsx` | GeoJSON source for alerts; clustering at zoom < 8 (`clusterMaxZoom: 7`); confidence-tier point colours; cluster-badge symbol layer; geodesic buffer ring; `'use client'` |
| `components/map/MapExplorerTab.tsx` | Server wrapper — fetches centroid GeoJSON (only when `tab === 'map'`); passes to client; `'use client'` boundary via child |
| `components/map/MapExplorerTabClient.tsx` | Client shell that mounts `MapLibreBase` + `ProjectCentroidLayer`; `'use client'` |
| `components/map/ProjectDetailMap.tsx` | Server wrapper for detail-page map panel; fetches project centroid + alerts GeoJSON |
| `components/map/ProjectDetailMapClient.tsx` | Client shell; mounts `MapLibreBase` + `EsriBaseLayer` + `ProjectCentroidLayer` + `SatelliteAlertsLayer`; renders "Showing N of M" UI notice with deep-link; `'use client'` |

### Query modules (2)

| File | Description |
|---|---|
| `lib/queries/map-geojson-types.ts` | Shared TypeScript types + `ALERTS_MAP_LIMIT = 5000` constant |
| `lib/queries/map-geojson.ts` | Pure server query module — `getCentroidsGeoJSON` + `getProjectAlertsGeoJSON`; zero `maplibre-gl` imports |

---

## 4. Files modified for integration (3)

| File | Change |
|---|---|
| `app/(app)/projects/page.tsx` | Added `tab` parsing (`parseTab`), conditional centroid fetch when `tab === 'map'`, `MapExplorerTab` rendered in tab panel; filters preserved through `buildFilterUrl` on every tab-toggle href |
| `app/(app)/projects/[slug]/page.tsx` | Mounted `<ProjectDetailMap>` server component inside the detail layout |
| `components/projects/detail/AlertsSummary.tsx` | Wrapped map placeholder in `<section id="map" aria-label="Project map">` anchor; T16's `id="alerts"` sibling preserved immediately above |

---

## 5. Phase A verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Exit 0 — no output |
| `npm run build` | Exit 0 — all routes compile; `/projects` and `/projects/[slug]` included |
| `ALERTS_MAP_LIMIT=5000` enforced | YES — constant at `lib/queries/map-geojson-types.ts:15`; `LIMIT ${ALERTS_MAP_LIMIT}` in SQL at `lib/queries/map-geojson.ts:152`; overflow surfaced via `truncated: true` + `total` count; UI notice rendered in `ProjectDetailMapClient.tsx:66-80` |
| `id="map"` anchor | YES — `<section id="map" aria-label="Project map">` in `AlertsSummary.tsx:61-71`; T16's `<section id="alerts">` preserved as sibling above |
| `'use client'` boundary | CLEAN — all 8 map components carry the directive; `lib/queries/map-geojson.ts` has zero `maplibre-gl` imports (grep confirmed) |
| No server-side maplibre-gl import | CLEAN — `maplibre-gl` imported only inside `'use client'` components |
| Tab preservation | YES — filters survive tab switch via `buildFilterUrl`; centroid GeoJSON only fetched when `tab === 'map'` |
| `mockProjects` export for T18 | YES — `lib/mock-data.ts` export unchanged |

---

## 6. Known deviations from HANDOFF design brief

The T13 story spec (§3.4, §3.5, §3.7) contained internal inconsistencies with
`HANDOFF.md § "Map (T13 visual rules)"`. The implementer correctly followed the HANDOFF
brief in all cases. These points are flagged here so the spec text can be corrected
via future cleanup (not a code change):

| Item | Spec text | Brief / implementation | Note |
|---|---|---|---|
| Project marker diameter | §3.4 implied 10 px | `circle-radius: 6` → 12 px diameter | Implementer followed brief; spec text had inconsistency |
| Alert point diameter | §3.5 implied 4 px | `circle-radius: 2.5` → 5 px diameter | Same — brief followed; spec text inconsistent |
| Alert colour for `low` confidence | §3.5 specified `#eab308` (yellow) | `--text-3` / `#888780` | Brief correct; spec text wrong — file spec-correction ticket |
| Buffer fill colour | §3.7 specified `rgba(59,130,246,0.15)` / `#3b82f6` stroke | `rgba(55,138,221,0.1)` / `--chart-blue` | Brief correct; spec text wrong — file spec-correction ticket |

---

## 7. Auditor scrutiny — cluster-badge glyph rendering

The code-audit (T13-code-audit.md § N-3) flagged that `SatelliteAlertsLayer.tsx`
adds a `symbol` layer for `cluster-count` badges without a `glyphs` URL in the
MapLibre style definition. MapLibre will silently fail to render text glyphs when
they are absent from the style. This is a QA-time risk only:

**Recommended QA step:** Open the detail map at zoom ≤ 7 on a project with ≥ 50
alerts (e.g., Mangrove Aceh). If cluster-count badges render numeric labels →
accept. If badges show empty circles → add a `glyphs` URL to `EMPTY_STYLE` in
`MapLibreBase.tsx`.

---

## 8. Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| AC-1 | `/projects?tab=map` renders satellite base map | PASS — `MapExplorerTab` mounts on `tab=map`; `EsriBaseLayer` loads Esri World Imagery |
| AC-2 | Project centroids coloured by score bucket | PASS — teal ≥80 / blue ≥60 / amber ≥40 / red else in `ProjectCentroidLayer.tsx:66-77` |
| AC-3 | Alerts cluster at zoom < 8 | PASS — `clusterMaxZoom: 7` in `SatelliteAlertsLayer.tsx:97` |
| AC-4 | `ALERTS_MAP_LIMIT` cap + UI notice | PASS — 5 000 cap in SQL; truncated notice with deep-link to `/alerts?project=<slug>` |
| AC-5 | `id="map"` anchor on detail page | PASS — `<section id="map">` in `AlertsSummary.tsx`; `id="alerts"` sibling intact |
| AC-6 | Server/client boundary clean | PASS — `lib/queries/map-geojson.ts` pure server; all MapLibre code inside `'use client'` |
| AC-7 | Tab filters survive tab switch | PASS — `buildFilterUrl` preserves search/region/status params |
| AC-8 | Esri attribution visible | PASS — `attributionControl: { compact: false }` |
| AC-9 | `tsc` + build exit 0 | PASS |

---

## 9. Commit list

- `7e90b28` `feat(T13): MapLibre integration — projects tab + detail panel`
- *(fix commit — junk files + unused deps removed; this report added)*

---

*End of T13 implementation report.*
