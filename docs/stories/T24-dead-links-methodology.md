---
id: T24
title: Fix dead links + create /methodology page
phase: 5-polish
status: done
blocked_by: []
blocks: []
owner: spec-writer
effort_estimate: 1.5h
---

## 1. User story

As a visitor reading a project score card, I want to follow the "See full methodology →" link to a real page that explains how the KarbonLens integrity score is computed, so that I can understand and trust the numbers before making any procurement decision.

## 2. Context & rationale

`app/(app)/projects/[slug]/page.tsx:175` contains:

```tsx
<a href="/methodology" className="kl-link">See full methodology →</a>
```

The route `app/(public)/methodology/` does not exist, so this link produces a 404 for every project detail page visitor. This is the only confirmed dead internal link as of the T24 audit, but the AC requires a full scan to be certain.

`lib/score.ts` is the canonical source of truth for WEIGHTS, COMMUNITY_OVERRIDES, and all bucket thresholds. `scrapers/scoring/weights.py` is the Python mirror. The methodology page must reproduce the same numbers exactly — any drift between the page prose and the TS/Python constants constitutes a spec violation (AC-6).

The `/methodology` route is a public reference document. `proxy.ts` only gates `/alerts/:path*`, `/admin/:path*`, and `/api/admin/:path*`; no change to the matcher is needed and must not be made.

## 3. Scope

### In scope

1. **Internal-link audit.** Grep every `href="/"...` occurrence in `app/` and `components/` only. `legacy/` is excluded from the audit scope (prototype is not deployed and uses exclusively hash-routed hrefs — no fix required there). Use the exact command:

   ```
   grep -rhE 'href="/[a-z][a-z0-9/-]*"' app/ components/ \
     | grep -oE 'href="/[a-z][a-z0-9/-]*"' | sort -u
   ```

   Produce an inventory at `docs/stories/reports/T24-link-audit.md` listing each distinct href found, its source file(s), and whether the destination route exists (yes/no). Fix every dead link found beyond `/methodology` as well. At story close, zero dead links must remain.

2. **Create `app/(public)/methodology/page.tsx`.** New public route — no auth gate needed; `/methodology` is absent from `proxy.ts` matcher and must stay absent. Page content:

   - `<title>` / `<h1>`: "KarbonLens scoring methodology (v1)"
   - Short prose intro: the score is a calibrated framework — not a formula — and all weights are configurable; v0.1 values are shown below.
   - Four sections (one per sub-score), in weight-descending order:

     **Reversal risk — 35 %**
     Satellite deforestation alerts from Global Forest Watch over the prior 90 days.
     Buckets (from `reversalScore()` in `lib/score.ts`). Conditions are evaluated top-to-bottom; first match wins.

     1. matches if `gfw_geostore_id IS NULL` (no GFW coverage) → **50** (unknown-neutral)
     2. matches if `alerts_90d = 0` (has coverage, zero alerts) → **100**
     3. matches if `high_conf = 0` AND `alerts_90d < 10` → **85**
     4. matches if `high_conf < 5` → **70**
     5. matches if `high_conf < 20` → **45**
     6. else (`high_conf ≥ 20`) → **20**

     **Validation recency — 25 %**
     Years elapsed since the project's most recent validation audit.
     Buckets (from `validationRecencyScore()` in `lib/score.ts`):
     | Condition | Score |
     |---|---|
     | Validation date unknown | 50 — unknown-neutral |
     | < 3 years | 100 |
     | < 5 years | 85 |
     | < 8 years | 70 |
     | < 12 years | 50 |
     | ≥ 12 years | 30 |

     **Community flags — 20 %**
     Default 75 for all projects. Hard-coded overrides for projects with documented community tension (from `COMMUNITY_OVERRIDES` in `lib/score.ts`):
     - Rimba Raya Biodiversity Reserve Project (`rimba-raya-biodiversity-reserve-project`): 45

     **Transparency — 20 %**
     Registry listings and active status (from `transparencyScore()` in `lib/score.ts`):
     | Condition | Score |
     |---|---|
     | ≥ 2 registries and ≥ 1 active | 85 |
     | Exactly 1 registry and 1 active | 70 |
     | ≥ 1 registry (none active) | 55 |
     | No registry listings | 40 |

   - **Composite score and clamping rule.** Weighted sum of the four sub-scores, rounded and clamped to [0, 100]. Additional constraint: if `registry_count == 0`, the composite is capped at 60 regardless of other sub-scores. This zero-data trap prevents unverifiable projects from reaching a high score.
   - **Methodology version label.** "Methodology v1 — calibrating." Brief note that weights and overrides are reviewed periodically. Include the sentence: "Community override list will expand in v0.2 based on validated third-party reports."
   - **Last updated date.** 2026-04-22.
   - **Navigation anchors.** Link back to `/projects` ("Browse all projects") and to one flagship example such as `/projects/rimba-raya-biodiversity-reserve-project` ("See a scored project").
   - **Design.** Uses existing CSS custom properties (`kl-page`, `kl-card`, `kl-muted`, `kl-link`, etc.) consistent with all other pages. Section prose width must not exceed 720 px to maintain mobile readability.

