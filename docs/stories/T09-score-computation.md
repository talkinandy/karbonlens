---
id: T09
title: Score computation daily job
phase: 2
status: audited
blocked_by: [T06, T07]
blocks: [T12, T18]
owner: unassigned
effort_estimate: 2h
---

## 1. User story

As a KarbonLens user, I want each project to display an integrity score based on current
registry, satellite, and validation data, so that I can quickly assess project quality without
reading multiple source documents.

## 2. Context & rationale

`project_scores` is the table that T12 (project detail) and T18 (landing stats) read for display.
Without it, those screens have no score component to render.

Score methodology is explicitly a **framework, not a locked formula** (PRD §6.1). The four
sub-scores (validation recency, reversal risk, community flags, transparency) are combined with
configurable weights stored in a constants file. They are labeled "v1 methodology, calibrating"
in the UI and will be iterated as buyer feedback comes in.

T09 also creates `lib/score.ts`, the TypeScript mirror of the Python scoring logic, so the
frontend can recompute and display per-component breakdowns without an extra DB round-trip. Both
files are owned by T09 and must stay in sync from day one.

This job runs daily at **04:00 VPS time**, after the weekly Verra and GFW scrapers have had a
chance to deposit fresh data (T19 installs crons at 03:00 Mon for Verra and 03:30 Mon for GFW).
No write contention exists: scoring reads are non-conflicting with scraper writes.

## 3. Scope

### In scope

1. **`scrapers/scoring/weights.py`** — central weight constants and methodology version string.
2. **`scrapers/scoring/compute.py`** — main job; entry point `python -m scrapers.scoring.compute`;
   flags `--project-id <uuid>` (single-project debug mode) and `--dry-run`.
3. **`lib/score.ts`** — TypeScript mirror of sub-score functions, `WEIGHTS` constants, and the
   canonical `ScoreComponents` type (see below).
4. **`scrapers/scripts/run_daily_score.sh`** — bash wrapper for cron.

### `ScoreInputs` vs `ScoreComponents` — type naming

- **`ScoreInputs`** — T09's Python/TS-internal type carrying the **raw inputs** used to compute
  sub-scores: `alerts_90d_count`, `high_conf_count`, `registry_count`,
  `years_since_validation`. This type is an implementation detail of `compute.py` and
  `lib/score.ts`; it is NOT exported from `lib/schema.ts`.

- **`ScoreComponents`** — the **canonical type** exported from `lib/score.ts`. It contains the
  four sub-scores that match the `project_scores.components` JSONB column, plus an `inputs`
  sub-object for raw provenance. Shape:

  ```json
  {
    "validation_recency": 85,
    "reversal_risk":      70,
    "community_flags":    75,
    "transparency":       85,
    "inputs": {
      "alerts_90d_count":        0,
      "high_conf_count":         0,
      "registry_count":          2,
      "years_since_validation":  11
    }
  }
  ```

  Both Python (`compute.py`) and TypeScript (`lib/score.ts`) must produce and consume this
  identical shape.

### Cross-file schema update (acceptable scope bleed — minimal)

`lib/schema.ts` (T04) already defines a placeholder `ScoreComponents` type at line 229 with a
comment explicitly deferring to T09: *"If/when `lib/score.ts` lands with a canonical
ScoreComponents interface, swap this in."* T09 must honour this handoff:

> **T09 may modify `lib/schema.ts` ONLY to: (a) add `import type { ScoreComponents } from
> './score'` at the top of the file, and (b) remove the inline `ScoreComponents` type alias at
> lines 229–237.** No other change to `lib/schema.ts` is permitted. This is a one-line import
> and a 9-line deletion — a single, reviewable diff hunk.

### Out of scope (explicit non-goals)

- Automated score regression tests — no tests in v0.1.
- Per-vintage scoring — scores are per-project for v0.1.
- Score history visualization — T12 may plot historical rows; T09 just writes them.
- User-configurable weight overrides — v0.2 admin UI concern.
- Aggregate "market-wide" summary row — T18 concern, not T09.
- Score methodology documentation page — future story.
- Python dependency management — `pyproject.toml` is owned by T06; T09 uses only psycopg + stdlib.

## 4. Acceptance criteria (Gherkin)

**AC-1: Dry-run exits cleanly without writing**
```
Given the database has at least one project
When  python -m scrapers.scoring.compute --dry-run
Then  structured JSON log lines are emitted showing would-be scores
And   no rows are inserted or updated in project_scores
And   the process exits with code 0
```

