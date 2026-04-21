# T14 Spec Audit — Price intelligence screen

**Auditor:** adversarial spec review  
**Date:** 2026-04-19  
**Story:** `docs/stories/T14-price-intelligence.md`  
**Verdict:** PASS — no blocking defects. Six non-blocking flags documented below.

---

## Verdict summary

| Blocking | Non-blocking | Open questions needing Andy's decision |
|---|---|---|
| 0 | 6 | 1 (OQ-1: chart library) |

The spec is internally consistent, correctly acknowledges the 10-month archive cap, documents all nullable fields, and covers empty/error/edge states. No blocking issues. Implementer may proceed.

---

## Flags

### NB-1 — 10-month dataset: sparse chart and no YoY (non-blocking, UX)

**Finding:** IDXCarbon's public archive covers only 10 months (Jun 2025 – Mar 2026). The spec correctly documents this cap in §2 and §5 "Source cap". Two UX consequences are not documented:

1. **Line chart has 10 points.** On a typical 1000px-wide chart that is one point every 100px — not dense enough to convey trend with confidence. Consider annotating the note below the chart: *"Trend reflects 10 months of available data; additional history will appear as IDXCarbon publishes new reports."*
2. **YoY comparison is structurally impossible.** MoM delta is meaningful; any future AC or UI element implying year-over-year should be deferred to v0.2. No current AC implies YoY — no action required unless a v0.2 story reuses T14 as a base.

**Action:** no code change required. Recommend adding the annotation string to the note below the chart (§3 item 3) for user clarity.

---

### OQ-1 — Chart library: Andy decides (open question, carried from spec §9)

**Finding:** The spec correctly surfaces `recharts` (~130 kB gzipped) vs. custom SVG (0 new deps, ~80–100 lines). The dual Y-axis case is non-trivial to implement correctly by hand (min/max scaling, axis label placement, responsive resize). The spec's recommendation to use `recharts` is sound.

**Audit position:** `recharts` is preferred. Custom SVG is viable only if bundle size is a hard constraint and Andy is willing to accept manual scaling math. Neither choice is a blocker.

**Action required:** Andy must make a call before implementation starts. This is not a code review item — it affects `package.json` and the entire `PriceChart.tsx` implementation strategy.

---

### NB-2 — Dual Y-axis scale misleading (non-blocking, UX risk)

**Finding:** Combining `avg_price_idr` (Y1, Rp scale, ~40k range) and `total_volume_tco2e` (Y2, tCO₂e scale, ~117k range) on one chart with independent axis scaling is a known data-visualisation deception vector. A reader can misread correlation or magnitude by comparing the two lines visually without checking the independent axis labels.

**Mitigations present in spec:** dual axis with explicit labels ("Avg price (Rp)" / "Volume (tCO₂e)") is already specified. The `domain={[0, 'auto']}` requirement prevents zero-suppressed axes.

**Residual risk:** on small viewports the Y-axis labels may be clipped. The spec does not address responsive behaviour of axis labels on mobile.

**Recommendation (non-blocking):** consider a stacked two-chart layout (price chart above, volume bar chart below, sharing the same X-axis) as an alternative for v0.2. Document as a v0.2 consideration. For v0.1 proceed with dual-axis as specced.

---

### NB-3 — Currency display inconsistency: hero vs. table (non-blocking, cosmetic)

**Finding:** Hero cards use abbreviated form (`Rp 40k`, `Rp 4.7B`); the monthly detail table uses full-precision form (`Rp 40,025`, `Rp X.XB`). This inconsistency is acknowledged in spec §9 item 2 as an open question but is not flagged as requiring Andy's decision before implementation starts.

**Risk:** if implementer uses the abbreviated helper for both contexts, the table loses precision. If implementer uses full-precision for both, the hero card becomes verbose.

**Action:** the spec's stated intent (abbreviated in hero, full in table) is correct and sufficient. Andy's confirmation of §9 item 2 should be logged before implementation of `PriceChart.tsx`'s parent page, but it is not a blocker.

---

### NB-4 — `total_value_idr` overflow: "Rp X,XXX.XB" not tested (non-blocking, edge case)

**Finding:** §7 documents the `> 999B` case: format as `Rp X,XXX.XB`. No AC tests this branch. The IDX market is small enough that this will not occur in v0.1, but the formatter must not silently produce `Rp 1000.0B` for a trillion-rupiah value. The spec's instruction is correct; the gap is the absence of a test vector.

**Action:** implementer should add a unit test or inline assertion for `formatIdr(1_000_000_000_000)` → `"Rp 1,000.0B"` as part of AC-8. Not a spec defect.

---

### NB-5 — AC-3 hardcoded Rp value: brittle test (non-blocking, test quality)

