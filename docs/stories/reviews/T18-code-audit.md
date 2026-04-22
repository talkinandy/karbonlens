---
story: T18
title: Landing with live stats — code audit
auditor: adversarial code-auditor
date: 2026-04-22
commit: e5416de
verdict: PASS (after fix — see re-audit note)
blocking: 0
---

## Verdict

**PASS (after fix).** Both blocking issues resolved in commit `c5c596f`.
See re-audit note below.

---

## Re-audit note (2026-04-22, commit c5c596f)

C-1 and C-2 both resolved:

- **C-1 resolved:** `HeroSection.tsx` now renders `Open dashboard →` for
  authenticated users. AC-6 passes verbatim.
- **C-2 resolved (option b):** `export const revalidate = 3600` removed.
  Route comment explains the dynamic-vs-ISR trade-off. Spec §3.2/§3.3/AC-7
  updated to document that `/` renders as `ƒ (Dynamic)` — accepted for v0.1
  to avoid a flash-of-unauth hydration hop on authed sessions. `npm run build`
  confirms `ƒ /` (Dynamic). `npx tsc --noEmit` exits 0.

Advisory items A-1 and A-2 carry forward as v0.2 follow-ups (see
implementation report).

---

## Original audit (commit e5416de)

**Conditional pass.** Core implementation is solid: query module shape
matches spec, DB-down fallback works, `mockProjects`/`PUBLIC_PROJECT_SLUGS`
cleanup is clean (B-1 resolved), and the authed-user CTA branch exists in
`HeroSection.tsx` (B-2 resolved in spirit). Live curl confirms 64 projects,
246,135 GFW alerts (≈ spec's ~247k), Mar 2026 period, Rp 42,660 avg price,
all three flagship slugs, and timestamp badges. However two concrete
violations of the stated acceptance criteria were introduced in
implementation.

## Blocking

**C-1 — Authed CTA text mismatch breaks AC-6.**
`components/landing/HeroSection.tsx:37` renders `Go to dashboard →` for
authenticated users. Spec uses `Open dashboard →` in four places: §3.2
example, §3.3 `HeroSection.tsx` contract, AC-6 Gherkin (`text matching
"Open dashboard"`), and DoD checklist. AC-6 fails verbatim on the curl
grep. Trivial fix but must land before merge.

**C-2 — `/` is dynamic, not ISR — AC-7 clause violated.**
`npm run build` emits `/` as `ƒ (Dynamic)`, not `● (ISR)`. `auth()` reads
cookies, opting the whole route into dynamic rendering; `export const
revalidate = 3600` has no effect. Spec AC-7 requires "build output notes
`/` as a statically generated ISR route with revalidate=3600". Either
hoist `auth()` to a small dynamic `<Suspense>` island (keeping the stats
section ISR), or accept dynamic rendering and weaken the spec. Current
code silently loses the entire 1-hour cache benefit the story was
designed around.

## Advisory

**A-1 — Sublabel conflation on two StatCards.** `IDXCarbon volume` card
sublabels with `latestValueIdr` ("Rp 1.8B" — the total value, not a
volume-scoped delta). `GFW alerts (90d)` sublabels with
"8 tracked regulations" — two unrelated metrics stacked. Matches no spec
layout but renders cleanly; flag for Andy visual review (OQ-4).

**A-2 — `medianIntegrityScore` rendered as "—" in prod smoke.** Live
curl shows the card value as `—`. Root cause is `PERCENTILE_CONT` over an
empty `project_scores WHERE score_date = CURRENT_DATE` set — spec edge
case (vii), handled, but suggests T09 scoring job has not run today. Not
a T18 defect; file for T09/T23 owner.

## Verify results

- `npm install` + `npx tsc --noEmit` + `npm run build`: all exit 0.
- `git grep 'mockProjects|PUBLIC_PROJECT_SLUGS' app/ components/ lib/`: 0
  active imports; only doc/comment residue (B-1 resolved).
- `FEATURED_SLUGS` in `lib/queries/landing-stats.ts:27`: correct canonical
  trio (katingan-peatland-restoration-and-conservation-project,
  rimba-raya-biodiversity-reserve-project,
  sumatra-merang-peatland-project-smpp).
- `export const revalidate = 3600` present (page.tsx:25). No
  `dynamic='force-dynamic'`. No `'use client'` on page or landing
  components (SignInButton is client, correctly).
- try/catch + `zeroStats()` fallback present (landing-stats.ts:347-350).
- `COALESCE(SUM(...), 0)` on `total_vcus_issued` and the generated-column
  workaround `SUM(total_vcus_issued - total_vcus_retired)` both in SQL.

## Live curl (localhost:3001)

- `curl -I /` → 200.
- Rendered HTML contains: `64`, `22.3M VCUs`, `1.7M VCUs`, `Rp 42,660`,
  `43k tCO₂e`, `246,135`, `Mar 2026`, `↓ 42.4% MoM`, `Sign in with
  Google`, three flagship slugs, `Last synced: … ago` × 3.
- Does NOT contain: `Open dashboard` (C-1), any T03 mock numbers
  `214`/`1,842`/`47`/`Rp 4.7B` (good).

## Merge recommendation

Block on C-1 (one-line text fix). C-2 is structural — either accept
dynamic rendering and amend the spec/AC-7, or refactor to isolate
`auth()` into a child component so the stats grid can genuinely ISR. The
rest of the implementation is mergeable as-is.
