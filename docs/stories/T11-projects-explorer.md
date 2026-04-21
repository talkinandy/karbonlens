---
id: T11
title: Projects explorer screen — table + filters (real data)
phase: 3
status: draft
blocked_by: [T04, T06]
blocks: [T13, T18]
owner: spec-writer agent
effort_estimate: 4h
---

## 1. User story

As a signed-in KarbonLens user, I want a paginated, filterable table of all 64 Indonesian carbon projects showing key metrics and integrity scores, so that I can quickly find and compare projects before diving into a detail page.

---

## 2. Context & rationale

T03 scaffolded `app/(app)/projects/page.tsx` with `mockProjects` inline. T04 gave us Drizzle + a live DB. T06 populated 64 Verra projects, 64 registries, and 307 issuances. T09 computed `project_scores` for today. This story replaces every piece of mock data on the explorer screen with live Drizzle queries and adds filter/sort/pagination controls.

The middleware from T05 already gates `/projects` behind Google OAuth (307 → `/?signin=1` for unauthenticated requests). `/projects/[slug]` public access for the three flagship slugs is T12's concern; T11 does not touch middleware.

Design tokens come from the legacy prototype (`legacy/prototype/styles.css`); a formal design brief is not available. Use the CSS classes present in the prototype — `.kl-table`, `.kl-filter-chip`, `.kl-pill`, etc. — and extend them in Tailwind v4 where new variants are needed.

`status` in `projects` contains raw Verra strings (`Registered`, `Under development`, `Withdrawn`, `Under validation`, `Under verification`, `Crediting period expired`). A canonical enum normalization is deferred to T06.1. T11 displays raw strings directly and applies badge colours by category (see §3.5). Do not attempt to remap to `active`/`pipeline`/`suspended`.

---

## 3. Scope

### In scope

#### 3.1 Query helper — `lib/queries/projects-list.ts`

Create a new file `lib/queries/projects-list.ts`. This is the **only** file that queries the `projects` table for list views. It must not be called from client components.

The exported function signature:

```typescript
export async function getProjectsList(params: ProjectsListParams): Promise<{
  rows: ProjectRow[];
  total: number;
  stats: ProjectsStats;
}>
```

where:

```typescript
export type ProjectsListParams = {
  province?: string[];       // multi-value, filter rows WHERE province = ANY(...)
  projectType?: string[];    // multi-value
  status?: string[];         // multi-value; raw Verra strings
  sort?: 'score_desc' | 'score_asc' | 'hectares_desc' | 'name_asc';
  page?: number;             // 1-indexed, default 1
  limit?: number;            // default 20, max 100
};

export type ProjectRow = {
  id: string;
  slug: string;
  nameCanonical: string;
  developer: string | null;
  province: string | null;
  projectType: string | null;
  methodology: string | null;
  hectares: string | null;       // numeric comes back as string from Drizzle
  totalVcusIssued: string | null;
  totalVcusRetired: string | null;
  totalVcusAvailable: string | null;
  status: string | null;
  integrityScore: string | null; // null when no score row for today
  registryNames: string[];       // aggregated from registries join
};

export type ProjectsStats = {
  totalMatching: number;         // COUNT(*) of filtered set (before pagination)
  sumAvailableVcus: string;      // SUM(total_vcus_available) formatted
  medianIntegrityScore: number | null;
};
```

Query details:

- Join `projects` LEFT JOIN `project_scores` ON `project_id = projects.id AND score_date = CURRENT_DATE`.
- Join `registries` grouped via subquery or `array_agg(registry_name)` to produce `registryNames`.
- Apply WHERE clauses for province, projectType, status filters only when the arrays are non-empty.
- Default sort: `score_desc` (NULLs last — projects with no score go to end).
- Stats (`totalMatching`, `sumAvailableVcus`, `medianIntegrityScore`) are computed server-side from the **unsliced** (pre-pagination) filtered result set, using a single supplementary query or a CTE. Do not compute these client-side.
- `medianIntegrityScore`: use `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY integrity_score)` from PostgreSQL via the `sql` tag. Returns `null` if no scores exist.
- `limit` is capped at 100 to prevent runaway queries.

