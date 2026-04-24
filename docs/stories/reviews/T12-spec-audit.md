# T12 Spec Audit — Project detail screen with real data

**Auditor:** adversarial spec-auditor
**Date:** 2026-04-19
**Story:** T12 — Project detail screen with real data
**Verdict:** CONDITIONAL PASS — 0 blocking, 4 advisory (B/C-level)

---

## Summary

The spec is coherent and well-structured. No blocking defects. Four advisory findings below, the most notable being the T13 anchor mismatch (B-level) and the T16 deep-link parameter inconsistency (B-level). All three proposed public slugs verified correct against live DB.

---

## Finding 1 — Real slug verification: PASS

**Level:** Informational (resolved)

Live DB query executed:
```sql
SELECT slug, name_canonical FROM projects
WHERE name_canonical ILIKE '%katingan%'
   OR name_canonical ILIKE '%rimba raya%'
   OR name_canonical ILIKE '%merang%';
```

Results match spec §3.3 exactly:
| Spec slug | DB slug | Match |
|---|---|---|
| `katingan-peatland-restoration-and-conservation-project` | `katingan-peatland-restoration-and-conservation-project` | ✓ |
| `rimba-raya-biodiversity-reserve-project` | `rimba-raya-biodiversity-reserve-project` | ✓ |
| `sumatra-merang-peatland-project-smpp` | `sumatra-merang-peatland-project-smpp` | ✓ |

The three placeholder slugs in live `middleware.ts` (`katingan-peatland`, `sumatra-merang-peat`, `rimba-raya`) are confirmed wrong. The §3.4 diff is correct and must be applied.

OQ-1 is resolved — Andy does not need to separately re-verify; the slugs in the spec are accurate.

---

## Finding 2 — T13 anchor mismatch: B-LEVEL

**Level:** B — will cause T13 integration failure without correction

T12 §3.2 places the map embed placeholder (`<div class="kl-map-placeholder">`) inside the `#alerts` section. The section hierarchy is: ... `#issuances` → Retirements card (no anchor) → `#alerts` (map placeholder inside).

T13 §1 user story says "a panel below the issuances table" and §3 item 7 says:
> Detail map panel (`/projects/[slug]#map`): Rendered below the issuances table, at the `#map` anchor T12 left as a placeholder.

**Conflict:** T12 leaves a placeholder *inside* `#alerts` with no `id="map"` anchor. T13 expects an `id="map"` anchor below the issuances table. The `#alerts` anchor is a different element.

T13's AC-3 even hard-codes `GET /projects/katingan-peatland` and checks for `#map` anchor in the response HTML — T12's current spec never emits `id="map"`.

**Fix required in T12 spec (or T13 spec):** Either T12 must add `id="map"` to the placeholder `<div>` inside `#alerts`, or T13 must update its language to match T12's actual anchor structure. Recommended: add `id="map"` to the placeholder div in §3.2 and add `map` to the §3.5 contractual anchor table. This does not change page structure, only adds one missing `id` attribute to an element T12 already specifies.

**Note:** T13's §6 lists `id="alerts"` as the parent it will not rename, but it also references `#map` as the entry point — these are inconsistent within T13 itself. T12 is the foundation; T13 must conform. The T12 spec should emit `id="map"` on the placeholder and document it.

---

## Finding 3 — T16 deep-link parameter inconsistency: B-LEVEL

**Level:** B — deep-link from T12 will not work against T16 as specced without alignment

T12 §3.2 alerts section specifies:
```html
<a href="/alerts?project={project.id}">View all alerts for this project →</a>
```

The parameter value is `project.id` — a UUID.

T16 §3 item 5 ("Deep-link support") specifies:
```
GET /alerts?project=katingan-peatland
```
The parameter value is a **slug** (text string). T16's server-side logic resolves the slug to UUID via a Drizzle lookup on `projects.slug`.

**Conflict:** T12 passes a UUID; T16 expects a slug. The two specs are inconsistent on the same `?project=` parameter.

T12's approach (UUID) is harder to read in URLs and breaks T16's slug-resolution code path. T16's approach (slug) is the correct RESTful pattern and matches the rest of the application's URL convention. T12 §3.2 should be corrected to pass `{project.slug}` not `{project.id}`. The existing T16 AC-7 also uses `?project=katingan-peatland` (slug), confirming T16's intent.

**Fix required in T12:** Change `href="/alerts?project={project.id}"` to `href="/alerts?project={project.slug}"` in §3.2.

---

## Finding 4 — Middleware file-ownership pattern: PASS (acceptable)

**Level:** Informational

The spec frames the T12 `middleware.ts` edit as a "narrow cross-story edit" (same pattern as T09→`lib/schema.ts`). The architecture doc §13 confirms T05 owns middleware.ts logic. T12 §3.4 and §6 are explicit: only `PUBLIC_PROJECT_SLUGS` (4 lines), no other changes, `config.matcher` and redirect logic are untouched.

