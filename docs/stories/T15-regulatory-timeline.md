---
id: T15
title: Regulatory timeline screen with real data
phase: 3
status: draft
blocked_by: [T04, T10]
blocks: []
owner: agent
effort_estimate: 2h
---

## 1. User story

As a signed-in KarbonLens user, I want to browse Indonesian carbon-market regulations on a visual timeline — filtered by importance, ministry, and tag, in English or Indonesian — so that I can quickly orient myself in the regulatory landscape and share specific views with colleagues.

## 2. Context & rationale

T03 scaffolded `app/(app)/regulatory/page.tsx` with inline mock data. T10 seeded 10 real rows into `regulatory_events`, including bilingual summaries, importance levels, ad-hoc tag arrays, and one upcoming event (`is_upcoming = TRUE`). T15 replaces the mock with a live Drizzle query and builds the complete filter + timeline UI described in the design brief Screen 5.

Key decisions locked before this spec was written:

- **Tag filter is dynamic.** T10 uses 17+ ad-hoc tags with no canonical closed list. The filter UI must be built from `SELECT DISTINCT unnest(tags) FROM regulatory_events ORDER BY 1` — no hardcoded tag strings in code.
- **Language toggle.** Bilingual summaries (`summary_en` / `summary_id`) exist on every row. Display English by default; toggle to Indonesian via a segmented control. Persist the choice in `?lang=id` URL param so links are shareable.
- **Upcoming visual treatment.** The single `is_upcoming = TRUE` row (IDXCarbon full-scale launch, forecast 2026-07-01) must be visually distinct: dashed card border + "Forecast" pill.
- **Route is gated.** Middleware already protects `(app)` routes. `/regulatory` requires a session; unsigned-out visitors get a 307 redirect.

## 3. Scope

### In scope

1. **Replace the mock in `app/(app)/regulatory/page.tsx`** with a Drizzle query on `regulatory_events`, filtered and sorted server-side. Default sort: `event_date DESC`. Upcoming rows (`is_upcoming = TRUE`) are surfaced at the top of the list regardless of date order (above the historical events), styled distinctly, so users immediately see what is coming next.

