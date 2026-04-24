---
story: T07 — GFW alerts scraper
auditor: adversarial code-auditor agent
date: 2026-04-19
phase: A (pre-live-key); Phase B deferred to Andy's GFW_API_KEY setup
verdict: PASS (after fix commit 1440129)
blocking_count: 1
non_blocking_count: 6
branch: feature/T07-gfw-alerts-scraper
base: feature/v0.1-impl
commits: 4 (d92f4aa, 801614c, 0aff4b5, 85c168a)
files_changed: 6 (all expected; no leaks)
---

## Executive summary

Migration 002 applies cleanly and is idempotent. The dry-run path is
mechanically clean (zero HTTP calls, zero DB writes verified). The geodesic
buffer is geometrically correct (0.1798° / 0.1809° span at the equator for a
10 km radius — spec-compliant). The missing-key guard is correctly hardened
against `.env.example` drift. Lint is clean. File ownership is clean.

**However, one blocking bug will cause the scraper to raise a hard Postgres
error on the first attempt to upsert an alert or fan out a notification in
Phase B:** the code uses `ON CONFLICT ON CONSTRAINT <name> DO NOTHING`, but
migration 002 only creates expression-based **unique indexes**, not
constraints. Postgres does not treat indexes as constraints for `ON CONFLICT
ON CONSTRAINT` — verified by live reproduction. Expression-based unique
indexes CANNOT be promoted to constraints via `ALTER TABLE ADD CONSTRAINT`;
the fix is to rewrite both call sites to use `ON CONFLICT (<col_list>) DO
NOTHING` with the exact same expressions the indexes use. See B-1 below.

Because Phase A dry-run never executes these statements, the bug was
invisible during implementer verification. It is a guaranteed Phase-B hard
failure. Verdict: **FAIL** — fix B-1 before merge or before Andy runs Phase B.

---

## AC table (Phase A)

| AC | Spec | Result | Evidence |
|---|---|---|---|
| AC-1 | Migration 002 applies cleanly and is idempotent | **PASS** | Re-applied with `sudo -u postgres psql --single-transaction -f scrapers/migrations/002_add_geostore.sql` → exit 0, NOTICE skips for all 4 DDL stmts, `INSERT 0 0` on schema_migrations. `schema_migrations` has exactly one row for '002'. |
| AC-1a | `\d projects` has `gfw_geostore_id TEXT` | **PASS** | Column present, nullable, type text. |
| AC-1b | 3 new unique indexes exist | **PASS** | `uq_sat_project_date_loc`, `uq_issuances_dedupe`, `uq_notifications_dedupe` all present in `pg_indexes`. |
| AC-2 | Dry-run: exit 0, no HTTP, no DB writes | **PASS** | `GFW_API_KEY=dummy-valid-shape python -m scrapers.gfw.fetch --dry-run` → exit 0, `grep -c data-api.globalforestwatch` = 0, `grep -c "HTTP Request"` = 0. DB snapshot before/after: `satellite_alerts` count unchanged, `projects.gfw_geostore_id` count unchanged at 55. |
| AC-3 | First run populates geostore IDs | **DEFERRED** (Phase B) | Requires live key. Code path present. |
| AC-4 | `> 50` alerts after run | **DEFERRED** | Phase B. |
| AC-5 | Katingan has > 0 alerts | **DEFERRED** | Phase B. |
| AC-6 | Re-run does not duplicate | **FAIL (code bug — B-1)** | Expression unique index enforces dedupe at the index level, but the scraper uses `ON CONFLICT ON CONSTRAINT uq_sat_project_date_loc DO NOTHING` which Postgres rejects at runtime: `ERROR: constraint "uq_sat_project_date_loc" for table "satellite_alerts" does not exist`. Live-reproduced. |
| AC-7 | Notifications fan-out + dedupe | **FAIL (code bug — B-1)** | Same issue on `uq_notifications_dedupe`. |
| AC-8 | Rate-limit >= N seconds (1 s before each API call) | **PASS (code-complete)** | `time.sleep(RATE_LIMIT_SLEEP_S)` at `register_geostore:310` and `query_alerts:351`, both BEFORE the outbound call. Two separate sleeps, not one per project. |
| AC-9 | Missing key → exit 2 with runbook pointer | **PASS** | `env -u GFW_API_KEY python -m scrapers.gfw.fetch` → exit 2, stderr contains `GFW_API_KEY required — see docs/runbooks/gfw-api-key.md`. Placeholders `CHANGE_ME`, `changeme`, `TODO` also rejected (dry-run still proceeds without a key, which is consistent with §7 edge case table). |
| AC-10 | `ruff check scrapers/gfw/` exit 0 | **PASS** | `All checks passed!` |

