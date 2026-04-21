---
id: T14
title: Price intelligence screen with real data
phase: 3
status: audited
blocked_by: [T04, T08]
blocks: [T18]
owner: ""
effort_estimate: 3h
---

## 1. User story

As a signed-in analyst, I want to see IDXCarbon's monthly carbon credit price and volume history on the `/prices` screen, so that I can track market trends and cite real data in investment decisions.

## 2. Context & rationale

T03 scaffolded `app/(app)/prices/page.tsx` with inline mock data. T08 scraped 10 monthly PDFs from IDXCarbon (Jun 2025 – Mar 2026) and wrote them to `idx_monthly_snapshots`. T14 replaces every mock import with a real Drizzle query on that table, adds a dual-axis chart, and surfacing month-over-month deltas.

**Source cap:** IDXCarbon's publicly available archive currently covers only 10 months. The spec and all ACs accommodate this. Phrases like "showing last 10 months" appear where relevant; the design does not promise 24 months of data even though the query requests LIMIT 24.

**Auth gate:** middleware (T05) already blocks unauthenticated requests to `/prices` with a 307 redirect to the landing page. This story does not modify `middleware.ts`.

**Design reference:** `legacy/prototype/index.html` + `styles.css` — the visual language for cards, tables, pills, and typography. Design brief for Screen 4 is the authoritative layout. Mock data in `lib/mock-data.ts` (`mockPriceStats`, `mockPriceSeries`, `mockTransactions`) is deleted from the page; `lib/mock-data.ts` itself is left intact for other screens.

**Chart library:** `recharts ^2.13` is locked as the chart library for this story. Add `"recharts": "^2.13"` to `dependencies` in `package.json`. The ~130 kB gzip cost is accepted. Custom SVG is not an alternative for this story.

---

## 3. Scope

### In scope

1. **Drizzle query (`lib/queries/prices.ts`).**
   Create and export `getPriceHistory()`:
   ```ts
   import { db } from '@/lib/db';
   import { idxMonthlySnapshots } from '@/lib/schema';
   import { desc } from 'drizzle-orm';

   export async function getPriceHistory() {
     return db
       .select()
       .from(idxMonthlySnapshots)
       .orderBy(desc(idxMonthlySnapshots.periodMonth))
       .limit(24); // returns however many exist (currently 10)
   }
   ```
   Return type is inferred from Drizzle; consumers should use `Awaited<ReturnType<typeof getPriceHistory>>`.

2. **Hero stats row** — top of page, four cards in a `grid-template-columns: repeat(auto-fit, minmax(200px,1fr))` grid:
   - **Latest month** — `period_month` formatted as "Mar 2026" (always the most recent row after DESC sort).
   - **Volume** — `total_volume_tco2e` formatted as `117k tCO₂e` (divide by 1 000, round to 1 dp, append "k").
   - **Value** — `total_value_idr` formatted as `Rp 4.7B` (divide by 1 000 000 000, round to 1 dp, prepend "Rp ", append "B").
   - **Avg price** — `avg_price_idr` formatted as **`Rp 40k`** (abbreviated: divide by 1 000, round to nearest integer, append "k"). **Hero cards always use abbreviated form.** Full-precision format ("Rp 40,025") is reserved for the monthly detail table.
   - **Participants** — `registered_participants` as integer.
   - Each card shows a **month-over-month delta badge**: compare rows[0] vs rows[1]. Badge format: `↑ 12%` in green (`var(--color-positive)`) or `↓ 38%` in red (`var(--color-negative)`); `≈` (no color change) when |delta| < 1%. If only one row exists, omit the badge.

