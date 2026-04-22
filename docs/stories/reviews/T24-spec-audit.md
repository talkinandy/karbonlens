---
id: T24-spec-audit
story: T24
auditor: adversarial-spec-review
date: 2026-04-22
verdict: CONDITIONAL PASS
blocking_issues: 3
---

# T24 Spec Audit — Fix dead links + /methodology page

## Verdict

**CONDITIONAL PASS — 3 blocking issues, 3 non-blocking notes.**
Bucket numbers for `validationRecencyScore` and `reversalScore` match `lib/score.ts` exactly. Route group path, COMMUNITY_OVERRIDES, and zero-registry cap are correct. Three blocking issues must be resolved before implementation begins.

---

## Blocking Issues

### B-1 — `architecture.md §8` bucket thresholds contradict `lib/score.ts`

`docs/architecture.md §8` ("Score methodology v1") was written before T09 reconciled the constants and has never been updated. It shows **different bucket scores** than the live code:

| Sub-score | §8 (stale) | `lib/score.ts` (authoritative) |
|---|---|---|
| Validation recency <3y | "90–100" | **100** |
| Validation recency 3–5y | "60–89" | **85** |
| Validation recency 5–8y | "30–59" | **70** |
| Validation recency >8y/unknown | "0–29" | **50 (unknown) / 30 (≥12y)** |
| Reversal: 0 alerts | "90–100" | **100** |
| Reversal: 1–5 nominal | "70–89" | **85 (0 high-conf, <10 total)** |
| Reversal: 6–15 / any high-conf | "40–69" | **70 (<5 high-conf) / 45 (<20 high-conf)** |
| Reversal: >15 / fire clusters | "0–39" | **20** |

Also §8 uses a different code snippet (`SCORE_WEIGHTS_V1` / `computeIntegrityScore`) that does not match the actual exported names (`WEIGHTS` / `integrityScore`). The T24 spec correctly reads from `lib/score.ts` but does not flag this discrepancy. **AC-6 hand-verification will pass while §8 remains wrong**, misleading any engineer who reads the architecture doc.

**Fix required:** T24 scope must explicitly include updating `architecture.md §8` to match `lib/score.ts`, or a new task must be filed. The current out-of-scope list ("Any changes to scoring constants") is about `lib/score.ts` — it does not cover the architecture doc, but the omission is a trap.

---

### B-2 — Link audit scope includes `legacy/prototype/src/` but grep command is absent; AC-4 is unverifiable

Section 3 in-scope item 1 says "Grep every `href="/"...` occurrence in `app/`, `components/`, and `legacy/prototype/src/`" but gives no command. AC-4 says the report must cover those three directories with no further guidance. The implementer cannot reproduce the audit without knowing the exact grep invocation.

Verified: prototype files (`Landing.jsx`, `App.jsx`, etc.) use exclusively hash-routed hrefs (`#/projects`, `#/regulatory`, `#/prices`). None are `href="/"...` absolute paths. The audit command matters because if the implementer grep-pattern-matches `href="/"` they will correctly find zero hits in the prototype; if they use `href=` broadly they get false positives. The spec must state the command.

**Fix required:** Add to §3 in-scope item 1 the exact grep command, e.g.:
```
grep -rn 'href="/' app/ components/ legacy/prototype/src/
```
And confirm prototype hash-routes (`href="#/..."`) are excluded from the zero-dead-links target (add to OQ-3 resolution, which currently recommends "no fix required" but does not close the question).

---

### B-3 — Reversal bucket `< 5 high-confidence alerts → 70` is tested after `highConf === 0 && alerts90d < 10 → 85`, but the spec table ordering implies mutual exclusivity that can mislead

The spec methodology table lists:

| 0 high-conf alerts and < 10 total | 85 |
| < 5 high-confidence alerts | 70 |

When `highConf === 0`, both conditions match (`0 < 5` is true). The code resolves this correctly via sequential if-else order (line 102 short-circuits before line 103). However, the table as written makes `< 5 high-conf` appear to be a superset that includes `highConf === 0`. A reader implementing from the table alone (without reading the code) would set `highConf=0, alerts90d=5` → bucket 70, when `lib/score.ts` would actually return **70** in that case (correct), but `highConf=0, alerts90d=3` → the table says 70 yet `lib/score.ts` returns **85** (line 102 fires first: `highConf === 0 && alerts90d < 10`).

**Fix required:** Reorder the table rows so the more-specific condition (`0 high-conf AND < 10 total`) appears before the broader one (`< 5 high-conf`), and add a footnote: "Conditions evaluated top-to-bottom; first match wins." This makes the table isomorphic to the code's if-else chain.

---

## Non-blocking Notes

### N-1 — Footer discoverability gap acknowledged but not fully mitigated

§3 in-scope item 4 correctly identifies that there is no existing footer component and tasks T24 with adding a `<footer>` to `app/(public)/layout.tsx`. However, the `(public)` layout only wraps the landing page (`app/(public)/page.tsx`). The score-card link is in `app/(app)/projects/[slug]/page.tsx`, which is in the `(app)` layout, not the `(public)` layout. A visitor who arrives directly at a project detail page and follows "See full methodology →" will reach `/methodology` correctly, but if they navigate back to the projects list and want to find the methodology page again, there is no footer in the `(app)` group.

