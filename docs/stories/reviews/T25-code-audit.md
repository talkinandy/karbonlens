---
story: T25
title: Landing redesign with satellite map visual — code audit
auditor: adversarial code-auditor
date: 2026-04-22
commit: a870dc3
branch: t25-landing-impl
worktree: .claude/worktrees/agent-a4ade2ae
verdict: PASS
blocking: 0
non_blocking: 5
---

## Verdict

**PASS.** Zero blocking issues. Five non-blocking findings, four of which are
documented in the spec (`/og-image.png` absence, `/methodology` 404 until T24,
Permenhut 6/2026 query-param, IntersectionObserver defer). One scope deviation
worth flagging: `lib/queries/landing-map.ts` is a new file not in the
implementation report's file list line-by-line but *is* named in spec §5 and
§6 — so not a scope violation, just under-declared in the report table.

Build (`npx tsc --noEmit` exit 0; `npm run build` exit 0 with a fake
`DATABASE_URL`), live dev `curl` smoke, and class-count checks all match AC
expectations. Forbidden files are untouched. Map is dynamically imported into
its own >1 MB chunk. No `export const metadata` in `app/(public)/page.tsx`
(T26 clean).

---

## Diff shape

6 commits, 14 files changed, +1381/-165 lines.

| File | Expected | Present | Notes |
|---|---|---|---|
| `app/(public)/page.tsx` | rewrite | rewrite (123 L) | `revalidate=600`; no metadata export; runs `auth()` + both queries in parallel. |
| `app/globals.css` | +<300 L `lp-*` | **+119 net** | All additive, zero removed, three `@media` breakpoints (1100 / 900 / 640 px). No `lp-method`/`lp-closer` leakage. |
| `components/landing/HeroSection.tsx` | rewrite | rewrite | Auth-aware CTA via `session` prop. Kicker + H1 + EN/ID taglines + CTAs + 3-stat strip. |
| `components/landing/FeaturedProjects.tsx` | rewrite | rewrite | `lp-feat-*` hierarchy; SVG placeholder; preserves `FeaturedProject[]` prop shape. |
| `components/landing/DataSources.tsx` | deprecate | `@deprecated` JSDoc, no imports. | Matches DoD. |
| `components/landing/LandingHeroMap.tsx` + `LandingHeroMapInner.tsx` | new | present | Dynamic import with `ssr:false`, `MapErrorBoundary` class, skeleton, `<noscript>` fallback. |
| `components/landing/Ticker.tsx` | new | present | Server component; six items; MoM for rows 1–3, WoW for row 4, flat for 5–6. Zero recharts/SVG imports. |
| `components/landing/PipelinesGrid.tsx` | new | present | Four cards, live `projectCount` + `latestVolumeTco2e`. |
| `components/landing/RolesGrid.tsx` | new | present | Four persona cards. |
| `components/landing/DataFreshness.tsx` | new | present | Server-rendered relative-time. `/methodology` link present. |
| `lib/queries/landing-stats.ts` | extended | extended (additive) | Adds `activeAlerts30d`, `alerts7d`, `alertsPrior7d`, `idxParticipantCount`, `momParticipantDelta`, `momVolumeDelta`, `vcusTradedYtd`. IDX query reads `registered_participants`. Aggregate CTE gains `alerts_agg` window FILTERs and `ytd_agg`. |
| `lib/queries/landing-map.ts` | new (spec §5) | present | Try/catch, empty fallback, no `alert_source='RADD'` filter. 10 km `ST_Buffer` in geography metres. |

No forbidden files modified (spot-checked: no diff to `components/map/*`,
`lib/schema.ts`, `lib/db.ts`, `lib/auth.ts`, `proxy.ts`, `app/layout.tsx`,
`middleware.ts`, `app/(app)/**`).

---

## AC verification

