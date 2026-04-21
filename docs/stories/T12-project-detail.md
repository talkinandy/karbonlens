---
id: T12
title: Project detail screen with real data
phase: 3
status: audited
blocked_by: [T04, T06, T07, T09]
blocks: [T13]
owner: unassigned
effort_estimate: 4h
---

## 1. User story

As a KarbonLens user, I want to open a project's detail page and see a complete dossier —
integrity score breakdown, registry cross-references, full issuance history, retirement summary,
and a satellite-alert count — so that I can assess project quality without navigating to
external registries.

---

## 2. Context & rationale

The T03 scaffold already has `app/(app)/projects/[slug]/page.tsx` but it renders inline mock
data. This story replaces the mock with real Drizzle queries against the live DB (64 projects,
307 issuances, 247k satellite alerts, 64 daily scores as of 2026-04-19).

Two cross-cutting issues must be resolved before or alongside implementation:

**Public-slug mismatch.** T05 wrote `middleware.ts` with three placeholder slugs
(`katingan-peatland`, `sumatra-merang-peat`, `rimba-raya`) in `PUBLIC_PROJECT_SLUGS`. T06's
scraper generated real slugs from project names in a different format. The gap means a signed-out
user who visits the real URL gets a 307 redirect to sign-in, defeating the intended public demo.
This story narrows-edits `middleware.ts` to replace the three placeholders with real slugs (see
§3 item 4 for exact slugs and rationale for approach A over approach B).

**Section anchors for downstream stories.** T13 (map) and T16 (alerts inbox) will deep-link into
this page. Section IDs are specified in §3 and must not be renamed after landing.

The legacy prototype `legacy/prototype/src/ProjectDetail.jsx` is the visual reference. Follow its
two-column layout for score breakdown vs. issuance chart, the `score-row` + `score-track` bar
pattern, and the stat-card row at the top. Adapt to KarbonLens CSS tokens (`kl-card`,
`kl-section-label`, `tnum`, etc.) already used in the T03 scaffold.

---

## 3. Scope

### In scope

#### 3.1 Replace mock with Drizzle queries

Delete the `mockProjects` import from `app/(app)/projects/[slug]/page.tsx`. Extract all DB
queries into a new module `lib/queries/project-detail.ts` that exports a single async function:

```typescript
export async function getProjectDetail(slug: string): Promise<ProjectDetail | null>
```

The function runs these queries (server-side, single request lifecycle):

1. `SELECT * FROM projects WHERE slug = $1` — returns the project row; if null, the page calls
   `notFound()`.
2. `SELECT * FROM project_scores WHERE project_id = $1 ORDER BY score_date DESC LIMIT 1` — latest
   score row.
3. `SELECT * FROM registries WHERE project_id = $1 ORDER BY registry_name ASC` — all registry
   rows.
4. `SELECT vintage_year, credits, issuance_date, serial_start, serial_end FROM issuances WHERE
   project_id = $1 ORDER BY vintage_year DESC, issuance_date DESC` — all issuances; UI paginates
   to 20.
5. `SELECT SUM(credits) AS total_retired, beneficiary_name, COUNT(*) AS n FROM retirements WHERE
   project_id = $1 GROUP BY beneficiary_name ORDER BY n DESC LIMIT 3` — top-3 beneficiaries and
   grand total.
6. ```sql
   SELECT
     COUNT(*)                                         AS total_90d,
     COUNT(*) FILTER (WHERE confidence = 'high')      AS high_conf,
     COUNT(*) FILTER (WHERE confidence = 'nominal')   AS nominal_conf
   FROM satellite_alerts
   WHERE project_id = $1
     AND alert_date >= CURRENT_DATE - INTERVAL '90 days'
   ```

Wrap queries in a `Promise.all` where the project-row check allows it. The project existence check
must complete first; the remaining five queries run in parallel.

#### 3.2 Page sections (top to bottom)

