---
id: T25-spec-audit
story: T25
title: "Spec audit — Landing redesign with satellite map visual"
auditor: Claude Sonnet 4.6 (adversarial)
date: 2026-04-22
verdict: PASS-WITH-FIXES
blocking: 4
non_blocking: 8
---

## Verdict

**PASS-WITH-FIXES** — 4 blocking issues, 8 non-blocking. The spec is well-structured and the
T18 data layer already covers most of what is needed. The four blocking issues are: (1) a
wrong `alert_source` value in the hero caption and the `getLandingMapData` query, (2) a
`participant_count` column name mismatch (column is `registered_participants`), (3) a WoW
vs MoM delta wording conflict in the ticker, and (4) a CSS class list that must be enumerated
before implementation starts. None is catastrophic; all are fixable in the spec before code
lands.

---

## Blocking issues

### B-1 — Caption and map query reference `RADD` but scraper stores `'INTEGRATED'`

**Spec §3.1 (hero caption):** "…`{katinganAlerts90d}` RADD alerts in last 90 days"

**Spec §5 (getLandingMapData):** the alerts query has no `alert_source` filter, so the count
includes all integrated alerts — but the caption says "RADD alerts".

**Reality:** `scrapers/gfw/fetch.py` line 541 inserts `alert_source = 'INTEGRATED'` (not
`'RADD'`). The schema comment lists `'RADD', 'GLAD-S2', 'GLAD-L', 'DIST-ALERT', 'VIIRS'` as
expected values, but the live scraper uses none of those; it writes `'INTEGRATED'` to reflect
the `gfw_integrated_alerts` dataset which is a superset of RADD, GLAD-S2, GLAD-Landsat, and
DIST-ALERT. Filtering by `alert_source = 'RADD'` would return zero rows.

**Required fix:** Change the caption to "satellite alerts" or "deforestation alerts"
(acceptable brand-neutral wording). Do NOT add an `alert_source = 'RADD'` filter to the
`getLandingMapData` SQL — it would silently zero-out the count. If the wording "RADD" is
important for brand reasons, document the mismatch and add a migration to correct the stored
`alert_source` value first.

**Affects:** §3.1 caption text, §5 `getLandingMapData` implementation note, AC-7 wording.

---

### B-2 — `idxParticipantCount` maps to wrong column name

**Spec §3.2 and §5 data additions:** refers to `idx_monthly_snapshots.participant_count`.

**Reality:** `001_init.sql` line 112 defines the column as `registered_participants` (INT),
not `participant_count`. `lib/schema.ts` line 180 confirms `registeredParticipants:
integer('registered_participants')`. The scraper (`fetch_monthly.py`) inserts as
`registered_participants`.

**Required fix:** Update all spec references from `participant_count` to
`registered_participants`. The query in the spec's "data additions" section must read
`registered_participants` not `participant_count` (or the Drizzle field
`registeredParticipants`). OQ-3 in §9 asks whether the column exists — it does; the OQ can be
closed with a note that the column name differs from the spec.

**Affects:** §3.2 ticker table row 3, §5 data additions type definition, §7 edge case (v), OQ-3.

---

### B-3 — Ticker delta wording conflict: "WoW" on monthly data

**Spec §3.2 ticker table:**
- Row 1 (IDTBS-RE): delta is `momDeltaPct` "WoW if available, else flat"
- Row 2 (volume): delta is "prior-month volume delta"
- Row 3 (Participants): delta is "WoW delta or flat"

**Problem:** `idx_monthly_snapshots` has monthly granularity (one row per calendar month).
There is no weekly snapshot. "WoW" (week-over-week) cannot be computed from this table. The
existing `momDeltaPct` in `LandingStats` is already month-over-month. `activeAlerts30d`
(row 4) compares last 30 days vs prior 7 days — that is the only place a true 7-day window
exists.

**Required fix:** The spec must consistently use "MoM" (month-over-month) for ticker items
sourced from `idx_monthly_snapshots` (rows 1, 2, 3). Update the ticker table in §3.2 and
remove all "WoW" references for IDXCarbon-sourced items. Only the satellite alerts item (row 4)
legitimately offers a 7-day comparison window. Delta tone labels (`up/down/flat`) are fine;
only the time-frame wording needs correction.

**Affects:** §3.2 ticker table rows 1, 2, 3.

---

### B-4 — `app/globals.css` edit lacks an enumerated class list

