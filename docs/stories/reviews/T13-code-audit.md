# T13 Code Audit — MapLibre integration

**Auditor:** adversarial code-auditor
**Date:** 2026-04-22
**Worktree:** `.claude/worktrees/agent-a52d4079`
**Branch / commit:** `worktree-agent-a52d4079` @ `7e90b28`
**Base:** `feature/v0.1-impl`
**Verdict:** **PASS (after fix commit)** — blocking B-1 resolved; junk files deleted + unused `supercluster` deps removed + implementation report written in fix commit `e5a9624`.

---

## 1. Independent verification

| Check | Result |
|---|---|
| `npm install` | exit 0 |
| `npx tsc --noEmit` | exit 0 (no output) |
| `npm run build` | exit 0 — all 10 routes compile, including `/projects` and `/projects/[slug]` |
| `ALERTS_MAP_LIMIT` present and enforced in SQL | YES — constant `5000` in `lib/queries/map-geojson-types.ts:15`; `LIMIT ${ALERTS_MAP_LIMIT}` at `lib/queries/map-geojson.ts:152`; separate `COUNT(*)` run via `Promise.all`; `properties: { truncated: true, total }` attached on overflow; UI notice rendered in `ProjectDetailMapClient.tsx:66-80` |
| `#map` anchor on detail page | YES — `<section id="map" aria-label="Project map">` in `components/projects/detail/AlertsSummary.tsx:61-71`; `<section id="alerts">` preserved immediately above (T16 deep-link contract intact). Both anchors rendered as siblings, matching the spec-audit's clarification that T12 already emitted `id="map"` |
| `'use client'` on MapLibreBase and all browser-only components | YES — `MapLibreBase.tsx`, `EsriBaseLayer.tsx`, `ProjectCentroidLayer.tsx`, `SatelliteAlertsLayer.tsx`, `MapExplorerTab.tsx`, `MapExplorerTabClient.tsx`, `ProjectDetailMap.tsx`, `ProjectDetailMapClient.tsx` — all have the directive |
| Tab preservation on `/projects` | YES — `parseTab` in `app/(app)/projects/page.tsx:89-92`, centroids fetched only when `tab === 'map'` (line 132-133), filters preserved through `buildFilterUrl` on every tab-toggle href |
| No server-side import of `maplibre-gl` | CLEAN — grep confirms imports only in `components/map/{MapLibreBase,ProjectCentroidLayer,SatelliteAlertsLayer}.tsx`, all `'use client'`. `lib/queries/map-geojson.ts` has zero `maplibre-gl` references |
| `mockProjects` in `lib/mock-data.ts` left intact for T18 | YES — export unchanged |

---

## 2. Blocking findings

### B-1 — Stray `_verify-map*.mjs` files committed

`_verify-map.mjs` and `_verify-map2.mjs` sit at the repo root, both dev-scratch harnesses that manually parse `.env.local`, import TS modules via dynamic `import()` (which only works under `node --experimental-strip-types` or a ts runner), and open a raw `postgres` connection. They have no `.gitignore` entry, no build-system hook, and their names explicitly telegraph "delete me" (`_`-prefixed, `.mjs` in a TS repo). The orchestrator's `git add -A` swept them in.

**Required fix (blocking merge to `feature/v0.1-impl`):**
```
git rm _verify-map.mjs _verify-map2.mjs
```
…in a follow-up commit before merging. Do not merge with these files present — they leak internal DB-probe patterns and pollute the v0.1 root.

---

## 3. Non-blocking findings (must-fix before v0.1 GA, but not merge-blocking)

### N-1 — Unused `supercluster` + `@types/supercluster` dependencies

`package.json` adds `supercluster@^8.0.1` and `@types/supercluster@^7.1.3`. Grep finds **zero** `import` or `require` of `supercluster` anywhere in `lib/`, `components/`, or `app/`. MapLibre GL bundles supercluster internally when a GeoJSON source uses `cluster: true`; the explicit dep was unnecessary. This bloats `node_modules` and the lockfile by ~40 KB of types + a transitive runtime package the app never executes.

