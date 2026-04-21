# Spec Audit — T11: Projects Explorer (Table + Filters)

**Auditor:** adversarial spec-auditor agent
**Date:** 2026-04-19
**Story under review:** `docs/stories/T11-projects-explorer.md`
**Verdict:** CONDITIONAL PASS — 2 blocking issues, 7 non-blocking issues. Implement only after B-1 and B-2 are resolved.

---

## Summary

| Severity | Count |
|---|---|
| BLOCKING | 2 |
| NON-BLOCKING (high) | 4 |
| NON-BLOCKING (low) | 3 |
| Open questions awaiting Andy | 2 |

---

## Blocking Issues

### B-1 — `searchParams.tab` is not defined, creating a T13 rebase conflict

**Impact:** T13 adds a map tab to `app/(app)/projects/page.tsx` by testing `searchParams.tab === 'map'`. T11 replaces that file entirely and owns all `searchParams` parsing. If T11 ships without any `tab` param awareness, T13 has two options: (a) add the `tab` branch itself, which means T13 modifies a file T11 "owns", or (b) T11 must leave a documented hook. Neither is currently specified.

**Concrete risk:** T11 §3.3 parses `province`, `type`, `status`, `sort`, `page`, `limit` — `tab` is absent. §3.3 says "unknown keys (e.g., `q=foo`): silently ignore". Under that rule, `?tab=map` would be silently dropped. T13 §3 item 6 explicitly says it adds `?tab=map` routing "to T11's `app/(app)/projects/page.tsx`". T13 §6 calls this a "narrow change only".

**Required fix:** T11 must either (a) define `tab?: 'table' | 'map'` in its `searchParams` parsing block with a fallback to `'table'` and a `{tab === 'map' && <MapPlaceholder />}` branch (even an empty div is enough to anchor T13), or (b) add an explicit note in §3.3 that `tab` is a reserved param T13 will add, and instruct the implementer not to strip it from outbound `<Link>` hrefs. Option (a) is safer.

**Reference:** T11 §3.3, T13 §3 item 6 and §3 item 9.

---

### B-2 — `'Unknown'` province filter round-trip is under-specified

**Impact:** Implementer will almost certainly write `WHERE province = 'Unknown'` rather than `WHERE province IS NULL`, causing zero results for the "Unknown" chip and a silent data integrity bug.

T11 §7(i) states: "`getProvinceOptions()` maps NULL to the string 'Unknown'" and "The filter chip 'Unknown' filters for `province IS NULL` — the query helper must handle `province = 'Unknown'` as `WHERE province IS NULL`." The requirement is correct but buried in the edge-cases section. The function signature in §3.2 says `province?: string[]` and the WHERE clause in §3.1 says `WHERE province = ANY(...)`. Those two statements alone are ambiguous — nothing in §3.1 mentions the NULL-sentinel translation.

**Required fix:** Add an explicit code comment in §3.1's query details block: "Before constructing the `ANY(...)` array, scan for the value `'Unknown'` in the input array. If present, add a `OR province IS NULL` predicate alongside `province = ANY(filteredArray)`. Remove `'Unknown'` from the array before binding."

**Reference:** T11 §3.1, §3.2, §7(i).

---

## Non-Blocking Issues (High Severity)

### N-1 — URL serialization for multi-select filters is not canonicalized

**Impact:** T13 and future stories must build URLs that are compatible with T11's filter links. Without a documented canonical form, bugs accumulate silently.

T11 §3.4 says chips build URLs by "adding/removing the relevant query param (e.g., `?province=Central+Kalimantan&province=East+Kalimantan`)". That implies repeated-key form (`?province=A&province=B`). But `searchParams` in Next.js App Router returns `string | string[] | undefined` — both forms work for reading. For writing, `<Link>` href construction must be consistent. If one component serializes as `?province=A,B` and another as `?province=A&province=B`, the filter will silently lose values.

**Recommendation:** Add a one-sentence canonical statement to §3.4: "URL serialization: use repeated-key form (`?province=A&province=B`). Comma-joined single-value form is not used." Add a helper `buildFilterUrl(base, params)` to keep chip and pagination link construction in sync.

---

### N-2 — Stats strip says "Showing X of 64 projects" but 64 is hardcoded

**Impact:** As Verra adds more Indonesian projects (scraper runs weekly), the denominator would be stale.

AC-6 reads "Showing 64 of 64 projects" with 64 hardcoded in the AC. The `ProjectsStats.totalMatching` field counts only the filtered set. There is no field for the total unfiltered count. When no filters are active, `totalMatching` equals the full table count — but the "of 64" part should be driven by a `SELECT COUNT(*) FROM projects WHERE country = 'ID'` (or equivalent), not a literal `64`.