**Finding:** AC-3 reads: *"expected ~Rp 40k range"* with the note that exact digits depend on scraped data. The spec text already loosens the assertion — the parenthetical instructs the implementer to verify against the January 2026 PDF rather than asserting a specific number in an automated test. This is adequate for v0.1 manual verification.

**Risk:** if IDXCarbon retroactively corrects a previously published figure (rare but documented precedent in other PDF-based scraping contexts), the Jan 2026 scraped value in the DB will diverge from the PDF. Any future automated test pinned to `Rp 40,025` would then be a false failure.

**Recommendation:** if an automated test is added, match against a format regex (`/^Rp \d{1,3}(,\d{3})*$/`) rather than a literal value. Spec language is already compatible with this — no spec change required.

---

### NB-6 — Accessibility: chart has no text alternative (non-blocking, a11y)

**Finding:** The spec does not require a screen-reader-accessible alternative for `PriceChart.tsx`. A chart rendered as pure SVG or `recharts` output is opaque to assistive technology without an `aria-label` on the root element and a visually-hidden data table.

**Schema support:** the monthly detail table (§3 item 4, `MonthlyTable.tsx`) already contains all the same data as the chart. The simplest a11y fix is:

```tsx
<div role="img" aria-label="Monthly IDXCarbon price and volume chart">
  <PriceChart ... />
</div>
<div className="sr-only">
  {/* MonthlyTable rendered here, or a trimmed version */}
</div>
```

**Action:** add `aria-label` to the chart wrapper div and add a `sr-only` visually-hidden data table containing the same monthly data. This should be a DoD item. Flag as non-blocking for v0.1 but strongly recommended before any public launch.

---

### NB-7 — ISR not applicable to `/prices` (non-blocking, documentation gap)

**Finding:** `/prices` is inside `app/(app)/` and is gated by the middleware (T05) with a 307 redirect for unauthenticated users. Next.js ISR only caches at the CDN layer for public routes; middleware-gated routes that require session cookies cannot be cached at the CDN edge because each response is session-dependent.

The spec does not mention caching, which is correct behaviour by omission — there is no caching and there should not be. However, this should be documented explicitly so a future implementer does not inadvertently add `export const revalidate = 3600` (as T18 does for the public landing page).

**Recommendation:** add a one-line comment to `app/(app)/prices/page.tsx`:

```typescript
// No ISR: /prices is auth-gated (middleware 307). Each request is a fresh Drizzle query.
// The idx_monthly_snapshots query (LIMIT 24 on period_month index) is sub-ms.
```

Not a blocker; add to implementer notes.

---

## Cross-story check: T14 → T18 interface

T18 reuses T14's `getPriceHistory()` query shape for IDXCarbon stats on the landing page. One friction point: T14's `getPriceHistory()` returns all columns from `idx_monthly_snapshots` (full `db.select()`), while T18 only needs `period_month`, `avg_price_idr`, `total_volume_tco2e`, `total_value_idr`, and `scraped_at`. The T18 spec defines its own LIMIT 2 query in `getLandingStats()` rather than calling `getPriceHistory()` directly, which avoids over-fetching. This is correct — no change required. The two queries are parallel but not shared, which is intentional.

---

## Checklist pass

| Criterion | Status |
|---|---|
| Drizzle query correct (table name, field names match `lib/schema.ts`) | PASS |
| `idxMonthlySnapshots` column names match (`periodMonth`, `avgPriceIdr`, `rawReportUrl`, etc.) | PASS |
| `raw_report_url` nullable handling documented | PASS (§7 row 3) |
| `avg_price_idr` NULL handling documented | PASS (§7 row 2) |
| Empty state (0 rows) documented | PASS (§7 row 1) |
| Error state (DB unreachable) documented | PASS (§3 item 8) |
| Loading state present | PASS (`loading.tsx` §3 item 7) |
| No ISR on gated route | PASS (not specified — correct) |
| No mock imports in DoD | PASS (§8 bullet 3) |
| AC-8 build/type-check gate | PASS |
| `raw_report_url` not in `lib/schema.ts`… wait | — |

**Schema cross-check note:** `lib/schema.ts` line 185 defines `rawReportUrl: text('raw_report_url')` — present and nullable (no `.notNull()`). The spec's defensive null-handling requirement for the Report column is backed by the schema. PASS.

---

## Summary for Andy

**Verdict: PASS, 0 blockers.**

Top finding: NB-6 (accessibility). The monthly detail table already contains all chart data — adding `aria-label` on the chart wrapper and a `sr-only` duplicate table is a 10-line change that should be part of DoD before public launch.

**Chart library call (OQ-1):** use `recharts`. The dual Y-axis with independent domains, responsive container, and tooltip is ~30 lines of JSX with recharts vs. ~100 lines of manual SVG math with no library. The 130 kB gzip cost is acceptable on an authenticated, data-heavy screen where the user is already making investment decisions — they are not on a mobile connection optimising for first paint.