**Spec §5 edited files:** "append all `lp-*` classes verbatim from
`legacy/prototype/styles.css` lines 1118–1588…"

**Reality:** Lines 1118–1588 of `styles.css` are 471 lines (verified). That block includes
classes for sections not rendered by T25 (`.lp-method`, `.lp-method-*`, `.lp-ms-*`,
`.lp-closer`, `.lp-closer-*`, `.lp-closer-h`, `.lp-closer-sub`) because the Methodology
editorial strip and Closing CTA are explicitly out of scope (§3 out-of-scope list). Naively
copying lines 1118–1588 verbatim would add ~471 lines including dead CSS.

Additionally, the spec states "No existing class is removed or overridden" and `app/globals.css`
currently has no `lp-*` classes, so adding 471 lines is additive-only — but the implementer
needs a definitive list to prevent scope creep or incomplete porting.

**Required fix:** The spec must enumerate the exact `lp-*` class blocks needed for T25 (the
in-scope sections: hero, ticker, generic section, pipelines, featured grid, roles, freshness)
and set a max line-count budget (recommended: < 320 new lines, excluding the out-of-scope
methodology and closer blocks). List the classes to exclude or provide a trimmed line range.

**Affects:** §5 globals.css edit entry, §8 DoD "additive only" CI check.

---

## Non-blocking issues

### N-1 — MapLibre hero map: missing IntersectionObserver defer recommendation

**Spec §3.1:** The map is `dynamic({ ssr: false })` which correctly code-splits the
~300 KB MapLibre bundle. However, the spec does not recommend deferring map initialisation
until the hero is in the viewport (via IntersectionObserver). On fast connections this is
fine; on slow 3G the Esri tile fetch may compete with LCP text. AC-11 requires the map to
be interactive within 3 seconds on Fast 3G — the spec should explicitly note that if the
Lighthouse budget is missed, the IntersectionObserver defer pattern is the first
recommended optimisation.

**Recommendation (non-blocking):** Add an implementation note: "If AC-11's 3-second Fast 3G
target is not met, wrap `SatelliteMapHero` in an IntersectionObserver trigger so MapLibre
init is deferred until the hero scrolls into view."

---

### N-2 — `revalidate = 600` conflicts with current T18 `revalidate = 3600`

`app/(public)/page.tsx` currently (T18) has no `export const revalidate` — the comment
reads "Route is dynamic because auth() reads the session cookie." There is no top-level
`revalidate` export; the route is fully dynamic. T25 spec declares `revalidate = 600` but
also notes the route stays dynamic due to `auth()`. In Next.js App Router, `auth()` (which
reads request cookies) marks the page as dynamic and effectively bypasses ISR caching unless
the host CDN has a separate layer. The spec acknowledges this trade-off but should clarify
whether `revalidate = 600` is intended as a hint for CDN `stale-while-revalidate` or is
expected to enable partial ISR. For v0.1, the current fully-dynamic behaviour is acceptable;
the export is harmless but should not be presented as providing ISR.

---

### N-3 — Featured projects: 4-col grid with 3 entries

Spec §3.4 says `.lp-featured-grid` uses `repeat(4, 1fr)` (from prototype CSS) but renders
only 3 cards. At desktop widths this leaves one empty column cell. The prototype always had
4 slugs (Katingan, Rimba Raya, Pertamina Lahendong, Bukit Tigapuluh — confirmed in
`Landing.jsx` line 6). T25 FEATURED_SLUGS has 3. OQ-2 asks Andy. The spec's resolution
("grid renders 3 cards — no empty-state fourth card") is valid, but a 4-column grid with 3
items creates an unbalanced layout. Auditor recommendation: change grid to `repeat(3, 1fr)`
when `featuredProjects.length === 3`, or add a generic fourth card ("Browse all {n} →").
The spec should define the behaviour rather than leaving it to the implementer.

---

### N-4 — Pipeline card 01 stat label mismatch

**Prototype (`Landing.jsx` line 85):** stat label is `"credits indexed"` (credits, not
projects). **Spec §3.3 table:** stat label is `"projects indexed"` and stat value is
`projectCount`. These are materially different numbers (project count vs total VCUs indexed).
The spec change is intentional (using project count instead of VCU count), but the
inconsistency with the prototype should be explicitly acknowledged as a deliberate change, not
a copy error, to prevent future confusion during code review.

---