Use Drizzle's query builder where idiomatic; drop to the `sql` tag for the percentile aggregate.

#### 3.2 Filter option helpers

Add two additional exported functions in `lib/queries/projects-list.ts`:

```typescript
export async function getProvinceOptions(): Promise<string[]>
// SELECT DISTINCT province FROM projects ORDER BY province — NULLs mapped to 'Unknown'

export async function getProjectTypeOptions(): Promise<string[]>
// SELECT DISTINCT project_type FROM projects ORDER BY project_type — NULLs excluded
```

These are called once per page render and cached by Next.js's default `fetch` deduplication (they're DB calls, not fetch, so they execute each render — acceptable for 64 rows).

#### 3.3 Page — `app/(app)/projects/page.tsx`

Replace the file entirely. It must be a Next.js **server component** (no `'use client'` directive). It reads `searchParams` from the page props, calls `getProjectsList` and the two option helpers in parallel, then renders the full page.

```typescript
// Simplified shape of the page component
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) { ... }
```

`searchParams` handling rules:
- Parse `province`, `type`, `status` as arrays (a single string value is wrapped in `[]`).
- Parse `sort` as `ProjectsListParams['sort']`; ignore unrecognised values (fall back to `score_desc`).
- Parse `page` as a positive integer; ignore non-numeric or ≤0 values (fall back to 1).
- Parse `limit` — only honoured up to 100; intended for AC-3 (`?limit=100` override).
- Malformed values are silently ignored; the page renders with defaults rather than erroring.

Page layout (top to bottom):

1. **Page header** — reuse existing `.kl-page-header` + `.kl-page-title` structure.
2. **Stats strip** — inline row: "Showing X of 64 projects · X VCUs available · Median score: X". Uses `ProjectsStats` from the query.
3. **Filter + sort row** — `<FilterChips>` + `<SortControl>` components (see §3.4).
4. **Table** — `<ProjectsTable>` component (see §3.4).
5. **Pagination** — simple Prev / Next links built inline with `searchParams`.
6. **Empty state** — rendered inline when `rows.length === 0` (see §3.6).

#### 3.4 Components

**`components/projects/ProjectsTable.tsx`** — pure presentational, receives `rows: ProjectRow[]` as props.

Columns (in order):

| Column | Source field | Notes |
|--------|--------------|-------|
| Project | `nameCanonical` + `developer` | Name as `<Link href="/projects/{slug}">`, developer as muted sub-line |
| Developer | `developer` | Shown as sub-line under name; not a separate column |
| Province | `province` | `null` → `"Unknown"` |
| Project Type | `projectType` | `null` → `"—"` |
| Methodology | `methodology` | `null` → `"—"` |
| Hectares | `hectares` | Formatted: `149,800 ha` — use `toLocaleString('en-ID')`. `null` → `"—"` |
| Issued / Retired / Available | `totalVcusIssued`, `totalVcusRetired`, `totalVcusAvailable` | Show as compact "32.5 M" format for values ≥ 1 000 000; "307 k" for ≥ 1 000; raw for smaller. `null` → `"—"` |
| Status | `status` | Badge pill using `.kl-pill`; colour by category (§3.5) |
| Score | `integrityScore` | Right-aligned, bold. `null` → `"—"` |

Do not add a "Registries" column — registries are shown in the project detail (T12). The existing mock-data scaffold had a Registries column; remove it.

**`components/projects/FilterChips.tsx`** — receives `provinceOptions`, `typeOptions`, `statusOptions`, `activeFilters`, `currentSort`.

Each filter is a multi-select chip group labelled "Province", "Type", "Status". Selecting/deselecting a chip builds a new URL by adding/removing the relevant query param (e.g., `?province=Central+Kalimantan&province=East+Kalimantan`) and navigating via `<Link>` (no client-side JS state required — server-rendered links). This keeps the component a server component.

Status options are the **distinct raw Verra strings** present in the DB at render time (not a hardcoded enum). This makes it self-updating as Verra adds new statuses.

When any filter is active, render a "Clear filters" link that returns to `/projects` with no query params.

**`components/projects/SortControl.tsx`** — renders a `<select>` or pill set for sort order. Options:

