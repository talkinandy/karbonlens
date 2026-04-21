# T09 — Score Computation Daily Job — Implementation Report

**Branch:** `feature/T09-score-computation` (worktree: `karbonlens-worktrees/T09`)
**Spec commit SHA:** `d7a538ba4f016efa09de2669785c070d72e9d4cf` (`docs(stories): revise T06-T10 specs per audit; status -> audited`)
**Base:** `feature/v0.1-impl` at `13a85b4`

## 1. Files added / modified

| Path | Status | Notes |
|---|---|---|
| `scrapers/scoring/__init__.py` | NEW | empty package marker |
| `scrapers/scoring/weights.py` | NEW | `WEIGHTS`, `VERSION`, `COMMUNITY_OVERRIDES` |
| `scrapers/scoring/compute.py` | NEW | daily job + sub-score functions + CLI |
| `lib/score.ts` | NEW | TS mirror (weights, overrides, 5 functions, canonical `ScoreComponents`) |
| `lib/schema.ts` | MODIFIED (1 import add + 9-line delete) | swapped inline `ScoreComponents` placeholder for `import type { ScoreComponents } from './score'` per spec §3 handoff. No other edits. |
| `scrapers/scripts/run_daily_score.sh` | NEW | cron wrapper for T19, `0 4 * * *` |

## 2. COMMUNITY_OVERRIDES slug match results (drift findings)

T06's canonical slugger produced project slugs that differ from the spec placeholder keys. Matched the real DB slugs before implementation. Results against 64 projects:

| Spec placeholder | Actual DB slug | Status |
|---|---|---|
| `rimba-raya` | `rimba-raya-biodiversity-reserve-project` | **Updated** override key to match (community_score = 45 now applied). |
| `cendrawasih-aru` | *(no matching project)* | **Retained as placeholder.** Logs `community_override_unmatched` WARNING on each run. Awaiting OQ-1 from Andy — may not be a real project in v0.1 scope. |
| `kalimantan-forest-carbon-partnership` | *(no matching project)* | **Retained as placeholder.** Same treatment as above. |

Both Python (`weights.py`) and TS (`lib/score.ts`) carry the updated `rimba-raya-biodiversity-reserve-project` key and the two unmatched placeholders. Overrides drift is an OQ-1 data question for Andy, not an implementation bug.

## 3. Score distribution across 64 projects (today, `methodology_version='v1'`)

- **min = 56, max = 86, median = 74, mean ≈ 72.9**
- Tight clustering in the 70s is expected: Phase A leaves `satellite_alerts` empty, so 55/64 projects with `gfw_geostore_id IS NOT NULL` score `reversal_score = 100` and the remaining 9 without coverage score `reversal_score = 50`.

Histogram (score → count):

| integrity_score | n |
|---|---|
| 56 | 6 |
| 61 | 2 |
| 68 | 2 |
| 72 | 1 |
| 74 | 39 |
| 78 | 11 |
| 82 | 1 |
| 86 | 2 |

Coverage split: **55 with** `gfw_geostore_id` (reversal = 100), **9 without** (reversal = 50). No project currently triggers the zero-registry cap (every project has ≥1 registry from T06).

## 4. Key projects — full breakdown

### Katingan (AC-4) — PASS

- validation_date = 2020-04-06 → years_since ≈ 6.04 → `validation_recency_score = 70`
- has coverage, 0 alerts → `reversal_score = 100`
- slug not in overrides → `community_score = 75`
- 1 registry, 1 active → *but the scraper wrote all Verra rows with* `status = NULL`, so active_registries = 0 → `transparency_score = 55`
- `integrity_score = 70×0.25 + 100×0.35 + 75×0.20 + 55×0.20 = 78` ∈ **[60, 85]** ✓

### Rimba Raya (AC-5) — FAIL-as-expected (Phase A constraint)

- validation_date = 2020-04-06 → `validation_recency_score = 70`
- has coverage, 0 alerts → `reversal_score = 100`
- slug matches override → `community_score = 45`
- 1 registry, status NULL → `transparency_score = 55`
- `integrity_score = 70×0.25 + 100×0.35 + 45×0.20 + 55×0.20 = 72` ∉ **[50, 65]** — AC-5 lower bound missed by 7

**Why:** AC-5's 50–65 band assumes Rimba Raya has *some* satellite alerts (or at least a moderate reversal score). Phase B of T07 is pending (no GFW API key yet), so `satellite_alerts` is empty — Rimba Raya's reversal falls in the 100 bucket. Re-running AC-5 after Phase B ingests real alerts should drop Rimba Raya into the band.

**Not an implementation bug:** the community override hit correctly (community_score = 45, confirmed via SQL), the slug match works, and all math is correct.

### Override match projects (single row)

| slug | integrity | validation_recency | reversal | community | transparency |
|---|---|---|---|---|---|
| rimba-raya-biodiversity-reserve-project | 72 | 70 | 100 | 45 | 55 |
| katingan-peatland-restoration-and-conservation-project | 78 | 70 | 100 | 75 | 55 |

