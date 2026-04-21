---
id: T18
title: Landing page with live stats
phase: 3
status: draft
blocked_by: [T11, T14]
blocks: [T23]
owner: ""
effort_estimate: 2h
---

## 1. User story

As a prospective user visiting `karbonlens.netlify.app`, I want the landing page to show real market numbers drawn from the live database, so that the hero stats are credible signals of what the product tracks rather than placeholder copy.

---

## 2. Context & rationale

T03 scaffolded `app/(public)/page.tsx` with four hard-coded stat cards (214 indexed projects, 1,842 satellite alerts, 47 tracked regulations, Rp 4.7B monthly value). T05 added a "Sign in with Google" `<SignInButton>` to the hero and introduced the `auth()` session check that hides the button for already-signed-in users. Neither story connected the stats to the database.

T11 proved the query shape for projects and introduced `lib/queries/projects-list.ts`. T14 proved the query shape for `idx_monthly_snapshots` and introduced `lib/queries/prices.ts`. T18 adds a third query module (`lib/queries/landing-stats.ts`) and replaces every static number in the landing page with live DB-derived values.

The public landing page is a marketing surface. The middleware created in T05 explicitly does **not** gate `/` — unauthenticated users must see the page. Signed-in users who navigate to `/` also stay on the landing (no redirect to `/projects`). Both states are in scope.

**Cache strategy.** The page is a Next.js server component. Querying the DB on every cold request would add 100–300 ms to TTFB and create unnecessary read load for what is essentially an immutable stat on 1-hour timescales. T18 uses Next.js's ISR (`export const revalidate = 3600`): the first visitor after each 60-minute window triggers a background revalidation while the cached response is returned immediately. Subsequent visitors within the same window get the stale-while-revalidate HTML. This keeps TTFB < 100 ms for cache-hit requests and limits the landing page to at most one DB round-trip per hour. If v0.2 requires more frequent refresh (e.g., for ops-level alerting on the landing), the constant can be dropped to 900 (15 minutes) without other code changes.

---

## 3. Scope

### In scope

#### 3.1 Query module — `lib/queries/landing-stats.ts`

Create a new file. It must not be imported by client components. Export a single async function:

```typescript
export async function getLandingStats(): Promise<LandingStats>
```

where:

```typescript
export type LandingStats = {
  // Projects
  projectCount: number;              // COUNT(*) WHERE country='ID'
  totalVcusIssued: string;           // SUM(total_vcus_issued) WHERE country='ID', formatted compact
  totalVcusAvailable: string;        // SUM(total_vcus_available) WHERE country='ID', formatted compact

  // IDXCarbon latest month
  latestPeriod: string | null;       // period_month formatted as "Mar 2026"
  latestVolumeTco2e: string | null;  // total_volume_tco2e formatted "117k tCO₂e"
  latestAvgPriceIdr: string | null;  // avg_price_idr formatted "Rp 40,025"
  latestValueIdr: string | null;     // total_value_idr formatted "Rp 4.7B"
  momDeltaPct: number | null;        // MoM delta on avg_price_idr (rows[0] vs rows[1]); null if < 2 months

  // Integrity scores
  medianIntegrityScore: number | null;  // PERCENTILE_CONT(0.5) across today's project_scores

  // Regulatory events
  regulatoryEventCount: number;      // COUNT(*) FROM regulatory_events

  // GFW alerts
  gfwAlerts90d: number;              // COUNT(*) FROM satellite_alerts WHERE alert_date >= NOW() - INTERVAL '90 days'

  // Data source timestamps (for §3.3)
  registriesLastSynced: Date | null;    // MAX(last_synced_at) FROM registries
  satelliteLastIngested: Date | null;   // MAX(ingested_at) FROM satellite_alerts
  idxLastScraped: Date | null;          // MAX(scraped_at) FROM idx_monthly_snapshots
};
```

Implementation details:

- Execute **two** Drizzle queries in parallel (`Promise.all`) to minimise latency:
  1. Projects + scores + regulatory + alerts query (one CTE or joined query against `projects`, `project_scores`, `regulatory_events`, `satellite_alerts`).
  2. IDXCarbon query: `SELECT * FROM idx_monthly_snapshots ORDER BY period_month DESC LIMIT 2` (two rows to compute MoM delta). Also pulls `MAX(scraped_at)`.