**AC-2: Full run covers every project**
```
Given N rows in the projects table
When  python -m scrapers.scoring.compute completes
Then  SELECT COUNT(*) FROM project_scores WHERE score_date = CURRENT_DATE
      returns N
And   the process exits with code 0
```

**AC-3: Same-day re-run is idempotent**
```
Given a full run has already completed today
When  python -m scrapers.scoring.compute is run again
Then  SELECT COUNT(*) FROM project_scores WHERE score_date = CURRENT_DATE
      still returns N (unchanged)
And   score values may change if underlying data changed, but no duplicate rows appear
```

**AC-4: Katingan score lands in expected range**
```
Given Katingan-Peatland has a validation_date roughly 11-13 years ago,
      low-to-moderate satellite alert activity, and is listed on at least 2 registries
When  the daily score job runs
Then  SELECT integrity_score
      FROM project_scores
      WHERE project_id = (SELECT id FROM projects WHERE slug = 'katingan-peatland')
        AND score_date = CURRENT_DATE
      returns a value BETWEEN 60 AND 85
```
*(Range widened from 75–85 to 60–85 to accommodate Katingan's ~13-year-old validation date,
which places it in the `8–12 → 50` or `>= 12 → 30` recency bucket depending on exact date.
Actual range narrows once OQ-2 thresholds are confirmed and the real `validation_date` is
ingested by T06.)*

**AC-5: Rimba Raya community flag drags score down**
```
Given Rimba Raya matches the COMMUNITY_OVERRIDES entry (community_score = 45)
When  the daily score job runs
Then  SELECT integrity_score
      FROM project_scores
      WHERE project_id = (SELECT id FROM projects WHERE slug = 'rimba-raya')
        AND score_date = CURRENT_DATE
      returns a value BETWEEN 50 AND 65
```

**AC-6: All scores are clamped to [0, 100]**
```
Given the job has run for today
When  SELECT MIN(integrity_score), MAX(integrity_score)
      FROM project_scores WHERE score_date = CURRENT_DATE
Then  MIN >= 0 AND MAX <= 100
```

**AC-7: components JSONB is fully populated**
```
Given the job has run for today
When  SELECT components FROM project_scores WHERE score_date = CURRENT_DATE LIMIT 1
Then  the JSONB object contains top-level keys:
        validation_recency  (integer)
        reversal_risk       (integer)
        community_flags     (integer)
        transparency        (integer)
      and an "inputs" sub-object with:
        alerts_90d_count      (integer)
        high_conf_count       (integer)
        registry_count        (integer)
        years_since_validation (numeric or null)
```

**AC-8: methodology_version is 'v1' for every row**
```
Given the job has run for today
When  SELECT COUNT(*) FROM project_scores
      WHERE score_date = CURRENT_DATE AND methodology_version <> 'v1'
Then  result is 0
```

**AC-9: TypeScript mirror compiles cleanly and exports identical weights**
```
Given lib/score.ts has been added to the repo
When  npx tsc --noEmit
Then  the command exits 0 (no type errors)
And   WEIGHTS exported from lib/score.ts has the same four numeric values
      as WEIGHTS in scrapers/scoring/weights.py (hand-verified)
```

**AC-10: Python linter passes**
```
Given scrapers/scoring/ contains compute.py and weights.py
When  ruff check scrapers/
Then  the command exits 0 with no reported issues
```

## 5. Inputs & outputs

**Inputs:**
- `DATABASE_URL` — psycopg connection string to the Postgres database.
- `projects` table — source of all project IDs, slugs, `validation_date`, and `gfw_geostore_id`.
- `satellite_alerts` table — alert counts for `reversal_score` computation.
- `registries` table — registry count and active-status count for `transparency_score`.

**Outputs:**
- Rows upserted into `project_scores` (one row per project per `score_date`).
- `lib/score.ts` — new file on the TypeScript side, consumed by T12 and T18.
- No new migration is needed; `project_scores` already exists in `001_init.sql`.

## 6. Dependencies & interactions

**Blocked by:**
- T06 (Verra scraper) — `projects`, `registries`, and `validation_date` must be populated.
- T07 (GFW scraper) — `satellite_alerts` must be populated for meaningful `reversal_score`.

**Blocks:**
- T12 (project detail screen) — reads `project_scores` and calls `lib/score.ts` for
  sub-component bar display.
- T18 (landing page live stats) — may surface aggregate score stats.