**Recommended fix:** `npm uninstall supercluster @types/supercluster` in a follow-up.

### N-2 — Visual brief drift (HANDOFF.md § "Map (T13 visual rules)")

Four deviations from the brief, all cosmetic but worth filing as T13 follow-ups (the story spec §3.4, §3.5, §3.7 itself was internally inconsistent with the brief on points 2 and 4 — implementer chose brief over spec, which is the right call, but should be documented):

1. **Project marker size:** brief = 10 px; impl = `circle-radius: 6` (diameter 12 px) in `ProjectCentroidLayer.tsx:63`. Deviation of +2 px on diameter — reads visually slightly larger than prototype.
2. **Alert point size:** brief = 4 px; impl = `circle-radius: 2.5` (diameter 5 px) in `SatelliteAlertsLayer.tsx:149`. Off by +1 px on diameter.
3. **Alert colour for `low` confidence:** brief = `--text-3` (#888780); impl uses `#888780` (correct). The T13 story §3.5 text conflicted — it specified `#eab308` (yellow). Implementer followed the brief. Good call. File a spec-correction ticket.
4. **Buffer fill colour:** brief = `rgba(55, 138, 221, 0.1)`; impl uses `fill-color: #378add` + `fill-opacity: 0.1`, which renders identically. But the story §3.7 specified `rgba(59, 130, 246, 0.15)` with `#3b82f6` stroke width 1.5 px. Implementer again followed the brief (correct). File spec-correction.

### N-3 — Cluster count badge uses default font stack (no glyphs registered)

`SatelliteAlertsLayer.tsx:127-141` adds a `symbol` layer for `cluster-count` with no `glyphs` URL in the style definition. MapLibre will silently fail to render text when glyphs are missing in most style configurations. In this implementation it may render using a fallback, but this is implementation-defined behaviour. The build passes because the style is valid; the runtime risk is that cluster badges show empty circles on some browsers. Low severity — easily caught in QA.

**Recommended fix:** QA the detail map at zoom ≤ 7 with a project that has ≥ 50 alerts (e.g., Mangrove Aceh). If badges render, accept; if empty, add `glyphs` to `EMPTY_STYLE`.

### N-4 — Missing implementation report

`docs/stories/T13-implementation-report.md` does not exist. Other tasks (T11, T12, T16) shipped with this file; T13 skipped it. The story frontmatter is still `status: audited` (not `done`), and `docs/TASKS.md:37` still marks T13 as `todo`. These are post-audit doc tasks the orchestrator has yet to run — noted here for tracking, not blocking the code audit.

### N-5 — `ProjectCentroidLayer` silent skip on null-score features

Feature with `score === null` is rendered in `COLOR_NEUTRAL` (correct per brief) but the popup shows "Score: —". No concern — behaves as spec §3.4. Noting that the `Number.isFinite(scoreNum)` check on line 94 is redundant given the `row.score === null` early branch already returns `null`; dead branch.

### N-6 — `escapeHtml` duplicated across two files

Identical ~7-line function appears in `ProjectCentroidLayer.tsx:144-151` and `SatelliteAlertsLayer.tsx:275-282`. Not worth a follow-up commit, but a shared helper would reduce drift risk.

---

## 4. Adversarial checklist results

| Question | Answer |
|---|---|
| `fdb3349`-era stub junk files committed? | YES — see B-1 |
| Esri tile URL hard-coded and attribution visible? | YES — URL hardcoded in `EsriBaseLayer.tsx:19-20`; attribution string matches brief verbatim; `attributionControl: { compact: false }` in `MapLibreBase.tsx:102` ensures visibility |
| Score-bucket marker colors match brief? | YES — hex values correctly mirror `--chart-teal/blue/amber/red`; bucket boundaries correct (≥80 / ≥60 / ≥40 / else) in `ProjectCentroidLayer.tsx:66-77` |
| 10 km buffer 1 px stroke `--chart-blue`, fill rgba? | YES (per alpha math); `SatelliteAlertsLayer.tsx:72-80` |
| Alert point colors (high=red / nominal=amber / low=text-3)? | YES — `SatelliteAlertsLayer.tsx:150-157` |
| Clustering at zoom < 8? | YES — `clusterMaxZoom: 7` (CLUSTER_ZOOM_MAX − 1) in `SatelliteAlertsLayer.tsx:97`; cluster layer filter `['has', 'point_count']`; point layer filter `['!', ['has', 'point_count']]` |
| Cluster click → easeTo zoom + N? | YES — `getClusterExpansionZoom(clusterId).then(...)` pattern in `SatelliteAlertsLayer.tsx:181-190`; easeTo with the expansion zoom (spec-prescribed pattern, though note it uses `zoom` directly rather than `zoom + 2` per T13 spec §3.5 cluster-click snippet — this is actually the correct MapLibre idiom and matches the official docs, not a bug) |
| Alerts LIMIT cap present? | YES — 5 000, enforced in SQL; `truncated` property surfaced; UI notice links to `/alerts?project=<slug>` |
| `mockProjects` export preserved for T18? | YES |
| Detail page `#map` anchor preserved after T13's edit? | YES — both `id="alerts"` and `id="map"` intact |
| Server component integrity (`projects/page.tsx` stays server)? | YES — no `'use client'` added; client boundary crossed only via `<MapExplorerTabClient>` |

---

## 5. Files touched (matches expected scope)

New (10): `components/map/{MapLibreBase,EsriBaseLayer,ProjectCentroidLayer,SatelliteAlertsLayer,MapExplorerTab,MapExplorerTabClient,ProjectDetailMap,ProjectDetailMapClient}.tsx`, `lib/queries/{map-geojson,map-geojson-types}.ts`.
Modified (3): `app/(app)/projects/page.tsx`, `app/(app)/projects/[slug]/page.tsx`, `components/projects/detail/AlertsSummary.tsx`.
Dependency: `maplibre-gl` + unused `supercluster`, `@types/supercluster` in `package.json` / `package-lock.json`.
Stray: `_verify-map.mjs`, `_verify-map2.mjs` (blocking — delete).

No test files, no other throwaway. File scope matches spec exactly.

---

## 6. Merge recommendation

**CONDITIONAL MERGE** — gate on the implementer running:

```
git rm _verify-map.mjs _verify-map2.mjs
npm uninstall supercluster @types/supercluster
git add package.json package-lock.json
git commit -m "chore(T13): drop scratch verify scripts + unused supercluster dep"
```

After that commit: merge to `feature/v0.1-impl`. The four cosmetic brief-drift findings (N-2) and the cluster-glyph runtime risk (N-3) can be caught in QA and patched in a follow-up; none block a v0.1 demo.

**Blocking count:** 1 (junk files) — RESOLVED, see re-audit note below.
**Top finding:** B-1 — `_verify-map.mjs` / `_verify-map2.mjs` committed at repo root; `git add -A` from orchestrator swept dev-scratch files into the commit. Delete before merge.
**Junk-file audit:** 2 offenders (`_verify-map.mjs`, `_verify-map2.mjs`); no stray `.test.*` files, no random root-level throwaways beyond those two.

---

## Re-audit note

**Date:** 2026-04-22
**Fix commit:** `e5a9624` on `worktree-agent-a52d4079`

All conditions for CONDITIONAL PASS have been satisfied:

- `_verify-map.mjs` and `_verify-map2.mjs` deleted via `git rm` — confirmed absent from `ls _verify-map*.mjs` output.
- `supercluster@^8.0.1` and `@types/supercluster@^7.1.3` removed via `npm uninstall` — confirmed absent from `package.json` `dependencies` and `devDependencies`.
- `docs/stories/reports/T13-implementation-report.md` written and committed (N-4 resolved).
- Re-verification: `npx tsc --noEmit` exit 0; `npm run build` exit 0 (all 10 routes compile).

**Revised verdict: PASS — clear to merge to `feature/v0.1-impl`.**
