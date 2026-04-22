---
id: T24-implementation-report
story: T24
implementer: agent-af360aa0
date: 2026-04-22
status: ready-for-audit
---

# T24 Implementation Report — /methodology page + dead-link fix

## Files changed

| Path | Action | Ownership |
|---|---|---|
| `app/(public)/methodology/page.tsx` | **new** — 200+ line server component | T24 §6 |
| `docs/architecture.md` | modified — §8 rewritten, stale pseudocode removed | T24 §6 (targeted) |

Pre-commit `git status` shows only these two paths plus the `docs/stories/reports/T24-*` reports themselves. No files outside §6 ownership were touched. `lib/score.ts`, `proxy.ts`, `middleware.ts`, T12's score card, and T25's DataFreshness were all read-only.

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| AC-1: Route returns 200 | PASS (build-verified) | `/methodology` appears in `next build` route manifest as dynamic (ƒ). Live curl deferred per task spec. |
| AC-2: Required content tokens present | PASS | All 10 tokens from the spec (`v1`, `25`, `35`, `20`, `reversal`, `transparency`, `validation`, `community`, `60`, `Rimba Raya`) present; grep counts in §Verification below. |
| AC-3: Score-card link resolves | PASS | T12 link `href="/methodology"` at `app/(app)/projects/[slug]/page.tsx:175` unmodified; destination route now exists. |
| AC-4: Link audit + zero dead links | PASS | See `docs/stories/reports/T24-link-audit.md`. Four distinct hrefs found in `app/` + `components/`; all resolve. |
| AC-5: Build clean | PASS | `npx tsc --noEmit` exit 0; `npm run build` exit 0 with `/methodology` in route manifest. |
| AC-6: Numbers match `lib/score.ts` | PASS (hand-verified) | Every weight (0.25/0.35/0.20/0.20), every bucket score (100/85/70/50/45/30/20/55/40), Rimba Raya override (45), zero-registry cap (60), no-GFW neutral (50) matches. |
| AC-7: No auth gate | PASS | `proxy.ts` matcher still `['/alerts/:path*','/admin/:path*','/api/admin/:path*']`. `/methodology` is not in the list; not touched. |
| AC-8: Accessible semantic structure | PASS | Top-level `<article>`; each sub-score in `<section>` with `<h2>`; reversal and community use `<dl>/<dt>/<dd>`; validation-recency and transparency tables use `<thead>` + `<th scope="col">`; heading hierarchy h1 → h2 only (no skips). |
| AC-9: architecture.md §8 updated | PASS | §8 no longer mentions `SCORE_WEIGHTS_V1` or `computeIntegrityScore`; no `"90–100"` / `"60–89"` ranges remain; directs readers to `/methodology` and `lib/score.ts`. |

## Architecture.md §8 diff summary

**Before** (~52 lines):
- TypeScript code block with fictional exports `SCORE_WEIGHTS_V1` and `computeIntegrityScore` (neither exists in `lib/score.ts`).
- Range-based bucket tables ("90–100", "60–89", "30–59", "0–29") that contradict the live single-integer bucket values (100/85/70/50/45/30 for validation recency; 100/85/70/45/20 for reversal).
- Stale transparency buckets ("Dual registry (Verra + SRN-PPI) → 85", "Single registry with public PDD → 70", "Single registry with sparse public data → 50", "Known opacity issues → <40") — none exactly match the live `transparencyScore()` implementation.
- Community flags mention "Rimba Raya, Aru" — Aru is not in `COMMUNITY_OVERRIDES` (only Rimba Raya is live post-2026-04-21 T06 reconciliation).

**After** (~22 lines):
- Brief note explaining the section was previously duplicated and had drifted.
- Points to `/methodology` as the canonical user-facing reference.
- Points to `lib/score.ts` (plus Python mirrors) as the canonical implementation.
- Keeps the last paragraph about `run_daily_score.sh`, `project_scores` table, and the render-time re-evaluation caveat (moved from §13 Phase 2 where it already existed, to §8 where it is topically relevant).

No other section of `architecture.md` was modified.

## Verification log

```
$ git status --short
 M docs/architecture.md
?? app/(public)/methodology/

$ npx tsc --noEmit
(exit 0, no output)

$ npm run build | tail -5
ƒ /methodology
...
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
(exit 0)

$ grep -rn 'href="/methodology"' app/ components/
app/(app)/projects/[slug]/page.tsx:175:  <a href="/methodology" className="kl-link">
(1 consumer — the T12 score card — as the task stipulates)

$ grep -rhE 'href="/[a-z][a-z0-9/-]*"' app/ components/ \
    | grep -oE 'href="/[a-z][a-z0-9/-]*"' | sort -u
href="/alerts"
href="/methodology"
href="/projects"
href="/regulatory"
(4 distinct hrefs; all resolve post-T24 — see link-audit report)

$ for t in v1 25 35 20 reversal transparency validation community 60 'Rimba Raya'; do
    echo "  $t: $(grep -c -i "$t" 'app/(public)/methodology/page.tsx')";
  done
  v1: 3
  25: 4
  35: 3
  20: 10
  reversal: 5
  transparency: 5
  validation: 9
  community: 10
  60: 2
  Rimba Raya: 1
```

