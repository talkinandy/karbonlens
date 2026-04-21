---
id: T09
title: Score computation daily job
phase: 2
status: draft
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

This job runs daily at 06:00 on the VPS, after the weekly Verra and GFW scrapers have had a
chance to deposit fresh data (cron schedule: `0 6 * * *` — see `docs/architecture.md §4`).

## 3. Scope

### In scope

1. **`scrapers/scoring/weights.py`** — central weight constants and methodology version string.
2. **`scrapers/scoring/compute.py`** — main job; entry point `python -m scrapers.scoring.compute`;
   flags `--project-id <uuid>` (single-project debug mode) and `--dry-run`.
3. **`lib/score.ts`** — TypeScript mirror of sub-score functions and `WEIGHTS` constants.
4. **`scrapers/scripts/run_daily_score.sh`** — bash wrapper for cron.

### Out of scope (explicit non-goals)

- Automated score regression tests — no tests in v0.1.
- Per-vintage scoring — scores are per-project for v0.1.
- Score history visualization — T12 may plot historical rows; T09 just writes them.
- User-configurable weight overrides — v0.2 admin UI concern.
- Aggregate "market-wide" summary row — T18 concern, not T09.
- Score methodology documentation page — future story.

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
Given Katingan-Peatland has a recent validation_date (< 3 years old),
      moderate satellite alert activity, and is listed on at least 2 registries
When  the daily score job runs
Then  SELECT integrity_score
      FROM project_scores
      WHERE project_id = (SELECT id FROM projects WHERE slug = 'katingan-peatland')
        AND score_date = CURRENT_DATE
      returns a value BETWEEN 75 AND 85
```

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
Then  the JSONB object contains all of:
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
- `projects` table — source of all project IDs, slugs, and `validation_date`.
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

**Files T09 must NOT touch:**
- `lib/schema.ts`
- `lib/db.ts`
- `lib/auth.ts`
- Any existing migration file.

## 7. Edge cases & failure modes

**E1 — New project with no satellite alerts**
`reversal_score = 100`. No alerts in 90 days means no known deforestation signal — the framework
treats absence of negative evidence as maximum trust for reversal. This is intentional and should
be documented in a comment in `compute.py`: "absence of evidence is not evidence of absence; this
is a first-pass heuristic that calibrates over time."

**E2 — Project with `validation_date` NULL**
`validation_recency_score = 50` (unknown-neutral). Do NOT return 0 or a low score. Log at
`DEBUG` level: "validation_date is NULL for project <id>; returning neutral score 50."

**E3 — Project with zero registries**
Theoretically impossible after T06 runs (Verra inserts at least one registry per project), but
the code must handle it gracefully. `transparency_score = 40`. Emit a `WARNING` log:
"project <id> has 0 registries; returning minimum transparency score."

**E4 — Very old validation (> 15 years ago)**
`validation_recency_score = 30` (the floor). The bucket logic bottoms out at `else: 30` for
`years_since >= 12`. There is no lower floor needed.

**E5 — Slug mismatch in COMMUNITY_OVERRIDES**
If a slug in `COMMUNITY_OVERRIDES` does not match any `projects.slug` (and the ILIKE fallback on
`name_canonical` also fails), log a `WARNING`: "community override '<slug>' listed but no
matching project in DB." The override is silently ignored; the project scores at the default 75.
Do not raise an error or abort the run.

**E6 — Concurrent T06/T07 writes**
Score job runs at 06:00; scrapers run earlier (02:00, 03:00). Window overlap is unlikely and not
a hard isolation concern for v0.1. Document this assumption in a comment.

**E7 — `--project-id` flag with unknown UUID**
Log an error and exit non-zero: "project <uuid> not found in projects table."

## 8. Definition of done

Standard checklist from `docs/stories/README.md`, plus:

- [ ] All 10 acceptance criteria pass.
- [ ] `WEIGHTS` constants exist in both `scrapers/scoring/weights.py` and `lib/score.ts` with
      identical numeric values (hand-verified, not automated).
- [ ] Every 4 sub-score function has mirrored logic between Python and TypeScript
      (hand-verified; no automated cross-check in v0.1).
- [ ] `lib/score.ts` begins with the sync comment (see §3 below).
- [ ] `scrapers/scoring/compute.py` begins with the sync comment.
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
- **OQ-3 (Andy):** Confirm the reversal alert thresholds: `0 alerts → 100`,
  `no high-conf and < 10 → 85`, `high_conf < 5 → 70`, `high_conf < 20 → 45`, `else → 20`.
- **OQ-4:** Should the score job emit a notification when a project's `integrity_score`
  drops significantly (e.g., > 10 points) day-over-day? Current answer: NO for v0.1 —
  notification triggers are T16/T17 scope.

## 10. References

- PRD §6.1 — Score methodology is a framework, not a formula
- `docs/architecture.md` §3 — `project_scores` table DDL
- `docs/architecture.md` §8 — Score methodology v1 component definitions
- `docs/architecture.md` §4 — Cron schedule (`0 6 * * *` for score job)
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

### reversal_score(alerts_90d_count, high_conf_count) → int (0–100)
```python
if alerts_90d_count == 0:
    return 100  # no signal; see edge case E1
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
COMMUNITY_OVERRIDES = {
    'rimba-raya':                              45,   # documented community tension
    'cendrawasih-aru':                         30,   # documented concerns
    'kalimantan-forest-carbon-partnership':    60,   # OQ-1: confirm with Andy
}
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
```

### components JSONB payload (AC-7)
```python
components = {
    'alerts_90d_count':       alerts_90d_count,
    'high_conf_count':        high_conf_count,
    'registry_count':         registry_count,
    'years_since_validation': round(years_since, 2) if validation_date else None,
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

export const WEIGHTS = {
  validationRecency: 0.25,
  reversalRisk:      0.35,
  communityFlags:    0.20,
  transparency:      0.20,
} as const;

export const METHODOLOGY_VERSION = 'v1';

export interface ScoreComponents {
  alerts90dCount:        number;
  highConfCount:         number;
  registryCount:         number;
  yearssinceValidation:  number | null;
}

export function validationRecencyScore(validationDate: Date | null): number
export function reversalScore(alerts90dCount: number, highConfCount: number): number
export function communityScore(projectSlug: string): number
export function transparencyScore(registryCount: number, activeStatuses: number): number
export function integrityScore(components: ScoreComponents): number
```

`communityScore` reads a TS-literal mirror of `COMMUNITY_OVERRIDES` defined in the same file.
`integrityScore` uses `WEIGHTS` and clamps the result to [0, 100].

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

Installed in cron at `0 6 * * * karbonlens /opt/karbonlens/scrapers/scripts/run_daily_score.sh`
(see `docs/architecture.md §4` for the full crontab).