All sections appear for authenticated users. Public users (non-authenticated) may access the
three public slugs (§3.3) but see a **reduced view**: the hero, score card, and registry card
only — the issuances detail, retirements card, alerts section, and methodology note are NOT
rendered for unauthenticated requests. The middleware handles slug-level gating; the page
component checks `session` (from NextAuth `getServerSession`) to conditionally render the
restricted sections. For all other slugs, middleware redirects to `/?signin=1` before the page
component runs.

**Section: Hero** (no anchor needed — it is the top of the page)

- Project name as `<h1 class="kl-page-title">`.
- Breadcrumb: `← Projects` link to `/projects` then `· <registryTag>` pills (one per registry).
- Subtitle: `developer · province · hectares ha`.
- Right-aligned: status badge (`kl-pill kl-pill--success|warning|danger`). Import and use
  `displayStatus()` from `lib/display/status.ts` (created by T11; T12 consumes it) to derive the
  badge variant and label from `project.status`.
- Status mapping: `active → success`, `pipeline → warning`, anything else → `danger`.

**Section: `#score` — Integrity score card**

Anchor: `id="score"`.

Renders as a `kl-card` with:
- Large composite score: `<span class="kl-stat-value tnum">{integrityScore}<span class="text-3">
  / 100</span></span>`.
- Quality label: `High quality` (≥ 75) | `Moderate` (≥ 60) | `Watch closely` (< 60).
- Four horizontal bar rows using the `ScoreComponents` fields from `project_scores.components`
  JSONB (read via the `ScoreComponents` type from `lib/score.ts`):

  | DB key | Display label |
  |---|---|
  | `validation_recency` | Validation & verification |
  | `reversal_risk` | Reversal risk (inverse) |
  | `community_flags` | Community & benefit-sharing |
  | `transparency` | Transparency & disclosure |

  Each row: label left, `{value}/100` right (numeric text label is mandatory for accessibility),
  then a `div.score-track` containing a `div.score-fill` with `width: {value}%` and class
  `success` (≥ 75) / `info` (≥ 60) / `warning` (< 60). The `div.score-fill` must include
  ARIA progressbar semantics:
  ```html
  <div class="score-fill ..."
       role="progressbar"
       aria-valuenow="{value}"
       aria-valuemin="0"
       aria-valuemax="100"
       aria-label="{label}: {value} out of 100">
  </div>
  ```
- Footer note (italic, 11 px, `--text-3`):
  `"v1 methodology, calibrating. Last computed {scoreDate}."` where `scoreDate` is
  `project_scores.score_date` formatted as `YYYY-MM-DD`.
- If `project_scores` returns no row, render:
  `"Score not yet computed for this project."` in place of the card body.

**Section: `#registries` — Registry cross-reference card**

Anchor: `id="registries"`.

A `kl-card` containing a `kl-table` with columns: Registry | External ID | Status |
Last synced.

- External ID cell: `<a href={registry.url} target="_blank" rel="noopener">{registry.externalId}</a>`.
  If `url` is null, render plain text. For Verra registries the URL follows the pattern
  `https://registry.verra.org/app/projectDetail/VCS/{numericId}` — the Verra scraper (T06)
  populates this in `registries.url`.
- Last synced: `lastSyncedAt` formatted as `DD MMM YYYY` (e.g. `19 Apr 2026`) or `—` if null,
  followed by a muted inline note: `"Synced N days ago"` where N is the number of whole days
  between `lastSyncedAt` and today (e.g. `"19 Apr 2026 · Synced 3 days ago"`). If
  `lastSyncedAt` is null, omit the note entirely.
- Status: render as a `kl-pill` (`active → success`, `suspended → danger`, else neutral).
- If the registries array is empty, render: `"No registry records found."`.

**Section: `#issuances` — Issuances table**

Anchor: `id="issuances"`.

A `kl-card` with:
- Header row: `Vintage | Credits (tCO₂e) | Issuance date | Serial range`.
- Data rows sorted descending by vintage_year then issuance_date (DB query already returns this
  order).