| Label | `sort` value |
|-------|-------------|
| Score (high → low) | `score_desc` (default) |
| Score (low → high) | `score_asc` |
| Largest first | `hectares_desc` |
| Name A–Z | `name_asc` |

The control must work without JavaScript (use `<form method="GET">` with a `<select>` that appends `sort=` to the current URL while preserving other query params). Implementing as a server component with a `<form>` is preferred; a `'use client'` approach with `useRouter` is acceptable as a fallback if the form approach proves awkward.

#### 3.5 Status badge colour mapping

Map raw Verra `status` strings to pill classes as follows. All unrecognised strings fall back to neutral/gray.

| Verra status string | Pill class | Visible label |
|---------------------|------------|---------------|
| `Registered` | `.kl-pill--success` (green) | Registered |
| `Under validation` | `.kl-pill--info` (blue) | Under validation |
| `Under verification` | `.kl-pill--info` (blue) | Under verification |
| `Under development` | `.kl-pill--warning` (blue/muted) | Under development |
| `Withdrawn` | `.kl-pill--danger` (red) | Withdrawn |
| `Crediting period expired` | `.kl-pill--neutral` (gray) | Expired |
| any other / null | `.kl-pill--neutral` (gray) | (raw string or `"Unknown"`) |

Note: this mapping is intentionally kept in `ProjectsTable.tsx` as a local constant, not in `lib/`. It will be superseded by T06.1's canonical enum.

#### 3.6 Empty state

When `rows.length === 0`, render instead of the table:

```
No projects match these filters.
[Clear filters →]   (link to /projects)
```

Use the existing `.kl-card` wrapper so the empty state has the same card chrome as the table.

#### 3.7 Pagination

Pagination is purely link-based (server-rendered). Rules:
- Page 1: no "Prev" link (or disabled).
- Last page: no "Next" link (or disabled). Last page = `Math.ceil(total / limit)`.
- Links preserve all active filter and sort params.
- Page indicator: "Page X of Y".

#### 3.8 Skeleton loading state — `app/(app)/projects/loading.tsx`

Create a co-located `loading.tsx` that renders the page chrome (header + filter row placeholder + table skeleton of 20 ghost rows) using Tailwind's `animate-pulse` utility. This file is picked up automatically by Next.js App Router streaming.

#### 3.9 Mock data cleanup

Remove the `import { mockProjects } from "@/lib/mock-data"` line and its usage from `app/(app)/projects/page.tsx`. Do **not** delete `mockProjects` from `lib/mock-data.ts` — T18 (landing page) may still reference it. The comment at the top of `lib/mock-data.ts` already anticipates this partial removal.

### Out of scope (explicit non-goals)

- Map tab on `/projects` — T13.
- Project detail page — T12.
- CSV export — v0.2.
- Search by project name / developer (text `q` param) — v0.2 (remove the `q` placeholder from T11 query helper; do not implement the UI).
- Multi-select of arbitrary columns — v0.2.
- Date-range sliders — v0.2.
- Saved views / bookmarks — v0.2.
- Unauthenticated partial access (3-project cap for signed-out users) — middleware already blocks `/projects` entirely; the partial-access logic lives at the page level in T12 for `/projects/[slug]`.
- Infinite scroll — not in v0.1; simple Prev/Next only.

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Unauthenticated redirect**
```
Given the user is not signed in
When curl -I http://localhost:3001/projects
Then the HTTP status is 307
 And the Location header is /?signin=1 (or equivalent middleware redirect)
```

**AC-2: Authenticated response with real data**
```
Given the user is signed in (valid session cookie)
When curl -b <session-cookie> http://localhost:3001/projects
Then the HTTP status is 200
 And the response HTML contains a <table> element with at least 20 <tr> rows in <tbody>
 And the rows come from the live DB (not mock-data.ts)
```

**AC-3: Named projects appear in full listing**
```
Given the user is signed in
When curl -b <session-cookie> "http://localhost:3001/projects?limit=100"
Then grepping the HTML for "Katingan" returns at least 1 match
 And grepping for "Rimba Raya" returns at least 1 match
 And grepping for "Sumatra Merang" (or "Sumatera Merang") returns at least 1 match
```

