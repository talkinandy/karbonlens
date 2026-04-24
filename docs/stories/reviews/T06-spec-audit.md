---
story: T06
title: "Verra scraper — fetch, parse, and upsert Indonesian VCS projects"
auditor: "adversarial spec-auditor (Claude Sonnet 4.6)"
audited_commit: 96daab8
audit_date: 2026-04-19
verdict: CONDITIONAL PASS
blocking_findings: 3
non_blocking_suggestions: 6
cross_story_risks: 3
---

## Summary

T06 is a well-structured spec with genuine implementer clarity: `uv` usage is locked, file ownership is enumerated, edge cases are comprehensive, and the `common/` API contract is concrete enough (function signatures with Python code blocks) for parallel implementation of downstream scrapers. Three findings are blocking before implementation starts. The most serious is a threshold conflict between the spec's AC-2 (≥30 projects) and the PRD's hard success criterion (≥40 projects). The other two blockers involve a known-centroids bug (duplicate dict key) and a missing `project_match_queue` logic flaw that silently discards the incoming candidate instead of inserting it first.

---

## Blocking findings

### B-1 — AC-2 threshold (≥30) contradicts PRD §4 success criterion (≥40)

**Severity:** Blocking  
**Location:** §4 AC-2, PRD §4 criterion 2, architecture §5.1

AC-2 reads `SELECT COUNT(*) FROM projects WHERE country='ID'; returns >= 30`. PRD §4 item 2 reads "At least 40 Indonesian carbon projects populated in the database." Architecture §5.1 states "Expected records: ~40 Indonesian VCS projects at v0.1 launch."

A scraper that passes AC-2 (30 projects) but fails the PRD's coverage criterion (40 projects) will mislead Andy into calling T06 done while the v0.1 success gate is unmet. The 30/40 split is not explained anywhere in the spec. If the intent is "30 is the scraper's minimum, remaining 10 come from SRN-PPI + Gold Standard in v0.2," that must be stated explicitly. Otherwise, raise AC-2 to ≥40.

**Required fix:** Either (a) raise AC-2 to ≥40 and note that Verra alone is expected to yield ≥40 Indonesian VCS projects, or (b) add a comment explicitly stating that ≥30 is the Verra-only floor and that the PRD's 40-project target is met in aggregate across T06 + future registry scrapers.

---

### B-2 — `project_match_queue` insert is logically broken for the 0.70–0.95 similarity band

**Severity:** Blocking  
**Location:** §3.3 "Entity resolution" decision table

When `0.70 < sim <= 0.95`, the spec says: insert a row into `project_match_queue` with `candidate_b_id = NULL` and do NOT insert the new project. This logic has two compounding bugs:

1. **`candidate_b_id = NULL` is meaningless.** The queue row represents a match between an existing project (`candidate_a_id`) and an *incoming candidate*. If the incoming candidate is not inserted, there is nothing for a human reviewer to approve or merge. The admin UI (T21) will display a queue entry that points to a real project and a NULL — it cannot do anything useful with it.

2. **The incoming data is silently discarded.** The project exists in Verra's registry but is not written anywhere in the database. On the next weekly run, the same fuzzy match will fire again, generating a second duplicate queue row. Over time, `project_match_queue` accumulates phantom rows while the project is never ingested.

**Architecture §6.3** (PRD) says the queue enables a human to "approve/reject" candidate pairs. That implies both candidates must be stored.

**Required fix:** Change the logic to: (a) insert the incoming project as a new row (tentatively, with a `status` indicating it is "pending resolution" — or simply insert it normally), then set `candidate_b_id = new_project.id` in the queue row. The human reviewer then decides whether to merge it into `candidate_a` or keep it separate. If a `status = 'pending'` marker on the `projects` row is undesirable, an alternative is to write the raw data only to the registry row and leave `project_id` FK null until resolved — but the spec must choose a path and spell it out.

---

### B-3 — `known_centroids.py` contains a duplicate dict key (VCS1764 appears twice)

**Severity:** Blocking (data correctness)  
**Location:** §3.3 `scrapers/verra/known_centroids.py` code block, lines 179–180

```python
"VCS1764": (-0.5000,  116.5000),   # Berau Forest Carbon (East Kalimantan)
"VCS1764": (-0.5000,  116.5000),   # (duplicate key guard — remove before finalising)
```

