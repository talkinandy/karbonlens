---
id: T18
title: Landing page with live stats
phase: 3
status: audited
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

**Cache strategy.** Page is dynamic because `auth()` reads the session cookie to branch the hero CTA ("Open dashboard →" for authed users vs `<SignInButton>` for anon visitors). ISR path would require splitting the stats section into a client island that hydrates post-auth; deferred to v0.2 if landing page load time becomes a concern. As of 2026-04-21 the page renders under 300ms from DB warm cache, well within budget.

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

- Execute **three to five** Drizzle queries in parallel (`Promise.all`) to minimise latency. The minimum required set is:
  1. Projects + scores + regulatory + alerts query (one CTE or joined query against `projects`, `project_scores`, `regulatory_events`, `satellite_alerts`).
  2. IDXCarbon query: `SELECT * FROM idx_monthly_snapshots ORDER BY period_month DESC LIMIT 2` (two rows to compute MoM delta). Also pulls `MAX(scraped_at)`.
  3. Featured projects query: fetch slug, nameCanonical, developer, province, projectType, latestIntegrityScore, and registryNames for `FEATURED_SLUGS` (see §3.2).
  Additional queries (e.g., a separate timestamp query for `registriesLastSynced` / `satelliteLastIngested`) may be added if the implementer finds it cleaner to separate concerns, keeping the total at no more than 5 parallel queries.
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

**T03 static-number audit (required pre-implementation step):** before editing `app/(public)/page.tsx`, run:

```bash
grep -n "[0-9]" app/\(public\)/page.tsx
```

For every inline static number found in the JSX (e.g., `"214"`, `"1,842"`, `"47"`, `"Rp 4.7B"`), replace with the appropriate `{stats.*}` template variable (e.g., `{stats.projectCount}`, `{stats.gfwAlerts90d}`, `{stats.regulatoryEventCount}`, `{stats.latestValueIdr}`). Do not leave any hardcoded numbers in the rendered hero or stat row — they will diverge from DB state immediately after launch.

Replace the static stat cards with live values. The page does **not** declare `export const revalidate` because `auth()` reads the session cookie, opting the route into dynamic rendering regardless. A comment at the top of `app/(public)/page.tsx` records this trade-off (see §3.2 cache strategy note above).

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

**Hero CTA — conditional on auth state:** replace the unconditional `<SignInButton>` render from T05 with a conditional block:

```tsx
{session?.user ? (
  <Link href="/projects">Open dashboard →</Link>
) : (
  <SignInButton />
)}
```

Authenticated users arriving at `/` (e.g., bookmarking the root URL) see a direct link to `/projects` rather than a dead-end hero with no call to action. The `<Link>` uses the same visual treatment as the `<SignInButton>` (existing button/pill styles from T03). The `showSignIn` prop passed to `HeroSection.tsx` (§3.3) becomes `session` (the full session object or `null`), so `HeroSection` can render either branch without the page having to decide which element to pass.

