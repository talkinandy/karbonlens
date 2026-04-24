# Spec Audit — T07: GFW Alerts Scraper

**Auditor:** adversarial spec-auditor agent
**Date:** 2026-04-19
**Story under review:** `docs/stories/T07-gfw-alerts-scraper.md`
**Verdict:** CONDITIONAL PASS — 3 blocking issues, 8 non-blocking issues. Do not implement until the three blocking items are resolved.

---

## Summary

| Severity | Count |
|---|---|
| BLOCKING | 3 |
| NON-BLOCKING (high) | 5 |
| NON-BLOCKING (low) | 3 |

---

## Blocking Issues

### B-1 — `satellite_alerts` dedupe strategy is ambiguous and unimplementable as written

**Location:** §3 scope ("Upsert") and §7 edge cases ("Duplicate alerts on re-run")

**Impact:** AC-6 (re-run does not duplicate alerts) cannot pass unless ONE dedupe strategy is mandated. The spec currently says:

> `INSERT ... ON CONFLICT DO NOTHING`. Since `satellite_alerts` has no unique constraint … use a SELECT-before-INSERT batch dedup **or** rely on geography type comparison (implementer's choice)

`ON CONFLICT DO NOTHING` requires a named unique constraint or unique index — without one, Postgres raises `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification`. The spec omits creating this constraint. "Geography type comparison" is not a valid Postgres conflict target. The SELECT-before-INSERT fallback is O(n×m) and will be catastrophic at 500 alerts × 40 projects = 20,000 round-trips.

**Required fix:** The spec must mandate one approach. The correct approach for v0.1 is:

Add to migration 002:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_sat_project_date_loc
  ON satellite_alerts (project_id, alert_date,
    ROUND(ST_Y(location::geometry)::NUMERIC, 6),
    ROUND(ST_X(location::geometry)::NUMERIC, 6));
```
Then the Python upsert becomes a clean `ON CONFLICT ON CONSTRAINT uq_sat_project_date_loc DO NOTHING`. Remove the "implementer's choice" language entirely. Note: `location` is a `GEOGRAPHY` type — a unique index directly on a geography column requires PostGIS 3.2+ and is non-standard. Using `ST_X`/`ST_Y` extracted and rounded to 6 decimal places (~0.1m precision) is the portable approach.

**Cross-story impact:** T09 score computation reads `satellite_alerts` and relies on accurate counts. Duplicate rows would silently inflate reversal scores.

---

### B-2 — Rate limiting: `sleep(1.0)` per project but each project makes 2 API calls

**Location:** §3 scope ("Rate limit") and AC-8

**Impact:** AC-3 already verifies `elapsed >= N seconds` where N = number of projects. But with 2 API calls per project (one geostore POST + one query GET), the actual call rate is 2 req/sec for multi-project runs, violating the GFW 1 req/sec limit documented in architecture §5.2. A 40-project run would fire 80 API calls in approximately 40 seconds — a guaranteed 429 storm after the first ~10 projects.

**Required fix:** Change the sleep strategy to `time.sleep(1.0)` **after each API call** (i.e., after the geostore POST and after the query GET separately), not once per project iteration. Update the spec text in §3 and update AC-8's verification formula to `elapsed >= 2*N seconds` for projects that require geostore registration, or `elapsed >= N seconds` for projects where geostore ID already exists (one call per project on repeat runs).

**Note:** On first run (all N projects need geostore registration): 2N seconds minimum. On repeat runs (geostore IDs cached): N seconds minimum. AC-8 currently only tests the repeat-run case and would pass incorrectly on a first run.

---

### B-3 — Notifications fan-out has no dedupe mechanism for new users / re-runs

**Location:** §3 scope ("Post-fetch notifications fan-out") and §9 OQ-4

**Impact:** The spec proposes a unique index `(user_id, project_id, type, DATE(created_at))` to deduplicate notifications, but:
1. This index is never actually specified as part of migration 002 or any other migration. It is only mentioned as a "suggested approach."
2. The `ON CONFLICT DO NOTHING` on the fan-out INSERT has no target constraint to resolve against — same problem as B-1. The INSERT will fail at runtime.
3. There is a **new-user retroactive spam problem**: a user who signs up 20 days after the scraper first ran will have `notifications` rows created for all 20 days of historical alerts on the next scraper run (their `notifications` table is empty, so all alerts inserted during all prior runs are "new" relative to the filter `ingested_at >= run_start_time`... actually the filter IS scoped to `run_start_time`, but the calendar-day dedup index would only protect same-calendar-day re-runs, not cross-day retroactive fan-out on signup).

**Required fix:** Mandate the unique index be added in migration 002:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_user_project_type_day
  ON notifications (user_id, project_id, type, DATE(created_at AT TIME ZONE 'Asia/Jakarta'));
```
Then the fan-out INSERT becomes `ON CONFLICT ON CONSTRAINT uq_notif_user_project_type_day DO NOTHING`. The retroactive spam issue is addressed by the per-day dedup: a new user on day 21 who triggers the scraper will get at most one notification per project per day — the daily granularity cap prevents backfill spam as long as the scraper runs at most once per day.

Document the chosen approach in the spec (remove "suggested approach" language).

---

## Non-Blocking Issues (High)

### N-1 — Migration 002: `schema_migrations` insert and ownership transfer not specified

**Location:** §3 scope item 1

**Impact:** Non-blocking but would produce an inconsistent state. The spec says migration 002 is idempotent (`ADD COLUMN IF NOT EXISTS`) and is verified by AC-1. However, the migration file spec does not explicitly require:
- `INSERT INTO schema_migrations (version) VALUES ('002') ON CONFLICT DO NOTHING;` — matches the pattern established by 001.
- `ALTER TABLE projects OWNER TO karbonlens;` — ownership is already set by 001 (the `GRANT ALL ... TO karbonlens` catch-all at the end of 001 covers new objects created by `karbonlens` user, but an `ALTER TABLE` migration applied by `postgres` superuser would transfer ownership back). Since 001's comment explicitly notes T07 adds `gfw_geostore_id`, the implementer should apply 002 as `karbonlens` user (not `postgres`) — spec AC-1 says `sudo -u postgres psql` which is inconsistent.

**Recommended fix:** Spec §3 item 1 should explicitly include the `schema_migrations` insert and clarify that migration 002 can be applied by the `karbonlens` role directly (no superuser needed — no new extensions, just `ALTER TABLE`). Update AC-1 to use `sudo -u karbonlens psql` or note that `karbonlens` user has sufficient rights.

---

### N-2 — `shapely` + `pyproj` dependency coordination is underspecified

**Location:** §6 "File ownership" and §9 OQ-1 / OQ-5

**Impact:** T06 owns `scrapers/pyproject.toml` (per T06's file-ownership table). T07 says "may append" with an unresolved "coordinate" instruction and two open questions (OQ-1 and OQ-5) that defer resolution to implementation time. This leaves the implementer without a deterministic instruction: if T06 has not landed, does T07 create a new `pyproject.toml`? T06 already initializes it with `uv init --no-workspace`. Running `uv init` again would fail or overwrite.

T06's `pyproject.toml` (as specified) does NOT include `shapely` or `pyproj`. So T07 will always need to add them via `uv add shapely pyproj`.

**Recommended fix:** Change §3 (or §6) to: "Run `uv add shapely pyproj` from the `scrapers/` directory. This appends to the `pyproject.toml` initialized by T06. If T06 has not landed, create a minimal `pyproject.toml` first with the deps in T06's spec §3.1, then add `shapely pyproj`. Do not re-run `uv init`." Version pins are not required for v0.1 since `uv.lock` pins transitively.

---

### N-3 — 5xx HTTP errors from GFW API have no handling

**Location:** §7 edge cases

**Impact:** The table covers 401 (hard fail), 429 (backoff+retry), geostore rejection, and network timeout — but not 5xx server errors. A transient GFW 502/503 during a 40-project run would either raise an unhandled exception (crashing the whole run) or silently continue with no data for that project depending on the `httpx` client's raise-on-status configuration.

**Recommended fix:** Add a row to the §7 edge case table:

| **GFW API 5xx** (server error) | Retry up to 3× with exponential backoff (2s, 4s, 8s). If still failing after 3 retries, log `{project_id, status_code, step}` at WARNING level, skip this project, continue loop. Do not exit non-zero unless ALL projects fail. |

---

### N-4 — GFW API response shape deferred entirely to implementation time

**Location:** §3 scope ("Geostore registration"), §7 ("GFW SQL column names changed"), §9 OQ-2 + OQ-3

**Assessment:** Architecture §5.2 is vague (`gfw_geostore_id` "implied"), and the spec correctly acknowledges the uncertainty in three places. The posture of "implementer probes at implementation time" is acceptable ONLY because:
1. The spec documents the `# FIXME: confirm column names` comment requirement.
2. §7 edge cases explicitly cover the column-name drift scenario.
3. OQ-2 and OQ-3 are explicitly open and visible.

This is acceptable for v0.1. However, the implementer MUST log `row[0].keys()` on every first run and include actual confirmed column names as a comment in the final committed code. **The `# FIXME` comment must not remain in committed production code** — the spec should state the implementer resolves it during development and replaces the FIXME with confirmed values.

**Recommended fix:** Add to §7 or §8 DoD: "The implementer confirms GFW column names via a live API probe before writing the parser. The `# FIXME` comment is removed and replaced with confirmed column names in the final commit."

---

### N-5 — Notifications fan-out SQL has a structural bug: `ROUND(COUNT(...))` pattern

**Location:** §3 scope, notifications SQL block

**Impact:** The SQL in the fan-out query uses:
```sql
ROUND(COUNT(sa.id)::NUMERIC, 2)::TEXT || ' alert(s) detected near ' || p.name_canonical
```
`COUNT()` always returns an integer — `ROUND(..., 2)` on an integer cast to NUMERIC adds unnecessary decimal places (e.g. "47.00 alert(s)"). This is a cosmetic bug that will look unprofessional in notifications. Additionally, `batch` is a subquery joined via `CROSS JOIN` but `batch` already groups by `project_id` and uses `alert_count` — the outer `COUNT(sa.id)` references `sa` which is not in scope after the subquery. The SQL as written will fail with `ERROR: missing FROM-clause entry for table "sa"`.

**Required fix:** Rewrite the description line as:
```sql
batch.alert_count::TEXT || ' alert(s) detected near ' || p.name_canonical,
```
And remove the outer `COUNT(sa.id)` reference entirely.

---

## Non-Blocking Issues (Low)

### N-6 — Dataset version pin: `latest` alias is not reproducible

**Location:** §3 scope (alert query URL)

**Impact:** The URL `gfw_integrated_alerts/latest/query/json` will silently switch to a new dataset version when GFW releases one, potentially changing column names, confidence encoding, or coverage without warning. This is the root cause of the column-name brittleness already noted in §7. For v0.1, `latest` is acceptable since the spec already documents the brittleness. For v0.2, pin to a specific version (e.g., `gfw_integrated_alerts/v20240101/query/json`). Flag in code as: `# TODO v0.2: pin to specific dataset version for reproducibility`.

---

### N-7 — `--dry-run` spec says "zero external HTTP calls" but implementer needs live data to estimate alert counts

**Location:** §3 scope ("--dry-run flag used") and §7 edge cases

**Impact:** AC-2 says dry-run should log "estimated alert counts from prior DB data." This implies reading from `satellite_alerts` for prior counts — which is fine and DB-only. However, the §7 edge case description says dry-run logs "what would happen (geostore registration plans, estimated alert counts from prior DB data)" — this is consistent and DB-only. No conflict. Low-priority clarification: if the project has never had a scraper run, "prior DB data" returns zero, so the dry-run estimate is always 0 for new projects. This is acceptable behavior; the spec should note it explicitly rather than leaving the implementer to discover it.

---

### N-8 — AC-7 testability requires Andy's user to have `email_digest_opt_in = TRUE`

**Location:** AC-7

**Impact:** AC-7's first branch requires "at least one user with `email_digest_opt_in = TRUE`." The `users.email_digest_opt_in` column defaults to `TRUE`, so Andy's user (created by T05 Phase B Google OAuth login) will satisfy this without manual action. This is testable given the current state. However, if Andy has ever run `UPDATE users SET email_digest_opt_in = FALSE`, the AC-7 first branch becomes untestable without re-opting in. The spec should note the dependency: "AC-7 assumes Andy's account (created by T05) retains the default `email_digest_opt_in = TRUE`. If not, manually reset before testing."

---

## Cross-Story Concerns

### CS-1 — `pyproject.toml` ownership race between T06 and T07

T06 owns `scrapers/pyproject.toml` and initializes it with `uv init`. T07 must append `shapely` and `pyproj`. T08 must append `pdfplumber`. All three stories are in Phase 2 with potential parallel implementation. If agents run T07 and T08 concurrently against T06's not-yet-merged branch, both will attempt to modify `pyproject.toml` and generate merge conflicts in `uv.lock` (which is a large lockfile). **Resolution:** TASKS.md should enforce T06 merges first, then T07 and T08 (currently T07 is `blocked_by: [T02, T06]` — correct). Verify T08 also has `blocked_by: T06` in its frontmatter (it currently says `blocked_by: [T02]` only — this is a T08 spec deficiency but noted here as cross-story risk).

### CS-2 — Notifications unique index must be in migration 002 (T07 owns it)

The unique index on `notifications (user_id, project_id, type, DATE(created_at))` does not exist in migration 001. T07 creates migration 002. T07 must add this index in 002 because no later story is better positioned to own it. T16 (notifications bell) reads from `notifications` but does not write to it — it should not own a write-side constraint. T09 (score computation) does not touch notifications. **T07 is the correct owner** and must include this in migration 002.

---

## Verification of Checklist Items from Audit Brief

| Item | Finding |
|---|---|
| Migration 002 idempotent `ADD COLUMN IF NOT EXISTS` | PASS — spec §3.1 explicitly requires it |
| `schema_migrations` row with `ON CONFLICT DO NOTHING` | WEAK — implied by pattern but not stated; see N-1 |
| Ownership transfer in 002 | WEAK — superuser vs karbonlens role ambiguity; see N-1 |
| `shapely`/`pyproj` deps in `pyproject.toml` | WEAK — deferred to implementer coordination; see N-2 |
| GFW API response shape acknowledged as unknown | PASS — documented in §7 and §9 OQ-2/OQ-3 |
| Rate limit: 1 req/sec vs 2 calls/project | BLOCKING — see B-2 |
| Notifications fan-out scope for new users (retroactive spam) | PARTIAL — calendar-day dedup mitigates but unique index never created; see B-3 |
| `satellite_alerts` dedupe with `ON CONFLICT` + unique constraint | BLOCKING — no constraint exists; spec is ambiguous; see B-1 |
| Geodesic buffer precision (32-point ring) | PASS — <1% error at equator, acceptable for v0.1 |
| Missing API key handling (AC-9) | PASS |
| 401 vs 429 vs 5xx handling | PARTIAL — 5xx missing; see N-3 |
| Dataset version pin (`latest` alias) | NON-BLOCKING best practice; see N-6 |
| AC testability (all 10 ACs concrete) | MOSTLY PASS — AC-7 has dependency caveat; see N-8 |
| AC-7 testable given Andy's user exists | PASS — with caveat in N-8 |