Python silently takes the last definition. The comment says "remove before finalising" but leaves the spec with a literal code error. An implementer who copies the spec verbatim produces a 10-entry dict with only 9 effective keys (the second VCS1764 overwrites the first). The spec also claims "10 projects" but only 9 unique IDs are present even after the duplicate is resolved (VCS2571 — Katingan Watershed extension — is a different project from VCS1477, so that is fine; the issue is only VCS1764 × 2). The list must be corrected before OQ-1 closes.

**Required fix:** Remove the duplicate VCS1764 entry and add a distinct tenth project with a confirmed VCS ID before the implementer begins. Flag as a hard prerequisite on OQ-1.

---

## Non-blocking suggestions

### S-1 — Architecture §5.1 entity-resolution threshold (0.85) does not match spec (0.95 / 0.70)

**Severity:** Non-blocking (spec divergence to acknowledge)  
**Location:** §3.3 entity resolution; architecture §5.1

Architecture §5.1 states: "If similarity > 0.85, skip insert and queue to `project_match_queue`." T06 uses a two-threshold system: auto-merge at > 0.95, queue at 0.70–0.95. The 0.85 threshold in the architecture doc is never mentioned in T06.

The T06 two-threshold approach is strictly more nuanced and defensible. However, the architecture doc should be updated to reflect the new thresholds, or a note added to §5.1 stating "thresholds refined in T06 spec." Without this, a future reader of the architecture doc will implement the wrong logic in a new scraper.

**Recommended fix:** Add a footnote in T06 §3.3 (or §10 References) noting that the architecture doc §5.1 carries an outdated single-threshold; T06's two-threshold scheme is canonical. Andy should update `architecture.md` §5.1 when T06 is marked done.

---

### S-2 — Idempotence contract on projects.updated_at is underspecified

**Severity:** Non-blocking  
**Location:** §3.3 "Upsert `registries`", AC-5

The `registries` upsert SQL is fully specified with `ON CONFLICT DO UPDATE SET status = EXCLUDED.status, raw_metadata = EXCLUDED.raw_metadata, last_synced_at = NOW()`. But the equivalent upsert for the `projects` row is not given — the spec only mentions `_update_project_metadata(existing_id, ...)` in prose. AC-5 says "only updated_at / last_synced_at timestamps have advanced" on re-run. The implementer is left to infer the exact `ON CONFLICT` clause for projects.

**Recommended fix:** Add a concrete SQL block for the projects upsert, analogous to the registries block. Minimum: `ON CONFLICT (slug) DO UPDATE SET total_vcus_issued = EXCLUDED.total_vcus_issued, total_vcus_retired = EXCLUDED.total_vcus_retired, updated_at = NOW()`.

---

### S-3 — No HTML test fixture; implementer must hit live site during development

**Severity:** Non-blocking (implementer-experience concern)  
**Location:** §3.3 "Parsing — project list page"; §3.3 "Parsing — project detail page"

The spec correctly flags Verra HTML brittleness and instructs the implementer to inspect the live page for CSS selectors. However, there is no offline fixture (saved HTML file committed to the repo) for development without network access. Every iteration of the parser requires hitting `registry.verra.org`. Given the 3-second rate limit and ~40 detail pages, a single full parse cycle takes ~2 minutes plus network variance.

**Recommended action:** Commit two fixture HTML files (`scrapers/verra/fixtures/search_page.html`, `scrapers/verra/fixtures/detail_VCS1477.html`) as saved snapshots at implementation time. This also allows future developers to regression-test the parser offline without hitting Verra. Not blocking for spec sign-off.

---

### S-4 — Issuance dedupe: `WHERE NOT EXISTS` vs unique index decision left open

**Severity:** Non-blocking (implementation guidance preferred)  
**Location:** §3.3 "Upsert `issuances`"; OQ-3

The spec explicitly raises this as OQ-3 and says "either approach is acceptable; prefer the `WHERE NOT EXISTS` pattern." Confirmed: `001_init.sql` has no unique constraint on `issuances(project_id, vintage_year, issuance_date)` — only an index on `(project_id, vintage_year)`. The `WHERE NOT EXISTS` pattern is therefore the correct path without a schema change.