3. **Dual-axis line chart (`components/prices/PriceChart.tsx`).**
   - **Library: `recharts ^2.13` (locked).** Use `<ComposedChart>` with two `<YAxis>` and a `<Line>` for price + `<Bar>` for volume. Add `"recharts": "^2.13"` to `dependencies` in `package.json`.
   - Y-axis left (Y1): `avg_price_idr` in Rp (integer scale, label **"IDR per tCO₂e"**). Zero-anchored: `domain={[0, 'auto']}`.
   - Y-axis right (Y2): `total_volume_tco2e` in tCO₂e (label **"Volume tCO₂e"**). Zero-anchored: `domain={[0, 'auto']}`.
   - X-axis: months in chronological order (oldest left), labels formatted "Jun '25", "Jul '25", … "Mar '26".
   - Data points plotted for every row in the query result (up to 10).
   - **Accessibility:** wrap the chart in a `<figure aria-label="Monthly IDXCarbon price and volume — [period range]">` element. Immediately after the closing `</figure>`, render a visually-hidden duplicate of the monthly detail table (same data, same columns) inside a `<div className="sr-only">`. Extract this visually-hidden table as a shared sub-component `components/prices/ChartA11yTable.tsx` so both `PriceChart.tsx` and `MonthlyTable.tsx` can render it without duplication.
   - **Sparse-data warning:** below the chart (outside `<figure>`), render in small text: `"Historical coverage limited to IDXCarbon's 10-month archive."`
   - The Y-axes must **not** auto-zoom: both axes start at 0 (pass `domain={[0, 'auto']}` in recharts). Outlier high-price months must remain visible relative to other months, not dominate the scale.

4. **Monthly detail table (`components/prices/MonthlyTable.tsx`).**
   Sorted descending by `period_month` (same order as query). Columns:
   | Column | Source field | Display |
   |---|---|---|
   | Period | `period_month` | "Mar 2026" |
   | Volume (tCO₂e) | `total_volume_tco2e` | integer with thousands sep |
   | Value (Rp B) | `total_value_idr` | `Rp X.XB` |
   | Avg price (Rp) | `avg_price_idr` | `Rp 40,025` or "—" if NULL |
   | Participants | `registered_participants` | integer |
   | Trading days | `trading_days` | integer |
   | Available units | `available_units` | integer with thousands sep |
   | Retired units | `retired_units` | integer with thousands sep |
   | Report | `raw_report_url` | "PDF ↗" anchor, `target="_blank" rel="noopener"` |

   The "Report" column links directly to `raw_report_url` from the DB row. If `raw_report_url` is NULL, render "—".

5. **Methodology note** — rendered as a `<p className="kl-page-subtitle">` below the table:
   > Data from IDXCarbon monthly reports. Source: idxcarbon.co.id/data-monthly. Reports typically published ~1 week after month-end. Historical coverage limited to IDXCarbon's current archive (10 months).

6. **Page header** — replace the T03 mock header with:
   - Section label: `IDXCarbon · [latest period, e.g. "Mar 2026"]` — derived from `rows[0].periodMonth`.
   - Title: `Price intelligence`
   - Subtitle: `Monthly IDXCarbon snapshots — last 10 months. Per-credit-type breakdown in v0.2.`

7. **Loading state** — `app/(app)/prices/loading.tsx` (Next.js co-located loading UI):
   ```tsx
   export default function PricesLoading() {
     return <div className="kl-page"><p className="kl-section-label">Loading price data…</p></div>;
   }
   ```

8. **Error state** — wrap the server component data fetch in `try/catch`; on error render:
   ```tsx
   <div className="kl-page">
     <p className="kl-section-label" style={{ color: 'var(--color-negative)' }}>
       Unable to load price data. Please try again later.
     </p>
   </div>
   ```

### Out of scope (explicit non-goals)

