---
id: T24-code-audit
story: T24
auditor: adversarial-code-review
date: 2026-04-22
verdict: PASS (after fix 4ca4380)
blocking_issues: 2
non_blocking_issues: 5
---

# T24 Code Audit — /methodology page + dead-link fix

## Verdict

**PASS — both blocking issues resolved in fix 4ca4380. 5 non-blocking notes stand.**

The methodology page is well-structured, content is accurate, all 22 numeric values match `lib/score.ts` exactly, and the architecture.md §8 rewrite is surgically clean. Two blocking issues must be resolved before merge: an incorrect claim in the link audit report, and bare `<table>` elements that will clip on narrow mobile viewports.

---

## Files reviewed

| Path | Action | Status |
|---|---|---|
| `app/(public)/methodology/page.tsx` | new — 297 lines | reviewed |
| `docs/architecture.md` | §8 rewritten | reviewed |
| `docs/stories/reports/T24-link-audit.md` | new — link inventory | reviewed |
| `docs/stories/reports/T24-implementation-report.md` | new — impl report | reviewed |

Diff stat: `+479 / -50` across 4 files. No forbidden files touched (`lib/score.ts`, `components/`, `proxy.ts`, `app/layout.tsx`, T25 files all unmodified — confirmed).

---

## Blocking Issues

### B-1 — Link audit report count is wrong: grep returns 5 hrefs, report claims 4

The link audit report (`docs/stories/reports/T24-link-audit.md`) states "Total distinct internal hrefs: 4" and its table lists only four entries. The report's Notes section claims the Rimba Raya slug `href="/projects/rimba-raya-biodiversity-reserve-project"` "does not match the grep pattern" because of "non-keyword characters." This is factually incorrect.

Running the exact audit command from AC-4:

```
grep -rhE 'href="/[a-z][a-z0-9/-]*"' app/ components/ \
  | grep -oE 'href="/[a-z][a-z0-9/-]*"' | sort -u
```

Returns **5** distinct hrefs, including `href="/projects/rimba-raya-biodiversity-reserve-project"`. The character class `[a-z0-9/-]` includes hyphens (`-`), so the slug matches cleanly.

This is not just a cosmetic documentation error: AC-4 requires the report to cover "all href="/..."  occurrences." A report that silently undercounts by one fails AC-4 on its face, even though the destination route (`app/(app)/projects/[slug]`) exists and the link is not dead.

**Fix required:** Add `href="/projects/rimba-raya-biodiversity-reserve-project"` as a fifth row to the inventory table with source `app/(public)/methodology/page.tsx`, destination `app/(app)/projects/[slug]/page.tsx` (dynamic), exists: yes. Update the count to 5 and remove the incorrect claim about the pattern not matching.

---

### B-2 — Tables lack overflow wrapper; will clip on narrow mobile viewports

The spec §7 states explicitly: "Tables must scroll horizontally on narrow viewports rather than overflow and clip." Both `<table>` elements (validation recency, transparency) are rendered bare:

```tsx
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
```

There is no wrapping `<div style={{ overflowX: 'auto' }}>`. On viewports narrower than roughly 360 px — common on older Android devices — a two-column table with long label text in the first column will overflow and clip rather than scroll. The `maxWidth: 720` on the `<article>` wrapper only constrains the page width on large screens; it does not provide overflow scroll on small screens.

The `<pre>` element for the composite formula correctly has `overflowX: 'auto'` (line 209). The same treatment must be applied to the two tables.

**Fix required:** Wrap each `<table>` in `<div style={{ overflowX: 'auto' }}>...</div>`.

---

## Non-blocking Notes

### N-1 — Personal name "Andy-maintained" in production page prose

Line 251: `Andy-maintained override list are downgraded.`

This leaks the product owner's first name into the public-facing methodology page. It is consistent with the same reference in `lib/score.ts` comments and in the implementation report, but a public-facing page should use a role-neutral phrase such as "curator-maintained" or "manually maintained" instead. Non-blocking because it is a cosmetic choice, but worth a one-line fix before any wider public launch.

---

### N-2 — Section wrappers use inline styles rather than `kl-card`

The spec §3 item 2 says the design "uses existing CSS custom properties (`kl-page`, `kl-card`, `kl-muted`, `kl-link`, etc.)." The methodology page uses `kl-page`, `kl-muted`, `kl-link`, and `kl-page-title`, but each `<section>` is styled with `style={{ marginBottom: 32 }}` rather than a `kl-card` wrapper. All other content pages (`/projects`, `/regulatory`, `/projects/[slug]`) use `kl-card` for primary content groupings.