- Drop to `sql` tag for `PERCENTILE_CONT` and any aggregates Drizzle cannot express natively.
- Use `COALESCE(SUM(total_vcus_issued), 0)` and `COALESCE(SUM(total_vcus_available), 0)` — the generated column `total_vcus_available` cannot be summed via Drizzle's column reference; use `sql\`COALESCE(SUM(total_vcus_issued - total_vcus_retired), 0)\`` instead.
- `momDeltaPct`: `((rows[0].avgPriceIdr - rows[1].avgPriceIdr) / rows[1].avgPriceIdr) * 100`, rounded to one decimal. Set to `null` if either value is `null` or if fewer than 2 rows exist.
- Wrap the entire function body in `try/catch`. On error, log the error with `console.error('[T18] getLandingStats error:', err)` and return a `LandingStats` object with all numeric fields set to `0`, all string fields to `null`, and all date fields to `null`. The landing page must never show a 500 — it degrades gracefully with `"—"` placeholders.

Number formatters (define as module-local helpers, not exported):

```typescript
// Compact VCU: 3_600_000 → "3.6M VCUs"; 307_000 → "307k VCUs"
function formatVcus(n: number): string { ... }

// Compact IDR value: 4_700_000_000 → "Rp 4.7B"
function formatIdr(n: number): string { ... }

// Full IDR price: 40025 → "Rp 40,025"
function formatIdrFull(n: number): string { ... }

// Volume: 117000 → "117k tCO₂e"
function formatVolume(n: number): string { ... }

// Period: "2026-03-01" → "Mar 2026"
function formatPeriod(d: string): string { ... }
```

#### 3.2 Updated landing page — `app/(public)/page.tsx`

Replace the static stat cards with live values. The page must declare:

```typescript
export const revalidate = 3600; // ISR: revalidate at most once per hour
```

at module scope (top of file, before the component).

Call `getLandingStats()` at the top of the server component. Keep the `auth()` call for the `<SignInButton>` visibility check (unchanged from T05). Run both in parallel:

```typescript
const [stats, session] = await Promise.all([getLandingStats(), auth()]);
```

**Hero stat row** — replace the four existing static `kl-card` divs with seven stat cards rendered from `stats`. Cards (in display order):

| Label | Value field | Trend indicator |
|---|---|---|
| Indonesian projects tracked | `stats.projectCount` | none |
| Credits issued | `stats.totalVcusIssued` | none |
| Credits available | `stats.totalVcusAvailable` | none |
| IDXCarbon avg price | `stats.latestAvgPriceIdr` + period label | `stats.momDeltaPct` (MoM, optional arrow badge) |
| IDXCarbon volume | `stats.latestVolumeTco2e` | none |
| Median integrity score | `stats.medianIntegrityScore` | none |
| GFW alerts (90d) | `stats.gfwAlerts90d` | none |

Each card uses the existing `kl-card`, `kl-stat-label`, `kl-stat-value`, and `kl-stat-delta` CSS classes (unchanged from T03). `null` values display as `"—"`. The trend badge on the avg price card uses arrow characters (`↑` / `↓`) and `var(--color-positive)` / `var(--color-negative)` for color, consistent with T14's delta badge style.

The stat row grid (`display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`) accommodates the expanded card count without layout changes.

The existing hero copy (headline, subtitle paragraph) and `<SignInButton>` placement are preserved exactly as-is from T05.