**AC-4: Province filter narrows results**
```
Given the user is signed in
When curl -b <session-cookie> "http://localhost:3001/projects?province=Central+Kalimantan"
Then every project row in the response HTML shows "Central Kalimantan" (or "C. Kalimantan" abbreviation) in its province cell
 And rows from other provinces are absent
 And the stats strip reads "Showing X of 64 projects" where X < 64
```

**AC-5: Score sort returns highest-score project first**
```
Given the user is signed in
 And project_scores for CURRENT_DATE contains at least one row
When curl -b <session-cookie> "http://localhost:3001/projects?sort=score_desc"
Then the first data row in the HTML table has the highest integrity_score among all 64 projects
```

**AC-6: Stats strip reflects active filters**
```
Given the user is signed in
 And no filter params are set
When the page renders
Then the stats strip contains the text "Showing 64 of 64 projects"
 And when province=Central+Kalimantan is set, the strip reads "Showing X of 64 projects" where X < 64
```

**AC-7: TypeScript compiles cleanly**
```
Given the repository on feature/v0.1-impl
When npx tsc --noEmit
Then exit code is 0 with no type errors
```

**AC-8: Production build succeeds**
```
Given DATABASE_URL is set in the environment
When npm run build
Then exit code is 0 with no build errors
```

**AC-9: Legacy design tokens present in HTML output**
```
Given the user is signed in
When curl -b <session-cookie> http://localhost:3001/projects
Then grepping the HTML for "kl-table" returns at least 1 match
 And grepping for "kl-pill" returns at least 1 match
 And grepping for "kl-filter-chip" (or equivalent class applied by FilterChips) returns at least 1 match
```

---

## 5. Inputs & outputs

**Inputs:**
- `DATABASE_URL` — Postgres connection string (Hetzner VPS, set in `.env.local` and Netlify env vars).
- Session cookie — issued by NextAuth (T05); presence checked by middleware (T05).
- `searchParams` — URL query params from the browser/curl request.

**Outputs:**
- HTML page (read-only; no DB writes).
- No new env vars, no migrations, no DB writes.

---

## 6. Dependencies & interactions

**Blocked by:**
- T04 — Drizzle client (`lib/db.ts`) and schema (`lib/schema.ts`).
- T06 — Live data in `projects`, `registries`, `issuances` tables (64 rows each, 307 issuances).

**Blocks:**
- T13 — Map tab on `/projects` builds on top of this page's query infrastructure.
- T18 — Landing page live stats may reuse `getProjectsList` with `limit: 3` for the featured projects section.

**Files owned by T11** (no other story may modify these in parallel):

| Path | Action |
|------|--------|
| `app/(app)/projects/page.tsx` | Replace entirely |
| `app/(app)/projects/loading.tsx` | Create |
| `components/projects/ProjectsTable.tsx` | Create |
| `components/projects/FilterChips.tsx` | Create |
| `components/projects/SortControl.tsx` | Create |
| `lib/queries/projects-list.ts` | Create |
| `lib/mock-data.ts` | Remove `mockProjects` import from `projects/page.tsx` only; do NOT edit `mock-data.ts` itself |

---

## 7. Edge cases & failure modes

**(i) Project with NULL province**
`getProvinceOptions()` maps NULL to the string `"Unknown"` in the returned array. `ProjectsTable.tsx` renders `"Unknown"` in the province cell. The filter chip "Unknown" filters for `province IS NULL` — the query helper must handle `province = 'Unknown'` as `WHERE province IS NULL`.

**(ii) Project with NULL integrity score today**
When `project_scores` has no row for a project on `CURRENT_DATE`, the LEFT JOIN produces NULL for `integrityScore`. `ProjectsTable.tsx` renders `"—"` in the score cell. These rows sort last under `score_desc` (NULLs last). Default sort `score_desc` is still valid even if all 64 projects lack scores.

**(iii) Invalid or unexpected searchParam values**
- Non-numeric `page` (e.g., `page=abc`): fall back to page 1.
- `sort=random`: fall back to `score_desc`.
- `province=` (empty string): treat as no filter.
- `limit=999`: cap at 100.
- Unknown keys (e.g., `q=foo`): silently ignore.
The page must never throw for any searchParam input.