**Recommendation:** Add a `totalProjectCount: number` field to `ProjectsStats` computed as a separate COUNT in the stats CTE (or a `COUNT(*) OVER ()` on the unfiltered base). Update AC-6 to reference `stats.totalProjectCount` rather than a literal.

---

### N-3 — `transparency_score` / status enum mismatch documented in architecture §13 but T11 is silent

**Impact:** T09 architecture note (§13 Phase 2 shipped state) states: "`transparency_score` floors at 55 for most projects because T06 writes raw Verra status strings (e.g. 'Registered') rather than the canonical enum ('active'). T09's transparency sub-score filter checks `status='active'` — the mismatch causes all non-overridden projects to land in the single-registry path."

T11's status filter chip exposes raw Verra strings — which is correct per §2. But T11 §3.5 documents `.kl-pill--warning` for "Under development" as "blue/muted". The color label is internally contradictory (warning class is conventionally amber/yellow, not blue). This is a CSS naming confusion that will surface as a QA bug.

**Recommendation:** Fix §3.5 pill class description: `kl-pill--warning` should be labeled "(amber/muted)" not "(blue/muted)". Verify against `legacy/prototype/styles.css` before shipping.

---

### N-4 — Stats strip median query may do two passes against Drizzle-SQL boundary

**Impact:** Performance and correctness.

§3.1 says: "Stats (`totalMatching`, `sumAvailableVcus`, `medianIntegrityScore`) are computed server-side from the unsliced (pre-pagination) filtered result set, using a single supplementary query or a CTE." The word "supplementary" suggests a second query, but the intent is "same query via CTE". A second query is a TOCTOU risk — the filtered set could change between the list query and the stats query (unlikely in practice, but non-zero).

`PERCENTILE_CONT` cannot be expressed in Drizzle's type-safe query builder, so the `sql` tag is required for the stats. This is fine but means the filter WHERE clause must be duplicated between the Drizzle query and the raw SQL stats query — a maintenance footprint. 

**Recommendation:** Make the design explicit: "Implement stats as a CTE that is part of the same `sql`-tagged query as the paginated list. The CTE applies the same WHERE predicate; the main SELECT paginates. This prevents two-pass inconsistency and avoids WHERE clause duplication." If a second query is used, add a locking comment explaining the TOCTOU acceptance.

---

## Non-Blocking Issues (Low Severity)

### N-5 — `mockProjects` lifecycle and T18 dependency

**Impact:** T11 §3.9 says "Do not delete `mockProjects` from `lib/mock-data.ts` — T18 (landing page) may still reference it." However, T18 §3.2 says to remove `import { mockProjects }` from `app/(public)/page.tsx` and conditionally delete the export if T11 has landed. T18 §6 confirms that T18 is blocked by T11, so when T18 runs T11 will already have landed. T18 can therefore always delete the `mockProjects` export. T11's instruction to preserve it is technically correct but will leave dead code if T18 is implemented immediately after T11.

**Recommendation:** T11 §3.9 should say: "Do not delete the `mockProjects` export — T18 will handle that cleanup as part of its own scope." No spec change required; this is informational only. Low risk.

---

### N-6 — Pagination hides when unnecessary: not specified

**Impact:** When filters produce 1–3 results, the pagination "Prev / Page 1 of 1 / Next" row is visible and both buttons are disabled. This looks broken.

T11 §3.7 says "Page 1: no Prev link (or disabled). Last page: no Next link (or disabled)." When `Math.ceil(total / limit) === 1`, both conditions are simultaneously true. The spec does not say "hide the pagination row entirely when there is only one page."

**Recommendation:** Add to §3.7: "When `total <= limit` (only one page), hide the entire pagination row rather than showing it with both controls disabled."

---

### N-7 — `loading.tsx` skeleton vs spinner

**Impact:** User experience consistency.

T11 §3.8 specifies a skeleton (20 ghost rows, `animate-pulse`) — which is correct and preferred. However the spec says "table skeleton of 20 ghost rows" without specifying the filter row placeholder. If the filter bar skeleton is omitted, there will be a layout shift as the filter chips appear after the table skeleton disappears.

**Recommendation:** Add to §3.8: "The filter row placeholder must match the height of the rendered `<FilterChips>` and `<SortControl>` row (approximately 40 px). Use a single full-width `animate-pulse` bar for simplicity."

---

## Cross-Story Concerns