- Per-transaction (intraday) data — not in public PDFs; v0.2.
- Price alerts / notifications — v0.2 (`watchlists`).
- Per-project pricing (primary-market PDD prices) — v0.2.
- Export to CSV — v0.2.
- Time-range pills (1M / 6M / 1Y / All) updating the chart — v0.2; with only 10 months of data a filter adds no value. The full history is always shown.
- IDTBS-RE / IDTBS / IDNBS per-credit-type breakdown — requires daily scraper; v0.2.
- API route `app/api/prices/idxcarbon/route.ts` — the page is a server component; it queries Drizzle directly. No client-facing API needed for T14. (The route stub from T14 TASKS.md is deferred; T18 or T23 may add it if required.)

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Middleware gate**
```
Given a user who is not signed in
When they request GET /prices
Then the server responds with 307
And the Location header points to the landing page (/)
```

**AC-2: Hero stats show latest month**
```
Given the DB has 10 rows in idx_monthly_snapshots (Jun 2025 – Mar 2026)
And the user is signed in
When they navigate to /prices
Then the page title section label contains "Mar 2026"
And the hero row displays volume, value, avg price, and participants for the March 2026 snapshot
```

**AC-3: Avg price value is plausible**
```
Given the January 2026 row in idx_monthly_snapshots has avg_price_idr populated
When the implementer inspects the rendered HTML for the Jan 2026 row in the monthly detail table
Then it contains a reasonable Rp number matching the format "Rp NN,NNN" or "Rp N.N k"
     (verify against the January 2026 IDXCarbon PDF — expected ~Rp 40k range;
      do not assert a specific literal value in automated tests — match format regex instead)
```

**AC-4: Chart renders**
```
Given the page loads successfully
When the browser renders /prices
Then the DOM contains either:
  (a) an <svg> element (custom SVG chart), or
  (b) a <div> with class containing "recharts-wrapper" (recharts)
```

**AC-5: Detail table has 10 rows**
```
Given 10 months of data exist in the DB
When the monthly detail table is rendered
Then it has exactly 10 <tr> rows in <tbody>
```

**AC-6: Month-over-month delta badge**
```
Given rows[0] is Mar 2026 and rows[1] is Feb 2026
And Mar 2026 volume differs from Feb 2026 volume by more than 1%
When the page renders
Then the Volume hero card shows an arrow badge (↑ or ↓) with a % change
And the badge text color is green (↑) or red (↓) as appropriate
```

**AC-7: PDF link is reachable**
```
Given a row in idx_monthly_snapshots has a non-NULL raw_report_url
When the implementer follows the "PDF ↗" link for that row
Then the HTTP response status is 200
And the content is a PDF (Content-Type: application/pdf or inline PDF)
```
Note: links point to `idxcarbon.co.id` — test manually against a known month.

**AC-8: Build passes**
```
Given the implementation is complete
When the implementer runs:
  npx tsc --noEmit
  npm run build
Then both commands exit 0 with no type errors
```

---

## 5. Inputs & outputs

**Inputs:**
- `DATABASE_URL` env var (already in `.env.local` and Netlify from T04).
- `idx_monthly_snapshots` table — 10 rows written by T08.
- `lib/schema.ts` — `idxMonthlySnapshots` table definition (read-only for this story).
- `lib/db.ts` — Drizzle client singleton.
- `app/(app)/prices/page.tsx` — existing T03 scaffold to be replaced.
- `legacy/prototype/index.html` + `styles.css` — visual reference.

**Outputs:**
- `lib/queries/prices.ts` — new file, `getPriceHistory()` export.
- `app/(app)/prices/page.tsx` — rewritten; removes all mock imports. Must include at the top: `// No ISR: auth-gated; server query is sub-ms on period_month index.`
- `app/(app)/prices/loading.tsx` — new file.
- `components/prices/PriceChart.tsx` — new file.
- `components/prices/MonthlyTable.tsx` — new file.
- `components/prices/ChartA11yTable.tsx` — new shared sub-component (visually-hidden a11y table).
- `package.json` — add `"recharts": "^2.13"` to `dependencies` (locked; not optional).
- No DB migrations. No new env vars.

---

## 6. Dependencies & interactions

