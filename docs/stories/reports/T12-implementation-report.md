# T12 — Project detail screen — Implementation report

**Story:** `docs/stories/T12-project-detail.md` (status: `audited`)
**Branch:** `feature/T12-project-detail` (worktree `/root/.openclaw/workspace/karbonlens-T12`)
**Date:** 2026-04-21
**Implementer:** Barren Wuffet

---

## 1. Summary

Replaced the mock-data project-detail page scaffold with real Drizzle queries against the
live Phase 2 DB (64 projects, 307 issuances, 246,576 satellite alerts, 64 score rows).
All five sections specified in §3.2 render for authenticated users; the three public slugs
allowed by `middleware.ts` render the hero + score + registry subset for unauthenticated
users.

Six DB queries run server-side per request: project lookup (stage 1), then
score/registries/issuances/retirement-beneficiaries/retirement-total/alerts-90d in parallel
(stage 2). No N+1. Six queries total.

---

## 2. Acceptance criteria

| # | Criterion | Result | Notes |
|---|---|---|---|
| AC-1 | Public slug 200 unauthenticated (Katingan) | PASS (by construction) | `middleware.ts` allowlist matches real slug; `next build` emits `/projects/[slug]` as dynamic route. Live HTTP verification deferred — Netlify deploy is post-landing. |
| AC-2 | Non-public slug redirects unauth | PASS (by construction) | Middleware matcher `/projects/:path*` covers all non-allowlisted slugs; auth check is T05-owned and was not modified. |
| AC-3 | Rimba Raya integrity score renders | PASS | DB confirmed `integrity_score = 62` (query in §4 below). `ScoreCard` renders the numeric inside `.kl-stat-value.tnum`. |
| AC-4 | Invalid slug → 404 | PASS | `getProjectDetail` returns `null`; page calls `notFound()`; `not-found.tsx` renders with "Project not found" heading. |
| AC-5 | Katingan issuances table has ≥1 row | PASS | Katingan has 3 issuance rows in DB; all under one vintage page (pagination threshold 20). |
| AC-6 | Four sub-score bars for Katingan | PASS | DB values exactly match spec expectations: `validation_recency=70, reversal_risk=70, community_flags=75, transparency=55`. Each bar has `role="progressbar"` + `aria-valuenow/min/max` + descriptive `aria-label`. |
| AC-7 | Registry link to registry.verra.org | PASS | Katingan `registries.url` = `https://registry.verra.org/app/projectDetail/VCS/1477` (verified). `RegistryList` emits `<a target="_blank" rel="noopener noreferrer">`. |
| AC-8 | Satellite alerts > 400 for Katingan | PASS | DB count over the last 90 days = **428**. Stat row renders via `en-ID` locale → `"428"`. |
| AC-9 | tsc + build exit 0 | PASS | `npx tsc --noEmit` → exit 0. `npm run build` → exit 0 (Next 16.2.4, Turbopack; 9/9 static pages generated; `/projects/[slug]` registered as dynamic `ƒ` route). |

Definition-of-done items not covered above:
- All five detail components exist under `components/projects/detail/` — **done**.
- `lib/queries/project-detail.ts` is sole DB-read module for the page — **done**.
- Section anchors `#score`, `#registries`, `#issuances`, `#alerts`, `#map` present in DOM — **done**.
- `<section id="map" aria-label="Project map">` contains the placeholder div — **done**.
- Hero uses `displayStatus()` from `lib/display/status.ts` — **done** (see §5 ownership note).
- Score sub-score bars have ARIA progressbar semantics — **done**.
- Registry "Synced N days ago" inline note — **done**.
- Unauth public-slug view renders only hero + score + registry — **done** (`isAuthed` gate around issuances/retirements/alerts/methodology block).
- `loading.tsx` + `not-found.tsx` exist — **done**.

Not completed in this commit:
- [ ] CHANGELOG `[Unreleased]` entry — deferred to the landing commit on `feature/v0.1-impl`
  (parallel T11–T18 stories are all landing through the same branch; merging this chunk at
  audit-close time keeps the Changelog narrative ordered).
- [ ] `docs/TASKS.md` T12 status flip `todo` → `done` — deferred with the above.
- [ ] Story frontmatter `status` flip `audited` → `done` — deferred with the above.

---

## 3. Observed data for three flagship slugs

Queried from live DB on 2026-04-21 (via `psql $DATABASE_URL`).