This is acceptable for v0.1. However, the `WHERE NOT EXISTS` approach has a race condition under concurrent inserts (two scraper runs starting simultaneously). While simultaneous runs are not expected (weekly cron, single VPS), the spec should acknowledge this and document the chosen approach as a `# NOTE` comment in the code.

**Recommended addition:** Add a one-line note to §3.3: "The `WHERE NOT EXISTS` pattern is chosen for v0.1. A unique index on `(project_id, vintage_year, issuance_date)` is preferred for v0.2 once it is safe to add a migration to the live DB."

---

### S-5 — `run_weekly_verra.sh` wrapper does not propagate exit code correctly

**Severity:** Non-blocking  
**Location:** §3.4 bash wrapper

The final `echo "... (exit $?)"` line always captures `$?` after the `echo` on the line above, not after the Python process. By the time `$?` is evaluated in the final echo, it contains the exit code of the previous `echo` command (always 0), not the Python process. The `set -euo pipefail` at the top means the script will exit early if the Python process fails — but the log line will never record a non-zero exit code in the `end` message.

**Recommended fix:**
```bash
"$VENV_PYTHON" -m scrapers.verra.fetch >> "$LOG" 2>&1
SCRAPER_EXIT=$?
echo "--- $(date --iso-8601=seconds) verra scraper end (exit $SCRAPER_EXIT) ---" >> "$LOG"
exit $SCRAPER_EXIT
```

---

### S-6 — `config.py` code block has a forward-reference bug

**Severity:** Non-blocking (will cause `NameError` at import)  
**Location:** §3.2 `scrapers/common/config.py` code block

```python
DATABASE_URL: str = os.environ.get("DATABASE_URL") or _raise("DATABASE_URL is required")
...
def _raise(msg: str) -> str:
    raise RuntimeError(msg)
```

`_raise` is used on line 4 but defined on line 6. Python resolves the module-level expression `or _raise(...)` at import time, at which point `_raise` is not yet defined, causing `NameError: name '_raise' is not defined`.

**Required fix:** Move the `_raise` definition above all the variable assignments, or replace the one-liner with an explicit `if` block:
```python
_DATABASE_URL = os.environ.get("DATABASE_URL")
if not _DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required")
DATABASE_URL: str = _DATABASE_URL
```

This is technically a spec bug that produces broken starter code. Classified non-blocking because a competent implementer will catch it immediately, but the spec should not ship broken examples.

---

## Cross-story issues

### CS-1 — `pyproject.toml` ownership: T06 claims creation; T07 and T08 acknowledge this conditionally, but coordination mechanism is fragile

T06 §6 explicitly claims ownership of `scrapers/pyproject.toml`. T07 §6 says "T07 may append to `scrapers/pyproject.toml` (adding `shapely`, `pyproj`) if T06 has not done so." T08 §9 OQ-1 says "if T06 lands first, T08 only appends `pdfplumber`."

**Risk:** The conditional "if T06 has not landed yet" branch in T07 and T08 means each story carries its own bootstrap path for `pyproject.toml`. If T07 or T08 is implemented in a separate git worktree before T06 merges, both will create `pyproject.toml` independently, producing a merge conflict. The spec does not define a conflict-resolution procedure (rebase? squash? manual merge?).