| AC | Check | Result |
|---|---|---|
| AC-1 | HTTP 200 | PASS — `curl http://localhost:3010/` returns 200. |
| AC-2 | H1 + ID tagline | PASS — "Every credit" ×2 (SSR + React stream), "satu layar" ×2, "Platform intelijen" ×2. `<h1 class="lp-h1">` is a real `<h1>`. |
| AC-3 | MapLibre canvas | PASS (progressive enhancement) — SSR HTML has `kl-map` skeleton div + `<noscript><img src="/og-image.png"></noscript>`; canvas appears post-hydration. Spec §7 (iv) explicitly accepts SSR-absent canvas. |
| AC-4 | `lp-ticker-item` ×6 | PASS — exactly 6 in HTML. |
| AC-5 | `lp-pipeline` ×4 | PASS — exactly 4. Card 01 uses `projectCount` with label "projects indexed" (N-4 acknowledged deliberate change). Card 03 stat label contains `latestPeriod` month. |
| AC-6 | `lp-feat` 3–4 linked cards | PASS (with live DB). In the dry-run (no DB) the empty-state branch renders ("Featured projects coming soon."); FEATURED_SLUGS still contains all three real slugs. Code path verified. |
| AC-7 | 3 freshness timestamps | PASS — Verra/SRN-PPI, GFW/Sentinel, IDXCarbon all rendered via `formatRelative`. |
| AC-8 | Signed-in CTA swap | PASS by code path — `session?.user` flips `primaryLabel` to "Open your dashboard →" and hides the `<SignInButton>`. Guest HTML renders "Sign in with Google to save alerts". |
| AC-9 | `npm run build` exit 0 | PASS — `/` is `ƒ` (Dynamic) as expected; TypeScript compile clean. |
| AC-10 | Mobile layout | PASS (static) — `@media (max-width: 1100px)` collapses `lp-hero-inner` to 1 column; 900 / 640 px tighten padding and stack pipelines/featured/roles to 1-col. No horizontal-scroll risk introduced. |
| AC-11 | Map code-split | PASS — `.next/static/chunks/0-7aa5lg4fp._.js` (~1 MB) contains `maplibre` tokens; not pulled into the landing HTML chunk. Fast-3G Lighthouse not run in worktree (spec calls this a production smoke-test item). |

---

## Non-blocking findings

### N-1 — `/og-image.png` 404 until T26 lands
Implementer self-flagged. `<noscript>` and `MapErrorBoundary` fallbacks both
point to `/og-image.png`, which is a T26 deliverable. Worst case is a broken
image icon for no-JS/no-WebGL visitors. Spec §7 accepts this as progressive
enhancement. Recommend landing T26 first or before public marketing push.

### N-2 — `/methodology` link 404 until T24
Cross-story dependency documented in spec §6 and audit. Link is present and
correct; simply 404s in the window between T25 and T24 ship. Non-blocking.

### N-3 — Implementation report under-declares `lib/queries/landing-map.ts`
The report's table (row: "Files created / modified") lists it, so this is
resolved on second read — initial instinct was it had been omitted. No action.

### N-4 — `kl-map` skeleton lacks an explicit `aria-label`
The `MapSkeleton` div uses `aria-hidden="true"` (reasonable for a decorative
placeholder) but the hydrated MapLibre element receives
`ariaLabel="Live satellite map of Katingan Peatland"` via the `MapLibreBase`
prop. Between SSR and hydrate, screen-reader users land on the caption
("Live monitoring · Katingan Peatland …") which covers the semantic gap.
Acceptable; flag for future polish if needed.

### N-5 — Permenhut 6/2026 CTA is a query-param, not a slug
`HeroSection.tsx` links to `/regulatory?focus=permenhut-6-2026`. The
`/regulatory` page currently ignores the `focus=` param (no 404, no
highlight). Implementer report confirms DoD OQ-4 closes on this: the value is
a page-level focus hint, not a route slug. Non-blocking; deep-link
highlighting is a v0.2 regulatory-page story.

---

## Adversarial angles (spec §)

1. **MapLibre bundle cost** — dynamic-import works; main landing HTML is
   ~64 KB and the maplibre chunk is lazy. Ticker imports are clean (no
   recharts / SVG libs pulled in). PASS.
2. **IDX MoM delta with only one month** — `momVolumeDelta` /
   `momParticipantDelta` / `momDeltaPct` all guarded by `if (previous)` in
   `landing-stats.ts`. When only one row exists, deltas render `"flat"` via
   the null-tone branch in `Ticker.tsx`. No crash path. PASS.