**Recommendation:** Note in T24 or open a follow-up task to add a footer link in `app/(app)/layout.tsx` as well, or defer to T25 (site-wide nav/footer task).

---

### N-2 — Accessibility ACs absent

The methodology page spec mandates a `<h1>` but no further semantic HTML requirements. No ACs for `<article>` landmarks, `<h2>` section headings, `<dl>` / `<dt>` / `<dd>` for bucket lists, or `<caption>` for tables. The tables in the spec are `<table>` with `<th>` headers implied but unspecified. Non-blocking for v0.1 but worth a one-line AC: "All tables include `<thead>` / `<th scope='col'>` and the page passes `axe` for no critical violations."

---

### N-3 — `architecture.md §8` stale code snippet uses `SCORE_WEIGHTS_V1` (non-existent export)

Related to B-1 but distinct: the pseudocode in §8 exports `SCORE_WEIGHTS_V1` and `computeIntegrityScore`, neither of which exists in `lib/score.ts` (actual exports: `WEIGHTS`, `integrityScore`). If any future engineer follows §8 to write a consumer of `lib/score.ts` they will get a TypeScript compile error. This is a latent defect. Closing B-1 by updating §8 resolves this automatically.

---

## Cross-Check: Spec Numbers vs Code

| Claim in T24 spec | `lib/score.ts` value | Match? |
|---|---|---|
| WEIGHTS: validation_recency 25% | `0.25` | YES |
| WEIGHTS: reversal_risk 35% | `0.35` | YES |
| WEIGHTS: community_flags 20% | `0.20` | YES |
| WEIGHTS: transparency 20% | `0.20` | YES |
| Reversal: no GFW coverage → 50 | `if (!hasCoverage) return 50` | YES |
| Reversal: 0 alerts → 100 | `if (alerts90d === 0) return 100` | YES |
| Reversal: 0 high-conf & <10 total → 85 | `if (highConf === 0 && alerts90d < 10) return 85` | YES |
| Reversal: <5 high-conf → 70 | `if (highConf < 5) return 70` | YES |
| Reversal: <20 high-conf → 45 | `if (highConf < 20) return 45` | YES |
| Reversal: ≥20 high-conf → 20 | `return 20` | YES |
| ValidationRecency: null → 50 | `if (validationDate === null) return 50` | YES |
| ValidationRecency: <3y → 100 | `if (yearsSince < 3) return 100` | YES |
| ValidationRecency: <5y → 85 | `if (yearsSince < 5) return 85` | YES |
| ValidationRecency: <8y → 70 | `if (yearsSince < 8) return 70` | YES |
| ValidationRecency: <12y → 50 | `if (yearsSince < 12) return 50` | YES |
| ValidationRecency: ≥12y → 30 | `return 30` | YES |
| Transparency: ≥2 reg & ≥1 active → 85 | `if (registryCount >= 2 && activeRegistries >= 1) return 85` | YES |
| Transparency: 1 reg & 1 active → 70 | `if (registryCount === 1 && activeRegistries === 1) return 70` | YES |
| Transparency: ≥1 reg (none active) → 55 | `if (registryCount >= 1) return 55` | YES |
| Transparency: no registry → 40 | `return 40` | YES |
| COMMUNITY_OVERRIDES: Rimba Raya → 45 | `'rimba-raya-biodiversity-reserve-project': 45` | YES |
| Community default → 75 | `COMMUNITY_OVERRIDES[slug] ?? 75` | YES |
| Zero-registry cap → 60 | `if (registryCount === 0) score = Math.min(score, 60)` | YES |
| Only Rimba Raya in active overrides | Two other slugs commented out post-reconciliation | YES |

**All 22 numeric values in the T24 spec match `lib/score.ts` exactly.**
`scrapers/scoring/weights.py` WEIGHTS and COMMUNITY_OVERRIDES also match.

---

## Other Checks

| Check | Result |
|---|---|
| Route path `app/(public)/methodology/page.tsx` matches `(public)` convention | PASS — T18 landing uses `app/(public)/page.tsx`; methodology fits the same group |
| `proxy.ts` must not gate `/methodology` | Spec confirmed — proxy only gates `/alerts/:path*`, `/admin/:path*`, `/api/admin/:path*` |
| Score-card link at `app/(app)/projects/[slug]/page.tsx` line 175 | CONFIRMED at line 175–176: `<a href="/methodology" className="kl-link">` |
| Prototype hrefs are exclusively `#/...` hash routes | CONFIRMED — `Landing.jsx` has `#/projects`, `#/projects/katingan-peatland`, `#/prices`, `#/regulatory`; none are absolute paths; correctly excluded from zero-dead-links target |
| COMMUNITY_OVERRIDES: only Rimba Raya active (not 3 projects) | CONFIRMED — `cendrawasih-aru` and `kalimantan-forest-carbon-partnership` are commented out post-2026-04-21 reconciliation in both `lib/score.ts` and `weights.py` |
| No site-wide footer exists in `app/(public)/layout.tsx` | CONFIRMED — layout renders only `<SiteNav>` and `{children}` |
| OQ-3 (prototype dead links) should be closed, not left open | FAIL — recommend closing: prototype links are all hash routes, no action required |