**Phase A ACs testable: 7 of 10 (AC-1, 1a, 1b, 2, 8, 9, 10). 5 pass + 2 fail on B-1. 3 deferred to Phase B.**

---

## D-2 decision verdict: **CONDITIONAL ACCEPT**

55 of 64 projects have `gfw_geostore_id` populated by the accidental
non-dry-run invocation during development. The implementer's recommendation
to leave them in place is **defensible and preferred**, with the following
caveats.

**Arguments for accepting the current state:**

1. Geostores on GFW's API are retrievable by any holder of the ID (the
   endpoint is effectively public for read). Andy's Phase-B key will reuse
   them — saving 55 × 1 s = 55 s of API calls and 55 registrations of
   noise at the GFW endpoint.
2. The query endpoint returned 403 during the debug run, so NO alerts were
   written. Pollution is contained to one column, and that column is the
   intended cache for the legitimate scraper behavior.
3. Clearing them would be a destructive write to the shared DB and the
   implementer's harness correctly denied it.

**Arguments against (mitigations required):**

1. **Stale-geostore risk**: if GFW rotates or expires geostore IDs, the 55
   cached IDs become dead pointers. The current `query_alerts` call will
   silently receive a 4xx or empty `data` from GFW. The scraper treats
   4xx as a skip + continue (good), but will never re-register. There is
   NO fallback that detects a stale geostore and re-registers.
   - **Required mitigation**: add a re-registration branch to the scraper:
     if `query_alerts` returns a 404/400 that is specifically "geostore not
     found", clear `projects.gfw_geostore_id` and attempt registration on
     the next run. This is a non-blocking finding (F-2 below) but should
     be on the Phase-B punchlist.
2. The 55 IDs were never verified against the ACTUAL key Andy will use —
   they were created anonymously (see F-4). If GFW retroactively binds
   anonymous geostores to an account on the first authenticated call,
   behavior is undefined; if they cannot be bound, the query endpoint
   may continue to 403 them forever.
   - **Required mitigation**: Phase B smoke test (§6 step 2 of the
     implementer report) MUST be run against one of the existing-ID
     projects AND one fresh project (e.g., a never-seen project with
     `gfw_geostore_id IS NULL`) to confirm both paths work with Andy's
     real key. If the 55 stale IDs 403/404 persistently, run
     `UPDATE projects SET gfw_geostore_id = NULL;` and re-run.

**Verdict:** ACCEPT the current state conditional on the Phase-B smoke
test explicitly covering both cached and uncached paths. Document the
fallback requirement in F-2.

---

## Adversarial findings

### B-1 (BLOCKING) — `ON CONFLICT ON CONSTRAINT` against a non-constraint index

**Location:** `scrapers/gfw/fetch.py:523` and `:574`. Also the implementer
report §4 AC-6 + AC-7 erroneously claims these are code-complete.

**Impact:** Runtime `psycopg.errors.UndefinedObject`: `constraint
"uq_sat_project_date_loc" for table "satellite_alerts" does not exist`.
The code path is invoked for every successful alert parse and every
post-run fan-out; both AC-6 and AC-7 cannot pass. Re-produced live:

```sql
-- Fails:
INSERT INTO satellite_alerts (...) VALUES (...)
  ON CONFLICT ON CONSTRAINT uq_sat_project_date_loc DO NOTHING;
-- ERROR:  constraint "uq_sat_project_date_loc" ... does not exist

-- Works (same index, column-list target):
INSERT INTO satellite_alerts (...) VALUES (...)
  ON CONFLICT (project_id, alert_date,
               ROUND(ST_Y(location::geometry)::NUMERIC, 6),
               ROUND(ST_X(location::geometry)::NUMERIC, 6))
  DO NOTHING;
-- Second run → INSERT 0 0 (dedupe works as intended).
```