- Credits rendered with `toLocaleString('en-ID')` (e.g., `2,345,678`).
- Serial range: `{serialStart} – {serialEnd}` or `—` if null.
- Pagination: display 20 rows per page; implement via URL search param `?issuance_page=N` so
  the server component can slice the array. Do not add client-side JS pagination — server-render
  the paginated slice.
- If zero rows: `"Pipeline — no issuances recorded."`.

**Section: Retirements card** (no anchor; v0.1 may be empty)

A `kl-card` with:
- `Total retired: {totalRetired.toLocaleString('en-ID')} tCO₂e` or `—`.
- List of top-3 beneficiaries: `{beneficiaryName} — {credits.toLocaleString('en-ID')} tCO₂e`.
- If zero retirements: `"No retirements recorded."`.

**Section: `#alerts` — Satellite alerts**

Anchor: `id="alerts"`.

A `kl-card` with:
- Stat row: `Total (last 90 days): {total90d}` | `High confidence: {highConf}` |
  `Nominal confidence: {nominalConf}`.
- Map placeholder section — emitted immediately below the stat row, **outside** the alerts
  `kl-card`, as its own element with a contractual anchor for T13:
  ```html
  <section id="map" aria-label="Project map">
    <div class="kl-map-placeholder">Map coming in T13</div>
  </section>
  ```
  The `<div class="kl-map-placeholder">` is a styled grey rectangle (min-height: 280 px) with
  that label centred in muted text. T13 will replace the placeholder content; it must not rename
  or remove the `<section id="map">` element.
- Link: `<a href="/alerts?project={project.slug}">View all alerts for this project →</a>`. This
  pre-seeds the T16 alerts inbox filter. T16 resolves the slug to UUID server-side; passing
  `project.slug` (not `project.id`) is the correct RESTful convention and matches T16's spec.
- If zero alerts in 90 days: show the stat row with all zeros; still render the map placeholder.

**Section: Methodology note** (below alerts, no anchor)

`<p class="kl-section-label">Score methodology</p>` followed by a small card:

> Score computed {scoreDate} from inputs: alerts last 90 days ({alerts90dCount}),
> high-confidence alerts ({highConfCount}), registries ({registryCount}),
> years since validation ({yearsSinceValidation ?? "unknown"}).
> Weights: validation recency 25%, reversal risk 35%, community flags 20%, transparency 20%.
> <a href="/methodology">See full methodology →</a>

The `/methodology` route does not exist in v0.1; the link is rendered but returns 404.
The values come from `project_scores.components.inputs` (the `ScoreComponents.inputs` sub-object).

#### 3.3 Public-slug handling

Three projects are publicly accessible without authentication. Middleware exempts them; the page
renders all sections. For all other slugs, `middleware.ts` redirects unauthenticated requests to
`/?signin=1` before the page component ever runs — no page-level auth check is needed.

The three public slugs (real values confirmed via `COMMUNITY_OVERRIDES` in `lib/score.ts` and
T06 scraper slug-generation logic):

| Public slug (real value) | Verra ID | Project name |
|---|---|---|
| `katingan-peatland-restoration-and-conservation-project` | VCS1477 | Katingan Peatland Restoration and Conservation Project |
| `rimba-raya-biodiversity-reserve-project` | VCS674 | Rimba Raya Biodiversity Reserve Project |
| `sumatra-merang-peatland-project-smpp` | VCS1650 | Sumatra Merang Peatland Project (SMPP) |

**Slugs verified 2026-04-19 against live DB** (OQ-1 closed). The query below was executed by
the spec auditor and all three slugs matched exactly — no further confirmation needed:

```sql
SELECT slug, name_canonical
FROM projects
WHERE name_canonical ILIKE '%katingan%'
   OR name_canonical ILIKE '%rimba raya%'
   OR name_canonical ILIKE '%merang%';
```

#### 3.4 Middleware update (narrow edit)

Edit `middleware.ts` — `PUBLIC_PROJECT_SLUGS` only. Replace the three placeholder slugs:

```diff
 const PUBLIC_PROJECT_SLUGS = new Set([
-  'katingan-peatland',
-  'sumatra-merang-peat',
-  'rimba-raya',
+  // Real slugs — verified 2026-04-19 via:
+  //   SELECT slug FROM projects WHERE name_canonical ILIKE '%katingan%'
+  //     OR name_canonical ILIKE '%rimba raya%' OR name_canonical ILIKE '%merang%';
+  'katingan-peatland-restoration-and-conservation-project',
+  'rimba-raya-biodiversity-reserve-project',
+  'sumatra-merang-peatland-project-smpp',
 ]);
```

No other change to `middleware.ts` is permitted in this story. The `config.matcher`, redirect
logic, and auth check are T05-owned and must not be touched.

#### 3.5 Section anchors

The following `id` attributes are contractual — T13 and T16 will hard-code deep-links to them:

| id | Section | Consumer |
|---|---|---|
| `score` | Integrity score card | internal nav |
| `registries` | Registry cross-reference card | internal nav |
| `issuances` | Issuances table | internal nav |
| `alerts` | Satellite alerts | internal nav, T16 |
| `map` | Map placeholder `<section>` below issuances | T13 (replaces placeholder content) |

Do not rename these after landing on `feature/v0.1-impl`.

#### 3.6 Loading and error states

Create co-located Next.js special files:

- `app/(app)/projects/[slug]/loading.tsx` — renders a skeleton matching the page structure
  (hero skeleton, four stat-card skeletons, a score-card skeleton with four bar rows). Use CSS
  `animation: pulse` or the existing `kl-skeleton` class if present.
- `app/(app)/projects/[slug]/not-found.tsx` — renders inside the `(app)` shell with:
  `"Project not found"` heading and `"← Back to projects"` link.

The page component calls `notFound()` when `getProjectDetail` returns null.

### Out of scope (explicit non-goals)

- Map integration — T13 fills the placeholder added in §3.2.
- `/methodology` page — future story; the link renders but returns 404.
- Comments / discussion feed.
- Watchlist button — v0.2.
- Score diff / historical trend chart — v0.2.
- News feed / signals section — not wired in T12 (TASKS.md T12 notes it as v0.1 content, but
  the regulatory-events join requires T15 to be done first; defer to T15 or a v0.2 story).
- Issuances bar chart (Recharts) — the issuances _table_ is mandatory; the bar chart is a
  nice-to-have. If effort is tight, ship the table and skip the chart. Log an open question
  if the chart is deferred.
- Per-vintage score breakdown.
- CSV export on this page.

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Public slug exempt from auth redirect**
```
Given the user is not signed in
When  curl -I https://karbonlens.netlify.app/projects/katingan-peatland-restoration-and-conservation-project
Then  the response status is 200
And   the body contains the project name "Katingan"
```

**AC-2: Non-public slug redirects unauthenticated users**
```
Given the user is not signed in
When  curl -Ls -o /dev/null -w "%{http_code}" /projects/some-random-valid-slug
Then  the final status is 307 (redirect to /?signin=1)
```

**AC-3: Authenticated user sees integrity score for Rimba Raya**
```
Given the user is signed in
When  the user navigates to /projects/rimba-raya-biodiversity-reserve-project
Then  the page returns 200
And   the HTML contains an element with text matching "62" or whatever the current
      integrity_score is from project_scores (implementer verifies the exact value
      via: SELECT integrity_score FROM project_scores WHERE project_id =
      (SELECT id FROM projects WHERE slug = 'rimba-raya-biodiversity-reserve-project')
      ORDER BY score_date DESC LIMIT 1)
And   the #score section is visible
```

**AC-4: Invalid slug returns 404**
```
Given any user (signed in or not) for a public-slug route, or a signed-in user for any route
When  the user navigates to /projects/this-slug-does-not-exist-xyz
Then  the response status is 404
And   the not-found page renders with "Project not found" heading
```

**AC-5: Issuances table has rows for Katingan**
```
Given Katingan (VCS1477) has multi-year issuances ingested by T06
When  the user navigates to /projects/katingan-peatland-restoration-and-conservation-project
Then  the #issuances section renders ≥ 1 table row
And   each row contains a vintage year, a credit count, and an issuance date
```