**Shared helpers used (read-only):**
- `scrapers/common/db.py` — psycopg connection helper.
- `scrapers/common/config.py` — env var loader.
- `scrapers/common/logging.py` — structlog JSON formatter.

**Files owned by T09 (do not create or modify in parallel tasks):**
- `scrapers/scoring/compute.py` (NEW)
- `scrapers/scoring/weights.py` (NEW)
- `scrapers/scoring/__init__.py` (NEW — empty, makes it a package)
- `scrapers/scripts/run_daily_score.sh` (NEW)
- `lib/score.ts` (NEW)

**Files T09 must NOT touch (except as noted):**
- `lib/schema.ts` — **exception**: T09 may make one targeted change: import `ScoreComponents`
  from `./score` and remove the inline placeholder type. No other edits permitted.
- `lib/db.ts`
- `lib/auth.ts`
- Any existing migration file.

## 7. Edge cases & failure modes

**E1 — New project with no satellite alerts AND satellite coverage exists**
`reversal_score = 100`. No alerts in 90 days means no known deforestation signal — the framework
treats absence of negative evidence as maximum trust for reversal. This applies only when
`projects.gfw_geostore_id IS NOT NULL` (i.e., the GFW scraper has attempted coverage for this
project). This is intentional and should be documented in a comment in `compute.py`:
"absence of evidence is not evidence of absence; this is a first-pass heuristic that calibrates
over time."

**E1a — Project with no satellite coverage (`gfw_geostore_id IS NULL`)**
`reversal_score = 50` (unknown-neutral). The GFW scraper never attempted this project; returning
100 would misrepresent absence-of-coverage as a clean signal. Mirrors the `validation_date IS
NULL → 50` pattern from E2.

**E2 — Project with `validation_date` NULL**
`validation_recency_score = 50` (unknown-neutral). Do NOT return 0 or a low score. Log at
`DEBUG` level: "validation_date is NULL for project <id>; returning neutral score 50."

**E3 — Project with zero registries**
Theoretically impossible after T06 runs (Verra inserts at least one registry per project), but
the code must handle it gracefully. `transparency_score = 40`. Emit a `WARNING` log:
"project <id> has 0 registries; returning minimum transparency score."

Additionally, cap `integrity_score ≤ 60` when `registry_count == 0`. Apply this clamp AFTER the
weighted composite: `integrity_score = min(integrity_score, 60)`. Document in a comment:
"zero-registry cap: insufficient data coverage; clamping final score to 60."

**E4 — Very old validation (> 15 years ago)**
`validation_recency_score = 30` (the floor). The bucket logic bottoms out at `else: 30` for
`years_since >= 12`. There is no lower floor needed.

**E5 — Slug mismatch in COMMUNITY_OVERRIDES**
If a slug in `COMMUNITY_OVERRIDES` does not match any `projects.slug` (and the ILIKE fallback on
`name_canonical` also fails), log a `WARNING`: "community override '<slug>' listed but no
matching project in DB." The override is silently ignored; the project scores at the default 75.
Do not raise an error or abort the run.

**E6 — Concurrent T06/T07 writes**
Score job runs at 04:00 VPS time; Verra scraper runs at 03:00 Mon and GFW scraper at 03:30 Mon
(T19 installs these crons). The score job starts after scraper cadence completes. Window overlap
is unlikely and not a hard isolation concern for v0.1. Document this assumption in a comment.

**E7 — `--project-id` flag with unknown UUID**
Log an error and exit non-zero: "project <uuid> not found in projects table."

**E8 — Future v2 methodology**
If a future v2 methodology adds a new `methodology_version` value, v1 rows in `project_scores`
are preserved untouched (the composite PK includes `score_date`, not `methodology_version`).
V2 is implemented as a new migration (adding a `methodology_version` column index or a
separate table) or as an app-side branch in `compute.py`. Old v1 rows remain queryable and
the UI can filter by `methodology_version` to display the correct label.

## 8. Definition of done

Standard checklist from `docs/stories/README.md`, plus:

- [ ] All 10 acceptance criteria pass.
- [ ] `WEIGHTS` constants exist in both `scrapers/scoring/weights.py` and `lib/score.ts` with
      identical numeric values (hand-verified, not automated).
- [ ] Every 4 sub-score function has mirrored logic between Python and TypeScript
      (hand-verified; no automated cross-check in v0.1).
- [ ] `lib/score.ts` begins with the sync comment (see §3 below).
- [ ] `scrapers/scoring/compute.py` begins with the sync comment.
- [ ] `COMMUNITY_OVERRIDES` dict is in `scrapers/scoring/weights.py` and mirrored in
      `lib/score.ts` — both files updated in sync whenever overrides change.