**Root cause:** `CREATE UNIQUE INDEX` produces an index, not a constraint.
Postgres allows `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE USING INDEX
<idx>` only for indexes whose keys are plain columns — expression-based
indexes (`ROUND(...)`, `AT TIME ZONE`) cannot be promoted. So adding a
constraint of the same name is not an option. The fix must change the
application code.

**Required fix (pick one):**

Option A (preferred — minimal diff):

```python
# satellite_alerts upsert (line 523):
ON CONFLICT (project_id, alert_date,
             ROUND(ST_Y(location::geometry)::NUMERIC, 6),
             ROUND(ST_X(location::geometry)::NUMERIC, 6)) DO NOTHING

# notifications fan-out (line 574):
ON CONFLICT (user_id, type, project_id,
             ((created_at AT TIME ZONE 'UTC')::date)) DO NOTHING
```

The parenthesisation must match the index definition EXACTLY (run
`\d+ satellite_alerts` / `\d+ notifications` to copy the expression
verbatim). For `uq_notifications_dedupe` the indexed expression reads
`(((created_at AT TIME ZONE 'UTC'::text))::date)` — the extra cast on the
TZ literal comes from Postgres internal normalization; the planner
matches against the canonical form.

Option B: drop the expression indexes and replace with column-list
constraints + regular columns. Requires schema change (add
`rounded_lat`, `rounded_lon`, `created_at_utc_date` generated columns).
Larger diff, no runtime advantage. Not recommended for v0.1.

**Blocker status:** MUST fix before Phase B run.

---

### F-2 (HIGH) — No stale-geostore re-registration path

**Location:** `scrapers/gfw/fetch.py:657–666` (query_alerts failure branch).

**Impact:** Per the D-2 discussion, 55 geostore IDs are from an unauthenticated
debug run. If any of them 404 under Andy's real key, the scraper logs
`project_skipped_query_fail` and moves on — forever. There is no code path
that clears the stale ID and re-registers.

**Recommendation:** After F-1 is fixed, in `query_alerts`, return a
distinct sentinel (not `None`) when GFW responds with a 404 whose body
mentions "geostore". In `process_project`, on that sentinel, clear
`projects.gfw_geostore_id = NULL` and recurse one level to re-register.
Alternatively: if `query_alerts` returns None twice in a row for the same
project across runs, clear the cached ID as a fallback. Non-blocking for
the initial Phase B run (Andy can manually `UPDATE projects SET
gfw_geostore_id = NULL` if needed), but should land before v0.2 weekly cron.

---

### F-3 (MEDIUM) — 401 hard-fail path exits 2 from inside the project loop, skipping notifications fan-out

**Location:** `scrapers/gfw/fetch.py:786–794`.

**Impact:** When `GfwAuthError` is raised mid-loop, `run()` returns 2
**immediately** — skipping the `run_complete` log line and the notifications
fan-out. If the first N projects happened to succeed before the Nth
returned 401, those alerts were committed but no notifications fire. This
is probably fine (an expired key is a hard-stop condition; the next weekly
run will catch up on the fan-out via per-day dedup). But the log line
`run_complete` never prints, which breaks downstream log-parsers (and
violates the implicit "always log a terminal event" pattern used by Verra
and IDXCarbon scrapers).

**Recommendation:** Move the 401 `return 2` to AFTER the log line, and add
a `status: "auth_failed"` branch in the terminal log. Minor.

---

### F-4 (INFORMATIONAL) — Anonymous geostore POST behavior confirmed

**Location:** deviation D-2.

**Impact:** The GFW `/geostore` POST endpoint accepted 55 registrations
from the debug run WITHOUT a valid `x-api-key`. This means GFW treats
geostore creation as unauthenticated (at least at the time of the debug
run). Two implications:
1. The rate-limit analysis in AC-8 should account for the possibility that
   `x-api-key` is ignored on the geostore endpoint — real rate limiting is
   IP-level. Phase B with the real key should not see behavior change on
   `register_geostore`.
2. The 403s from the `query` endpoint confirm that the `query` endpoint IS
   authenticated. So the Phase B risk narrows to: query endpoint works
   with real key + existing IDs.

Not a bug — just a note the Phase-B tester should know going in. Log
DEBUG output on `register_geostore` (line 315) already captures response
keys, which is good forensic hygiene.

---

### F-5 (LOW) — Placeholder guard too narrow

**Location:** `scrapers/gfw/fetch.py:105` (`PLACEHOLDER_KEYS`).