**(iv) DB unreachable**
Let the Drizzle call throw. Next.js App Router will catch it and render `app/(app)/error.tsx` (if it exists) or the default Next.js 500 page. T11 does not add a custom `error.tsx` — that is a shared concern deferred to T22 (Sentry).

**(v) All rows filtered away (empty state)**
When filters produce zero matching rows, render the empty state (§3.6) instead of the table. The stats strip reads "Showing 0 of 64 projects". The "Clear filters" link returns to `/projects`.

**(vi) Extremely large numeric values**
`total_vcus_issued` is stored as `numeric` (string in Drizzle). Format using `BigInt` or `parseFloat` — do not use `parseInt` which truncates large mantissas. The compact formatter (`32.5 M`) must handle values up to at least 10 billion.

---

## 8. Definition of done

- [ ] All 9 acceptance criteria pass (manually verified with curl + grep).
- [ ] `app/(app)/projects/page.tsx` imports nothing from `lib/mock-data`.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0.
- [ ] Story's files landed in `feature/v0.1-impl` (single commit or PR).
- [ ] CHANGELOG entry added under `[Unreleased]`: `T11 — Projects explorer: live Drizzle query, filters, pagination`.
- [ ] `TASKS.md` status for T11 flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

**OQ-1 — Status enum normalization (deferred to T06.1)**
Verra raw strings (`Registered`, `Under development`, `Withdrawn`, etc.) are displayed verbatim in T11 with a badge colour mapping in `ProjectsTable.tsx`. If T06.1 lands before T11 and introduces a canonical `status_canonical` column, T11 implementer should use that column instead. Coordinate with the T06.1 implementer.

**Decision for T11:** display raw `projects.status` with local badge mapping (§3.5). No normalization in the query helper.

**OQ-2 — Hectares display precision**
Displaying `149,800 ha` (integer formatting) is specified. Projects with fractional hectares (e.g., `22,900.5`) should round to nearest integer for display. Confirm with Andy if sub-hectare precision is ever meaningful for the table view.

**Decision for T11:** round to nearest integer (`Math.round(parseFloat(hectares)).toLocaleString('en-ID') + ' ha'`).

**OQ-3 — Stats strip "sum of available VCUs" unit**
`SUM(total_vcus_available)` across 64 projects will be in the hundreds of millions. Display as "X M VCUs" compact format. Confirm unit label with Andy — "VCUs" or "tCO₂e" (Verra VCUs are nominally 1 VCU = 1 tCO₂e, so either is correct; VCUs is more accurate for registry context).

**Decision for T11:** use "VCUs". A label clarification "(≈ tCO₂e)" can be added as a tooltip in T12.

**OQ-4 — `SortControl` implementation: `<form>` vs client router**
A pure `<form method="GET">` approach preserves server-component status for `SortControl` but requires all current filter params to be serialized as hidden `<input>` elements (otherwise the form submission drops them). This is doable but slightly verbose. A `'use client'` `useRouter` approach is simpler. Andy's preference is not documented.

**Decision for T11:** use `'use client'` + `useRouter` for `SortControl` only (it is a leaf component; making it client does not force the page to be client). Keep `FilterChips` as server-rendered `<Link>` elements.

---

## 10. References

- `docs/architecture.md` §2 (repository layout), §3 (schema — `projects`, `registries`, `project_scores` tables).
- `docs/PRD.md` §3 (scope), §2 (user personas — international buyer as primary).
- `docs/TASKS.md` T11 section.
- `lib/schema.ts` — Drizzle table definitions for `projects`, `registries`, `projectScores`.
- `app/(app)/projects/page.tsx` — T03 scaffold being replaced.
- `lib/mock-data.ts` — `mockProjects` definition (to be unlinked from the page; export retained for T18).
- `legacy/prototype/styles.css` — CSS custom properties and class names (`.kl-table`, `.kl-pill`, `.kl-pill--success`, `.kl-pill--danger`, `.kl-pill--warning`, `.kl-pill--neutral`, `.kl-filter-chip`).
- `docs/stories/T06-verra-scraper.md` §7 (status field note: raw Verra strings, not canonical enum).
- `docs/stories/T05-nextauth-google-oauth.md` — middleware protecting `/projects`.