**Featured projects section** — replace `mockProjects.slice(0, 3)` with a static list of the three canonical public slugs. Create a small query in `getLandingStats` (or a separate helper, implementer's choice) that fetches only these three projects:

```typescript
const FEATURED_SLUGS = ['katingan-peatland', 'sumatra-merang-peat', 'rimba-raya'] as const;
```

For each project, fetch: `slug`, `nameCanonical`, `developer`, `province`, `projectType`, the latest `integrityScore` from `project_scores` (LEFT JOIN on `score_date = CURRENT_DATE`), and `registryNames` (aggregated from `registries`). Shape this into a `FeaturedProject[]` array.

Each card links to `/projects/{slug}` via `<Link>`. Show: registry names as the section label, project name, developer + province subtitle, integrity score, and the first registry name as "Primary registry". The `kl-pill` status badge is omitted from the landing — it would require a raw Verra string which is too noisy for a marketing surface.

**Remove the mock import** — delete `import { mockProjects } from "@/lib/mock-data"` from `app/(public)/page.tsx`. The `mockProjects` export in `lib/mock-data.ts` may be deleted by T18 **only if** T11 has already landed and removed the last other consumer of that export. If T11 has not landed when T18 is implemented, leave `mockProjects` in `lib/mock-data.ts` (the export is harmless). Add a comment: `// mockProjects no longer used by landing (T18). Safe to delete when T11 lands.`

#### 3.3 Component breakdown

Extract presentational components into `components/landing/`:

**`components/landing/StatCard.tsx`** — pure presentational. Props:
```typescript
type StatCardProps = {
  label: string;
  value: string | number | null;   // null renders as "—"
  sublabel?: string;               // e.g. "Mar 2026"
  trend?: { pct: number } | null;  // renders arrow badge if non-null
};
```

**`components/landing/FeaturedProjects.tsx`** — receives `projects: FeaturedProject[]`. Renders the grid of three project cards with `<Link>` elements. Pure presentational.

**`components/landing/DataSources.tsx`** — receives the three timestamps (`registriesLastSynced`, `satelliteLastIngested`, `idxLastScraped`). Renders a row of three data-source badges near the bottom of the page:

```
Verra registry    GFW alerts           IDXCarbon
Last synced: …    Last ingested: …     Last scraped: …
```

Timestamps formatted as relative time ("3 days ago", "2 hours ago") using a simple local helper (`formatRelative`) — no external library. Fall back to "—" if null.

**`components/landing/HeroSection.tsx`** — wraps the `<header>` with headline, subtitle, and `<SignInButton>`. Receives `showSignIn: boolean` (derived from `!session?.user`). Keeps the existing copy verbatim.

#### 3.4 Cache strategy documentation

Add a comment block at the top of `lib/queries/landing-stats.ts`:

```typescript
/**
 * getLandingStats — landing page live stats query.
 *
 * Cache contract: app/(public)/page.tsx declares `export const revalidate = 3600`.
 * This means Next.js ISR will serve the cached HTML for up to 1 hour before
 * triggering a background re-fetch. The function itself has no internal cache.
 *
 * v0.2 consideration: if operators need sub-15-minute freshness on the landing
 * (e.g., for ops-level GFW alert monitoring), reduce `revalidate` to 900.
 */
```

### Out of scope (explicit non-goals)

- Marketing copy overhaul — use T03's scaffolded headline and subtitle verbatim.
- Signup without Google OAuth on the landing page — v0.2.
- Case studies, testimonials, or logo walls — v0.2.
- Animated hero — keep it static for v0.1.
- Per-project breakdown on the landing (that belongs to `/projects/[slug]`).
- Client-side polling / WebSocket live updates — ISR at 1 hour is sufficient for v0.1.
- Public analytics instrumentation (Plausible, GA) — v0.2.
- Time-range selectors on the stat cards — v0.2.

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Public route — no auth required**
```
Given no session cookie is present
When curl -I https://karbonlens.netlify.app/
Then the HTTP status is 200
 And no Location header is present (no redirect)
```

**AC-2: Live project count and page heading visible**
```
Given the DB has 64 rows in projects WHERE country='ID'
 And the page is rendered (ISR or fresh)
When curl https://karbonlens.netlify.app/ | grep -c "64"
Then the count returned is at least 1
 And the HTML also contains text matching "Indonesia" or "Indonesian"
```

**AC-3: IDXCarbon avg price rendered in correct format**
```
Given idx_monthly_snapshots contains a Mar 2026 row with avg_price_idr populated
When curl https://karbonlens.netlify.app/ | grep -oP "Rp \d{2,6}"
Then at least one match is found (e.g. "Rp 40,025" or abbreviated "Rp 40k")
 And the adjacent sublabel contains "Mar 2026" or equivalent period label
```

**AC-4: Featured projects section contains Katingan slug**
```
Given the three featured projects are Katingan, Sumatra Merang, Rimba Raya
When curl https://karbonlens.netlify.app/ | grep "katingan-peatland"
Then at least 1 match is found (href in the featured project card link)
```

**AC-5: Data sources section shows last-synced timestamps**
```
Given registries, satellite_alerts, and idx_monthly_snapshots all have rows
When curl https://karbonlens.netlify.app/ | grep -i "last synced\|last ingested\|last scraped"
Then at least 1 match is found
 And none of the timestamp displays shows an error or stack trace
```

**AC-6: Signed-in user stays on landing (no redirect)**
```
Given a user has a valid session cookie
When curl -b <session-cookie> -I https://karbonlens.netlify.app/
Then the HTTP status is 200
 And the Location header is absent
 And the SignInButton is absent from the HTML (button hidden for authenticated users)
```

**AC-7: TypeScript and build pass**
```
Given the implementation is complete on feature/v0.1-impl
When npx tsc --noEmit
Then exit code is 0 with no type errors
When npm run build
Then exit code is 0
 And the build output notes "/" as a statically generated ISR route with revalidate=3600
```

**AC-8: DB error degrades gracefully**
```
Given DATABASE_URL points to an unreachable host (simulated by temporarily unsetting the var)
When the ISR revalidation fires (or the dev server handles a fresh request)
Then the landing page still renders with "—" in all stat card values
 And the HTTP status is 200 (not 500)
 And a console.error line containing "[T18] getLandingStats error:" appears in the server log
```

---

## 5. Inputs & outputs

**Inputs:**
- `DATABASE_URL` — Postgres connection string (already in `.env.local` and Netlify env vars from T04).
- `projects` table — 64 rows (T06).
- `project_scores` table — today's scores (T09).
- `registries` table — 64+ rows (T06).
- `idx_monthly_snapshots` table — up to 10 rows (T08).
- `satellite_alerts` table — populated by T07.
- `regulatory_events` table — seeded by T10.
- `lib/schema.ts` — Drizzle table definitions (read-only).
- `lib/db.ts` — Drizzle client singleton.
- `app/(public)/page.tsx` — T03 scaffold + T05 `<SignInButton>` to be updated.
- `lib/mock-data.ts` — `mockProjects` export (landing page import to be removed).

**Outputs:**
- `lib/queries/landing-stats.ts` — new file.
- `app/(public)/page.tsx` — updated (live stats, `revalidate = 3600`, removed mock import).
- `components/landing/StatCard.tsx` — new file.
- `components/landing/FeaturedProjects.tsx` — new file.
- `components/landing/DataSources.tsx` — new file.
- `components/landing/HeroSection.tsx` — new file.
- `lib/mock-data.ts` — comment added if `mockProjects` still has other consumers; or `mockProjects` export deleted if T11 has already landed (cleanup only, no functional change).
- No DB migrations. No new env vars.

---

## 6. Dependencies & interactions

**Blocked by:**
- T11 — confirms `lib/queries/projects-list.ts` query patterns and that `mockProjects` is no longer consumed by `app/(app)/projects/page.tsx` (prerequisite for potentially deleting the export).
- T14 — confirms `lib/queries/prices.ts` query patterns for `idx_monthly_snapshots`; T18 reuses the same query shape for the IDXCarbon stat card.

**Blocks:**
- T23 — final smoke-test requires the landing to show live stats before signing off that the product is live.

**Files owned by T18** (no other story may modify these in parallel):

| Path | Action |
|---|---|
| `app/(public)/page.tsx` | Update |
| `components/landing/StatCard.tsx` | Create |
| `components/landing/FeaturedProjects.tsx` | Create |
| `components/landing/DataSources.tsx` | Create |
| `components/landing/HeroSection.tsx` | Create |
| `lib/queries/landing-stats.ts` | Create |
| `lib/mock-data.ts` | Conditional cleanup only (delete `mockProjects` export if T11 has landed) |

T18 must not modify:
- `middleware.ts` (T05)
- `lib/queries/projects-list.ts` (T11)
- `lib/queries/prices.ts` (T14)
- Any scraper file

---

## 7. Edge cases & failure modes

**(i) DB unreachable or query throws** — `getLandingStats` catches all errors, logs them, and returns a zero/null-filled `LandingStats` object. `StatCard` renders `"—"` for null values. The page always returns HTTP 200 to the visitor. ISR will retry on the next revalidation window.

**(ii) Zero projects in DB** — `projectCount` is 0. The stat card shows `"0"`. `FeaturedProjects` receives an empty array and renders a message: `"Featured projects coming soon."` inside the `kl-card` wrapper. No crash.

**(iii) `SUM(total_vcus_issued)` returns NULL** — `COALESCE(..., 0)` in the SQL ensures a numeric 0 is returned rather than NULL. `formatVcus(0)` returns `"0 VCUs"`.

**(iv) `avg_price_idr` NULL for the latest IDXCarbon month** — `latestAvgPriceIdr` is `null`. The price card shows `"—"`. `momDeltaPct` is `null` (no trend badge).

**(v) Only one IDXCarbon row** — `momDeltaPct` is `null` (insufficient history to compute). Trend badge is absent. The page renders normally.

**(vi) Concurrent users during ISR revalidation** — ISR guarantees only one background regeneration request fires per revalidation window; all concurrent visitors receive the stale cached response. The DB never receives more than one T18 query per hour regardless of traffic volume.

**(vii) `PERCENTILE_CONT` with no `project_scores` rows for today** — Postgres returns NULL for the percentile aggregate over an empty set. `medianIntegrityScore` maps to `null`. The stat card shows `"—"`.

---

## 8. Definition of done

- [ ] All 8 acceptance criteria pass (AC-1, AC-6 via `curl -I`; AC-2 to AC-5 via `curl | grep`; AC-7 via CLI; AC-8 simulated locally).
- [ ] `app/(public)/page.tsx` imports nothing from `lib/mock-data` (import line deleted).
- [ ] `export const revalidate = 3600` is present in `app/(public)/page.tsx`.
- [ ] `lib/queries/landing-stats.ts` exists with the `getLandingStats()` export and cache-contract comment.
- [ ] All four `components/landing/*.tsx` files exist and are pure server components (no `'use client'`).
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0; build log shows `/` as ISR with revalidate=3600.
- [ ] Story's files landed in `feature/v0.1-impl` (single commit or PR).
- [ ] CHANGELOG entry added under `[Unreleased]`: `T18 — Landing page: live DB stats, ISR cache, featured projects`.
- [ ] `TASKS.md` status for T18 flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

**OQ-1 — Cache duration**
1 hour ISR is specified for v0.1. This is appropriate for a marketing surface where data changes daily at most. If v0.2 operators use the landing page for operational awareness (e.g., watching GFW alert counts spike), drop `revalidate` to 900 (15 minutes). Changing this requires no other code changes. Andy's call for v0.2.

**OQ-2 — Featured projects: static list vs dynamic (top-3 by score)**
The spec uses a static list (`katingan-peatland`, `sumatra-merang-peat`, `rimba-raya`) for brand consistency and because these three are the "flagship projects" named in the PRD. A dynamic top-3 by score would surface a different project if Katingan's score dropped, which would be surprising to returning visitors and potentially confusing in marketing context. Recommendation: keep static. Andy may override for v0.2 if he wants score-based featuring.

**OQ-3 — Public analytics**
Plausible or Google Analytics on the landing would let Andy measure conversion from visitor → sign-up. Out of scope for T18. v0.2 can add a `<Script>` in `app/(public)/layout.tsx` without touching T18's files.

**OQ-4 — Seven stat cards vs four**
The T03 scaffold had four cards. T18 adds seven. On narrow viewports (`minmax(180px, 1fr)`) this wraps to two or three rows. Confirm with Andy that seven cards is acceptable, or whether a tighter selection (e.g., the original four plus one price stat) is preferred for visual cleanliness. Recommendation: ship seven and review visually — the auto-fit grid is forgiving.

---

## 10. References

- `docs/PRD.md` — landing is a public marketing surface; §3 "flagship projects" language justifies the static featured-project list.
- `docs/architecture.md` §2 — repository layout (`app/(public)/`, `components/landing/`, `lib/queries/`); §3 — canonical schema for all tables queried here.
- `docs/TASKS.md` T18 — task block.
- `lib/schema.ts` — `projects`, `registries`, `idxMonthlySnapshots`, `satelliteAlerts`, `regulatoryEvents`, `projectScores` Drizzle definitions.
- `lib/mock-data.ts` — `mockProjects` export being removed from the landing page import.
- `app/(public)/page.tsx` — T03 scaffold + T05 `<SignInButton>` (base being updated).
- `docs/stories/T11-projects-explorer.md` §3.1 — `getProjectsList` query shape; `medianIntegrityScore` via `PERCENTILE_CONT`; T18 reuses both patterns.
- `docs/stories/T14-price-intelligence.md` §3 item 1 — `getPriceHistory()` query shape; MoM delta badge logic; T18 reuses both.
- `docs/stories/T05-nextauth-google-oauth.md` — middleware leaves `/` ungated; `<SignInButton>` component location.