**Current:** `frozenset({"", "CHANGE_ME", "changeme", "TODO"})`.

**Missed:** `YOUR_KEY_HERE`, `your-key-here`, `XXXXXXXX`, `REPLACEME`,
`<your-key>`, whitespace-only strings that aren't empty after `.strip()`
(those DO get caught because of the `.strip()` at line 726). The current
guard handles `.env.example` as shipped, which is the main risk, so this
is LOW. Developers passing `"dummy"`, `"test"`, `"fake"` as test shapes
will fire real API calls — which is arguably the correct behavior for
test fixtures.

**Recommendation:** Either tighten to a prefix/regex guard (`re.match(r"^[A-Za-z0-9_-]{16,}$")` as the ONLY accepting shape), or accept the current narrow list as good-enough. No action required for merge.

---

### F-6 (LOW) — Response-shape probing is correct but response.get("data") can be a list

**Location:** `scrapers/gfw/fetch.py:317–322` (register_geostore).

**Impact:** The code does `data = response.get("data") or {}; if
isinstance(data, dict):`. If GFW returns `{"data": [{"id": "..."}]}`
(list, not dict), the `isinstance` check short-circuits and the probe
falls through to the top-level `response.get("id")` which will also miss.
GFW's convention on other endpoints IS to return `{"data": [...]}`, so
this is plausible.

**Recommendation:** After the `isinstance(data, dict)` branch, add an
`elif isinstance(data, list) and data: geostore_id = data[0].get("id") or
data[0].get("gfw_geostore_id")`. Non-blocking — Phase B will reveal the
actual shape; the implementer can tighten once verified.

---

### F-7 (LOW) — Confidence mapping doesn't handle float/string numeric values

**Location:** `scrapers/gfw/fetch.py:383–393` (`_map_confidence`).

**Impact:** `int(raw)` will TypeError on `None` (handled), succeed on
`"2"` (string → 2 → "nominal") and `2.0` (float → 2 → "nominal"), but
FAIL on `"high"` (string non-numeric → caught by ValueError → "low").
The fallback to `"low"` on anything unparseable is spec-compliant. String
confidence labels (e.g., GFW returning `"high"` directly) would be
silently downgraded to `"low"` — mildly wrong but not catastrophic.

**Recommendation:** Add a string-label pre-check: `if isinstance(raw,
str) and raw.lower() in {"high","nominal","low"}: return raw.lower()`.
Phase B will reveal which encoding GFW uses; tighten then.

---

## Cross-story implications (reviewed)

- **T09 (score compute)**: will consume `satellite_alerts`. Once B-1 is
  fixed and Phase B populates alerts, T09 is unblocked. No schema
  coupling.
- **T11 / T12 (frontend)**: Drizzle schema reads `satellite_alerts` with
  the same shape as migration 001 defined — migration 002 adds a column
  to `projects` only, not a new table. No schema mismatch.
- **T08 (IDXCarbon)**: independent. No overlap.
- **T17 (digest)**: will consume `notifications`. Depends on B-1 fix +
  Phase B run.

---

## Phase B readiness checklist

- [ ] **B-1 fix applied** (required before Phase B runs — will crash
      otherwise).
- [ ] `GFW_API_KEY=<real>` in `/root/.openclaw/workspace/karbonlens/.env.local`.
- [ ] Smoke test one cached-geostore project (uses one of the 55 existing
      IDs — verifies cache path works with real key).
- [ ] Smoke test one uncached-geostore project (verifies registration path
      still works with real key).
- [ ] Full run: `python -m scrapers.gfw.fetch` — verify `SELECT COUNT(*)
      FROM satellite_alerts` > 50 (AC-4), Katingan > 0 (AC-5), all 64
      projects have `gfw_geostore_id` (AC-3).
- [ ] Re-run dedupe check: `before == after` for satellite_alerts count
      (AC-6).
- [ ] Notifications: Andy's user with `email_digest_opt_in = TRUE` receives
      at least one row per project with alerts (AC-7).
- [ ] If any of the 55 stale IDs persistently 404: clear them manually and
      re-run.
- [ ] If column names differ from spec: update `parse_alert_row` primary
      keys and note in a follow-up commit.
- [ ] F-2 (stale-geostore fallback) scheduled as v0.2 item or fixed
      inline after Phase B.