The page renders correctly and the spec phrase "etc." gives latitude; the methodology is a pure-prose page with no data-grid blocks where `kl-card` is typically applied. This is a consistency gap rather than a strict violation. Non-blocking, but a follow-up to apply `kl-card` to each `<section>` would improve visual consistency.

---

### N-3 — `<article>` is nested inside `<main>`, not the top-level ARIA landmark

AC-8 specifies "page uses `<article>` as the top-level landmark." The implementation renders `<main className="kl-page"> → <article>`. ARIA-wise, `<main>` is the top-level landmark and `<article>` is a sectioning element nested within it. This passes accessibility in practice (no skipped landmarks, correct hierarchy), and the T12 score-card and other pages consistently use `<main className="kl-page">` as the outer wrapper. The AC-8 wording is ambiguous; the implementation is consistent with existing conventions. Non-blocking.

---

### N-4 — H1 title diverges from spec; implementation report documents but does not justify the change

Spec §3 item 2: `<h1>` should be "KarbonLens scoring methodology (v1)". Implemented as "Methodology — v1 integrity score". The implementation report acknowledges this as a deviation citing "task §6 wording is authoritative," but the task brief is not visible in the worktree. AC-2 requires only the token "v1" to be present, which it is, so the AC still passes. Non-blocking from an AC perspective, but the brand name "KarbonLens" in the heading improves SEO and direct-link context (especially since T26 metadata is deferred). Worth aligning to spec wording.

---

### N-5 — `loading.tsx` absent; fine since page is static, but should be noted

Spec §5 outputs: "`app/(public)/methodology/loading.tsx` — optional; add if the page has any async data fetching (unlikely given static content)." The page has no `async`/`await`, no `fetch`, and no DB calls — it is a pure static component. The absence of `loading.tsx` is correct and expected. Noted here only to confirm the auditor verified it was intentionally omitted.

---

## Acceptance Criteria verification

| AC | Result | Notes |
|---|---|---|
| AC-1: Route returns 200 | PASS (build-verified) | `next build` lists `ƒ /methodology`; no live curl since server not running in CI context |
| AC-2: Required content tokens | PASS | All 10 tokens confirmed present by grep counts in impl report; manually verified `v1` × 3, `Rimba Raya` × 1, `60` × 2, weights 25/35/20 all present |
| AC-3: Score-card link resolves | PASS | `app/(app)/projects/[slug]/page.tsx:175` `href="/methodology"` unchanged; destination now exists |
| AC-4: Link audit + zero dead links | **FAIL** | Report count is 4; actual grep returns 5. Rimba Raya slug omitted from table. See B-1. Routes all exist; zero actual dead links, but report is inaccurate |
| AC-5: Build clean | PASS | `npx tsc --noEmit` exit 0; `npm run build` exit 0 per impl report |
| AC-6: Numbers match `lib/score.ts` | PASS | All 22 values from T24-spec-audit cross-check table verified: WEIGHTS (0.25/0.35/0.20/0.20), all reversal buckets (50/100/85/70/45/20 in correct first-match-wins order), all validation-recency buckets (50/100/85/70/50/30), all transparency buckets (85/70/55/40), Rimba Raya override 45, community default 75, zero-registry cap 60 |
| AC-7: No auth gate | PASS | `proxy.ts` matcher unchanged: `['/alerts/:path*', '/admin/:path*', '/api/admin/:path*']`. No `/methodology` present. Page has no `import { auth }` |
| AC-8: Accessible semantic structure | PASS (with note) | `<article>` present inside `<main>`; 7 `<section>` elements each with `<h2>`; reversal and community use `<dl>/<dt>/<dd>`; both tables use `<thead>` + `<th scope="col">`; heading hierarchy h1 → h2 only (no skips). Note: `<main>` is technically the top landmark — see N-3 |
| AC-9: architecture.md §8 updated | PASS | `SCORE_WEIGHTS_V1` and `computeIntegrityScore` no longer appear as definitions; all range-based buckets ("90–100", "60–89", etc.) removed; §8 now points to `/methodology` (user-facing) and `lib/score.ts` (implementation); §8 is the only section changed |

---

## Numeric parity spot-check (AC-6)

