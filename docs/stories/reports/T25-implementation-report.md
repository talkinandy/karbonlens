# T25 — Landing redesign — Implementation report

**Story:** `docs/stories/T25-landing-redesign.md` (status: `audited`)
**Base branch:** `feature/v0.1-impl` at `af9d05e`
**Branch:** `t25-landing-impl` (worktree `.claude/worktrees/agent-a4ade2ae`)
**Date:** 2026-04-22
**Implementer:** Barren Wuffet

---

## 1. Summary

Replaced T18's stat-card grid with the prototype's editorial dark split-hero,
a live satellite MapLibre view of the Katingan Peatland project on the right,
six-item ticker, four data pipeline cards, three featured project cards,
four persona cards, and a data-freshness footer strip — all wired to live
DB aggregates extended in `lib/queries/landing-stats.ts` and a new
`lib/queries/landing-map.ts`.

## 2. Files created / modified

| File | Action |
|---|---|
| `lib/queries/landing-stats.ts` | Extended: `momVolumeDelta`, `idxParticipantCount`, `momParticipantDelta`, `vcusTradedYtd`, `activeAlerts30d`, `alerts7d`, `alertsPrior7d` added to `LandingStats`; aggregate CTE gains `alerts_agg` window FILTERs + `ytd_agg`; IDX query now selects `registered_participants`. |
| `lib/queries/landing-map.ts` | **New.** `getLandingMapData()` returns `{ katinganCentroid, katinganBuffer (10 km ST_Buffer in geography metres), alerts (last-90d, cap 200, no alert_source filter), katinganAlerts90d (pre-cap count) }`. Try/catch fallback returns empty FeatureCollection + zero count. |
| `components/landing/LandingHeroMap.tsx` | **New.** Client wrapper. Dynamic-imports `LandingHeroMapInner` with `ssr:false`, wraps in `MapErrorBoundary` (class component), provides `<Suspense>` skeleton, emits `<noscript>` fallback image pointing to `/og-image.png`. |
| `components/landing/LandingHeroMapInner.tsx` | **New.** `'use client'` composition: MapLibreBase + EsriBaseLayer + SatelliteAlertsLayer + ProjectCentroidLayer, centred on `[113.2, -1.8]` at zoom 9. |
| `components/landing/Ticker.tsx` | **New.** 6-item bar (IDXCarbon price MoM %, latest-month volume MoM abs, participants MoM abs, active alerts 30d + WoW, median integrity flat, regulatory flat). |
| `components/landing/PipelinesGrid.tsx` | **New.** Four cards wired to live `projectCount` (01) and `latestVolumeTco2e` (03); 02 "10 m" and 04 "Permenhut 6/2026" static per §3.3. |
| `components/landing/RolesGrid.tsx` | **New.** Four persona cards verbatim from §3.5. |
| `components/landing/DataFreshness.tsx` | **New.** Server-rendered `formatRelative` over 3 timestamps + `/projects · /prices · /regulatory · /methodology · /api/auth/signin · /about` link row. |
| `components/landing/FeaturedProjects.tsx` | Rewritten to `lp-feat-*` hierarchy with the prototype's SVG placeholder thumb; gains a `totalCount` prop; preserves `FeaturedProject[]` so T26 can swap thumbnails additively. |
| `components/landing/HeroSection.tsx` | Rewritten to the `lp-hero-left` composition (kicker + Instrument Serif H1 + EN + ID tagline + CTAs + 3-stat strip). Auth-aware primary CTA per AC-8. |
| `components/landing/DataSources.tsx` | JSDoc `@deprecated` added (no longer imported; kept to avoid breaking external refs). |
| `app/(public)/page.tsx` | Full rewrite. `export const revalidate = 600` (CDN hint only). No metadata export. |
| `app/globals.css` | **+119 net lines** appended after a `/* =========== T25 Landing editorial hero =========== */` divider. Every selector is `lp-*`; no existing `.kl-*` class removed or overridden. Excluded `.lp-method*` / `.lp-closer*` blocks per §3 out-of-scope. |

## 3. Verification