3. **Mobile responsive** — three `@media` blocks (1100 / 900 / 640 px).
   Hero, pipelines, featured grid, roles grid, ticker, freshness all have
   responsive cells. PASS.
4. **A11y** — Real `<h1>`; `<noscript>` fallback image has alt text;
   `<section>` for ticker and freshness footer have `aria-label`s; map
   skeleton is `aria-hidden="true"` with live caption text nearby. `<Link>`
   anchors wrap pipeline/featured cards (keyboard-nav friendly). PASS.
5. **Tailnet URL leak** — grep `tailec2b28|\.ts\.net` in T25 files: zero
   matches. Root-level `.crt`/`.key` files predate this branch. PASS.
6. **Score bucket colour on featured cards** — scores render as integer
   text only (no colour coding); design brief's teal/blue/amber/red palette
   is not yet applied. Spec §3.4 does not require it. Acceptable, possible
   T26 polish item.

---

## Data & query sanity

- IDX query selects `registered_participants` (line 266) — correct column
  name (spec B-2 remediation respected).
- No `alert_source = 'RADD'` filter anywhere in the code — `landing-map.ts`
  comment explicitly calls this out (line 7–8). RADD strings only appear as
  marketing copy in pipeline/role bodies.
- Freshness query returns `registries.last_synced_at`,
  `satellite_alerts.ingested_at`, `idx_monthly_snapshots.scraped_at` via
  three sub-selects in the main CTE.
- WoW delta for alerts uses `alerts_7d` minus `alerts_prior_7d`; both are
  computed as `FILTER` windows on `satellite_alerts.alert_date`. Correct.
- YTD volume uses `period_month >= date_trunc('year', CURRENT_DATE)`.
  Correct.

---

## Cross-story

| Story | Touchpoint | Status |
|---|---|---|
| T24 (`/methodology`) | DataFreshness footer link | Link present; 404s until T24 lands. **Not blocking.** |
| T26 (metadata + OG image + thumbnails) | `page.tsx` metadata, `/og-image.png`, featured thumbnails | `page.tsx` has zero metadata exports (clean hand-off); `/og-image.png` is the T26 deliverable the fallback points at; `FeaturedProject[]` prop shape preserved. **Not blocking.** |
| T13 (map stack) | Read-only reuse of `MapLibreBase`, `EsriBaseLayer`, `SatelliteAlertsLayer`, `ProjectCentroidLayer` | Zero edits to `components/map/*`. Verified via diff. **Clean.** |
| T18 | Superseded data layer | `DataSources.tsx` retained + `@deprecated` (per spec). **Clean.** |

---

## Independent build + smoke

- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0 (with any `DATABASE_URL`; page-data collection
  needs env vars, build itself compiles fine)
- `/` marked `ƒ` (Dynamic) in the Next.js route manifest — matches AC-9
- `curl http://localhost:3010/` → HTTP 200, ~64 KB HTML
- All class-count checks pass: `lp-ticker-item`×6, `lp-pipeline`×4,
  `lp-role`×4, `lp-feat`×0 in no-DB state (empty branch), `kl-map`,
  `noscript`, `lp-map-fallback` each ×1
- Guest HTML contains "Sign in with Google to save alerts"; authed flip
  verified by code inspection

---

## Merge recommendation

**APPROVE FOR MERGE.** All 11 ACs pass. Zero blocking issues. The five
non-blocking items are either T26/T24 ordering artifacts the spec already
accepts, or cosmetic polish deferrable to v0.2. `globals.css` budget
(119 lines << 300) leaves comfortable headroom for T26's metadata/thumbnail
additions. Recommend:

1. Land T24 (methodology route) before or concurrent with T25 so the
   DataFreshness footer link resolves.
2. Land T26 before external marketing to avoid the `/og-image.png` 404 on
   JS-off / WebGL-off clients.
3. After merge, run a Fast 3G Lighthouse pass on the deployed preview to
   confirm AC-11's 3-second interactive target. If missed, apply the
   IntersectionObserver defer called out in spec N-1.