This pattern is acceptable and consistent with precedent. The spec correctly documents the file as T12-touched in the file-ownership table with the "narrow edit only" qualifier. No conflict flag warranted.

---

## Finding 5 — Unauthed view: sections fully specified: PASS (minor gap noted)

**Level:** C — cosmetic clarity gap only

T12 §3.2 states "All sections appear for authenticated users. Public users (non-authenticated) may access only the three public slugs (§3.3); the middleware redirects all others before the page component ever runs."

This correctly implies: for the 3 public slugs, all sections (score, registries, issuances, alerts, methodology note) render without auth. The page component has no auth guard — middleware is the gate. This is unambiguous for implementers.

No issue. However, the spec could add one sentence confirming "public slug pages render all sections identically to authenticated views" to pre-empt implementer confusion. Advisory only, not a defect.

---

## Finding 6 — Score sub-score bars: ARIA/accessibility gap: C-LEVEL

**Level:** C — accessibility deficiency

§3.2 score section specifies bar rows with `{value}/100` text label (right side of row) and `div.score-fill` with `width: {value}%`. The text value is present in the DOM, which satisfies basic screen reader access.

However, the spec does not call out:
- No `role="meter"` or `role="progressbar"` on the fill element
- No `aria-valuenow`, `aria-valuemin`, `aria-valuemax` attributes
- No `aria-label` on the track container

The numeric text is rendered, so screen readers can read the value if they reach it. But without `role="meter"` or `progressbar` semantics, the bar itself is decorative and not announced with context. For a financial-quality product targeting institutional buyers, this is a meaningful gap.

**Recommendation:** Add to §3.2: each `div.score-track` should contain `role="meter" aria-valuenow="{value}" aria-valuemin="0" aria-valuemax="100" aria-label="{label}: {value} out of 100"`. This is a spec addition, not a blocker for v0.1 ship, but should be logged as a v0.2 backlog item if not addressed now.

---

## Finding 7 — Registry `last_synced_at` freshness signal: C-LEVEL (enhancement gap)

**Level:** C — minor omission

The registries table displays `last_synced_at` formatted as `DD MMM YYYY`. The spec does not specify a freshness signal ("last updated N days ago" or a staleness warning for data older than 30 days).

Given that the Verra scraper runs weekly, most `last_synced_at` values will be within 7 days. No urgency for v0.1. However, if a registry row is >30 days stale (e.g., scraper failure), the user has no visual cue. Advisory: add an optional staleness badge (`> 30 days` → amber) alongside the date display. Not blocking.

---

## Finding 8 — Issuances pagination with 20/page: PASS

**Level:** Informational

307 total issuances across 64 projects. Katingan has 2 distinct vintage years in DB (confirmed via live query). The 20-row server-rendered pagination via `?issuance_page=N` is appropriate — most projects will fit on page 1, and the server-slice approach avoids client JS. No concern.

---

## Finding 9 — 404 edge case: PASS

`notFound()` on null `getProjectDetail` return is correct Next.js App Router pattern. The co-located `not-found.tsx` is specified. Clean.

---

## Finding 10 — PostGIS centroid text display: PASS (no T12 action needed)

T12 correctly leaves centroid rendering to T13. No centroid-derived text (province label, coordinates display) is required on the detail page — province is already a DB column (`projects.province`) and is rendered in the hero subtitle. No gap.

---

## Verdict Summary

| # | Finding | Level | Action Required |
|---|---|---|---|
| 1 | Slugs verified correct against live DB | Info | None — OQ-1 resolved |
| 2 | T13 expects `#map` anchor; T12 never emits it | **B** | Add `id="map"` to placeholder div; add to §3.5 anchor table |
| 3 | T16 expects slug param; T12 passes UUID | **B** | Change `{project.id}` → `{project.slug}` in §3.2 alerts link |
| 4 | Middleware edit pattern is acceptable | Info | None |
| 5 | Public slug section rendering implicitly correct | C | Optional clarity sentence |
| 6 | Score bars missing ARIA semantics | C | Log as v0.2 backlog; optionally add to §3.2 |
| 7 | Registry freshness signal absent | C | Optional enhancement |
| 8 | Pagination 20/page reasonable | Info | None |
| 9 | 404 handling correct | Info | None |
| 10 | PostGIS centroid correctly deferred to T13 | Info | None |

**Blocking findings:** 0
**B-level (should-fix before implementation starts):** 2 (Findings 2 and 3)
**C-level (advisory):** 3 (Findings 5, 6, 7)

The spec may proceed to implementation after the two B-level items are corrected in the story text. The middleware diff and slug values are confirmed correct and ready to apply.