3. **Update `docs/architecture.md` §8 to match `lib/score.ts` verbatim.** `docs/architecture.md §8` ("Score methodology v1") predates the T09 reconciliation and contains stale content: the exported names (`SCORE_WEIGHTS_V1`, `computeIntegrityScore`) do not exist in the current code (actual exports: `WEIGHTS`, `integrityScore`), and all bucket threshold descriptions use range notation ("90–100", "0–39", etc.) that does not match the exact values in `lib/score.ts`. T24 must replace the stale pseudocode and range-based bucket tables with a note that `/methodology` is the canonical user-facing reference and `lib/score.ts` is the canonical implementation. Only the §8 section body is touched — no other sections of `architecture.md` are modified.

4. **Verify the score-card link.** After step 2, `app/(app)/projects/[slug]/page.tsx:175` requires no text change — `href="/methodology"` already targets the new route. Confirm in the AC-3 test.

5. **Footer link (coordinated with T25).** T25 (`DataFreshness.tsx`) already includes a `/methodology` link in the footer grid; T24 does not need to add it separately. T24 must not modify T25's output. Note: no site-wide footer component exists yet; `/methodology` is discoverable only via the T12 ScoreCard link and T25's DataFreshness link until a proper footer is added.

### Out of scope (explicit non-goals)

- Illustrations, interactive charts, or formula renderings — plain prose only in v0.1; upgrade deferred to v0.2.
- Internationalisation or locale variants of the methodology text.
- Automated cross-checking between `lib/score.ts` and `scrapers/scoring/weights.py` — hand-verification only (same DoD as T09).
- Any changes to scoring constants, weights, or bucket thresholds — T24 is read-only with respect to scoring logic.
- Addition of `/methodology` to `proxy.ts` matcher — it must remain ungated.
- Changes to `app/(app)` layout, `SiteNav`, or admin routes.

## 4. Acceptance criteria (Gherkin)

**AC-1: Route returns 200**
```
Given the app is deployed
When curl -sI https://karbonlens.com/methodology
Then the response status line is "HTTP/2 200"
And the response is not a redirect (no 307 / 308)
```

**AC-2: Page contains required content tokens**
```
Given the /methodology page is rendered
When its text content is inspected
Then it contains all of: "v1", "25", "35", "20", "reversal", "transparency",
     "validation", "community", "60", "Rimba Raya"
```

**AC-3: Score-card link resolves**
```
Given a visitor is on /projects/<any-valid-slug>
When they click "See full methodology →"
Then they land on /methodology with HTTP 200 (no 404, no redirect loop)
```

**AC-4: Link audit report produced; zero dead links**
```
Given the implementer has run the exact grep command from §3 in-scope item 1
When docs/stories/reports/T24-link-audit.md is read
Then every href listed is marked "exists: yes"
And the report covers all href="/..." occurrences in app/ and components/ only
    (legacy/ is excluded — prototype uses hash-routes, not in scope)
```

**AC-5: Build clean**
```
Given the new methodology page is added
When tsc --noEmit && npm run build are executed
Then both commands exit 0 with no new errors or warnings
```

**AC-6: Methodology numbers match lib/score.ts (hand-verification)**
```
Given lib/score.ts WEIGHTS, bucket thresholds, and COMMUNITY_OVERRIDES
When an implementer reads the /methodology page prose side-by-side
Then every numeric value on the page exactly matches the corresponding
     constant in lib/score.ts (25/35/20/20 %, all bucket thresholds,
     Rimba Raya override of 45, zero-registry cap of 60)
And the same check passes against scrapers/scoring/weights.py
```

**AC-7: No auth gate on /methodology**
```
Given an unauthenticated browser session (no session cookie)
When a GET request is made to /methodology
Then the response is 200 (not 307 redirect to /?signin=1)
And proxy.ts matcher array does not contain "/methodology" or any
    pattern that would match it
```

**AC-8: Accessible semantic structure**
```
Given the /methodology page is rendered
When its HTML is inspected
Then the page uses <article> as the top-level landmark
And each sub-score section is wrapped in a <section> with an <h2> heading
And bucket lists use <dl> / <dt> / <dd> (not bare tables where a list is more appropriate)
And all <table> elements include <thead> with <th scope="col"> headers
And the heading hierarchy is h1 → h2/h3 with no skipped levels
```

**AC-9: architecture.md §8 updated**
```
Given docs/architecture.md §8 previously contained stale pseudocode
When the implementer has completed T24
Then §8 no longer references SCORE_WEIGHTS_V1 or computeIntegrityScore
And the stale bucket-range notation has been removed
And §8 directs readers to /methodology (user-facing) and lib/score.ts (implementation)
```

## 5. Inputs & outputs

