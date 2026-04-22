---
id: T24
title: Fix dead links + create /methodology page
phase: 5-polish
status: draft
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

1. **Internal-link audit.** Grep every `href="/"...` occurrence in `app/`, `components/`, and `legacy/prototype/src/` (reference only — prototype is not deployed). Produce an inventory at `docs/stories/reports/T24-link-audit.md` listing: source file path, href value, and destination exists (yes/no). Fix every dead link found beyond `/methodology` as well. At story close, zero dead links must remain.

2. **Create `app/(public)/methodology/page.tsx`.** New public route — no auth gate needed; `/methodology` is absent from `proxy.ts` matcher and must stay absent. Page content:

   - `<title>` / `<h1>`: "KarbonLens scoring methodology (v1)"
   - Short prose intro: the score is a calibrated framework — not a formula — and all weights are configurable; v0.1 values are shown below.
   - Four sections (one per sub-score), in weight-descending order:

     **Reversal risk — 35 %**
     Satellite deforestation alerts from Global Forest Watch over the prior 90 days.
     Buckets (from `reversalScore()` in `lib/score.ts`):
     | Condition | Score |
     |---|---|
     | No GFW coverage (`gfw_geostore_id IS NULL`) | 50 — unknown-neutral |
     | 0 alerts | 100 |
     | 0 high-confidence alerts and < 10 total | 85 |
     | < 5 high-confidence alerts | 70 |
     | < 20 high-confidence alerts | 45 |
     | ≥ 20 high-confidence alerts | 20 |

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
   - **Methodology version label.** "Methodology v1 — calibrating." Brief note that weights and overrides are reviewed periodically and a v0.2 expansion of community flags is planned.
   - **Last updated date.** 2026-04-22.
   - **Navigation anchors.** Link back to `/projects` ("Browse all projects") and to one flagship example such as `/projects/rimba-raya-biodiversity-reserve-project` ("See a scored project").
   - **Design.** Uses existing CSS custom properties (`kl-page`, `kl-card`, `kl-muted`, `kl-link`, etc.) consistent with all other pages. Section prose width must not exceed 720 px to maintain mobile readability.

3. **Verify the score-card link.** After step 2, `app/(app)/projects/[slug]/page.tsx:175` requires no text change — `href="/methodology"` already targets the new route. Confirm in the AC-3 test.

4. **Footer link.** No top-level footer component exists in `components/` or `app/` — the public layout (`app/(public)/layout.tsx`) renders only `<SiteNav>` and `{children}`. Add a minimal `<footer>` element to `app/(public)/layout.tsx` containing a link to `/methodology`, matching the existing design language. Do not add `/methodology` to the `<SiteNav>` primary nav.

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
Given the implementer has run the internal-link audit
When docs/stories/reports/T24-link-audit.md is read
Then every href listed is marked "exists: yes"
And the file covers all href="/..." occurrences in app/, components/,
    and legacy/prototype/src/ (prototype column labelled "reference only")
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

## 5. Inputs & outputs

- **Inputs:**
  - `lib/score.ts` — WEIGHTS, COMMUNITY_OVERRIDES, all sub-score functions (authoritative source for page content).
  - `scrapers/scoring/weights.py` — Python mirror (hand-verification only).
  - `app/(public)/layout.tsx` — public group layout to receive the footer addition.
  - `app/(app)/projects/[slug]/page.tsx` — contains the originating dead link (read-only unless link text needs update, which it does not).
  - `proxy.ts` — verify `/methodology` is absent from matcher (read-only).

- **Outputs:**
  - `app/(public)/methodology/page.tsx` — new server component (no auth dependency).
  - `app/(public)/methodology/loading.tsx` — optional; add if the page has any async data fetching (unlikely given static content).
  - `app/(public)/layout.tsx` — modified to add a footer `<a href="/methodology">` link.
  - `docs/stories/reports/T24-link-audit.md` — internal link audit inventory.

- **Env vars added:** none.
- **DB migrations:** none.

## 6. Dependencies & interactions

- **Blocked by:** nothing — T24 is self-contained.
- **Blocks:** nothing in current task graph.
- **Files owned by T24 (parallel implementers must not touch):**
  - `app/(public)/methodology/**`
  - `app/(public)/layout.tsx`
  - `docs/stories/reports/T24-link-audit.md`
- **May read but not modify:** `app/(app)/projects/[slug]/page.tsx` (link is already correct post-route creation), `proxy.ts`, `lib/score.ts`, `scrapers/scoring/weights.py`.

## 7. Edge cases & failure modes

- **Prototype links in `legacy/prototype/src/`.** These are JSX files in the legacy directory; they are not deployed. The audit must include them for completeness but should flag them as "reference only — not a deployed route." Dead links in the prototype are noted but not fixed (the prototype is not maintained).
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

- **OQ-1 (resolved — standalone).** Methodology page is a standalone `/methodology` route accessible from the score card link and from a footer link added to `app/(public)/layout.tsx`. It is not in the primary `<SiteNav>` to avoid nav clutter.
- **OQ-2 (open — Andy decision).** Should the page mention the planned v0.2 community-flag expansion (broader override list, possibly sourced from a DB table rather than hard-coded constants)? Recommendation: include one sentence ("Community override list will expand in v0.2 based on validated third-party reports") but do not detail the roadmap further. Andy to confirm or suppress.
- **OQ-3 (open — Andy decision).** The prototype (`legacy/prototype/src/`) contains dead hrefs that reference routes the prototype never implemented. Should the link-audit report flag these as action items, or mark them "prototype — no fix required"? Recommendation: mark them "prototype — no fix required" and omit from the zero-dead-links target.

## 10. References

- `lib/score.ts` — WEIGHTS, COMMUNITY_OVERRIDES, `validationRecencyScore()`, `reversalScore()`, `transparencyScore()`, `communityScore()`, `integrityScore()`.
- `scrapers/scoring/weights.py` — Python mirror of same constants.
- `app/(app)/projects/[slug]/page.tsx:175` — originating `href="/methodology"` link.
- `proxy.ts` — route protection matcher (confirms `/methodology` is ungated).
- `app/(public)/layout.tsx` — public group layout (target for footer addition).
- `docs/stories/T09-score-computation.md` — scoring pipeline spec; DoD requires hand-verification of TS↔Python constant parity; same requirement applies here.
- Architecture §1 — confirms app router structure and `(public)` vs `(app)` group separation.