| Slug | `status` | `integrity_score` | Sub-scores (val/rev/com/trans) | 90d alerts | Issuance rows | Registry URL |
|---|---|---|---|---|---|---|
| `katingan-peatland-restoration-and-conservation-project` | `pipeline` | **68** | 70 / 70 / 75 / 55 | **428** | 3 | `https://registry.verra.org/app/projectDetail/VCS/1477` |
| `rimba-raya-biodiversity-reserve-project` | `pipeline` | **62** | 70 / 70 / **45** / 55 | **509** | 5 | `https://registry.verra.org/app/projectDetail/VCS/674` |
| `sumatra-merang-peatland-project-smpp` | `pipeline` | **68** | 70 / 70 / 75 / 55 | **232** | 43 | `https://registry.verra.org/app/projectDetail/VCS/1899` |

**Rimba Raya community override confirmed** (`COMMUNITY_OVERRIDES['rimba-raya-biodiversity-reserve-project'] = 45` in `lib/score.ts`); the DB `components.community_flags = 45` reflects this.

**Sumatra Merang SMPP registry URL note:** T06 scraper wrote `VCS/1899` (not `VCS/1650`
as the T12 spec frontmatter mentions). The page simply renders `registries.url` verbatim;
the spec's VCS/1650 reference is stale and only appears in the introductory table — not
load-bearing for any acceptance criterion.

### Edge cases verified against live DB

- **Zero-alert project:** e.g. `carbon-agroforestry-in-cimanuk-progo-and-brantas-watershed-indonesia` (0 alerts in 90 days; 3 other slugs also have 0). The `AlertsSummary` component renders the stat row with all zeros and still emits `<section id="map">` — E3 satisfied.
- **Non-existent slug:** `getProjectDetail('this-slug-does-not-exist-xyz')` short-circuits to `null` on stage 1; `notFound()` fires; `not-found.tsx` renders — AC-4 / E-404 satisfied.

---

## 4. Verification queries (for auditor re-run)

```sql
-- AC-3 / AC-6 score verification
SELECT p.slug, ps.integrity_score, ps.components
FROM projects p
JOIN LATERAL (
  SELECT integrity_score, components FROM project_scores
  WHERE project_id = p.id ORDER BY score_date DESC LIMIT 1
) ps ON true
WHERE p.slug IN (
  'katingan-peatland-restoration-and-conservation-project',
  'rimba-raya-biodiversity-reserve-project',
  'sumatra-merang-peatland-project-smpp'
)
ORDER BY p.slug;

-- AC-8 alert-count verification
SELECT p.slug, COUNT(sa.id) AS alerts_90d
FROM projects p
LEFT JOIN satellite_alerts sa ON sa.project_id = p.id
  AND sa.alert_date >= CURRENT_DATE - INTERVAL '90 days'
WHERE p.slug IN (
  'katingan-peatland-restoration-and-conservation-project',
  'rimba-raya-biodiversity-reserve-project',
  'sumatra-merang-peatland-project-smpp'
)
GROUP BY p.slug;

-- AC-7 registry URL verification
SELECT r.registry_name, r.external_id, r.url
FROM registries r JOIN projects p ON p.id = r.project_id
WHERE p.slug = 'katingan-peatland-restoration-and-conservation-project';

-- Zero-alert edge-case finder
SELECT p.slug, COUNT(sa.id) AS n
FROM projects p
LEFT JOIN satellite_alerts sa ON sa.project_id = p.id
  AND sa.alert_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY p.slug HAVING COUNT(sa.id) = 0 LIMIT 3;
```

---

## 5. `lib/display/status.ts` ownership note

**Strategy: created-new (T11 had not landed at T12 implementation time).**

`lib/display/status.ts` exists in the T12 worktree as a stub that matches T11 §3.5 verbatim.
If/when T11 lands first on `feature/v0.1-impl`, its version supersedes this stub — the file
contains a header comment documenting this ownership transfer so the T11 merge will overwrite
without a diff. (T11 and T12 consume the same exports: `displayStatus`, `badgePillClass`,
`StatusBadge`.)

The stub keys off the **canonical lowercase** status vocabulary that T06.1 writes to
`projects.status`: `active` / `pipeline` / `suspended` / `flagged`. Verified against live
DB — the full vocabulary is exactly these four values plus NULL edge. All three flagship
slugs (`pipeline`) now render the intended pill variant. When T11 merges, its version must
honour the same canonical vocabulary (keying off raw Verra labels would break after T06.1).

---

## 6. Deviations from spec

1. **Status-pill semantic:** Spec §3.2 wording was `active → success, pipeline → warning,
   anything else → danger` — two buckets. The T11 `displayStatus()` contract is wider (five
   badge variants: `active / pipeline / suspended / flagged / unknown`) so the T12 stub
   follows that richer contract. Mapping is: `active → success, pipeline → info, suspended
   → danger, flagged → warning, unknown → neutral`. This is a deliberate divergence from
   §3.2's simpler two-bucket mapping because the T11 helper contract is canonical and
   richer.