2. **Filter bar** (`components/regulatory/FilterBar.tsx`) — rendered client-side to maintain interactivity while page shell is a server component:
   - **Importance** multi-select pills: `critical`, `high`, `medium`, `low` (these four values are schema-enforced via T10's seed assertion; safe to hardcode for importance only).
   - **Ministry** multi-select pills: `Presidential`, `OJK`, `Kemenhut`, `Kementerian LH`, `IDX` — use the DB values as source of truth; this list can be derived at build time from the same query or hardcoded from the known T10 set (5 values, stable for v0.1). Prefer deriving from DB for consistency.
   - **Tags** multi-select pills: built dynamically from `SELECT DISTINCT unnest(tags) FROM regulatory_events ORDER BY 1`. Do not hardcode any tag string. Pills rendered alphabetically.
   - **Language toggle** (`components/regulatory/LanguageToggle.tsx`): segmented control `EN | ID`. Reflected in URL param `?lang=id` (absence = EN default). Sticky within session via URL state.
   - All active filters and language param live in the URL query string. The page renders with filter values parsed from `searchParams` (Next.js server component pattern). Changes push to the URL via `useRouter().push()` client-side.

3. **Event card layout — vertical timeline** (`components/regulatory/TimelineCard.tsx`):
   - **Year grouping rail** on the left: a vertical line with a year label (`2009`, `2016`, …, `2026`) that appears once per calendar year as the user scrolls down.
   - **Card contents** (in order):
     - Date formatted as `"26 Sep 2023"` (day month-abbr year).
     - Ministry badge — small pill in muted tone.
     - Document-type + document-number pill: e.g., `"POJK 14/2023"`, `"Perpres 98/2021"`. If `document_type` or `document_number` is NULL/sentinel (`'N/A'`, `'IDX-LAUNCH-2026'`), show just the type or omit the pill.
     - Title (`title` column).
     - Summary — language-dependent: show `summary_en` when `lang` is absent or `en`; show `summary_id` when `lang=id`.
     - Tag chips from `tags[]` array — rendered as small rounded labels.
     - Document URL link — render only when `document_url IS NOT NULL`; opens in new tab with `target="_blank" rel="noopener noreferrer"`. Label: "View document →".
   - **Importance indicator**: a 4px colored left border stripe on the card using the importance color palette:
     - `critical` → `#DC2626` (red-600)
     - `high` → `#D97706` (amber-600)
     - `medium` → `#2563EB` (blue-600)
     - `low` → `#6B7280` (gray-500)
   - **Upcoming treatment**: cards where `is_upcoming = TRUE` receive:
     - Dashed card border (`border-dashed border-2`).
     - A `"Forecast"` pill (amber background, dark text) in the card header alongside the date.
     - The upcoming section is visually separated from historical events by a "Coming up" section header above the first upcoming card.

4. **URL state** — all active filter values and `lang` param are reflected in the URL so links are shareable. Pattern: `/regulatory?importance=critical&importance=high&ministry=Kemenhut&tag=forestry&lang=id`.

5. **Empty state** — when filters match zero events, show a centered message: "No regulations match your filters." + a "Clear all filters" button that resets to `/regulatory`.

6. **Loading and error states** — use `app/(app)/regulatory/loading.tsx` for the Suspense loading skeleton. Wrap the Drizzle query in a try/catch; on error render an inline error message within the page (no crash boundary needed for v0.1).

### Out of scope (explicit non-goals)

- RSS feed (v0.2).
- Email subscribe / watchlist for new regulations (v0.2).
- Regulation comparison tool (v0.3).
- Automated translation pipeline — summaries are hand-authored EN+ID.
- Full-text search box — tag and importance filters are sufficient for 10 events.
- Admin UI for adding new events (v0.2).
- Pagination — 10 events fit on one page.
- "Subscribe" button wiring — render as placeholder / disabled for v0.1.

## 4. Acceptance criteria (Gherkin)

**AC-1: Middleware gate**
```
Given a visitor who is not signed in
When they request GET /regulatory
Then the response status is 307
And the Location header redirects toward the sign-in flow
```

**AC-2: Authenticated page load**
```
Given a signed-in user
When they navigate to /regulatory
Then the response status is 200
And the page renders exactly 10 event cards (all seeded events)
```

**AC-3: Importance filter**
```
Given a signed-in user
When they navigate to /regulatory?importance=critical
Then only cards with importance = 'critical' are shown
And the count is >= 3 (matching T10 seed: Perpres 98/2021, POJK 14/2023, Perpres 110/2025, Permenhut 6/2026)
```

**AC-4: Ministry filter**
```
Given a signed-in user
When they navigate to /regulatory?ministry=Kemenhut
Then only cards whose ministry column = 'Kemenhut' are shown
And the count is >= 2 (Permenhut 7/2024 and Permenhut 6/2026)
```

**AC-5: Tag filter**
```
Given a signed-in user
When they navigate to /regulatory?tag=forestry
Then only cards whose tags array contains 'forestry' are shown
And the count is >= 2 (Permenhut 7/2024 tags include 'forestry'; Permenhut 6/2026 tags include 'forestry')
```

**AC-6: Language toggle — Indonesian**
```
Given a signed-in user
When they navigate to /regulatory?lang=id
Then each event card displays the summary_id field (Indonesian text)
And no card shows the summary_en field in the summary position
```

**AC-7: Upcoming visual treatment**
```
Given a signed-in user with no filters active
When they view /regulatory
Then the card for the IDXCarbon full-scale launch (is_upcoming = TRUE) has a "Forecast" pill visible
And that card has a dashed border
And it appears in a "Coming up" section above the historical event list
```

**AC-8: Tag filter list is dynamic**
```
Given a signed-in user
When they view /regulatory with no filters
Then the Tags section of the filter bar renders >= 5 distinct tag pill values
And those values match the output of:
    SELECT DISTINCT unnest(tags) FROM regulatory_events ORDER BY 1
And no tag string is hardcoded in FilterBar.tsx source (grep confirms absence)
```

**AC-9: Build passes**
```
Given the implementation branch
When npx tsc --noEmit is run
Then exit code is 0 with no type errors
When npm run build is run
Then exit code is 0 with no build errors
```

**AC-10: Document URL links open in new tab**
```
Given a signed-in user viewing an event card whose document_url is not NULL
When they inspect the "View document →" link element
Then the anchor has target="_blank" and rel="noopener noreferrer"
Given an event card whose document_url IS NULL
Then no anchor element is rendered for that card
```

## 5. Inputs & outputs

**Inputs:**
- `DATABASE_URL` env var (Postgres connection string, already wired in T04).
- `regulatory_events` table populated by T10 (`scrapers/seed/regulatory_events_v1.sql`).
- Middleware auth session from T05 (gates `/regulatory`).
- URL `searchParams`: `importance[]`, `ministry[]`, `tag[]`, `lang`.

**Outputs — files created or modified:**
- `app/(app)/regulatory/page.tsx` — replaces T03 mock; server component; queries DB; passes data to client components.
- `app/(app)/regulatory/loading.tsx` — Suspense skeleton for the timeline.
- `components/regulatory/TimelineCard.tsx` — card component; pure presentational; receives a typed `RegulatoryEvent` prop.
- `components/regulatory/FilterBar.tsx` — client component; receives available filter options as props from the server; manages URL state via `useRouter` + `useSearchParams`.
- `components/regulatory/LanguageToggle.tsx` — segmented control `EN | ID`; part of FilterBar or standalone; updates `?lang` param.
- `lib/queries/regulatory.ts` — Drizzle query functions:
  - `getRegulatoryEvents(filters)` — filtered, sorted query returning typed rows.
  - `getDistinctTags()` — `SELECT DISTINCT unnest(tags) FROM regulatory_events ORDER BY 1`.
  - `getDistinctMinistries()` — `SELECT DISTINCT ministry FROM regulatory_events WHERE ministry IS NOT NULL ORDER BY 1`.

No new env vars. No DB migrations. No schema changes.

## 6. Dependencies & interactions

**Blocked by:**
- T04 — Drizzle client and DB connection required.
- T10 — `regulatory_events` must be seeded with 10 rows for ACs to pass.

**Blocks:** (none in v0.1)

**Files owned by T15** (no other story may create or modify these in parallel):
- `app/(app)/regulatory/page.tsx`
- `app/(app)/regulatory/loading.tsx`
- `components/regulatory/TimelineCard.tsx`
- `components/regulatory/FilterBar.tsx`
- `components/regulatory/LanguageToggle.tsx`
- `lib/queries/regulatory.ts`

**Parallel safety:**
- T11, T12, T13, T14 touch different routes and components; no conflict.
- T16 touches `components/ui/TopNav.tsx` and `/alerts` only; no conflict.

## 7. Edge cases & failure modes

1. **`is_upcoming = FALSE` but `event_date` is in the future.** This is a data inconsistency (should not arise from T10 seed, but possible after manual edits). Render the row as a normal historical card — do not apply Forecast styling based on date comparison alone. Log a `console.warn` server-side: `"regulatory_events row {id}: event_date is in the future but is_upcoming=FALSE"`. Do not crash.

2. **NULL `document_url`.** Do not render the "View document →" link at all. Several T10 rows carry `NULL` (Rows 5, 6, 7, 8, 9, 10). No placeholder text needed.

3. **Zero events matching current filters.** Render the empty state: "No regulations match your filters." + "Clear all filters" button that navigates to `/regulatory` (no params).

4. **Tag values containing URL-encoding-sensitive characters** (spaces, slashes, ampersands). URL-encode tag values when writing to query params (`encodeURIComponent`). Decode with `decodeURIComponent` when reading from `searchParams`. SQL query uses parameterised Drizzle calls — no injection risk.

5. **`document_number` sentinel values** (`'N/A'`, `'IDX-LAUNCH-2026'`). The document-number pill logic must handle these gracefully: if `document_number` equals `'N/A'` or matches the pattern `/^[A-Z]+-[A-Z]+-\d{4}$/` (all-caps sentinel), omit the number from the pill and show only the `document_type`. Alternatively, show no pill at all for these rows — implementer's call, either is acceptable.

6. **Ministry canonical form.** Use DB values as source of truth. Do not normalise `"Kemenhut"` to `"Kementerian Kehutanan"` in the UI — display whatever `ministry` column contains, to avoid mismatch with filter logic.

7. **`summary_en` or `summary_id` unexpectedly NULL.** T10's seed asserts this cannot happen, but handle defensively: if the active language's summary is NULL, fall back to the other language. Render a small `(EN)` or `(ID)` indicator next to the summary to signal the fallback.

## 8. Definition of done

- [ ] All 10 acceptance criteria pass.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0.
- [ ] Story files landed in `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`: `T15 — Regulatory timeline screen`.
- [ ] TASKS.md status flipped `todo` → `done` for T15.
- [ ] Story frontmatter `status` set to `done`.

## 9. Open questions

1. **Language persistence: URL param vs cookie vs user-setting.** Recommendation: URL param (`?lang=id`). Rationale: shareable links carry the language context; no additional storage or session coupling needed; consistent with the URL-state pattern used for all other filters. If Andy later wants language to default to the user's locale preference, that can be added as a middleware read of `Accept-Language` header that sets a default param — no component refactor needed.

2. **Post-T10 fact-check corrections (rows 6–10 pending Andy).** When Andy corrects or updates rows 6–10 in the DB (e.g., confirms document numbers, updates summaries, corrects dates), T15 auto-re-renders from the DB — no code change required. The only code-touching scenario is if a corrected `ministry` value differs from what is hardcoded anywhere; since T15 derives ministries from the DB query, this is safe.

3. **Ministry list derivation.** The spec recommends deriving the ministry filter list dynamically from `getDistinctMinistries()` for consistency with the tag pattern. An alternative is to hardcode the 5 known T10 values. Dynamic is preferred: future seed files (v0.2) will automatically appear in the filter without code changes. Implementer should use dynamic unless there is a build-time fetch constraint.

4. **Upcoming section header placement.** The spec recommends a "Coming up" section header above upcoming cards (top of timeline). If there are zero upcoming events, the section header should not render. This is robust for v0.2 when the IDXCarbon row's `is_upcoming` is flipped to FALSE post-launch.

## 10. References

- `docs/PRD.md` — §3 v0.1 in-scope: "Regulatory timeline screen (manual entries)"
- `docs/architecture.md` — §3 `regulatory_events` schema; §2 folder layout
- `docs/TASKS.md` — T15 task block; T10 task block (tag vocabulary decision)
- `docs/stories/T10-regulatory-seed.md` — seed data spec, bilingual summaries, tag list, `is_upcoming` semantics
- `docs/stories/README.md` — story lifecycle and conventions
- `lib/schema.ts` — `regulatoryEvents` Drizzle table definition
