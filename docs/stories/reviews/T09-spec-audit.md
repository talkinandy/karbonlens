# Spec Audit — T09: Score Computation Daily Job

**Auditor:** adversarial spec-auditor agent
**Date:** 2026-04-19
**Story under review:** `docs/stories/T09-score-computation.md`
**Verdict:** CONDITIONAL PASS — 1 blocking issue, 7 non-blocking issues. Implement only after B-1 is resolved and OQ-1/OQ-2/OQ-3 are answered by Andy.

---

## Summary

| Severity | Count |
|---|---|
| BLOCKING | 1 |
| NON-BLOCKING (high) | 4 |
| NON-BLOCKING (low) | 3 |
| Open questions awaiting Andy | 3 (OQ-1, OQ-2, OQ-3) |

---

## Blocking Issues

### B-1 — `ScoreComponents` type conflict between `lib/schema.ts` (T04) and `lib/score.ts` (T09)

**Impact:** Type collision at merge time; one of the two definitions will silently win, making T12 frontend consumption unreliable.

`lib/schema.ts` (T04, lines 229–237) already defines a `ScoreComponents` type:

```typescript
export type ScoreComponents = {
  integrity?: number;
  validationRecency?: number;
  reversal?: number;
  community?: number;
  transparency?: number;
  notes?: string;
  [key: string]: unknown;
};
```

T09's Appendix C defines a **different** `ScoreComponents` interface in `lib/score.ts`:

```typescript
export interface ScoreComponents {
  alerts90dCount:        number;
  highConfCount:         number;
  registryCount:         number;
  yearssinceValidation:  number | null;   // note: typo — should be yearsSinceValidation
}
```

These are structurally incompatible. The T04 shape carries score component *values* (sub-scores). The T09 shape carries score component *inputs* (raw data). T12 and T18, which read `project_scores.components`, will be consuming the T04 shape through the Drizzle ORM (`.$type<ScoreComponents>()`). If T09 exports a conflicting `ScoreComponents`, consumers that import from `lib/score.ts` will get one shape while those using the Drizzle query result get another.

The T04 comment in `lib/schema.ts` at line 226 even anticipates this: *"If/when `lib/score.ts` lands with a canonical `ScoreComponents` interface, swap this in."* T09 must honor this handoff contract.

**Required actions before implementation:**

1. T09 must rename its input-data interface to `ScoreInputs` (or `ScoreComponentInputs`) to avoid the name collision.
2. T09 must define a `ScoreComponents` interface that **replaces** the T04 placeholder — with both the raw-input fields (from Appendix C) AND per-component scores if T12 expects them. Or T09 must coordinate with T12 about which shape `project_scores.components` actually stores.
3. T09 must update `lib/schema.ts`'s `$type<ScoreComponents>()` binding to point to the canonical type from `lib/score.ts` (as T04 anticipated). This requires a coordinated touch of `lib/schema.ts` — which the T09 spec currently lists as a file T09 "must NOT touch."

**The "must NOT touch `lib/schema.ts`" constraint is incorrect for v0.1 given that T04 explicitly deferred the type definition to T09.** The constraint must be relaxed to allow a single targeted update: swapping the `ScoreComponents` type alias.

**Additional bug:** `yearssinceValidation` in Appendix C is a typo — should be `yearsSinceValidation`. Must be fixed before implementing.

---

## Non-Blocking Issues (High)

### NB-H1 — Zero-data trap: `reversal_score = 100` for a project with 0 alerts AND 0 registries produces a misleadingly high composite score

**Impact:** Integrity score inflation for projects with no data, undermining the platform's credibility with sophisticated buyers.

Per Appendix B edge case E1: a new project with 0 satellite alerts gets `reversal_score = 100`. Per E3: a project with 0 registries gets `transparency_score = 40`. The composite for such a project:

```
integrity = 50 × 0.25 + 100 × 0.35 + 75 × 0.20 + 40 × 0.20
          = 12.5 + 35.0 + 15.0 + 8.0 = 70.5 → rounds to 71
```

A score of 71 for a project with literally zero data signals — no satellite coverage, no registries — is not just miscalibrated; it actively misleads buyers. The spec's comment "absence of evidence is not evidence of absence" is philosophically defensible for the *reversal* component alone, but it should not cascade into a high composite when *all* data is absent.