### C-1 — T13 modifies `app/(app)/projects/page.tsx` after T11 owns it

T11 §6 lists `app/(app)/projects/page.tsx` as "owned by T11 (no other story may modify these in parallel)". T13 §5 lists `app/(app)/projects/page.tsx` as a modified file. T13 §6 says it makes "narrow, coordinated changes" and "must rebase onto the latest `feature/v0.1-impl` before opening the T13 PR". This is the intended workflow — T13 merges after T11.

**Risk:** If T11 ships `searchParams` parsing that strips unknown keys (the current spec implies this via the `?q=foo` silently ignore rule), then `?tab=map` would be dropped from any `<Link>` T11 builds (e.g., a "Province=X" filter link). T13 would then lose its tab state on every filter interaction. This is the same issue as B-1 above. B-1's fix also resolves C-1.

**Action required:** Resolve B-1. Once `tab` is a named param, T11's `<Link>` builders must preserve it in filter URL construction (i.e., when building `?province=A`, carry forward `?tab={currentTab}` if present).

### C-2 — T18 `mockProjects` removal lifecycle

T18 is blocked by T11 (`blocked_by: [T11, T14]`). T18 §3.2 says it removes the `mockProjects` import from `app/(public)/page.tsx` — this is `T18`'s own file, not T11's. T11 §3.9 correctly says do not delete `lib/mock-data.ts` content. T18 will be the final consumer to remove the import. The lifecycle is coherent.

**No action required for T11.**

### C-3 — T12 detail page status badge uses `active/pipeline/suspended` mapping, T11 uses raw Verra strings

T12 §3.2 (Hero section) maps `active → success`, `pipeline → warning`, `anything else → danger`. T11 §3.5 maps raw Verra strings (`Registered → success`, `Under development → warning`, etc.). These are two separate badge implementations for the same conceptual field. When T06.1 normalizes the status column, whichever mapping is canonical will need updating; the other silently stays wrong.

**Recommendation:** Document in T11 §3.5 (or as an OQ) that T12 uses a different mapping table and both must be updated together when T06.1 lands. Low priority but worth a code comment.

---

## Acceptance Criteria Testability

| AC | Concrete? | Notes |
|---|---|---|
| AC-1 | Yes | curl + HTTP code check. |
| AC-2 | Mostly | "at least 20 `<tr>` rows" is testable; "rows come from live DB" is not curl-verifiable without a DB diff. Consider adding: "and the HTML does NOT contain `mockProjects`". |
| AC-3 | Yes | grep for project names is concrete. |
| AC-4 | Weak | "every project row shows 'Central Kalimantan'" requires parsing multiple rows from HTML — not easily grep-able. Recommend adding a count check: "and the HTML contains exactly X occurrences of 'Central Kalimantan' in province cells". |
| AC-5 | Yes | First row having highest score is concrete if the HTML order matches the DB order. |
| AC-6 | Yes | Concrete text match. |
| AC-7 | Yes | Exit code check. |
| AC-8 | Yes | Exit code check. |
| AC-9 | Yes | grep for class names. |

---

## Empty State

Adequately specified in §3.6. "Clear filters" link to `/projects` is present. The `.kl-card` wrapper ensures visual consistency. No issues.

---

## Performance Assessment

64 projects + indexed filters (`idx_projects_province`, `idx_projects_type`, `idx_projects_status`) + one `project_scores` left join = minimal query overhead. No caching required for v0.1. `getProvinceOptions()` and `getProjectTypeOptions()` execute on every render (not `fetch`-cached), which is acceptable for 64 rows. Document this in §3.2 — the current note is sufficient.

`PERCENTILE_CONT` on 64 rows is O(n log n) at most — immaterial.

No perf concerns for v0.1.

---

## Open Questions Requiring Andy's Decision

**OQ-A — `tab` param: T11 defines it, or T13 adds it?**
Recommendation: T11 defines `tab` with a stub branch so T13 only fills it. Otherwise T13's rebase changes the file structure T11 already established, risking logic regression.

**OQ-B — Stats strip "of N projects" denominator: live count or literal?**
Recommendation: live count (a `SELECT COUNT(*)` in the same CTE). The literal `64` will be stale within weeks as the scraper runs. This is N-2 above elevated to a decision point.

---

## Definition of Done Gap

T11 §8 DoD is complete. One gap: the DoD does not require verifying `?tab=map` URL preservation across filter links. Add: "[ ] Filter links (`<Link>` hrefs built by `FilterChips`) preserve the `tab` query param when present."

This is conditional on resolving B-1 and OQ-A.