- **Blocked by:** T04 (Drizzle client + `lib/schema.ts`), T08 (`idx_monthly_snapshots` populated).
- **Blocks:** T18 (landing page live stats queries `idx_monthly_snapshots` for latest price/volume).
- **Does not touch:** `middleware.ts` (T05), any scraper file, any other screen's page.tsx.
- **File ownership** (this story owns; parallel implementers must not modify):
  - `app/(app)/prices/page.tsx`
  - `app/(app)/prices/loading.tsx`
  - `components/prices/PriceChart.tsx`
  - `components/prices/MonthlyTable.tsx`
  - `components/prices/ChartA11yTable.tsx`
  - `lib/queries/prices.ts`
  - `package.json` (only the `"recharts": "^2.13"` dep line)

---

## 7. Edge cases & failure modes

| Situation | Expected behaviour |
|---|---|
| `idx_monthly_snapshots` has 0 rows | Render: "No data yet — check back after IDXCarbon publishes the next monthly report." in place of hero stats, chart, and table. No crash. |
| `avg_price_idr` is NULL for a row | Display "—" in the avg price column of the detail table. Hero avg-price card shows "—" if the latest row's value is NULL. |
| `raw_report_url` is NULL | Display "—" in the Report column (no broken link). |
| Only 1 row in DB | Hero stats render; delta badges are omitted (no previous month to compare). Chart renders a single point. Table has 1 row. |
| Outlier high-price month | Y-axis `domain` starts at 0; the outlier month will appear tall but all other months remain distinguishable. Do not auto-scale to clip it. |
| DB connection error | `try/catch` in the server component renders the error state (§3 item 8). Sentry (T22) captures the exception. |
| `total_value_idr` very large (> 999B) | Format as `Rp X,XXX.XB` — do not truncate to trillions yet; acceptable for v0.1 given current market size. |

---

## 8. Definition of done

- [ ] All 8 acceptance criteria pass (AC-1 verified via curl; AC-2 to AC-7 verified by visual inspection + curl against a running local dev server; AC-8 via CLI).
- [ ] Story's files landed on `feature/v0.1-impl`.
- [ ] No mock-data imports remain in `app/(app)/prices/page.tsx`.
- [ ] `lib/mock-data.ts` is not deleted (other screens still use it).
- [ ] `PriceChart.tsx` is wrapped in `<figure aria-label="...">` and `ChartA11yTable.tsx` is rendered in an adjacent `sr-only` div.
- [ ] `app/(app)/prices/page.tsx` includes the `// No ISR: auth-gated; server query is sub-ms on period_month index.` comment.
- [ ] CHANGELOG entry added under `[Unreleased]`: `T14 — Price intelligence screen wired to real IDXCarbon data`.
- [ ] `TASKS.md` status flipped `todo` → `done` for T14.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Decisions (formerly open questions — resolved)

1. **Chart library: recharts (locked).**
   Decision: `recharts ^2.13`. The ~130 kB gzip cost is accepted on this auth-gated, data-heavy screen. Custom SVG is not an alternative for T14. `package.json` must include `"recharts": "^2.13"` in `dependencies`.

2. **Currency display convention (locked).**
   Hero cards use abbreviated form (`Rp 40k`, `Rp 4.7B`). Monthly detail table rows use full-precision form with thousands separator (`Rp 40,025`). Implementer must not use the abbreviated helper for table cells.

---

## 10. References

- `PRD.md` §4 — "Price intelligence" feature narrative.
- `docs/architecture.md` §3 — `idx_monthly_snapshots` schema (canonical column names).
- `docs/architecture.md` §5.3 — IDXCarbon scraper context.
- `docs/TASKS.md` T08, T14, T18 — task blocks.
- `legacy/prototype/index.html` + `styles.css` — Screen 4 visual reference.
- `lib/schema.ts` lines 173–188 — Drizzle `idxMonthlySnapshots` table definition.
- `app/(app)/prices/page.tsx` — T03 scaffold being replaced.
- `lib/mock-data.ts` lines 146–217 — mock price data to be removed from the page.