**Recommended mitigation (for Andy's review before OQ-3 is closed):**

Option A (preferred): If `registry_count == 0`, set `community_score = 50` (not 75 default) AND cap `integrity_score ≤ 60`, regardless of other component values. Document the cap as "insufficient data coverage."

Option B: Add a fifth implicit component `data_completeness` (0 or 1) that gates the final score: `if registry_count == 0 and geostore_id IS NULL: integrity_score = min(integrity_score, 55)`.

Option C: Change E1 so `reversal_score = 100` only applies when the project has `gfw_geostore_id IS NOT NULL` (i.e., satellite coverage was actually attempted). If the scraper never ran for this project, `reversal_score = 50` (unknown-neutral, mirroring the `validation_date IS NULL` pattern in E2).

The spec should surface this as a calibration concern with a recommended interim cap rather than leaving the 71-for-no-data case as silent behavior.

### NB-H2 — Python ↔ TypeScript weight parity: hand-maintenance warning is present but no merge-time cross-check exists

**Impact:** Silent drift between `weights.py` and `lib/score.ts` after the first post-v0.1 weight change.

Both files carry the `# KEEP IN SYNC WITH` comment (spec Appendix A, B, C — good). AC-9 requires hand-verification. But neither the spec nor the DoD provides a concrete command the reviewer can run at merge time to catch a numeric divergence.

**Recommended one-liner to document in the DoD and AC-9:**

```bash
python3 -c "
import importlib.util, json, re
spec = importlib.util.spec_from_file_location('w', 'scrapers/scoring/weights.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
py_w = mod.WEIGHTS
ts = open('lib/score.ts').read()
ts_vals = re.findall(r'(?:validationRecency|reversalRisk|communityFlags|transparency):\s*([\d.]+)', ts)
print('Python:', list(py_w.values()), 'TS:', [float(v) for v in ts_vals])
"
```

This is not a unit test — it is a 10-second manual audit step. The spec should include it (or equivalent) in Appendix A or AC-9 commentary so the reviewer does not have to invent it.

### NB-H3 — Methodology thresholds diverge between architecture §8 and spec Appendix B

**Impact:** Implementer confusion; the frontend (T12) reading architecture §8 will display different bucket descriptions than what the Python job actually computes.

Architecture §8 defines:
- Validation recency: `< 3 years → 90–100`, `3–5 → 60–89`, `5–8 → 30–59`, `>8 → 0–29`
- Reversal risk: `0 alerts → 90–100`, `1–5 nominal → 70–89`, `6–15 or any high-conf → 40–69`, `>15 or active fire → 0–39`

T09 Appendix B defines:
- Validation recency: `< 3 years → 100`, `3–5 → 85`, `5–8 → 70`, `8–12 → 50`, `>= 12 → 30`
- Reversal: `0 alerts → 100`, `no-high-conf + <10 → 85`, `high_conf < 5 → 70`, `high_conf < 20 → 45`, `else → 20`

These are materially different. The architecture §8 bands overlap the spec's discrete steps. Architecture §8 also uses `>8 years` as the lowest validation bucket; the spec uses `>= 12` with a separate `8–12 → 50` bucket (5 bands vs 4 bands).

**Required action:** T09 implementer must resolve the discrepancy with Andy. The T09 Appendix B logic will be what runs. Architecture §8 should be updated to match (or flagged as pre-implementation pseudocode that was superseded). This is a documentation integrity issue that will confuse T12 (frontend methodology display).

### NB-H4 — AC-4 and AC-5 score ranges depend on unconfirmed OQ-1/OQ-2/OQ-3 answers

**Impact:** AC-4 (Katingan 75–85) and AC-5 (Rimba Raya 50–65) are unverifiable until Andy confirms the bucket thresholds (OQ-2, OQ-3) and community overrides (OQ-1).

Katingan score computation (assuming OQ-2 thresholds, recent validation ~2013-2015, so ~11–13 years since validation):
- `validation_recency_score`: ~11 years → `50` (bucket `8–12 → 50`) or `30` (if `>= 12`)
- `reversal_score`: moderate alerts → likely `70` (if `high_conf < 5`) or `45`
- `community_score`: 75 (default — Katingan not in COMMUNITY_OVERRIDES)
- `transparency_score`: 2 registries + active → 85

With `validation_recency = 50`, `reversal = 70`, `community = 75`, `transparency = 85`:
```
integrity = 50×0.25 + 70×0.35 + 75×0.20 + 85×0.20
          = 12.5 + 24.5 + 15.0 + 17.0 = 69 → BELOW the 75 target
```

AC-4 requires 75–85. With these thresholds, Katingan would need `reversal_score = 85` (nearly zero alerts) AND `validation_recency ≥ 70` to reach 75. Given that Katingan's first validation was ~2013, it is now ~13 years ago → floor bucket (30). That pushes the score even lower:

```
integrity = 30×0.25 + 85×0.35 + 75×0.20 + 85×0.20
          = 7.5 + 29.75 + 15.0 + 17.0 = 69.25 → still below 75
```

**AC-4 is likely to fail with the specified thresholds unless Katingan has been re-validated recently (post-2021).** The audit cannot resolve this without knowing the actual Verra validation_date for Katingan. The spec must acknowledge this dependency and note that AC-4 may require threshold adjustment after first data ingestion.

---

## Non-Blocking Issues (Low)

### NB-L1 — `run_daily_score.sh` runs on `* * *` (every day), but GFW data arrives weekly

**Impact:** Monday-through-Saturday runs will score against stale GFW data. This is flagged in E6 as acceptable. Non-blocking. But the spec should explicitly note: daily scoring against weekly-refreshed alert data means Monday scores are the freshest; Sunday scores are 6 days stale. The UI's "v1, calibrating" label partially covers this, but a tooltip or methodology note should clarify the cadence mismatch to sophisticated users.

### NB-L2 — `COMMUNITY_OVERRIDES` is a Python dict inside `compute.py` but mirrored as a TS-literal in `lib/score.ts` — a third hand-maintenance surface

**Impact:** Three files now require manual sync: `weights.py`, `compute.py` (COMMUNITY_OVERRIDES), `lib/score.ts` (COMMUNITY_OVERRIDES mirror). The `KEEP IN SYNC` header comment covers `weights.py` and `compute.py` but Appendix C's `lib/score.ts` does not explicitly mention COMMUNITY_OVERRIDES sync. The DoD only mentions WEIGHTS sync. COMMUNITY_OVERRIDES drift will cause community scores to differ between the Python job (DB writes) and the TypeScript UI (display-only recomputation), producing a visible inconsistency in T12.

**Required action:** Add `COMMUNITY_OVERRIDES` to the DoD sync checklist explicitly, and ensure the `lib/score.ts` KEEP IN SYNC comment mentions it.

### NB-L3 — OQ-4 (score-drop notification) is correctly deferred to T16/T17 — but the data needed to compute day-over-day delta is never stored

**Impact:** When T16/T17 eventually want to implement score-drop notifications, the query requires yesterday's score. The schema stores one row per `(project_id, score_date)`, which supports the query. No action needed for T09. Flagged for completeness: the daily retention (one row/project/day) is the correct design for this future use case.

---

## Cross-Story Delta Summary

### `lib/schema.ts` (T04 — minor targeted update required by T09)

T09 must update the `$type<ScoreComponents>()` binding on `projectScores.components` to import from `lib/score.ts` once T09 defines the canonical interface. The current T04 placeholder comment at line 226–228 explicitly anticipates this handoff. The T09 spec must remove `lib/schema.ts` from its "must NOT touch" list and replace it with: "T09 may make one targeted change to `lib/schema.ts`: swap the inline `ScoreComponents` type alias for an import from `lib/score.ts`."

### `docs/architecture.md` §8 (documentation debt — update after T09 thresholds confirmed)

After Andy confirms OQ-2 and OQ-3, architecture §8's pseudocode bucket descriptions must be updated to match the Appendix B discrete values. This is not T09's implementation blocker, but it must happen before T12 builds the methodology display component.

---

## Positive Findings

- Idempotence: `ON CONFLICT (project_id, score_date) DO UPDATE` correctly matches the composite PK. Clean.
- Clamping: `max(0, min(100, round(raw)))` in Python + `check('integrity_score_range', ...)` in DB = double-enforced. Correct.
- `methodology_version = 'v1'` hardcoded string is the right approach for v0.1 — no premature enum.
- `--dry-run` and `--project-id` flags are well-specified with correct exit-code behavior.
- E2 (NULL validation_date → 50 neutral) mirrors the correct "unknown-neutral" pattern rather than penalizing missing data.
- E7 (`--project-id` unknown UUID → exit non-zero) is correct and explicit.
- File ownership is clearly demarcated with no conflicts against T06/T07/T08 file sets.
- `run_daily_score.sh` is minimal and correct. `set -euo pipefail` is present.
- Historical retention (40 projects × 365 days = 14,600 rows/year) is trivially small. No partitioning or retention policy needed for v0.1.
- OQ-4 correctly defers score-drop notifications to T16/T17 rather than scope-creeping into T09.