- `npx tsc --noEmit` → exit 0.
- `npm run build` → exit 0; route `/` listed as `ƒ` (dynamic) in the route manifest, as expected because `auth()` reads the session cookie.
- Dev-server curl `GET /` → HTTP 200; body contains:
  - "Every credit," / "every policy," / "one lens." (H1) — PASS
  - "Platform intelijen pasar karbon Indonesia" — PASS
  - "Open the terminal →" (guest CTA) — PASS
  - "Sign in with Google to save alerts" (guest secondary) — PASS
  - "Four data pipelines" — PASS
  - `class="lp-ticker-item"` ×6 (AC-4) — PASS
  - `class="lp-pipeline"` ×4 (AC-5) — PASS
  - `class="lp-role"` ×4 — PASS
  - `class="kl-map"` (on inner map element) — PASS
  - `maplibregl-canvas` — **expected absent in SSR output** (dynamic `ssr: false`); renders client-side after hydration.
  - `Rp ` prefix on price value — only renders when DB is reachable. In dev with no DB, the stat collapses to `—`. Live server with real DB (per T18 snapshot, `latestAvgPriceIdr = "Rp 42,660"`) will show this.
  - Featured project slugs — only render with live DB. Empty state ("Featured projects coming soon.") renders otherwise.
- Mobile: `@media (max-width: 900px)` and `@media (max-width: 640px)` blocks present; hero stacks vertically at ≤1100 px via `.lp-hero-inner { grid-template-columns: 1fr }`.

## 4. Commit history (atomic)

| SHA | Message |
|---|---|
| `4b57085` | feat(T25): extend lib/queries/landing-stats.ts for ticker + freshness aggregates |
| `57e634e` | feat(T25): LandingHeroMap with MapLibre dynamic-import |
| `65f74a2` | feat(T25): ticker + pipelines + roles + featured grid + freshness footer |
| `98a41bd` | feat(T25): globals.css lp-* classes from legacy prototype |
| `37b1bb4` | feat(T25): rewrite app/(public)/page.tsx |

## 5. Notes for auditor

- **AC-11 MapLibre code-split** — `next build` produces a separate chunk for
  the inner map. Confirmed by grep on `.next/static/chunks/*` for
  `maplibre`. Fast 3G Lighthouse run not performed in this worktree
  (no real DB / no real network); recommend a production smoke-test
  after merge + deploy.
- **Alerts in SSR caption** — the caption count uses `mapData.katinganAlerts90d`
  which is a server-fetched integer. In dev with DB down, the caption reads
  "0 satellite alerts in last 90 days", not "— satellite alerts". This is
  per spec §7 edge case (i).
- **`/og-image.png` fallback** — spec references `/og-image.png`; the file is
  not yet in `/public` (it ships with T26's OG artwork). The `<noscript>` and
  `MapErrorBoundary` paths will 404 the image until T26 lands. This is
  consistent with the spec's cross-story coordination note — functional
  fallback still renders (broken image icon in worst case, which is
  progressive-enhancement acceptable).
- **Permenhut 6/2026 slug (OQ-4)** — `regulatory_events` has no `slug` column;
  the CTA link `href="/regulatory?focus=permenhut-6-2026"` carries a
  query-string param the current `/regulatory` page ignores (no 404, just no
  focus highlight). This matches the DoD "implementer has confirmed the live
  `regulatory_events` slug" — the value is a page query param, not a route
  slug. No backend schema change required.
- **Signed-in CTA branching** — verified via code path; cannot authenticate
  against a live Google OAuth in the worktree. Auditor should spot-check
  on a deployed preview.

## 6. Out of scope (defer)

- CHANGELOG / TASKS.md flips (the spec's §8 DoD items are owned by the
  merge-in-chief agent per README lifecycle — not this implementer).
- Story frontmatter `status` flip to `done` — same.
- IntersectionObserver defer for the hero map — noted as a v0.2 follow-up
  in spec N-1; not required unless AC-11's 3-second Fast 3G target is
  missed in production.

## T25 follow-ups

Non-blocking findings accepted at code-audit (PASS, 0 blocking, 5 non-blocking):

1. `/og-image.png` returns 404 until T26 lands — T26 ships the social-preview image asset; accepted.
2. `/methodology` returns 404 until T24 lands — T24 ships the methodology page; accepted.
3. Permenhut CTA uses `?focus=permenhut-6-2026` query param — the `/regulatory` page currently ignores this param (no 404, no scroll effect). Filter enhancement is a v0.2 follow-up.
4. Map skeleton div is `aria-hidden`; the visible caption covers the semantic gap pre-hydration. No screen-reader regression; accepted.
5. Score buckets on featured project cards render as plain text (no teal/blue/amber/red colour ring). Not required by spec §3.4; visual polish deferred to a later sprint.
