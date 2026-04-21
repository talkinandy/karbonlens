---
story: T18
title: Landing with live stats — spec audit
auditor: adversarial spec-auditor
date: 2026-04-19
verdict: CONDITIONAL PASS
blocking: 2
---

## Verdict

**Conditional pass. 2 blocking issues, 3 advisory flags.**

The spec is well-constructed. Query contracts are sound, ISR strategy is reasonable, DB-down degradation is covered, and the mockProjects circular dependency is explicitly anticipated. Two gaps need resolution before implementation starts; one is merge-order structural, the other is a missing UX CTA.

---

## Blocking issues

**B1 — mockProjects circular cleanup: spec is under-specified.**
Section 3.2 says T18 deletes the `mockProjects` export only if T11 has already landed. The recommended fallback is to leave a comment. This is correct in spirit but leaves the implementer with no concrete instruction for the forward path. Specifically: `lib/mock-data.ts` also exports `PUBLIC_PROJECT_SLUGS` (a `ReadonlySet` derived from `mockProjects`). `PUBLIC_PROJECT_SLUGS` is referenced by the T05 middleware allowlist comment and potentially consumed by other screens still on mock data. T18 must not delete `mockProjects` without first grepping all importers — but the spec gives no grep target. **Fix required:** spec should mandate `grep -r "mockProjects" --include="*.ts" --include="*.tsx"` as a pre-delete gate and list every known consumer. The T11 story says "leave export for T18"; T18 says "only delete if T11 has landed." Neither story owns the actual deletion decision with a concrete consumer-count check.

**B2 — Signed-in user landing: missing "Go to dashboard" CTA.**
AC-6 confirms signed-in users stay on `/` (no redirect) and the `<SignInButton>` is hidden. The spec says nothing about what replaces it for authenticated users. The current T03/T05 scaffold hides the button and renders nothing in its place. A signed-in user hitting the landing sees stats and featured projects but no call to action. This is a UX dead-end for v0.1 production users. **Fix required:** spec must define the authenticated CTA — at minimum a `<Link href="/projects">Go to dashboard →</Link>` rendered when `session?.user` is truthy.

---

## Advisory flags

**A1 — Hero copy contains hard-coded mock numbers.**
`app/(public)/page.tsx` (T03 scaffold, current state) has four static stat cards: "214", "1,842", "47", "Rp 4.7B". T18 replaces all four with live values. The out-of-scope clause says "use T03's scaffolded headline and subtitle verbatim." The headline (`"Indonesia's carbon market, in one terminal."`) and subtitle paragraph are clean — no mock numbers there. The four stat cards are being replaced, not preserved. No issue with the spec's intent, but the implementation note in §3.2 should explicitly call out that the stat cards from T03 are entirely replaced (not extended), to prevent implementers from accidentally preserving any static fallback numbers in JSX comments.

**A2 — `gfwAlerts90d` scope mismatch vs T03 static.**
T03 shows "Satellite alerts (30d): 1,842." T18 changes this to a 90-day window (`COUNT(*) WHERE alert_date >= NOW() - INTERVAL '90 days'`). This is a valid product decision, but the stat card label must change from "30d" to "90d" accordingly. The spec's stat card table (§3.2) labels this "GFW alerts (90d)" — correct. Confirm the label in `StatCard` renders "GFW alerts (90d)" not "Satellite alerts (30d)" to avoid misleading the landing visitor.

**A3 — `FeaturedProject` available VCUs not in card spec.**
The T03 scaffold's featured project card shows both `integrityScore` and `available` (VCU available, e.g., "3.6M"). T18's `FeaturedProject[]` fetch spec (§3.2) lists: slug, nameCanonical, developer, province, projectType, integrityScore, registryNames. `totalVcusAvailable` is absent. The §3.2 card rendering description also omits it. If this is intentional (marketing surface: score only, no financials), flag it to Andy — the T03 mock showed "Available" prominently. If it should be included, add `totalVcusAvailable` to the query and card.

---

## Non-issues confirmed

- `COALESCE(SUM(...), 0)` on generated column `total_vcus_available` correctly uses raw expression form. Spec covers.
- `PERCENTILE_CONT` NULL on empty `project_scores` returns null → "—". Covered.
- `MAX(last_synced_at)` NULL if no registries rows. Covered.
- ISR `revalidate = 3600` interaction with `Promise.all([getLandingStats(), auth()])`: `auth()` is a session read, not a DB write; no ISR incompatibility.
- Schema confirms `satellite_alerts.ingested_at` exists (for `satelliteLastIngested`). `idx_monthly_snapshots.scraped_at` exists (for `idxLastScraped`). Both columns confirmed in `lib/schema.ts`.
- `HeroSection.tsx` marked as server component (no `'use client'`). Compatible with `auth()` call being hoisted to page level.