- [ ] Story's files landed on `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] `TASKS.md` T09 status flipped `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

## 9. Open questions

- **OQ-1 (Andy):** Confirm the `COMMUNITY_OVERRIDES` dict. Current placeholders are
  `rimba-raya: 45`, `cendrawasih-aru: 30`, `kalimantan-forest-carbon-partnership: 60`. Are
  these the right projects and right values? Add or remove before implementing.
- **OQ-2 (Andy):** Confirm the validation_recency bucket thresholds: `< 3 years → 100`,
  `3–5 → 85`, `5–8 → 70`, `8–12 → 50`, `>= 12 → 30`. These are first-pass estimates from
  PRD §6.1's "calibrate over time" intent.
- **OQ-3 (Andy):** Confirm the reversal alert thresholds: `0 alerts (with geostore_id) → 100`,
  `no high-conf and < 10 → 85`, `high_conf < 5 → 70`, `high_conf < 20 → 45`, `else → 20`.
  No geostore_id → 50 (unknown-neutral).
- **OQ-4:** Should the score job emit a notification when a project's `integrity_score`
  drops significantly (e.g., > 10 points) day-over-day? Current answer: NO for v0.1 —
  notification triggers are T16/T17 scope. The `(project_id, score_date)` composite PK
  retains daily history, making the delta query trivially available when T16 is built.
- **OQ-5 (architecture reconciliation):** `docs/architecture.md §8` uses different bucket
  ranges and band counts than T09 Appendix B (4 bands vs 5 bands; different boundary years).
  After OQ-2 and OQ-3 are confirmed by Andy, architecture §8 must be updated to match the
  Appendix B discrete values before T12 builds its methodology display component. Not a T09
  implementation blocker.

## 10. References

- PRD §6.1 — Score methodology is a framework, not a formula
- `docs/architecture.md` §3 — `project_scores` table DDL
- `docs/architecture.md` §8 — Score methodology v1 component definitions (see OQ-5)
- `docs/architecture.md` §4 — Cron schedule
- `scrapers/migrations/001_init.sql` — `project_scores` DDL (lines 154–165)
- `TASKS.md` T09 — task brief and TASKS.md notes

---

## Appendix A — Implementation detail for `scrapers/scoring/weights.py`

```python
# KEEP IN SYNC WITH lib/score.ts AND scrapers/scoring/compute.py

WEIGHTS = {
    'validation_recency': 0.25,
    'reversal_risk':      0.35,
    'community_flags':    0.20,
    'transparency':       0.20,
}
VERSION = 'v1'

COMMUNITY_OVERRIDES = {
    'rimba-raya':                              45,   # documented community tension
    'cendrawasih-aru':                         30,   # documented concerns
    'kalimantan-forest-carbon-partnership':    60,   # OQ-1: confirm with Andy
}
```

---

## Appendix B — Sub-score logic for `scrapers/scoring/compute.py`

File header:
```python
# KEEP IN SYNC WITH lib/score.ts AND scrapers/scoring/weights.py
```

### validation_recency_score(validation_date) → int (0–100)
```python
if validation_date is None:
    return 50  # unknown → neutral; see edge case E2
years_since = (date.today() - validation_date).days / 365.25
if years_since < 3:
    return 100
elif years_since < 5:
    return 85
elif years_since < 8:
    return 70
elif years_since < 12:
    return 50
else:
    return 30  # floor; see edge case E4
```

### reversal_score(alerts_90d_count, high_conf_count, gfw_geostore_id) → int (0–100)
```python
if gfw_geostore_id is None:
    return 50  # no satellite coverage attempted → unknown-neutral; see edge case E1a
if alerts_90d_count == 0:
    return 100  # coverage exists, no signal; see edge case E1
elif high_conf_count == 0 and alerts_90d_count < 10:
    return 85
elif high_conf_count < 5:
    return 70
elif high_conf_count < 20:
    return 45
else:
    return 20
```

### community_score(slug, name_canonical) → int (0–100)
```python
from scrapers.scoring.weights import COMMUNITY_OVERRIDES
# Exact slug match first; ILIKE fallback on name_canonical via SQL if slug misses.
# If neither matches, return 75 and log WARNING (see edge case E5).
```

### transparency_score(registry_count, active_statuses) → int (0–100)
```python
if registry_count >= 2 and active_statuses >= 1:
    return 85
elif registry_count == 1 and active_statuses == 1:
    return 70
elif registry_count >= 1:
    return 55
else:
    return 40  # see edge case E3
```