### N-5 — No `<noscript>` implementation path specified

**Spec §7 edge case (iii):** states "The `<noscript>` tag in the root layout should include
the fallback image for no-JS users (implementer adds a `<noscript>` block inside
`SatelliteMapHero`'s server wrapper or the page layout)." This is vague. The root
`app/layout.tsx` is not owned by T25 (§6 file ownership). Adding a `<noscript>` tag to the
root layout would affect all routes. The correct approach is a `<noscript>` block inside the
T25 page or a server wrapper component. The spec should specify the exact file to edit.

---

### N-6 — `getLandingMapData` error fallback returns wrong type for `katinganBuffer`

**Spec §5 getLandingMapData fallback:** returns `katinganBuffer: null` on error. But
`SatelliteAlertsLayer` accepts `buffer?: BufferCollection` (optional `FeatureCollection`).
Passing `null` vs `undefined` may cause a TypeScript error at the call site if the prop is
typed as `BufferCollection | undefined` not `BufferCollection | null`. The spec should
clarify whether `katinganBuffer: null` is intentional (requires the component to accept
`null`) or should be `undefined`.

---

### N-7 — Auth-aware CTA: signed-in state changes primary CTA text, not just secondary

**Spec §3.1 secondary CTA:**
- Signed in: "Open your dashboard →" links to `/projects` — described as replacing the
  **secondary** CTA.
- But the spec also says: "replaces primary copy" in the same sentence.

The wording is ambiguous. AC-8 tests that the primary CTA text is "Open your dashboard →"
when signed in — which implies it replaces the primary CTA text `"Open the terminal →"`,
not just the secondary CTA. The spec's §3.1 layout description shows the secondary CTA below
`lp-cta`. If the signed-in state replaces the primary CTA text, the secondary auth button
should be hidden entirely (which AC-8 also asserts). The spec should clarify: does signing in
(a) change the primary CTA label to "Open your dashboard →" and hide the secondary auth CTA,
or (b) leave the primary CTA unchanged and only swap the secondary? AC-8 implies option (a);
reconcile §3.1 prose with AC-8.

---

### N-8 — `regulatoryEventCount` used in ticker but has no delta

**Spec §3.2 ticker item 6:** "Regulatory events tracked / `regulatoryEventCount` / flat".
The existing `LandingStats.regulatoryEventCount` counts all rows in `regulatory_events` with
no time filter. The spec calls this flat (no delta) which is correct given the current query.
However, `regulatory_events` has no `ingested_at` or `created_at`-based window that would
support a "new this week" delta. If a future spec adds a delta here, a migration adding
`created_at` index on `regulatory_events` will be needed. Flag for v0.2 planning.

---

## Data layer completeness (read §6 of audit instructions)

`getLandingStats()` already provides:

| Ticker item | Field in `LandingStats` | Status |
|---|---|---|
| IDTBS-RE price | `latestAvgPriceIdr` | EXISTS |
| Volume | `latestVolumeTco2e` | EXISTS |
| Median integrity score | `medianIntegrityScore` | EXISTS |
| Regulatory events | `regulatoryEventCount` | EXISTS |
| Freshness: Verra | `registriesLastSynced` (MAX of `registries.last_synced_at`) | EXISTS |
| Freshness: GFW | `satelliteLastIngested` (MAX of `satellite_alerts.ingested_at`) | EXISTS |
| Freshness: IDXCarbon | `idxLastScraped` (MAX of `idx_monthly_snapshots.scraped_at`) | EXISTS |

**Missing from `LandingStats` (need additive query as spec §5 requires):**

| Field | Notes |
|---|---|
| `activeAlerts30d` | New field; can reuse `satellite_alerts` table, no schema change needed |
| `idxParticipantCount` | Column is `registered_participants` (B-2); no schema change needed |
| `vcusTradedYtd` | New field; `SUM(total_volume_tco2e)` from `idx_monthly_snapshots` WHERE `period_month >= Jan 1` of current year |

Schema check for `registered_participants`: **CONFIRMED PRESENT** in `001_init.sql` and
populated by the T08 IDXCarbon scraper. Ticker item 3 can show a live value (not "—") once
the query is added.

---

## DB schema confirmation

**`idx_monthly_snapshots.registered_participants`:** Column exists in `001_init.sql` (line
112, type `INT`). No later migration drops or renames it. The T08 scraper inserts it. Ticker
item 3 ("Participants") is backed by real data. The spec's OQ-3 can be closed: the column
exists; use `registered_participants` not `participant_count`.

**Freshness timestamp columns confirmed:**
- `registries.last_synced_at` — TIMESTAMPTZ, present in `001_init.sql` line 71.
- `satellite_alerts.ingested_at` — TIMESTAMPTZ, present in `001_init.sql` line 133.
- `idx_monthly_snapshots.scraped_at` — TIMESTAMPTZ DEFAULT NOW(), present in `001_init.sql`
  line 119.

All three are already aggregated (MAX) in the existing `getLandingStats()` query. §3.6
freshness block is fully backed by live schema.

---

## MapLibre error boundary analysis

**Spec §7 (iii) vs MapLibreBase actual behaviour:**

`MapLibreBase` (`components/map/MapLibreBase.tsx`) catches constructor errors with
`try/catch` and sets `error` state, then renders a plain div with "Map unavailable — try
refresh." It does NOT propagate an error upward or call any `onError` callback. The spec
says `SatelliteMapHero` renders a fallback "when it receives an `onError` signal from its
dynamic import boundary" — but `MapLibreBase` does not emit such a signal; it renders its own
fallback internally. The spec's description of the error boundary wiring is incorrect.

**Implementer impact:** `SatelliteMapHero` cannot rely on an `onError` prop from
`MapLibreBase`'s dynamic import. To show the `<img>` fallback, either: (a) override
`MapLibreBase`'s error render via a `fallback` prop (needs a small T25-scoped edit to
`MapLibreBase`), or (b) wrap the `dynamic(...)` import in a React Error Boundary that catches
constructor-level throws. Option (b) is cleaner since it does not touch `components/map/*`
(which T25 is forbidden to modify per §6 file ownership).

