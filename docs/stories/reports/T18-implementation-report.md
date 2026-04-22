# T18 — Landing page with live stats — Implementation report

**Story:** `docs/stories/T18-landing-live-stats.md` (status: `done`)
**Branch:** `feature/T18-landing-live-stats` (worktree `/root/.openclaw/workspace/karbonlens-T18`)
**Date:** 2026-04-21
**Implementer:** Barren Wuffet

---

## 1. Summary

Replaced the T03 static-number landing page with a fully live server component.
`lib/queries/landing-stats.ts` fetches seven independent aggregates via `Promise.all`
and shapes them into a typed `LandingStats` struct. The landing renders: seven `<StatCard>`s,
three featured flagship projects (`<FeaturedProjects>`), an auth-aware hero CTA
(`<HeroSection>`), and three data-source timestamp badges (`<DataSources>`).

`mockProjects` and `PUBLIC_PROJECT_SLUGS` exports removed from `lib/mock-data.ts`
after grep confirmed zero consumers (T11 had already cleaned up its import).

## 2. Live data snapshot (2026-04-21)

| Stat | Value |
|---|---|
| Projects tracked | 64 |
| Credits issued | 22.3M VCUs |
| Credits available | 1.7M VCUs |
| IDXCarbon avg price | Rp 42,660 (Mar 2026) |
| IDXCarbon volume | 43k tCO₂e |
| MoM delta | ↓ 42.4% (Feb 74,020 → Mar 42,660) |
| Median integrity score | — (T09 not run today; see A-2) |
| GFW alerts (90d) | 246,135 |
| Regulatory events | 8 |

## 3. Files created / modified

| File | Action |
|---|---|
| `lib/queries/landing-stats.ts` | Created |
| `app/(public)/page.tsx` | Updated (live stats, removed mock import, dynamic route) |
| `components/landing/StatCard.tsx` | Created |
| `components/landing/FeaturedProjects.tsx` | Created |
| `components/landing/DataSources.tsx` | Created |
| `components/landing/HeroSection.tsx` | Created |
| `lib/mock-data.ts` | `mockProjects` + `PUBLIC_PROJECT_SLUGS` exports deleted (zero consumers) |

## 4. Pre-implementation grep gate

```
grep -rn "mockProjects|PUBLIC_PROJECT_SLUGS" app/ components/ lib/ --include="*.ts" --include="*.tsx"
```

Result: 0 active imports outside `lib/mock-data.ts` itself. Both exports deleted.

## 5. Code audit

Audit verdict: **PASS** (after fix of 2 blocking items, commit `c5c596f`).
See `docs/stories/reviews/T18-code-audit.md`.

- C-1 (CTA text) — resolved: `Open dashboard →`
- C-2 (ISR vs dynamic) — resolved: accepted dynamic rendering for v0.1

## T18 follow-ups

- **A-1 StatCard sublabel conflation** — `IDXCarbon volume` card sublabels with `latestValueIdr`
  (total monetary value, not a volume-scoped metric). `GFW alerts (90d)` card sublabels with
  regulatory event count — two unrelated metrics stacked. Matches no spec layout but renders
  cleanly. Visual polish for v0.2; flag for Andy review (OQ-4).

- **A-2 Median score shows "—"** — `medianIntegrityScore` is `null` in the live stat because
  `PERCENTILE_CONT` over an empty `project_scores WHERE score_date = CURRENT_DATE` set returns
  NULL. The T18 try/catch handles this correctly (spec edge case vii). Root cause: T09 scoring
  job has not run for today's date as of snapshot time. Not a T18 defect. Resolves automatically
  when T19 installs the daily cron; T09/T23 owner to verify after T19 lands.

- **C-2 ISR decision** — v0.2 can revisit if landing page load time becomes a concern.
  Splitting `auth()` into a `<Suspense>` client island would let the stats section ISR while
  the CTA hydrates client-side. As of 2026-04-21 page renders under 300ms from DB warm cache,
  so no urgency. See T18 spec §3.2.