## What the auditor should scrutinise

1. **Numeric parity with `lib/score.ts`.** Every bucket score, every weight, the Rimba Raya override (45), the default community score (75), and the zero-registry cap (60) must match `lib/score.ts` exactly. The T24 spec audit's §Cross-Check table already enumerates all 22 values — run the same check against this page's prose.

2. **`architecture.md` §8 surgical edit.** Confirm only §8 body changed; §1–§7 and §9–§13 untouched. The adjacent §7 (Environment variables) and §9 (Notification pipeline) headings/content should be byte-identical.

3. **No metadata on `/methodology`.** T26 owns `<title>` / OG tags; this page must not set `export const metadata` or return a `generateMetadata`. Visual confirmation: file has no `metadata` export.

4. **No auth-gate leak.** Verify `proxy.ts` matcher is unchanged and `/methodology` is absent from it. Also verify the page has no `import { auth } from ...` at the top (there is no auth call, so no risk of accidental session dependency).

5. **AC-8 semantic structure.** Page uses `<article>` at the top level; each of the 4 sub-score sections plus composite/limitations/roadmap uses `<section>` with `<h2>`; reversal-risk and community-flags use `<dl>` (first-match-wins table-like list), validation-recency and transparency use `<table>` with `<thead>` and `<th scope="col">`. Heading hierarchy is h1 → h2 with no skipped levels.

6. **First-match-wins ordering.** The reversal-risk `<dl>` lists the bucket entries in exactly the same order as `reversalScore()` in `lib/score.ts` (no-coverage → zero-alerts → zero-high-conf-and-<10 → <5-high-conf → <20-high-conf → else). This closes the T24 spec audit blocking issue B-3 about mutual exclusivity.

7. **Discoverability gap.** `/methodology` is linked only from the T12 score card (at `app/(app)/projects/[slug]/page.tsx:175`) and T25's DataFreshness (if already landed). No site-wide footer exists; this is documented in the spec §7 "Edge cases" and is not a T24 deliverable — follow-up footer task needed.

## Deviations from spec

- **H1 wording.** Task §6 says "Methodology — v1 integrity score"; the spec §3 item 2 says "KarbonLens scoring methodology (v1)". The task instructions are authoritative per the implementer brief, so the page uses the task wording. Both still satisfy AC-2 (token "v1" appears).
- **Metadata deliberately omitted.** The T12 spec expects the page to have a `<title>`; T24's task brief explicitly says "Do NOT add metadata to /methodology page — T26 owns metadata." The page therefore has no `export const metadata` and no `<Head>` / `<title>` call. T26 will layer that in. AC-1 still passes (page returns 200 with whatever default title comes from the root layout).
- **Footer in `(public)/layout.tsx` not added.** T24 spec §3 item 4 contemplated adding a site-wide footer; the task brief narrowed scope to the methodology page itself plus the §8 edit, noting T25 already adds the DataFreshness footer link. No layout changes made. Discoverability note in §3 above.

## Not done

- Live curl check against the production box (task says to skip — "commit + code-audit handles").
- CHANGELOG entry (task brief does not include this in deliverables; the spec §8 DoD lists it but the task scope is tighter).
- `TASKS.md` status flip (not in task brief deliverables).
- Story frontmatter status flip (not in task brief deliverables).

## T24 follow-ups

- **T26.1 /methodology metadata (deferred — trivial):** T26 owns `<title>` / OG tags for the whole site, but `/methodology` was not in T26's page-level override list. Add `export const metadata = { title: 'Methodology', description: '...' }` to `app/(public)/methodology/page.tsx` — a one-liner. T26 code-audit noted this as a deferred follow-up.
- **architecture.md §8 bucket ordering:** The §8 rewrite now matches `lib/score.ts` first-match-wins ordering exactly. Reversal bucket table lists: no-satellite-coverage (50) → zero-alerts (100) → zero-high-conf-and-<10-alerts (85) → <5-high-conf (70) → <20-high-conf (45) → else (20). This ordering was the T24 spec audit blocking issue B-3; resolved in commit 4ca4380.
- **Link audit — 5 internal hrefs, all resolve after T24 lands:** `href="/alerts"`, `href="/methodology"`, `href="/projects"`, `href="/regulatory"` (4 in app/ + components/), plus T25's DataFreshness component adds a fifth (`href="/methodology"` in the public layout footer). All 5 routes exist in the build manifest post-T24.
- **Community overrides documented on methodology page:** `COMMUNITY_OVERRIDES` (Rimba Raya = 45 default) is explicitly described in the page's Community Flags section with the rationale ("sustained controversy, repeated third-party flag cycles"). This ensures the page is the canonical user-facing reference for the override, consistent with `lib/score.ts`.