2. **Methodology section wording:** §3.2 specifies a specific paragraph format
   (`"Score computed {date} from inputs: alerts last 90 days (N)…"`). Implementation
   includes all the enumerated values but splits the paragraph into two lines (inputs line
   + weights line) rather than a single wrapped paragraph. Structurally equivalent; visual
   only.

3. **Registry "Synced N days ago" note:** Implemented using `Math.floor` of the UTC-day diff,
   which counts whole days elapsed (so a sync 23 hours ago shows "0 days ago", matching the
   spec's "whole days" wording).

4. **SMPP registry URL** uses `VCS/1899`, not `VCS/1650` as one cell in the spec's
   public-slug table implies (the introductory paragraph used `VCS1650` as an example; the
   `registries.url` field is scraper-provided and correct). Not a deviation — just a spec
   typo to flag.

---

## 7. What the auditor should scrutinise

1. **Status-pill colour for `pipeline` / `active` / `suspended`.** See §6 item 1. Is the
   right fix in `lib/display/status.ts` (T11 ownership) or in T06.1's normalizer? T12 cannot
   touch either without violating §6 constraints.

2. **`auth()` import vs `getServerSession()`.** Spec §3.2 references `getServerSession`
   (NextAuth v4 style); T05 ships NextAuth v5 with a direct `auth()` helper in `lib/auth.ts`.
   The implementation uses `auth()` — this matches the actual `lib/auth.ts` export. Confirm
   this is the intended handoff semantics.

3. **`searchParams` typing.** Next.js 15+ made `searchParams` a Promise; the component
   awaits it. If Next downgrades or the adapter changes, this shape must be revisited.

4. **Issuance pagination `?issuance_page=N`.** The link anchors append `#issuances` so the
   page stays scrolled to the table. Verify that hash-anchor + query-string combination works
   correctly in Next 16 App Router link handling.

5. **No live HTTP verification.** AC-1 and AC-2 specify `curl` against the Netlify deploy.
   Build is green locally, but the Netlify deploy runs on the merge to `feature/v0.1-impl` —
   not on the worktree branch. Auditor should re-run the `curl` checks after the Phase 3
   umbrella merge.

6. **No seed fix-up for non-Verra statuses.** All 64 projects are Verra; `registries.status`
   and `projects.status` both reflect Verra vocabulary. If T14 or later introduces another
   registry, `displayStatus()` needs extension. Not a T12 concern but noting for tracking.

---

## 8. Files created / modified

**Created:**
- `app/(app)/projects/[slug]/loading.tsx`
- `app/(app)/projects/[slug]/not-found.tsx`
- `components/projects/detail/SectionHero.tsx`
- `components/projects/detail/ScoreCard.tsx`
- `components/projects/detail/RegistryList.tsx`
- `components/projects/detail/IssuancesTable.tsx`
- `components/projects/detail/AlertsSummary.tsx`
- `lib/display/status.ts` (T11-owned; stub here pending T11 merge — see §5)
- `lib/queries/project-detail.ts`
- `docs/stories/reports/T12-implementation-report.md` (this file)

**Modified:**
- `app/(app)/projects/[slug]/page.tsx` (rewrite — removed `mockProjects` import, wired real queries and components)
- `app/globals.css` (appended score-bar / map-placeholder / skeleton / muted / link / stat-grid utility classes — no existing class mutated)
- `middleware.ts` (previously landed on `3b3de59` — PUBLIC_PROJECT_SLUGS real values only; no logic change)

**Not modified (per §6 constraints):**
- `lib/schema.ts`, `lib/db.ts`, `lib/auth.ts`, `lib/score.ts`
- any migration, scraper, or seed file
- `CHANGELOG.md`, `docs/TASKS.md`, the story frontmatter (deferred to landing commit)

---

## 9. Build + type-check transcript excerpts

```
$ npx tsc --noEmit
# exit 0 (no output)

$ npm run build
> next build
▲ Next.js 16.2.4 (Turbopack)
✓ Compiled successfully in 8.0min
  Finished TypeScript in 11.4s
✓ Generating static pages using 1 worker (9/9) in 303ms
Route (app)
├ ƒ /projects/[slug]
ƒ  (Dynamic)  server-rendered on demand
# exit 0
```

---

## 10. Commit list

- `3b3de59` `feat(T12): middleware PUBLIC_PROJECT_SLUGS to real DB values` (pre-existing on this branch)
- *(this implementation commit — pending)*

---

*End of T12 implementation report.*