**Featured projects section** — replace `mockProjects.slice(0, 3)` with a static list of the three canonical public slugs. Create a small query in `getLandingStats` (or a separate helper, implementer's choice) that fetches only these three projects:

```typescript
const FEATURED_SLUGS = ['katingan-peatland', 'sumatra-merang-peat', 'rimba-raya'] as const;
```

For each project, fetch: `slug`, `nameCanonical`, `developer`, `province`, `projectType`, the latest `integrityScore` from `project_scores` (LEFT JOIN on `score_date = CURRENT_DATE`), and `registryNames` (aggregated from `registries`). Shape this into a `FeaturedProject[]` array.

Each card links to `/projects/{slug}` via `<Link>`. Show: registry names as the section label, project name, developer + province subtitle, integrity score badge, and the first registry name as "Primary registry" cross-reference. The `kl-pill` status badge is omitted from the landing — it would require a raw Verra string which is too noisy for a marketing surface.

**`totalVcusAvailable` is intentionally omitted from the hero-variant `FeaturedProject` card.** Rationale: the landing is an analyst-credibility surface, not a marketplace. Available-credit volume is a commercial metric that risks misleading casual visitors (large numbers imply liquidity that the product does not guarantee). The integrity score badge achieves the same "signal of quality" goal without financial implication. If Andy wants to surface availability figures here in v0.2, add `totalVcusAvailable` to the `FeaturedProject` type and card at that time.

**Remove the mock import** — delete `import { mockProjects } from "@/lib/mock-data"` from `app/(public)/page.tsx`.

Before deleting the `mockProjects` export from `lib/mock-data.ts`, the implementer **must** run the following grep gate:

```bash
grep -rn "mockProjects\|PUBLIC_PROJECT_SLUGS" app/ components/ lib/ --include="*.ts" --include="*.tsx"
```

Decision rules:
- If `mockProjects` has **zero** matches outside `lib/mock-data.ts` itself → delete the `mockProjects` export from `lib/mock-data.ts`.
- If `mockProjects` still has consumers (e.g., T11 has not yet landed) → do **not** delete. Add the comment `// mockProjects no longer used by landing (T18). Safe to delete when T11 lands.` at the export site and record remaining consumers in the implementation report.
- For `PUBLIC_PROJECT_SLUGS` (a `ReadonlySet` derived from `mockProjects` in `lib/mock-data.ts`): check separately whether any file in `app/` or `components/` imports it. T05's middleware has its own hardcoded slug allowlist and does **not** import from `mock-data.ts`. If no consumer remains outside `lib/mock-data.ts`, the `PUBLIC_PROJECT_SLUGS` export may also be deleted alongside `mockProjects`. If consumers exist, retain it and log in the implementation report.

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

**`components/landing/HeroSection.tsx`** — wraps the `<header>` with headline, subtitle, and the auth-conditional CTA. Receives `session: Session | null` (the full NextAuth session). Renders `<Link href="/projects">Open dashboard →</Link>` when `session?.user` is truthy; otherwise renders `<SignInButton>`. Keeps the existing headline and subtitle copy verbatim.

#### 3.4 Cache strategy documentation

The comment block at the top of `lib/queries/landing-stats.ts` records the dynamic-vs-ISR decision:

```typescript
/**
 * getLandingStats — landing page live stats query.
 *
 * The route is dynamic (not ISR) because auth() reads the session cookie to
 * branch the hero CTA. ISR path would require a client-island for the CTA;
 * deferred to v0.2 if load time becomes a concern. As of 2026-04-21 the page
 * renders under 300ms from DB warm cache.
 */
```

### Out of scope (explicit non-goals)

- Marketing copy overhaul — use T03's scaffolded headline and subtitle verbatim.
- Signup without Google OAuth on the landing page — v0.2.
- Case studies, testimonials, or logo walls — v0.2.
- Animated hero — keep it static for v0.1.
- Per-project breakdown on the landing (that belongs to `/projects/[slug]`).
- Client-side polling / WebSocket live updates — dynamic server rendering is sufficient for v0.1.
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

**AC-6: Signed-in user stays on landing with dashboard CTA (no redirect)**
```
Given a user has a valid session cookie
When curl -b <session-cookie> -I https://karbonlens.netlify.app/
Then the HTTP status is 200
 And the Location header is absent
 And the SignInButton is absent from the HTML (button hidden for authenticated users)
 And the HTML contains a link with href="/projects" and text matching "Open dashboard"
```

**AC-7: TypeScript and build pass**
```
Given the implementation is complete on feature/v0.1-impl
When npx tsc --noEmit
Then exit code is 0 with no type errors
When npm run build
Then exit code is 0
 And the build output notes "/" as ƒ (Dynamic) — expected because auth() reads
 the session cookie; ISR is not used for v0.1 (see §3.2 cache strategy note)
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
- `app/(public)/page.tsx` — updated (live stats, dynamic route with trade-off comment, removed mock import).
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
- [ ] Pre-implementation grep gate run: `grep -rn "mockProjects\|PUBLIC_PROJECT_SLUGS" app/ components/ lib/ --include="*.ts" --include="*.tsx"` — result documented in implementation report.
- [ ] `app/(public)/page.tsx` imports nothing from `lib/mock-data` (import line deleted).
- [ ] No inline static numbers remain in hero/stat-row JSX (T03 static-number audit completed).
- [ ] `app/(public)/page.tsx` has a comment explaining the dynamic-vs-ISR trade-off (no `export const revalidate` — route is dynamic because of `auth()`).
- [ ] `lib/queries/landing-stats.ts` exists with the `getLandingStats()` export and dynamic-rendering rationale comment.
- [ ] `HeroSection.tsx` renders `<Link href="/projects">Open dashboard →</Link>` for authenticated users and `<SignInButton>` for unauthenticated users (conditional CTA verified via AC-6).
- [ ] All four `components/landing/*.tsx` files exist and are pure server components (no `'use client'`).
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0; build log shows `/` as `ƒ (Dynamic)` — expected for v0.1 (see §3.2).
- [ ] Story's files landed in `feature/v0.1-impl` (single commit or PR).
- [ ] CHANGELOG entry added under `[Unreleased]`: `T18 — Landing page: live DB stats, ISR cache, featured projects`.
- [ ] `TASKS.md` status for T18 flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

**OQ-1 — Cache strategy**
The route is dynamic for v0.1 (see §3.2). As of 2026-04-21 page renders under 300ms from DB warm cache. If v0.2 requires ISR caching, split the auth CTA into a client island (`<Suspense>`) so the stats section can revalidate independently. Andy's call for v0.2.

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
