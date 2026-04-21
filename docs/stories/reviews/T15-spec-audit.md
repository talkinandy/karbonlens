---
story: T15
auditor: adversarial-spec-auditor
date: 2026-04-19
verdict: CONDITIONAL PASS
blocking_count: 3
---

# T15 Spec Audit — Regulatory Timeline

## Verdict

**CONDITIONAL PASS — 3 blocking issues must be resolved before implementation starts.**

---

## Blocking Issues

### B1 — Empty year rail not handled (year grouping)

The spec describes a left-rail year grouping ("a year label that appears once per calendar year"). It is silent on what happens when active filters eliminate all events from a given year. The rail must not show orphan year labels with no cards beneath them. This is a UI correctness bug waiting to happen: with importance=low filtered, years 2009–2021 could disappear from results while 2009 still appears in the rail.

**Required:** Add explicit rule — "if no events remain for a year after filtering, suppress that year's rail label."

---

### B2 — Multi-select URL serialisation not pinned

Section 4 (URL state) shows the pattern `/regulatory?importance=critical&importance=high&tag=forestry` (repeated params). Section 3 (filter bar) is silent on how multiple selected tags are serialised. The spec does not explicitly mandate repeated params vs comma-separated. Next.js `useSearchParams().getAll('tag')` handles repeated params natively; comma-separated requires a manual split and breaks if a tag ever contains a comma (unlikely but possible given the ad-hoc tag vocabulary).

**Required:** Explicitly mandate repeated-param serialisation (`?tag=a&tag=b`) for all multi-select dimensions (importance, ministry, tag). One sentence in §3 or §4 is sufficient.

---

### B3 — `encodeURIComponent` on tags: read path not specified

Section 7 edge case 4 correctly mandates `encodeURIComponent` when writing tag values to the URL. It also says "Decode with `decodeURIComponent` when reading from `searchParams`." However, Next.js server-component `searchParams` already URL-decodes values — calling `decodeURIComponent` a second time on an already-decoded string will corrupt values containing `%` (e.g., a tag that was `50%` becomes `50` after double-decode). The spec is ambiguous: it could instruct the implementer to double-decode, which is a latent bug.

**Required:** Clarify that `decodeURIComponent` is only needed when reading from a raw URL string (e.g., `window.location.search`). When reading from Next.js `searchParams` (server component prop or `useSearchParams()` hook), values are already decoded — no manual decode call.

---

## Non-Blocking Flags (must be addressed in implementation, not spec)

**N1 — Duplicate lang param (`?lang=en&lang=id`):** Last value wins in Next.js `searchParams`. This is acceptable behaviour but should be noted in a code comment in `LanguageToggle.tsx` so future developers do not add de-duplication logic that contradicts it.

**N2 — "Clear filters" link location unspecified:** The empty-state "Clear all filters" button is mentioned (§3 item 5). No equivalent persistent "clear filters" affordance exists for the non-empty state. Implementer's call; consider adding a small "× Clear all" link at the right edge of the filter bar when any filter is active. Not blocking for v0.1 given 10 events.

**N3 — Language toggle accessibility:** `LanguageToggle.tsx` should use `role="group"` with `aria-label="Language"` and individual buttons carrying `aria-pressed`. The spec mentions no ARIA requirements. Add inline comment in the component; no spec amendment needed.

**N4 — Timeline cards accessibility:** `TimelineCard.tsx` should use `<article>` with `<time dateTime="YYYY-MM-DD">`. Not specified. Low risk for v0.1 but flag for v0.2 audit.

**N5 — `is_upcoming=FALSE` + future date logging:** Spec correctly mandates `console.warn` server-side (§7 item 1). Ensure the log includes the row `id` (not just a generic message) to aid incident triage. Good as written; no change needed.

**N6 — Sentinel document_number pill logic:** The regex pattern `/^[A-Z]+-[A-Z]+-\d{4}$/` in §7 item 5 would match `IDX-LAUNCH-2026` but NOT `N/A`. The spec lists both as sentinels but only one matches the regex. Implementer must handle `'N/A'` as an explicit string check in addition to the regex, or the `N/A` row will incorrectly render a pill showing `"Launch N/A"`.

**N7 — Ministry filter derivation at request time:** `getDistinctMinistries()` runs on every page load. With 10 rows this is negligible, but the pattern is identical to `getDistinctTags()`. Both could be parallelised (`Promise.all`) in the server component. Note for implementer.

**N8 — AC-2 count hardcoded to 10:** `Then the page renders exactly 10 event cards` will fail the moment any row is added or removed from the seed. Consider `>= 10` or derive count from DB. Low risk for v0.1 with a frozen seed.

---

## Confirmed-Fine Items

- Tag filter via `SELECT DISTINCT unnest(tags)`: correct, tiny result set, acceptable per-request cost.
- Importance values safe to hardcode in filter bar (schema-enforced via T10 seed assertion).
- Upcoming treatment (dashed border + Forecast pill + "Coming up" header) is fully specified.
- Empty state with "Clear all filters" navigation to `/regulatory` is specified.
- `document_url` null handling is specified (no link rendered).
- Bilingual fallback with `(EN)`/`(ID)` indicator is specified (§7 item 7).
- Tag vocabulary commitment from T10 respected: T15 derives dynamically, no hardcoded tags.
- Route gate via NextAuth middleware is correctly noted as pre-existing (T05).

---

## Top Finding

**B2 (URL serialisation)** is the highest-risk gap. Without an explicit mandate, different implementers will make different choices, producing incompatible shareable links and broken multi-select filter behaviour. Fix with one sentence in the spec.