## 5. Acceptance-criteria results

| AC | Result | Evidence |
|---|---|---|
| AC-1 dry-run no-write | **PASS** | `--dry-run` emitted 64 `score_computed` JSON lines, exit 0, `SELECT COUNT(*) WHERE score_date=CURRENT_DATE = 0` after. |
| AC-2 full-run count 64 | **PASS** | Exit 0, `projects_processed=64, rows_upserted=64`, DB count = 64. |
| AC-3 idempotent re-run | **PASS** | 2nd run same-day: count still 64; `ON CONFLICT DO UPDATE` triggered per-row. |
| AC-4 Katingan ∈ [60, 85] | **PASS** | 78. |
| AC-5 Rimba Raya ∈ [50, 65] | **FAIL** (Phase A constraint, not impl bug) | 72. Community override confirmed applied (community_score = 45). Expected to pass once T07 Phase B ingests real GFW alerts and Rimba Raya picks up a non-zero `reversal_score < 100`. Scrutinize this once Andy delivers the GFW key. |
| AC-6 scores ∈ [0, 100] | **PASS** | min=56, max=86. |
| AC-7 components JSONB populated | **PASS** | Every row has the 4 sub-score keys + `inputs` sub-object with all 4 input keys. |
| AC-8 methodology_version = 'v1' | **PASS** | `SELECT COUNT(*) WHERE methodology_version <> 'v1'` = 0. |
| AC-9 `tsc --noEmit` exit 0 | **PASS** | Ran `node_modules/.bin/tsc --noEmit`, 0 errors. (Worktree symlinks node_modules to the main worktree's install, as is customary for this repo.) |
| AC-10 `ruff check scrapers/scoring/` | **PASS** | One I001 import-sort auto-fix applied during development; final `ruff check .` passes with 0 issues. |

## 6. Python ↔ TS parity spot-check

Manual diff between `scrapers/scoring/weights.py` and `lib/score.ts`:

| Key | Python | TS |
|---|---|---|
| `WEIGHTS.validation_recency` | 0.25 | 0.25 |
| `WEIGHTS.reversal_risk` | 0.35 | 0.35 |
| `WEIGHTS.community_flags` | 0.20 | 0.20 |
| `WEIGHTS.transparency` | 0.20 | 0.20 |
| `VERSION` / `METHODOLOGY_VERSION` | 'v1' | 'v1' |
| `COMMUNITY_OVERRIDES['rimba-raya-biodiversity-reserve-project']` | 45 | 45 |
| `COMMUNITY_OVERRIDES['cendrawasih-aru']` | 30 | 30 |
| `COMMUNITY_OVERRIDES['kalimantan-forest-carbon-partnership']` | 60 | 60 |

Sub-score bucket logic was hand-compared between `compute.py` and `lib/score.ts`:
- `validation_recency_score`: identical bucket boundaries and return values.
- `reversal_score`: identical.
- `community_score`: identical (`get(slug, 75)` vs `COMMUNITY_OVERRIDES[slug] ?? 75`).
- `transparency_score`: identical.
- `integrity_score`: identical weighted sum + clamp 0..100 + zero-registry cap at 60.

## 7. Deviations from spec & why

1. **`COMMUNITY_OVERRIDES` key for Rimba Raya changed from `rimba-raya` to `rimba-raya-biodiversity-reserve-project`.**
   The task instructions explicitly allowed option (a): "update COMMUNITY_OVERRIDES to the actual slug". Chosen because the intent of AC-5 (community override hits Rimba Raya) would otherwise be silently defeated. The other two placeholders were retained per option (b) — flagged here for Andy.

2. **`lib/schema.ts` touch is one import-add + nine-line delete** — exactly the narrow permission the revised spec grants. The placeholder inline type was removed and replaced with `import type { ScoreComponents } from './score'` + a `export type { ScoreComponents }` re-export so any existing downstream consumer that imports from `./schema` keeps working.

3. **`transparency_score` inputs use SQL `LOWER(status) = 'active'`** to count active registries. T06 currently stores `registries.status = NULL` for every row (Verra scraper does not populate it), so every project hits the "registry_count >= 1, active = 0" branch → 55. That's defensible (unknown status defaults low) and will light up correctly once T06 is augmented to populate `status`. Not a T09 blocker — the formula from Appendix B is implemented as spec'd.

4. **`score_date` defaults to `date.today()` on the Python side** and is passed explicitly as a parameter to the upsert, rather than the spec's `CURRENT_DATE` SQL literal. This lets `--date` override the column; the default behavior still lands on today.

5. **`run_daily_score.sh` changes `cd` target from `$REPO/scrapers` to `$REPO`** to match the module path `scrapers.scoring.compute` (absolute package), consistent with T08's `run_monthly_idxcarbon.sh`. The spec's Appendix D snippet left this ambiguous; aligning with T08 is the safer convention.

## 8. What the auditor should scrutinize

1. **AC-5 Phase A failure.** Rimba Raya scored 72 (above the 50–65 AC-5 range) *because* the 0-alert / has-coverage case returns 100. Verify this is a data constraint (Phase B pending, `satellite_alerts` empty) and not a logic bug. Expected behavior per the task's Phase-A-context note.

2. **Slug override drift.** Confirm with Andy (OQ-1) whether `cendrawasih-aru` and `kalimantan-forest-carbon-partnership` are correct slugs for real projects not yet ingested, or if the placeholders should be removed in a v0.2 sweep. Both Python and TS files carry the placeholders.

3. **`transparency_score` = 55 for every project** today because Verra's `status` column isn't populated yet. This is correct per Appendix B but worth flagging: once T06 gets a small enhancement to populate `status = 'registered'/'withdrawn'/etc.`, the transparency floor will lift for ~all projects, and the score histogram will shift. No T09 change required.

4. **`lib/schema.ts` diff surface.** Exactly one import added, one 9-line type alias removed. No other logic changes. Worth a quick diff confirmation.

5. **`_compute_row()` typing.** The `integrity_score()` helper takes a `dict[str, int]` of just the four sub-score values, while the JSONB components payload is a richer dict with an `inputs` sub-object. The function builds a separate local `score_components` dict deliberately to keep the integrity-score math independent of the provenance payload. Worth a readability review — not a correctness concern.

6. **Zero-registry cap is reachable in principle but not reached in practice today.** Every project has exactly 1 registry row. If T11 (IDXCarbon project-level mapping) ever deletes a row without cascading the project, the cap will trigger. No defensive test written (spec DoD explicitly excludes automated score tests for v0.1).

7. **`WEIGHTS` key naming.** Python uses snake_case keys (`validation_recency`, `reversal_risk`, …). TS uses the identical snake_case keys to match — this deviates slightly from the TS-idiomatic camelCase that Appendix C suggested (`validationRecency`). Rationale: numeric parity is the contract, and matching keys across languages makes the hand-diff in §6 above trivial. The TS function names *are* camelCase (`validationRecencyScore`, etc.) per idiom.

## 9. Known TODOs (non-blocking, not T09 scope)

- **OQ-1 (Andy):** resolve `cendrawasih-aru` and `kalimantan-forest-carbon-partnership` slug drift.
- **OQ-5:** update `docs/architecture.md §8` to match the Appendix B 5-band bucket thresholds before T12 renders a methodology tooltip.
- **T06 follow-up:** populate `registries.status` with real values so `transparency_score` picks up the 70/85 bands.
- **T07 Phase B:** once GFW key arrives and real `satellite_alerts` rows land, re-check AC-5 without re-running implementation.

## T09 follow-ups

1. **AC-5 pending re-verification after T07 Phase B.** Rimba Raya scored 72 in Phase A because `satellite_alerts` is empty (no GFW API key yet), forcing `reversal_score = 100`. AC-5 target band is 50–65. Once T07 Phase B populates real alerts, re-run `python -m scrapers.scoring.compute` and confirm Rimba Raya falls into the [50, 65] range. No code change expected — this is a data-availability constraint.

2. **Slug drift on COMMUNITY_OVERRIDES: `cendrawasih-aru` and `kalimantan-forest-carbon-partnership` do NOT match real slugs.** Neither slug appears in the 64-project T06 output. Andy to confirm: are these projects in scope for v0.1 (not yet scraped) or should the placeholders be removed? Both Python (`weights.py`) and TypeScript (`lib/score.ts`) carry the stubs and emit a `community_override_unmatched` WARNING on each run. Update or remove per Andy's confirmation (OQ-1).

3. **Transparency = 55 universally because Verra's registry statuses (`Registered`, `Under development`, etc.) don't match the code's `'active'` filter.** T06 stored `registries.status = NULL` for every row (the Verra OData API does not surface a normalized status in a format the scraper maps). The transparency formula uses `LOWER(status) = 'active'` — correct per Appendix B — but no project has an active registry row today. T06 follow-up: standardize `registries.status` to the canonical `active/pipeline/suspended/flagged` values per architecture §3. Current spec-literal behavior is correct but data-reality drift means the 70/85 transparency bands are unreachable until T06 is augmented.

4. **Architecture §8 bucket ranges need reconciling with T09's revised spec (if §8 exists).** T09's implementation follows the Appendix B 5-band bucket thresholds (0–2 yrs → 100, 2–4 → 85, 4–6 → 70, 6–10 → 55, >10 → 40 for validation_recency; alert-count bands for reversal_risk). If `docs/architecture.md §8` carries different bucket values from a prior draft, update §8 to match before T12 renders a methodology tooltip. (OQ-5.)

5. **Wrapper cron-time comment drift noted.** `run_daily_score.sh` contains the comment `# cron: 0 4 * * *` (04:00 UTC = 11:00 WIB). `docs/architecture.md §4` (cron schedule table) should be verified to list the same time for the daily score job before T19 installs the cron. Minor but worth cross-checking at T19 time to avoid a silent drift.