- **Inputs:**
  - `lib/score.ts` — WEIGHTS, COMMUNITY_OVERRIDES, all sub-score functions (authoritative source for page content).
  - `scrapers/scoring/weights.py` — Python mirror (hand-verification only).
  - `app/(app)/projects/[slug]/page.tsx` — contains the originating dead link (read-only unless link text needs update, which it does not).
  - `proxy.ts` — verify `/methodology` is absent from matcher (read-only).
  - `docs/architecture.md` — §8 is the target of the stale-content fix (targeted section edit only).

- **Outputs:**
  - `app/(public)/methodology/page.tsx` — new server component (no auth dependency). Route path matches the existing `(public)` route-group convention (`app/(public)/page.tsx` for the landing page).
  - `app/(public)/methodology/loading.tsx` — optional; add if the page has any async data fetching (unlikely given static content).
  - `docs/architecture.md` — §8 section rewritten to remove stale pseudocode and bucket ranges; links to `/methodology` (user-facing) and `lib/score.ts` (implementation) as canonical references.
  - `docs/stories/reports/T24-link-audit.md` — internal link audit inventory.

- **Env vars added:** none.
- **DB migrations:** none.

## 6. Dependencies & interactions

- **Blocked by:** nothing — T24 is self-contained.
- **Blocks:** nothing in current task graph.
- **Coordination:** T25 (`DataFreshness.tsx`) includes a `/methodology` footer-grid link; T24 does not duplicate that work. Footer link is handled by T25.
- **Files owned by T24 (parallel implementers must not touch):**
  - `app/(public)/methodology/**`
  - `docs/stories/reports/T24-link-audit.md`
  - `docs/architecture.md` (§8 only — targeted section edit)
- **May read but not modify:** `app/(app)/projects/[slug]/page.tsx` (link is already correct post-route creation), `proxy.ts`, `lib/score.ts`, `scrapers/scoring/weights.py`, `app/(public)/layout.tsx`.

## 7. Edge cases & failure modes

- **Prototype links in `legacy/`.** `legacy/prototype/src/` uses exclusively `#/...` hash-routed hrefs (`#/projects`, `#/regulatory`, `#/prices`) — none are absolute-path hrefs matching the audit grep pattern. The prototype is excluded from the T24 audit scope. No action required.
- **No site-wide footer yet.** `/methodology` is discoverable only via the T12 ScoreCard link (`app/(app)/projects/[slug]/page.tsx:175`) and T25's DataFreshness link until a proper site-wide footer is added. This is a known discoverability gap; a follow-up task should add a footer to `app/(app)/layout.tsx` as well.
- **Zero-data trap prose.** The "No GFW coverage → 50" and "No registry → cap 60" rules must be explained in plain English alongside the tables so that a buyer understands why a project can score moderately even with incomplete data.
- **Mobile width.** Section containers must not exceed `max-width: 720px`. Tables must scroll horizontally on narrow viewports rather than overflow and clip.
- **Future-proofing the version label.** The page hard-codes "v1" and the last-updated date. When weights change (e.g., community flags expansion in v0.2), the implementer must update both the prose and the `last-updated` date. This is a manual step — no automation in v0.1.
- **Flagship link slug validity.** The link to `/projects/rimba-raya-biodiversity-reserve-project` used as an example must resolve to an existing DB record; this slug is confirmed in `lib/score.ts` COMMUNITY_OVERRIDES and the T06 reconciliation comment dated 2026-04-21.

## 8. Definition of done

- [ ] All acceptance criteria pass.
- [ ] Story's files landed in `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] TASKS.md status flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

## 9. Open questions

- **OQ-1 (resolved — standalone).** Methodology page is a standalone `/methodology` route accessible from the score card link and T25's DataFreshness footer link. It is not in the primary `<SiteNav>` to avoid nav clutter.
- **OQ-2 (resolved — include).** The page includes one sentence: "Community override list will expand in v0.2 based on validated third-party reports." No further roadmap detail is given.
- **OQ-3 (resolved — prototype out of scope).** `legacy/prototype/src/` uses exclusively hash-routed hrefs (`#/...`); none match the absolute-path grep pattern. The prototype is excluded from the audit scope and from the zero-dead-links target. No action required.

## 10. References

- `lib/score.ts` — WEIGHTS, COMMUNITY_OVERRIDES, `validationRecencyScore()`, `reversalScore()`, `transparencyScore()`, `communityScore()`, `integrityScore()`.
- `scrapers/scoring/weights.py` — Python mirror of same constants.
- `app/(app)/projects/[slug]/page.tsx:175` — originating `href="/methodology"` link.
- `proxy.ts` — route protection matcher (confirms `/methodology` is ungated).
- `app/(public)/layout.tsx` — public group layout (read-only for T24; footer link coordinated with T25).
- `docs/stories/T09-score-computation.md` — scoring pipeline spec; DoD requires hand-verification of TS↔Python constant parity; same requirement applies here.
- Architecture §1 — confirms app router structure and `(public)` vs `(app)` group separation.
