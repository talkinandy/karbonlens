# T12 Code Audit — Project detail screen (adversarial)

**Auditor:** adversarial code-auditor
**Worktree:** `/root/.openclaw/workspace/karbonlens-T12` @ `6135a17`
**Branch:** `feature/T12-project-detail`
**Date:** 2026-04-21

---

## Verdict: CONDITIONAL PASS — 0 blocking, 2 B-level, 3 C-level, 1 D-level (caller-hallucinated)

Implementation is solid: real Drizzle queries, clean component decomposition, correct slug/anchor/ARIA semantics, TSC and `npm run build` both exit 0. Live curls against 3 flagship public slugs return 200 with expected integrity scores and Verra URLs.

**Top finding (B-1):** `lib/display/status.ts` has a **real API divergence** from the T11 worktree version — T11 exposes `displayStatus` + `DisplayStatus` type and inlines pill-class mapping in `ProjectsTable.tsx`; T12 exposes `displayStatus` + `badgePillClass` (no `DisplayStatus` type export, different raw-string vocabulary). The spec claims “both files must expose the same signature” but they don't. A naïve T11-first merge will break T12's `SectionHero.tsx` (import of `badgePillClass`); a T12-first merge will break T11's Verra-raw-string handling. Reconciliation plan below.

**Top finding (B-2):** AC-1 (public slug 200 unauth) passes on content but the middleware.ts file convention is **deprecated in Next 16.2.4** (build warns: "Please use 'proxy' instead"). Middleware does not fire during `next start` — a test with real private slug `210-mw-musi-hydro-power-plant-bengkulu` unauthenticated returned HTTP 200 + full project detail (not the expected 307 redirect). The impl report's "PASS (by construction)" for AC-1/AC-2 is untested. This is a **T05/infrastructure bug inherited from base**, not a T12 regression, but T12 silently relies on page-level `isAuthed` gating to partial-render, masking the broken middleware. Flag for T05 follow-up, not a T12 blocker.

---

## Live verify results (local `next start` on :3097)

| URL | Status | Content spot-checks |
|---|---|---|
| `/projects/katingan-peatland-restoration-and-conservation-project` | 200 | integrity `>68<`, `kl-pill--info` "Pipeline", `VCS/1477`, `role="progressbar"` with `aria-valuenow="70/70/75/55"`, only `#score`+`#registries` render (unauth partial view per spec) |
| `/projects/rimba-raya-biodiversity-reserve-project` | 200 | integrity `>62<`, `community_flags 45/100`, `VCS/674`, Pipeline pill |
| `/projects/sumatra-merang-peatland-project-smpp` | 200 | integrity `>68<`, `VCS/1899` (not `1650`), Pipeline pill |
| `/projects/this-slug-does-not-exist-xyz` (GET) | HTTP 200 body contains both `<title>404: This page could not be found</title>` and `not-found.tsx` content ("Project not found" + "← Back to projects") | Next 16 returns 200 HTTP for `notFound()` pages but emits `NEXT_HTTP_ERROR_FALLBACK;404`. AC-4 strict reading ("status is 404") **fails on wire**; not-found renderer works. |
| `/projects/210-mw-musi-hydro-power-plant-bengkulu` unauth | 200 with full project detail partial-rendered | Middleware did not redirect. See B-2. |

Authenticated live verification not possible without valid session cookie; code-reviewed instead.

---

## Adversarial checklist

1. **status.ts duplication (B-1).** T11 and T12 versions diverge in **three** ways: (a) T11 exports `DisplayStatus` type, T12 does not; (b) T12 exports `badgePillClass`, T11 does not; (c) T11 accepts raw Verra strings (`Registered`, `Under development`, etc.), T12 only canonical. `components/projects/detail/SectionHero.tsx:13` imports `badgePillClass` from this module — if T11 merges first, SectionHero breaks. Reconciliation plan: **union merge** — take T11's richer raw-string switch + `DisplayStatus` export, and add T12's `badgePillClass` helper. Both consumers then work. `ProjectsTable.tsx` can optionally migrate to `badgePillClass` in a follow-up.

2. **`<section id="map">` anchor.** Present at `AlertsSummary.tsx:53`, emitted as sibling of `#alerts`. **Caveat:** AlertsSummary is inside the `isAuthed &&` block in `page.tsx:89-129`, so `#map` is **not rendered for unauthenticated visitors to the three public slugs**. The T12 spec §3.2 explicitly excludes alerts/map from unauth view; T13 must handle this (map absent when unauth) or the spec needs tightening. Not a T12 defect, but worth flagging for T13 handoff.

3. **`/alerts?project=<slug>` deep-link.** Correct — `AlertsSummary.tsx:46` emits `/alerts?project=${slug}` using the slug, not id. Matches T16 spec.