### integrity_score composite
```python
from scrapers.scoring.weights import WEIGHTS

raw = (
    validation_recency_score * WEIGHTS['validation_recency'] +
    reversal_score           * WEIGHTS['reversal_risk']      +
    community_score          * WEIGHTS['community_flags']    +
    transparency_score       * WEIGHTS['transparency']
)
integrity_score = max(0, min(100, round(raw)))

# Zero-registry cap: insufficient data coverage (see edge case E3)
if registry_count == 0:
    integrity_score = min(integrity_score, 60)
```

### components JSONB payload (AC-7)
```python
components = {
    'validation_recency': validation_recency_score,
    'reversal_risk':      reversal_score,
    'community_flags':    community_score,
    'transparency':       transparency_score,
    'inputs': {
        'alerts_90d_count':        alerts_90d_count,
        'high_conf_count':         high_conf_count,
        'registry_count':          registry_count,
        'years_since_validation':  round(years_since, 2) if validation_date else None,
    },
}
```

### DB upsert pattern
```sql
INSERT INTO project_scores
  (project_id, score_date, integrity_score, validation_recency_score,
   reversal_score, community_score, transparency_score, components, methodology_version)
VALUES (%s, CURRENT_DATE, %s, %s, %s, %s, %s, %s, 'v1')
ON CONFLICT (project_id, score_date) DO UPDATE SET
  integrity_score          = EXCLUDED.integrity_score,
  validation_recency_score = EXCLUDED.validation_recency_score,
  reversal_score           = EXCLUDED.reversal_score,
  community_score          = EXCLUDED.community_score,
  transparency_score       = EXCLUDED.transparency_score,
  components               = EXCLUDED.components,
  methodology_version      = EXCLUDED.methodology_version;
```

---

## Appendix C — `lib/score.ts` interface sketch

```typescript
// KEEP IN SYNC WITH scrapers/scoring/weights.py AND scrapers/scoring/compute.py
// Including COMMUNITY_OVERRIDES — update both files together when overrides change.

export const WEIGHTS = {
  validationRecency: 0.25,
  reversalRisk:      0.35,
  communityFlags:    0.20,
  transparency:      0.20,
} as const;

export const METHODOLOGY_VERSION = 'v1';

/** Raw inputs used to derive sub-scores — internal to compute pipeline. */
export interface ScoreInputs {
  alerts90dCount:       number;
  highConfCount:        number;
  registryCount:        number;
  yearsSinceValidation: number | null;  // camelCase, no typo
}

/**
 * Canonical shape of project_scores.components JSONB.
 * lib/schema.ts imports this type and removes its inline placeholder.
 */
export interface ScoreComponents {
  validation_recency: number;
  reversal_risk:      number;
  community_flags:    number;
  transparency:       number;
  inputs: {
    alerts_90d_count:        number;
    high_conf_count:         number;
    registry_count:          number;
    years_since_validation:  number | null;
  };
}

export const COMMUNITY_OVERRIDES: Record<string, number> = {
  'rimba-raya':                           45,
  'cendrawasih-aru':                      30,
  'kalimantan-forest-carbon-partnership': 60,
};

export function validationRecencyScore(validationDate: Date | null): number
export function reversalScore(alerts90dCount: number, highConfCount: number, gfwGeostoreId: string | null): number
export function communityScore(projectSlug: string): number
export function transparencyScore(registryCount: number, activeStatuses: number): number
export function integrityScore(inputs: ScoreInputs, communitySlug: string, gfwGeostoreId: string | null): ScoreComponents
```

`communityScore` reads the TS-literal `COMMUNITY_OVERRIDES` defined in the same file.
`integrityScore` uses `WEIGHTS`, applies the zero-registry cap (`registry_count == 0 → clamp ≤ 60`),
clamps the final result to [0, 100], and returns the full `ScoreComponents` object.

---

## Appendix D — `scrapers/scripts/run_daily_score.sh`

```bash
#!/bin/bash
set -euo pipefail
source /opt/karbonlens/.env
cd /opt/karbonlens
/opt/karbonlens/scrapers/.venv/bin/python -m scrapers.scoring.compute \
  >> /var/log/karbonlens/score.log 2>&1
```

Installed in cron at `0 4 * * * karbonlens /opt/karbonlens/scrapers/scripts/run_daily_score.sh`
(04:00 VPS time, after weekly scraper cadence — see §2 and T19 for full crontab).