**AC-6: Score card shows four sub-score bars for Katingan**
```
Given Katingan's latest project_scores row has components JSONB populated (T09)
When  the user views /projects/katingan-peatland-restoration-and-conservation-project#score
Then  four bar rows are visible: Validation & verification, Reversal risk (inverse),
      Community & benefit-sharing, Transparency & disclosure
And   each bar width is proportional to the sub-score value (implementer verifies
      current expected values: validation_recency=70, reversal_risk=70,
      community_flags=75, transparency=55 — query:
      SELECT components FROM project_scores
      WHERE project_id = (SELECT id FROM projects WHERE slug LIKE '%katingan%')
      ORDER BY score_date DESC LIMIT 1)
```

**AC-7: Registry card links to registry.verra.org**
```
Given a Verra-registered project (e.g. Katingan, external_id = 'VCS1477')
When  the user views #registries
Then  the External ID cell contains an <a> tag
And   the href is "https://registry.verra.org/app/projectDetail/VCS/1477"
      (or the exact URL stored in registries.url by T06)
```

**AC-8: Satellite alerts count reflects live data**
```
Given GFW alerts have been ingested for Katingan by T07
When  the user views /projects/katingan-peatland-restoration-and-conservation-project#alerts
Then  the "Total (last 90 days)" count is > 0
And   the implementer verifies Katingan's count > 400 via:
      SELECT COUNT(*) FROM satellite_alerts
      WHERE project_id = (SELECT id FROM projects WHERE slug LIKE '%katingan%')
        AND alert_date >= CURRENT_DATE - INTERVAL '90 days'
```

**AC-9: TypeScript and build pass**
```
Given all new files are committed
When  npx tsc --noEmit runs
Then  exit code is 0 (no type errors)
When  npm run build runs
Then  exit code is 0 (no build errors)
```

---

## 5. Inputs & outputs

**Inputs:**
- `DATABASE_URL` — Postgres connection string (already in Netlify env and `.env.local`).
- `projects` table — slug lookup, hero fields, hectares, description.
- `project_scores` table — `integrity_score`, four sub-scores, `components` JSONB, `score_date`.
- `registries` table — `external_id`, `url`, `status`, `last_synced_at`.
- `issuances` table — `vintage_year`, `credits`, `issuance_date`, `serial_start`, `serial_end`.
- `retirements` table — `beneficiary_name`, `credits`, `retirement_date`.
- `satellite_alerts` table — `confidence`, `alert_date` (last 90 days).
- `lib/score.ts` — `ScoreComponents` type, `WEIGHTS`, `METHODOLOGY_VERSION`, `COMMUNITY_OVERRIDES`.
- `lib/display/status.ts` — `displayStatus()` helper (created by T11; T12 imports read-only).

**Outputs:**
- `app/(app)/projects/[slug]/page.tsx` — modified (mock removed, real queries wired).
- `app/(app)/projects/[slug]/loading.tsx` — new file.
- `app/(app)/projects/[slug]/not-found.tsx` — new file.
- `lib/queries/project-detail.ts` — new file.
- `components/projects/detail/SectionHero.tsx` — new component.
- `components/projects/detail/ScoreCard.tsx` — new component.
- `components/projects/detail/RegistryList.tsx` — new component.
- `components/projects/detail/IssuancesTable.tsx` — new component.
- `components/projects/detail/AlertsSummary.tsx` — new component.
- `middleware.ts` — narrow edit to `PUBLIC_PROJECT_SLUGS` only.

No new DB migrations. No new env vars.

---

## 6. Dependencies & interactions

**Blocked by:**
- T04 (Drizzle schema + DB client) — `db`, `projects`, `registries`, `issuances`, `retirements`,
  `satellite_alerts`, `projectScores` are all T04-defined exports.
- T06 (Verra scraper) — populates `projects`, `registries`, `issuances`. Without T06 the page
  renders with empty sections.
- T07 (GFW alerts scraper) — populates `satellite_alerts`. AC-8 fails if T07 has not run.
- T09 (Score computation) — populates `project_scores`. AC-3 and AC-6 fail if T09 has not run.