**Add to spec §3.1 / §7:** "Because `MapLibreBase` renders its own `'Map unavailable'` error
state rather than re-throwing, `SatelliteMapHero` must wrap the dynamic import in a React
Error Boundary (not rely on an `onError` prop). A thin `MapErrorBoundary` class component
should be added inside `components/landing/SatelliteMapHero.tsx`."

---

## Cross-story coordination

**T24 (footer grid with /methodology link):**
Spec §3.6 lists the footer link grid as: `Projects · Prices · Regulatory · Methodology ·
Admin login · About`. The Methodology link is in scope for T25's `DataFreshness.tsx`
component. T24 adds `/methodology` as a route. If T24 lands after T25, the Methodology link
in T25's footer will 404 until T24 ships. This is acceptable for v0.1 (internal link, not
SEO-critical) but should be noted in the spec: "The `/methodology` link in the DataFreshness
footer is a placeholder that 404s until T24 ships. This is a known ordering dependency."

**T26 (landing metadata and project thumbnails):**
`app/layout.tsx` already exports a static `metadata` object. T25 must not add a
`generateMetadata` export or `export const metadata` to `app/(public)/page.tsx` — that is
T26's responsibility. Spec §3 out-of-scope list confirms this is handled; T25 also correctly
notes no hard-coded `<head>` tags. Confirmed: no conflict.

---

## Open questions — auditor recommendations

| # | OQ | Recommendation |
|---|---|---|
| OQ-1 | H1 copy | Keep prototype copy; follow up post-launch. No blocker. |
| OQ-2 | 3 or 4 featured projects | Specify 3-col grid for 3 cards. Add this resolution to spec before implementation. |
| OQ-3 | `idxParticipantCount` column | **CLOSED.** Column exists as `registered_participants`. Fix spec name (see B-2). |
| OQ-4 | Permenhut 6/2026 slug | Implementer must query `regulatory_events` for the slug before hardcoding. Spec should require this check as a DoD item. |

---

## Definition of done — additions required

The following items should be added to §8 before the story is implemented:

- [ ] Caption text confirmed as "satellite alerts" or "deforestation alerts" (not "RADD alerts").
- [ ] All `participant_count` references corrected to `registered_participants`.
- [ ] Ticker delta labels corrected to MoM for IDXCarbon-sourced items.
- [ ] Exact `lp-*` class list (or trimmed line range) documented in §5 globals.css entry.
- [ ] `SatelliteMapHero` error boundary implementation path documented (React Error Boundary
  wrapping dynamic import — does not require touching `components/map/*`).
- [ ] OQ-4 (Permenhut slug) resolved before code ships.