| Value | Page text | `lib/score.ts` | Match |
|---|---|---|---|
| Reversal weight | "35%" | `WEIGHTS.reversal_risk: 0.35` | YES |
| Validation weight | "25%" | `WEIGHTS.validation_recency: 0.25` | YES |
| Community weight | "20%" | `WEIGHTS.community_flags: 0.2` | YES |
| Transparency weight | "20%" | `WEIGHTS.transparency: 0.2` | YES |
| Reversal no-coverage | "50" | `if (!hasCoverage) return 50` | YES |
| Reversal 0 alerts | "100" | `if (alerts90d === 0) return 100` | YES |
| Reversal 0 high-conf + <10 | "85" | `if (highConf === 0 && alerts90d < 10) return 85` | YES |
| Reversal <5 high-conf | "70" | `if (highConf < 5) return 70` | YES |
| Reversal <20 high-conf | "45" | `if (highConf < 20) return 45` | YES |
| Reversal ≥20 | "20" | `return 20` | YES |
| Validation unknown | "50 — unknown-neutral" | `if (validationDate === null) return 50` | YES |
| Validation <3y | "100" | `if (yearsSince < 3) return 100` | YES |
| Validation <5y | "85" | `if (yearsSince < 5) return 85` | YES |
| Validation <8y | "70" | `if (yearsSince < 8) return 70` | YES |
| Validation <12y | "50" | `if (yearsSince < 12) return 50` | YES |
| Validation ≥12y | "30" | `return 30` | YES |
| Community Rimba Raya | "45" | `'rimba-raya-biodiversity-reserve-project': 45` | YES |
| Community default | "75" | `COMMUNITY_OVERRIDES[slug] ?? 75` | YES |
| Transparency ≥2 reg, ≥1 active | "85" | `if (registryCount >= 2 && activeRegistries >= 1) return 85` | YES |
| Transparency 1 reg, 1 active | "70" | `if (registryCount === 1 && activeRegistries === 1) return 70` | YES |
| Transparency ≥1 reg, none active | "55" | `if (registryCount >= 1) return 55` | YES |
| Transparency no registry | "40" | `return 40` | YES |
| Zero-registry cap | "60" | `if (registryCount === 0) score = Math.min(score, 60)` | YES |

All 23 values match.

---

## Adversarial angle responses

| Angle | Finding |
|---|---|
| **Bilingual content** | EN-only; per spec §3 out-of-scope list ("Internationalisation or locale variants"). Acceptable. |
| **Page wrapper** | Uses `kl-page`, `kl-muted`, `kl-link` — misses `kl-card` for section wrappers. See N-2. Not blocking. |
| **Version lock** | "Methodology v1 — calibrating" present (line 22); v0.2 roadmap section present; last-updated date 2026-04-22 hardcoded. Sync is manual per spec — acceptable for v0.1. |
| **Community overrides mentioned** | Rimba Raya at 45 is explicitly named with slug and rationale. Satisfies spec §3 item 2. |
| **Accessibility** | h1 → h2 only, no skipped levels. `<dl>/<dt>/<dd>` for ordered bucket lists. Tables have `<thead>` + `<th scope="col">`. See N-3 for `<article>` vs `<main>` nuance. |
| **Mobile** | `maxWidth: 720` on article is correct. Tables lack `overflowX: auto` wrapper — see B-2. |

---

## Cross-story checks

| Story | Status |
|---|---|
| T25 `DataFreshness.tsx` — links to `/methodology` | Not yet landed in worktree; T24 does not modify T25 files. Route now exists so T25 link will resolve whenever T25 lands. Order-independent. |
| T26 — metadata for `/methodology` | Page correctly omits `export const metadata` and `generateMetadata`. T26 can layer OG tags without conflict. |

---

## Merge recommendation

**Block on B-1 and B-2.** Both are small, low-risk fixes:

- B-1: Add one row to the audit report table, correct the count, remove the incorrect pattern-claim sentence (~3 lines).
- B-2: Wrap each `<table>` in `<div style={{ overflowX: 'auto' }}>` (~4 insertions).

No changes to `lib/score.ts`, `proxy.ts`, or any other gated file are required. Once B-1 and B-2 are fixed, the story is clean to merge.

---

## Re-audit note — 2026-04-22 (fix 4ca4380)

Both blocking issues resolved:

- **B-1 closed:** `docs/stories/reports/T24-link-audit.md` updated — Rimba Raya full slug added as fifth row, count corrected to 5, incorrect pattern-mismatch claim removed. AC-4 now passes.
- **B-2 closed:** Both `<table>` elements in `app/(public)/methodology/page.tsx` wrapped in `<div style={{ overflowX: 'auto' }}>`. `grep -c "overflowX"` returns 3 (formula `<pre>` + 2 tables). Spec §7 satisfied.
- **N-1 applied:** "Andy-maintained" replaced with "curator-maintained".

Re-verification: `npx tsc --noEmit` exit 0; `npm run build` exit 0 (static prerender confirmed). Story is clean to merge.