**Blocks:**
- T13 (Map integration) — replaces `kl-map-placeholder` div in `#alerts` section. T13 must
  not rename or remove the placeholder's parent container element (`id="alerts"`).

**Related stories (not blocking but coupled):**
- T11 (Projects explorer) — clicking a row navigates to `/projects/[slug]`. T11 sets slugs in
  `href` attributes; they must match real DB slugs. T11 also creates `lib/display/status.ts`
  which T12 imports for the hero status badge.
- T16 (Alerts inbox) — this story creates the `?project={slug}` deep-link. T16 resolves slug →
  UUID server-side and must honour the `?project=` param using slug values.
- T05 (NextAuth middleware) — this story makes a narrow edit to `middleware.ts`. The middleware
  logic itself is T05-owned; T12 touches only `PUBLIC_PROJECT_SLUGS`.

**Files owned by T12 (do not create or modify in parallel tasks):**
- `app/(app)/projects/[slug]/page.tsx`
- `app/(app)/projects/[slug]/loading.tsx`
- `app/(app)/projects/[slug]/not-found.tsx`
- `lib/queries/project-detail.ts`
- `components/projects/detail/SectionHero.tsx`
- `components/projects/detail/ScoreCard.tsx`
- `components/projects/detail/RegistryList.tsx`
- `components/projects/detail/IssuancesTable.tsx`
- `components/projects/detail/AlertsSummary.tsx`
- `middleware.ts` — **narrow edit only** (PUBLIC_PROJECT_SLUGS constant, ~4 lines changed).

**Files T12 must NOT touch:**
- `lib/schema.ts`
- `lib/db.ts`
- `lib/auth.ts`
- `lib/score.ts` (read-only import of `ScoreComponents`, `WEIGHTS`, `METHODOLOGY_VERSION`)
- `lib/display/status.ts` (read-only import of `displayStatus()`; owned by T11)
- Any migration file.
- Any file under `app/(app)/projects/` other than the `[slug]/` subdirectory.

---

## 7. Edge cases & failure modes

**E1 — Project with zero issuances**
The `#issuances` section renders: `"Pipeline — no issuances recorded."` in place of the table
and pagination controls. The section heading and anchor `id="issuances"` are still present.

**E2 — Project with zero retirements**
The retirements card renders: `"No retirements recorded."` Total retired shows `—`.

**E3 — Project with zero satellite alerts**
The `#alerts` section renders stat row with `0 / 0 / 0`. The map placeholder is still rendered.
The "View all alerts" link is still rendered (the inbox will be empty when filtered).

**E4 — project_scores has no row for the project**
Score card renders: `"Score not yet computed for this project."` Sub-score bars are not rendered.
Methodology note is not rendered (no inputs to display). AC-9 (build) must still pass.

**E5 — Slug case mismatch**
All slugs in the DB are lower-case hyphenated (T06 normalises them). The URL is matched exactly
by `WHERE slug = $1`. Do not add `LOWER()` or case-insensitive matching — that would mask a
configuration bug. If the wrong case is used in the URL, the page returns 404.

**E6 — URL-encoded slug characters**
Next.js `params.slug` returns the decoded slug (e.g., `my-project` not `my%2Dproject`). No
special handling is needed. Slugs in the DB do not contain characters that encode to `%2F` or
other path-structural characters; T06 normalises slugs to `[a-z0-9-]`.

**E7 — Issuances table with many rows**
The `getProjectDetail` function fetches all issuance rows. The page component slices to 20 rows
per page using the `?issuance_page=N` URL param (defaulting to 1). For Katingan (VCS1477),
which has issuances across many vintage years, this must paginate correctly. Test with
`?issuance_page=2`.

**E8 — `registries.url` is null**
The external ID cell renders plain text (not a link). No `<a>` tag is rendered. This must not
throw a React error.

**E9 — `project_scores.components` is null or missing sub-keys**
Use optional chaining when reading `components?.validation_recency`. If any sub-key is absent,
render `—` in the bar label and a zero-width bar. Do not crash the page.

