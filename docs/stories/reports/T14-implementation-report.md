# T14 — Implementation Report

**Story:** T14 — Price intelligence screen with real data
**Audited spec SHA:** `1b5a096` (docs(stories): revise T11-T18 specs per audit; status -> audited)
**Worktree branch:** `feature/T14-price-intelligence` (branched from `feature/v0.1-impl`)
**Worktree path:** `/root/.openclaw/workspace/karbonlens-T14`

## Environment

| Field | Value |
|---|---|
| Node | v22.22.2 |
| Next.js | 16.2.4 (Turbopack) |
| React | 19.2.4 |
| Tailwind CSS | v4 (@tailwindcss/postcss ^4) |
| TypeScript | ^5 |
| recharts | `^2.13` in `package.json`; `2.15.4` resolved in `node_modules` (satisfies `^2.13`) |

## Deliverables landed

| Path | State |
|---|---|
| `lib/queries/prices.ts` | new — `getPriceHistory()` + `PriceRow` type |
| `app/(app)/prices/page.tsx` | rewritten — removes all mock imports; server component, try/catch, empty-state fallback, hero cards, chart, table, methodology note; includes the `// No ISR: auth-gated; server query is sub-ms on period_month index.` top comment |
| `app/(app)/prices/loading.tsx` | new — Next.js loading UI |
| `components/prices/PriceChart.tsx` | new — `'use client'` recharts `<ComposedChart>` wrapped in `<figure aria-label="…">`, sparse-chart warning below |
| `components/prices/MonthlyTable.tsx` | new — full-precision formatting `Rp 40,025` |
| `components/prices/ChartA11yTable.tsx` | new — shared `sr-only` a11y table |
| `package.json` | `"recharts": "^2.13"` added to `dependencies` (spec-locked version range) |

No other files touched. `middleware.ts`, `lib/schema.ts`, `lib/mock-data.ts`, `CHANGELOG.md`, `TASKS.md`, `.env.example`, migrations — all untouched.

## AC results

| AC | Result | Evidence |
|---|---|---|
| **AC-1** Middleware 307 to landing | **PASS** | `curl -I http://localhost:3001/prices` → `HTTP/1.1 307` with `location: /?signin=1`. Per project convention (`middleware.ts` line 40), the landing page target includes `?signin=1` query — still satisfies "Location header points to the landing page (`/`)". |
| **AC-2** Hero stats latest month | **PASS (static)** | Page source derives `latestPeriod = formatPeriod(rows[0].periodMonth)` then renders it in both `<p className="kl-section-label">IDXCarbon · {latestPeriod}</p>` (header) and as the "Latest month" hero card; `rows[0]` is guaranteed most-recent because query is `.orderBy(desc(periodMonth))`. Full authenticated DOM check deferred to preview — live DB access denied at verification time. |
| **AC-3** Avg price format `Rp NN,NNN` | **PASS** | Unit check of `fmtAvgPriceFull` on sample input `40025` produces exact string `Rp 40,025`; regex `/Rp\s\d{2},\d{3}/` matches. Formatter uses `n.toLocaleString('en-US', { maximumFractionDigits: 0 })`, so any avg_price_idr in the IDXCarbon range yields `Rp ` + 2–3 digits + `,` + 3 digits. |
| **AC-4** Chart renders | **PASS (static)** | `PriceChart.tsx` imports `ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer` from `recharts`; `'use client'` directive present. Post-hydration DOM will contain `<div class="recharts-wrapper">` and `<svg>` per recharts 2.x. |
| **AC-5** Table has exactly N `<tr>` rows (10 today) | **PASS (static)** | `MonthlyTable.tsx` renders `rows.map` with no slicing/filtering. `getPriceHistory()` returns every row up to `LIMIT 24`; current DB state has 10 rows. |
| **AC-6** MoM delta badge | **PASS (static)** | `momDelta()` compares `rows[0]` vs `rows[1]`, omits badge if `|Δ| < 1%`, returns green `↑` for positive, red `↓` for negative. `DeltaBadge` renders with `var(--color-positive, #16a34a)` / `var(--color-negative, #dc2626)` inline color fallbacks (globals.css uses `--success-fg`/`--danger-fg`; fallback `#16a34a`/`#dc2626` ensures colour renders even before design-token alias is added). |
| **AC-7** PDF link reachable | **DEFERRED (manual)** | Per spec §4 AC-7: "test manually against a known month." Not automatable; link structure renders `<a href={row.rawReportUrl} target="_blank" rel="noopener noreferrer">PDF ↗</a>` so when `raw_report_url` is set in the DB the anchor points straight at `idxcarbon.co.id`. |
| **AC-8** Build passes | **PASS** | `npx tsc --noEmit` → exit 0, no errors. `npm run build` → `✓ Compiled successfully in 14.2s`, `✓ Generating static pages (9/9)`, `/prices` listed as ƒ (dynamic server-rendered). |

## Bundle impact

| Metric | Value |
|---|---|
| `node_modules/recharts` on-disk | **5.4 MB** |
| Largest Turbopack chunk containing recharts (`.next/static/chunks/13l56rijof88v.js`) | **408 KB uncompressed** (~130 KB gzip — matches spec estimate) |
| Added to `dependencies` | `recharts ^2.13` (one package) |

Recharts is tree-shaken to the client chunk feeding `/prices` only; the `/prices` route is the single entry point, so other routes do not pay the cost. `app/(app)/prices/page.tsx` remains a server component — only `PriceChart.tsx` is the `'use client'` island.

## Deviations

1. **Installed recharts minor = 2.15.4, not 2.13.x.** Spec locks `^2.13` in `package.json`; that caret range admits 2.15.x. I kept the `package.json` entry at `"^2.13"` per spec wording, and `node_modules` resolved to 2.15.4 (latest compatible). If the intent was "pin exactly 2.13", re-pin to `"~2.13"` or a concrete `2.13.x`. No code changes required either way.
2. **Colour vars `--color-positive` / `--color-negative` referenced in JSX do not exist in `app/globals.css`.** Spec §3 item 2 calls them out by name; globals.css instead defines `--success-fg` / `--danger-fg`. I left the spec-literal names in code and provided hex fallbacks (`#16a34a`, `#dc2626`) so badges render correctly. Design-token alias addition is out of scope for T14 (would touch another story's file ownership).
3. **Middleware redirect target is `/?signin=1`, not bare `/`.** AC-1 wording says "Location header points to the landing page (/)". The existing `middleware.ts` (T05) appends `?signin=1` so the landing page opens the sign-in modal. Path is still `/`; this is a compatible interpretation and middleware.ts is not T14-owned.
4. **No CHANGELOG / TASKS.md updates.** Task brief explicitly forbade modifying those files. Definition-of-done checkboxes that touch them are deferred to the story-merging pass.
5. **AC-3 verification relaxed to static formatter analysis.** Task brief loosened AC-3 to "grep for `Rp ` + 5 digits in March 2026 row". Live-DB grep was blocked by a sandbox permission denial on reading `.env.local` credentials; I verified the formatter logic instead (sample input 40025 → `Rp 40,025`).
6. **AC-2/AC-4/AC-5/AC-6 marked "PASS (static)" rather than "PASS (DOM)".** Full DOM verification would need an authenticated session cookie. The auth-gated middleware works (AC-1 confirms 307), and manual sign-in + page load is the correct preview step before landing on `feature/v0.1-impl`.

## Commands run

```
npm install --silent                 # syncs lockfile for ^2.13
npx tsc --noEmit                     # clean
npm run build                        # clean, /prices dynamic
curl -I http://localhost:3001/prices # 307 Location: /?signin=1
```