**Also at risk:** T07 needs `shapely` and `pyproj` (listed nowhere in T06's dep set). T08 needs `pdfplumber` (also absent from T06). T06's `pyproject.toml` does not include these, so whoever implements T07 or T08 must run `uv add shapely pyproj` or `uv add pdfplumber`, which modifies both `pyproject.toml` and `uv.lock` — files T06 claims ownership of.

**Recommendation:** T06 should explicitly note in §3.1 that `shapely`, `pyproj`, and `pdfplumber` are known future deps and should be pre-added during T06 bootstrap to prevent downstream `pyproject.toml` conflicts:
```bash
uv add "psycopg[binary]>=3" httpx beautifulsoup4 lxml structlog python-dotenv shapely pyproj pdfplumber
```
If pre-adding is not desired, define an explicit protocol: T07 and T08 must rebase onto T06's merged branch before adding deps.

---

### CS-2 — `scrapers/common/` API contract: sufficient for T07/T09 parallel implementation, but `db.py` is incomplete

T09 consumes `common/db.py`, `common/config.py`, and `common/logging.py`. T07 also consumes all three. The signatures specified in T06 are:
- `get_connection()` — context manager, yields `psycopg.Connection` ✓
- `execute(conn, sql, params=None)` — thin wrapper ✓
- `configure_logging(scraper_name: str) -> None` ✓
- `get_logger(name: str)` ✓

However, `db.py`'s code block as written shows only `get_connection()` with no `execute()` implementation. The prose above the code block says `execute()` is exposed, but the code block omits it. A parallel implementer of T07 who reads only the code block will not implement `execute()`, breaking T06's own usage of it.

**Recommendation:** Add the `execute()` function body to the `db.py` code block in §3.2 so the code block is the full implementation, not just a fragment.

---

### CS-3 — `scraper_runs.py` stub deferred but `scraper_runs` table is absent from `001_init.sql`

T06 §3.2 requires creating `scrapers/common/scraper_runs.py` as a stub with a `# TODO` comment. Architecture §4 convention 4 says "On error, write to a `scraper_runs` table (add in a later task)." However, `001_init.sql` does not contain a `scraper_runs` table. No story in Phase 2 (T06–T10) owns the creation of this table.

T07, T08, and T09 all inherit the structured logging convention that implies eventual `scraper_runs` persistence. Without a table or a story owning its creation, this will remain deferred indefinitely and the stub file will accumulate `# TODO` debt across all scrapers.

**Recommendation:** Either (a) create the `scraper_runs` table in migration 001 (requires T02 amendment — probably too late), or (b) assign a migration 003 to T06 or a dedicated story for the `scraper_runs` table before Phase 3 frontend stories need it. Flag the omission to Andy so it has an explicit owner.

---

## Proposed spec edits

1. **§4 AC-2:** Change `>= 30` to `>= 40`, or add: "_Note: ≥30 is the Verra-only floor. The PRD §4 success criterion of ≥40 projects is met in aggregate across Verra (T06) + SRN-PPI / Gold Standard (v0.2). T06 is done-done when Verra alone yields ≥40, or if it yields 30–39, Andy confirms the remaining projects will come from other registries._"

2. **§3.3 Entity resolution:** Replace the 0.70–0.95 queue-only action with: "Insert the incoming project row normally. Then insert into `project_match_queue` with `candidate_a_id = existing.id`, `candidate_b_id = newly_inserted.id`, `similarity = sim`, `match_reason = 'name_fuzzy'`, `status = 'pending'`. Log `{"event": "ambiguous_match", ...}`."

3. **§3.3 `known_centroids.py`:** Remove the second `VCS1764` entry. Resolve OQ-1 with Andy before the implementer writes any code; flag OQ-1 as a hard pre-implementation gate.

4. **§3.2 `common/config.py`:** Move `_raise()` above the `DATABASE_URL` assignment, or replace with an explicit `if not` guard.

5. **§3.2 `common/db.py`:** Add `execute()` function body to the code block.

6. **§3.1 pyproject.toml bootstrap:** Either pre-add `shapely pyproj pdfplumber` now, or add an explicit protocol sentence: "T07 and T08 implementers must rebase onto the merged T06 branch before running `uv add`."

7. **§3.4 bash wrapper:** Fix the `$?` capture order (see S-5).

---

## Sign-off conditions

T06 may proceed to implementation when all three of the following are resolved:

1. **B-1 resolved:** AC-2 threshold reconciled with PRD §4 (either raise to ≥40 or add explicit rationale for the 30-project floor).
2. **B-2 resolved:** Entity resolution logic for the 0.70–0.95 band rewritten so the incoming candidate is inserted before the queue row is created (or an alternative disposition path is documented).
3. **B-3 resolved:** OQ-1 answered by Andy with a confirmed 10-entry `KNOWN_CENTROIDS` dict (no duplicate keys); implementer treats the spec list as a placeholder until Andy signs off.

Additionally, the non-blocking `config.py` forward-reference bug (S-6) should be fixed in the spec before handing off to an implementer, as it will produce an immediate `NameError` on first import.

The cross-story `pyproject.toml` coordination risk (CS-1) requires a decision from Andy on implementation sequencing before any of T06/T07/T08 begins coding.