---

## 8. Definition of done

- [ ] All 9 acceptance criteria pass (manual verification).
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0.
- [ ] `middleware.ts` `PUBLIC_PROJECT_SLUGS` uses real DB slugs with the explanatory comment.
- [ ] All five detail components exist under `components/projects/detail/`.
- [ ] `lib/queries/project-detail.ts` is the only place DB queries for this page run.
- [ ] Section anchors `#score`, `#registries`, `#issuances`, `#alerts`, and `#map` are present in the DOM.
- [ ] `<section id="map" aria-label="Project map">` is emitted below the issuances table with the placeholder div inside.
- [ ] Hero status badge uses `displayStatus()` imported from `lib/display/status.ts`.
- [ ] Score sub-score bars have `role="progressbar"` + `aria-valuenow/min/max` + `aria-label`.
- [ ] Registry rows show "Synced N days ago" inline note next to the formatted date.
- [ ] Unauthenticated public-slug views render only hero + score + registry (not issuances, alerts, or methodology).
- [ ] `/projects/[slug]/loading.tsx` and `/projects/[slug]/not-found.tsx` exist.
- [ ] Story's files landed on `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] TASKS.md T12 status flipped `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

**OQ-1 — CLOSED (2026-04-19).** All three public slugs verified correct against live DB by spec
auditor. The §3.4 diff is confirmed ready to apply without further review.

**OQ-2 (Andy — design preference):** Score card sub-scores: horizontal bars (as in the legacy
prototype and specified here) vs. a radial/spider chart. Recommendation is horizontal bars:
higher information density, better accessibility (screen readers can read the numeric value), and
consistent with the existing CSS token set. Radial charts require an additional charting
dependency and add complexity for marginal visual gain.

**OQ-3 (scope clarification):** The issuances bar chart (Recharts) is listed in TASKS.md T12
but excluded from this spec as a non-goal given the 4h estimate. If Andy wants the chart in v0.1,
add 1h to the estimate and add a new component `IssuancesChart.tsx` in the same directory. The
table is sufficient for the acceptance criteria as written.

**OQ-4 (T09 sub-score values):** AC-6 states expected Katingan sub-scores as
`validation_recency=70, reversal_risk=70, community_flags=75, transparency=55`. These are
estimates based on T09's scoring logic applied to known project data. The implementer must
verify against the live `project_scores` table before writing the assertion.

---

## 10. References

- `docs/PRD.md` §6.1 — Score methodology is a framework, not a formula.
- `docs/architecture.md` §3 — `projects`, `registries`, `issuances`, `retirements`,
  `satellite_alerts`, `project_scores` table DDL.
- `docs/architecture.md` §2 — Folder layout (`app/(app)/`, `components/`, `lib/`).
- `docs/TASKS.md` T12 — Task brief.
- `lib/schema.ts` — Drizzle table definitions (T04).
- `lib/score.ts` — `ScoreComponents`, `WEIGHTS`, `METHODOLOGY_VERSION`, `COMMUNITY_OVERRIDES` (T09).
- `middleware.ts` — Route protection and `PUBLIC_PROJECT_SLUGS` (T05).
- `app/(app)/projects/[slug]/page.tsx` — Existing T03 scaffold with mock data (replaced by this story).
- `legacy/prototype/src/ProjectDetail.jsx` — Visual reference: two-column layout, score bars,
  stat-card row, `score-row` + `score-track` bar pattern.
- `legacy/prototype/styles.css` — CSS tokens and class names used in the prototype.
- `docs/stories/T05-nextauth-google-oauth.md` — Middleware ownership and `PUBLIC_PROJECT_SLUGS`
  original intent.
- `docs/stories/T09-score-computation.md` — `ScoreComponents` type definition and scoring logic.
- `docs/stories/T13-map-integration.md` (future) — T13 will fill the map placeholder in `#alerts`.
- `docs/stories/T16-notifications-alerts-inbox.md` (future) — T16 must honour `?project=` param.