4. **Score breakdown + methodology label.** 4 rows rendered with `role="progressbar"`, `aria-valuenow/min/max`, descriptive `aria-label`. Methodology label text at `ScoreCard.tsx:102` is **hardcoded "v1"** — should use `METHODOLOGY_VERSION` from `lib/score.ts` for consistency with the methodology section below (C-1, cosmetic). The methodology section itself does use the constant (`page.tsx:146`).

5. **Issuance timeline ordering.** `lib/queries/project-detail.ts:117` orders by `desc(issuances.vintageYear), desc(issuances.issuanceDate)`. DB counts verified: Katingan=3, Rimba=5, SMPP=43. SMPP will paginate (`pageSize=20` → 3 pages).

6. **Recent alerts rendering.** **The caller's prompt expects a list of 50 alerts with "+N more →".** The spec §3.2 `#alerts` calls for a **stat-count summary** (total90d / highConf / nominalConf), not a per-alert list. Implementation matches the spec (stat grid, no list, no 50-row cap). The caller's expectation is **hallucinated** — not a defect.

7. **Metadata card / validation_date.** **Not rendered.** The spec §3.2 does not list a metadata card; the caller's expected file `MetadataCard.tsx` is also hallucinated (spec §5 lists `SectionHero/ScoreCard/RegistryList/IssuancesTable/AlertsSummary`). No misleading "validation date" label exists because no such field is displayed. OK.

8. **Verra URLs.** Registry row renders `registries.url` verbatim. DB values confirmed: Katingan `VCS/1477`, Rimba `VCS/674`, SMPP `VCS/1899` (not VCS/1650 as spec §3.3 intro table lists — impl report §6.4 correctly flags the spec as stale).

9. **404 flow.** `page.tsx:52` calls `notFound()`; `not-found.tsx` renders with "Project not found" + "← Back to projects" link. Wire status is HTTP 200 (Next 16 App Router default for client-renderer fallback) with embedded `NEXT_HTTP_ERROR_FALLBACK;404` digest. **AC-4 strict status=404 is not satisfied** (C-2) — this is a Next 16 behavior, not a T12 bug; the renderer path is correct.

10. **Partial render for signed-out public slugs.** Curl confirmed: only `#score` and `#registries` render; `#issuances`, Retirements, `#alerts`, `#map`, methodology are gated behind `isAuthed` in `page.tsx:89`. Matches spec §3.2 DOD ("Unauthenticated public-slug views render only hero + score + registry").

11. **XSS/escaping.** No `dangerouslySetInnerHTML` anywhere in the new files (grep clean). All DB-sourced strings flow through React's default text escaping. OK.

12. **Loading + error boundary.** `loading.tsx` renders skeleton with `aria-busy="true"`. No `error.tsx` — relies on Next's default error boundary from parent layout (not verified). C-3: consider a `app/(app)/projects/[slug]/error.tsx` for graceful DB-failure rendering.

---

## Additional findings

- **D-1 (caller hallucination):** the caller's prompt expected component filenames `HeroHeader.tsx, ScoreBreakdown.tsx, IssuanceTimeline.tsx, RecentAlerts.tsx, MetadataCard.tsx`. The spec §5 actually lists `SectionHero, ScoreCard, RegistryList, IssuancesTable, AlertsSummary` — which is what was implemented. No deviation from spec.

- **C-4:** `page.tsx:146` — hardcoded `Math.round(WEIGHTS.validation_recency * 100)` etc. If WEIGHTS ever include a non-round fraction the display loses precision silently. Cosmetic.

- **Hectares locale quirk (info):** `Number(hectares).toLocaleString('en-ID')` renders 149800 as `149.800` (Indonesian uses `.` for thousands). English readers may misread as 149.8. Consistent with rest of app; noted for design review.

---

## Merge recommendation

**APPROVE with merge-time T11/T12 status.ts reconciliation.**

Proposed reconciliation patch (to land during Phase 3 umbrella merge):

```ts
// lib/display/status.ts — union
export type StatusBadge = 'active' | 'pipeline' | 'suspended' | 'flagged' | 'unknown';
export type DisplayStatus = { label: string; badge: StatusBadge };

export function displayStatus(raw: string | null): DisplayStatus {
  // ... T11's richer switch (canonical + raw Verra strings), keep default branch
}

export function badgePillClass(badge: StatusBadge): string {
  // ... T12's mapping, unchanged
}
```

Migrate `ProjectsTable.tsx` pill lookup to `badgePillClass` as a follow-up (optional).

**Other follow-ups (non-blocking):**
- T05: migrate `middleware.ts` → `proxy.ts` for Next 16.2.4 to re-enable auth redirect.
- T12: replace hardcoded `"v1"` in `ScoreCard.tsx:102` with `METHODOLOGY_VERSION` import.
- T12: consider `error.tsx` boundary.
- Deferred in T12 commit: CHANGELOG entry, TASKS.md tick, story frontmatter → `done` (impl report §2 acknowledges).

No blocking defects. Merge after status.ts union reconciliation.