---

## Merge recommendation

**DO NOT MERGE yet.** B-1 is a blocking runtime bug — the first real-key
invocation will crash at the first `upsert_alert` call, and Phase B ACs
6 + 7 cannot pass as written.

**Path to merge:**
1. Apply B-1 fix (change both `ON CONFLICT ON CONSTRAINT <name>` to `ON
   CONFLICT (<column list>)` with the expressions matching the index).
2. Re-run the live dedupe repro (this audit includes the exact SQL) to
   confirm both call sites.
3. Re-run `ruff check scrapers/gfw/`.
4. Amend or new-commit the fix on the branch; report the diff in the
   implementation report §5 deviations.
5. Andy runs Phase B per §6 of the implementation report.
6. If Phase B ACs 3–8 pass green, merge to `feature/v0.1-impl`.

**Phase B readiness after B-1 fix:** all 10 ACs become testable; 7 already
pass; 3 (AC-3, AC-4, AC-5) require the real key and will flip green on
the first successful full run.

---

## Re-audit note (2026-04-19)

**Verdict flipped: FAIL -> PASS.** Fix commit `1440129` addresses the single
blocking finding B-1 and the high-severity non-blocking finding F-2.

### What changed in `scrapers/gfw/fetch.py`

1. **B-1 (blocking) — satellite_alerts upsert.** `ON CONFLICT ON CONSTRAINT
   uq_sat_project_date_loc DO NOTHING` replaced with the column-list form
   matching the expression unique index verbatim (paren-wrapped expressions
   so the planner matches the index):

   ```sql
   ON CONFLICT (
     project_id,
     alert_date,
     (ROUND(ST_Y(location::geometry)::NUMERIC, 6)),
     (ROUND(ST_X(location::geometry)::NUMERIC, 6))
   ) DO NOTHING
   ```

2. **B-1 (blocking) — notifications upsert.** Same transformation against
   `uq_notifications_dedupe`:

   ```sql
   ON CONFLICT (
     user_id,
     type,
     project_id,
     ((created_at AT TIME ZONE 'UTC')::date)
   ) DO NOTHING
   ```

3. **F-2 (non-blocking, pre-empted) — stale-geostore fallback.** Added
   `GfwGeostoreNotFound` sentinel raised by `_get_with_retry` only when the
   caller opts in (`raise_on_404=True`, set by `query_alerts`). In
   `process_project`, the new catch block clears
   `projects.gfw_geostore_id = NULL`, re-calls `register_geostore`,
   persists the fresh ID, and retries `query_alerts` once. If the retry
   also 404s, logs `project_skipped_reregister_still_404` and continues to
   the next project. No new tests, no new abstractions.

### Live re-verification

- **satellite_alerts dedupe repro (matching §B-1):** first insert returned
  a UUID; second insert with identical `(project_id, alert_date, rounded
  lat, rounded lon)` returned `None`. PASS.
- **notifications ON CONFLICT arbiter resolution (EXPLAIN):** Postgres
  reported `Conflict Arbiter Indexes: uq_notifications_dedupe` —
  conflict target is planner-resolvable. PASS.
- **Dry-run:** `GFW_API_KEY=dummy-valid-shape python -m scrapers.gfw.fetch
  --dry-run` exits 0, zero HTTP calls, zero DB writes, 64 projects
  walked, `run_complete` emitted. PASS.
- **Lint:** `ruff check scrapers/gfw/` — "All checks passed!"

### Findings still open (non-blocking, punchlist)

- F-3 (MEDIUM): 401 `return 2` still bypasses `run_complete` log line.
  Deferred to v0.2 — Phase B weekly cron is unaffected (401 is a hard
  stop; ops will notice via the `gfw_auth_failed` error line).
- F-4 (INFO): unchanged — known behavior.
- F-5 (LOW): placeholder guard unchanged; `.env.example` shape still caught.
- F-6 (LOW): register_geostore response-shape probing unchanged — Phase B
  will reveal actual shape; tighten post-first-run.
- F-7 (LOW): `_map_confidence` string-label fallback unchanged —
  tighten post-first-run.

**Merge recommendation:** PROCEED. Phase A ACs 6 + 7 are now code-
complete-and-live-verified; Phase B ACs 3/4/5 remain the only outstanding
items and require Andy's real `GFW_API_KEY`.
