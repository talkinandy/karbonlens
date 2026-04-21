---
story: T06
title: "Verra scraper — fetch, parse, and upsert Indonesian VCS projects"
implementer: "Claude Opus 4.7 (1M context) under direction of OpenClaw Jenny"
implementation_date: 2026-04-19
branched_from: d7a538b  # docs(stories): revise T06-T10 specs per audit; status -> audited
branch: feature/T06-verra-scraper
worktree: /root/.openclaw/workspace/karbonlens-worktrees/T06
status: ready-for-audit
---

## 1. Tooling snapshot

| Thing               | Value                                                          |
| ------------------- | -------------------------------------------------------------- |
| Python              | 3.12.3                                                         |
| Environment manager | `uv` 0.10.12 (pre-installed at `/root/.local/bin/uv`)          |
| Postgres            | 16 with PostGIS + pgcrypto + pg_trgm (migration 001 applied)   |
| Worktree            | `/root/.openclaw/workspace/karbonlens-worktrees/T06`           |
| Branch              | `feature/T06-verra-scraper` off `d7a538b`                      |
| User-Agent          | `KarbonLens-scraper/0.1 (+https://karbonlens.netlify.app)`     |

Chose `uv` (spec §3.1 confirms it is present). `uv sync --extra dev` resolves
27 packages including `psycopg[binary]==3.3.3`, `httpx==0.28.1`,
`beautifulsoup4==4.14.3`, `lxml==6.1.0`, `shapely==2.1.2`, `pyproj==3.7.2`,
`pdfplumber==0.11.9`, `structlog==25.5.0`, `python-dotenv==1.2.2`,
`ruff==0.15.11`. `uv.lock` is committed.

## 2. Verra site inspection notes

**The HTML URLs in the pre-audit spec are dead.** `GET /app/search/VCS/Registered+project?filter[countryCode]=ID`
returns a 404 "Page Not Found" HTML page (612 bytes). All routes under `/app/` return
the same 1,187-byte Angular SPA shell (`<apx-root></apx-root>`). The spec's selectors for
`<table class="...">` would never match.

Inspection of the live bundle `main.57dc1e7b7b22ac2f4991.js` (≈4.4 MB) surfaced an
OData-style JSON API under `/uiapi`:

| Endpoint                                 | Method | Purpose                             |
| ---------------------------------------- | ------ | ----------------------------------- |
| `/uiapi/resource/resource/search`        | POST   | Project list; body `{program: "VCS", resourceType: "PROJECT"}`; query `$filter=country eq 'Indonesia'`, `$top`, `$skip`, `$count=true` |
| `/uiapi/resource/resourceSummary/{id}`   | GET    | Project detail; `{id}` is the numeric VCS id, e.g. `1477`. Returns `location.{latitude,longitude}`, `attributes[]`, `participationSummaries[].attributes[]`, `description` |
| `/uiapi/asset/asset/search`              | POST   | Issuance history; body `{program: "VCS", issuanceTypeCodes: ["ISSUE"]}`; query `$filter=resourceIdentifier eq 'NNNN'`. Returns one row per vintage / issuance / serial block with `vintageStart`, `issuanceDate`, `quantity`, `serialNumbers`, `retiredCancelled`. |

No authentication. No CSV download for filtered results (the code exists but requires a
prior session state, which would need a full headless-browser dance). The JSON endpoints
are significantly faster and more structured than any CSV equivalent, so the scraper
uses them directly.

Page size: 100 per page via `$top=100`. Indonesia total on 2026-04-21: **64** projects.

Pacing: 3-second sleep between each detail fetch (and each page of the list query) per
`docs/architecture.md` §4. No burst parallelism; `httpx.Client` reuses one connection.

Auth + respectful-UA: polite UA per constraints; no API key needed.

## 3. Hand-curated flagship centroids

Ten entries in `scrapers/verra/known_centroids.py::KNOWN_CENTROIDS`. Note: for
projects where Verra's own detail API returns a `location` block, the scraper
prefers that over the hand-curated value (see `_resolve_centroid` in
`fetch.py`); the hand-curated list is the fallback when Verra's data is
missing or (0, 0).

| VCS ID  | Project                                         | Centroid (lat, lon)       | Source                                                        |
| ------- | ----------------------------------------------- | ------------------------- | ------------------------------------------------------------- |
| VCS1477 | Katingan Peatland Restoration                   | (-2.382579, 113.267275)   | Verra `/resourceSummary/1477` `location`; matches PDD figure 1 |
| VCS612  | Rimba Raya Biodiversity Reserve                 | (-3.050000, 112.300000)   | InfiniteEARTH project page + published PDD boundary           |
| VCS1350 | Merang REDD+ Pilot (South Sumatra)              | (-2.250000, 104.250000)   | PDD boundary on Sembilang-Dangku peatland                     |
| VCS944  | Sumatera Merang Peatland Project                | (-2.750000, 104.550000)   | PDD boundary, adjacent to VCS1350, centred further south      |
| VCS2562 | Cendrawasih / Aru Islands REDD+ (Maluku)        | (-6.100000, 134.600000)   | PDD boundary, central Aru group                               |
| VCS1764 | Rimba Makmur Utama (Katingan extension)         | (-2.550000, 113.000000)   | Published map, between Katingan and Sampit                    |
| VCS2642 | Jantho REDD+ (Aceh)                             | (5.350000, 95.600000)     | PDD boundary, Aceh Besar regency                              |
| VCS985  | Gunung Palung REDD+ buffer (West Kalimantan)    | (-1.300000, 110.200000)   | PDD centroid near Sukadana                                    |
| VCS1748 | Ketapang REDD+ (West Kalimantan)                | (-1.850000, 110.000000)   | Public map of project boundary around Ketapang regency        |
| VCS1659 | Infinite Benefits Sustainable Palm (Riau)       | (0.300000, 102.200000)    | Press coverage placing the project in Riau province           |

Per the audit B-3 finding, the duplicate VCS1764 row that was in the pre-audit spec
is removed; VCS2642 Jantho takes its slot as the tenth entry.

`PROVINCE_CENTROIDS` covers all 34 Indonesian provinces as a second-tier fallback
(centroid = provincial capital coords).

## 4. Acceptance criteria: pass / fail

All checks run against the live Hetzner Postgres DB after two full runs (first-fill
then idempotence re-run). See §6 for log tail.

### AC-1 — dry-run, limit 3

```
$ cd scrapers && uv run python -m verra.fetch --dry-run --limit 3
{"dry_run": true, "limit": 3, ..., "event": "run_start"}
{"count": 64, "event": "verra_search_total"}
{"vcs_id": "VCS5962", ..., "action": "dry_run", "event": "project_processed"}
{"vcs_id": "VCS5956", ..., "action": "dry_run", "event": "project_processed"}
{"vcs_id": "VCS5930", ..., "action": "dry_run", "event": "project_processed"}
{"records_in": 3, "records_inserted": 0, ..., "event": "run_complete"}
```

Exit code: 0. `records_in: 3`. No DB writes. **PASS.**

### AC-2 — projects populated

```sql
SELECT COUNT(*) FROM projects WHERE country='ID';
-- 64
```

**PASS.** Verra alone yields 64 Indonesian projects; comfortably clears the revised
≥40 floor.

### AC-3 — registries populated

```sql
SELECT COUNT(*) FROM registries WHERE registry_name='Verra';   -- 64
SELECT COUNT(*) FROM registries
  WHERE registry_name='Verra' AND external_id ~ '^VCS[0-9]+$'; -- 64
```

**PASS.** All 64 rows have `external_id` matching `VCS\d+`.

### AC-4 — issuances populated

```sql
SELECT COUNT(*) FROM issuances;
-- 307
```

**PASS.** 307 deduplicated issuance rows across 64 projects. (Verra returns one
row per serial block; the scraper aggregates by `(vintage_year, issuance_date)`
before writing to match the `issuances` schema.)

### AC-5 — idempotency

First full run: `records_inserted=64, records_updated=0, issuances_written=307`.
Second full run immediately after (~3 min 46 s elapsed): `records_inserted=0,
records_updated=64, issuances_written=0`. No duplicates.

**PASS.**

### AC-6 — Katingan flagship data

```sql
SELECT name_canonical, developer, hectares::int, validation_date, total_vcus_issued::bigint
FROM projects WHERE slug LIKE '%katingan%';
```

| field                  | value                                                   | AC check                            |
| ---------------------- | ------------------------------------------------------- | ----------------------------------- |
| `name_canonical`       | Katingan Peatland Restoration and Conservation Project  |                                     |
| `developer`            | PT. Rimba Makmur Utama (PT. RMU)                        | contains "Rimba Makmur" ✓           |
| `hectares`             | 149800                                                  | within ±5 % of 149,800 ✓            |
| `validation_date`      | 2020-04-06                                              | **FAIL** — spec expects 2013–2015   |
| `total_vcus_issued`    | 3559014                                                 | > 0 ✓                               |

**PARTIAL PASS.** 4 of 5 sub-checks pass.

The `validation_date` sub-check fails because Verra's own API returns
`PROJECT_REGISTRATION_DATE = 06/04/2020` for Katingan (the Verra Registry
registration date — the project was re-registered under VCS v4 in 2020) and
that is the only date field the scraper has access to. The original PDD
validation in 2015 is not exposed through the public `/uiapi/resource/resourceSummary`
endpoint. Options for the auditor:

- accept as-is and update the spec to match what Verra exposes,
- add a hand-curated `validation_date` overlay table (out of scope for v0.1),
- parse the `documentGroups` PDF URLs for the validation report's date (v0.2 work).

I recommend accepting as-is; Verra's `PROJECT_REGISTRATION_DATE` is the closest
thing the current data model has to a validation date and is the field other
registry integrations will also populate.

### AC-7 — project_match_queue empty on first fill

```sql
SELECT COUNT(*) FROM project_match_queue WHERE status='pending';
-- 2
```

**FAIL (signal, not bug).** Two genuinely-ambiguous pairs are queued on first
fill:

| existing                                                               | new                                                                    | similarity |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| Recovery and Avoidance of methane ... at Agro Muara Rupit mill, Indonesia. | RECOVERY AND AVOIDANCE OF METHANE ... AT TSE GROUP, INDONESIA              | 0.779      |
| Installation of high efficiency wood burning cookstoves in Indonesia 1 | Installation of high efficiency wood burning cookstoves in Indonesia 2 | 0.942      |

These are two separate wastewater-methane projects at different mills and two
separately-numbered cookstove projects — the queue is flagging them correctly
for a human to rule on. The spec's AC-7 premise ("no ambiguous duplicates expected
on first fill of an empty database") is wrong in the presence of
similar-but-distinct project names from the same developer, which is common on
Verra.

I did not raise the 0.70 floor to mask this — per spec §7 E9 guidance, that
would be the wrong fix. The auditor can either tune AC-7 to allow `>=0` rather
than `==0`, or manually triage these two rows via `UPDATE project_match_queue
SET status='rejected'` (both pairs are confirmed distinct).

### AC-8 — per-project structured log output

Captured 100 % of a dry-run `--limit 3` stdout, verified via
`python3 -c 'import sys, json; [json.loads(l) for l in sys.stdin]'` — exits
0 with no output (all lines are valid JSON). At least one
`event=project_processed` line with `vcs_id`, `action`, `centroid_source`
present; final line is `event=run_complete` with every required field
including `errors: []`. **PASS.**

Note: the fix committed at `fd343ec` was needed to route httpx/psycopg
stdlib-logging records through the JSON formatter; without that the AC would
have failed on the first full run (httpx emits plain-text "HTTP Request: ..."
lines at INFO).

### AC-9 — ruff clean

```
$ uv run ruff check scrapers/
All checks passed!
```

**PASS.**

## 5. Coverage metrics

| Metric                             | Count | % of 64 |
| ---------------------------------- | ----- | ------- |
| Projects with a resolved centroid  | 64    | 100 %   |
| Projects with province populated   | 51    | 80 %    |
| Projects with hectares populated   | 39    | 61 %    |
| `status=active` (Registered)       | 4     |  6 %    |
| `status=pipeline` (Under validation/development) | 28 | 44 %  |
| `status=suspended` (On Hold / Inactive) | 29 | 45 %    |
| `status=flagged` (Withdrawn / Rejected) | 3 |  5 %     |

Most of the 64 Indonesian VCS projects are currently in validation or pipeline
states; the Registered-active set is small (4 projects: Rimba Raya is one,
Katingan status mapped to "suspended" because its current status string
"Verification approval requested" is not in the spec's status map and falls
through to `suspended` with a warning log).

## 6. Log tail from the final full run

Last 5 lines from `/tmp/verra-final.log` (2026-04-21 run):

```json
{"event": "HTTP Request: GET https://registry.verra.org/uiapi/resource/resourceSummary/674 \"HTTP/1.1 200 OK\"", "scraper": "verra", "level": "info", "timestamp": "2026-04-21T13:19:48.553Z"}
{"raw": "Late to verify", "event": "status_unmapped", "scraper": "verra", "level": "warning", "timestamp": "2026-04-21T13:19:51.554Z"}
{"event": "HTTP Request: POST https://registry.verra.org/uiapi/asset/asset/search?%24count=true&%24top=500&%24filter=resourceIdentifier+eq+%27674%27 \"HTTP/1.1 200 OK\"", "scraper": "verra", "level": "info", "timestamp": "2026-04-21T13:19:51.852Z"}
{"vcs_id": "VCS1477", "name": "Katingan Peatland Restoration and Conservation Project", "action": "updated", "issuances_written": 0, "centroid_source": "api", "status": "suspended", "event": "project_processed", "scraper": "verra", "level": "info", "timestamp": "2026-04-21T13:19:59.213Z"}
{"scraper": "verra", "started_at": "2026-04-21T13:16:13.287596+00:00", "finished_at": "2026-04-21T13:19:59.214142+00:00", "status": "ok", "records_in": 64, "records_inserted": 0, "records_updated": 64, "records_queued": 0, "issuances_written": 0, "errors": [], "event": "run_complete", "level": "info", "timestamp": "2026-04-21T13:19:59.214Z"}
```

Full run duration: 3 min 46 s for 64 projects × (detail fetch + issuance fetch + 3 s
delay) = ~14 HTTP roundtrips plus 42 s of sleep.

## 7. Deviations from the spec

### D-1 — JSON API instead of HTML scraping (REQUIRED)

The spec (§3.3, §5.1) directs HTML scraping of `registry.verra.org/app/search/...`
pages with `bs4 + lxml`. Those URLs now return a 404 HTML shell. Reverse-engineered
the `/uiapi` JSON endpoints from the live main.js bundle and used those. `bs4` and
`lxml` are still in the dependency set for T07/T08. Documented the endpoint contract
in the "Verra site inspection" section above so future maintainers can adjust
quickly if the API shape changes again.

### D-2 — `country='ID'` is hard-coded, not derived from the Verra response

Verra's list API returns `country="Indonesia"` as a full string. `projects.country`
is `CHAR(2)`. A future multi-country scraper will need a name→ISO-2 map; v0.1 scope
is Indonesia-only so the scraper writes `'ID'` unconditionally. Flagged in the
`upsert_project` docstring.

### D-3 — Katingan hectares heuristic

Verra's `PROJECT_ACREAGE` attribute for VCS1477 reports `"14980 Hectares"` — an
order-of-magnitude error on Verra's side; the project's own description on the same
page reads "149,800 hectares". The scraper now parses hectare figures from the
description text and prefers the description value when it is ≥2× the attribute
value. This preserves correct values on projects where `PROJECT_ACREAGE` is right,
while fixing Katingan. A note to Verra about their data bug is outside this scope.

### D-4 — Issuance endpoint's `@count` value is misleading

`/uiapi/asset/asset/search` returns `@count: 4654` regardless of the `$filter` (it
reports total VCS issuances across all projects, not the filtered subset). The
`value[]` array is correctly filtered. The scraper uses `len(value)` rather than
`@count` and logs the real per-project issuance count. No user-visible bug; just a
gotcha if someone reads the raw response.

### D-5 — AC-6 `validation_date` and AC-7 `project_match_queue` size

See AC-6 and AC-7 analysis above. Both are signals about the spec's assumptions
rather than implementation bugs; recommend the auditor relax AC-6 on the date
sub-check and AC-7 to `>=0` (or add a "triage the two confirmed-distinct pairs"
step to the DoD).

## 8. Commit log

```
fd343ec fix(T06): route stdlib logs (httpx, psycopg) through JSON formatter
a7fd633 docs(T06): scraper-patterns.md for v0.1 conventions
e838f4c feat(T06): weekly cron wrapper script
cf4a9b8 fix(T06): country='ID', Katingan hectares, and idempotent update path
d091bff feat(T06): scrapers/verra/fetch.py with entity resolution
dd0e460 feat(T06): known_centroids for 10 flagship Indonesian VCS projects
866d3d7 feat(T06): bootstrap scrapers/ Python project + common helpers
```

Branched from `d7a538b`. Not pushed, not merged.

## 9. Files owned / created

```
scrapers/pyproject.toml                     (new)
scrapers/uv.lock                            (new)
scrapers/.python-version                    (new)
scrapers/README.md                          (new)
scrapers/common/__init__.py                 (new)
scrapers/common/config.py                   (new)
scrapers/common/db.py                       (new)
scrapers/common/logging.py                  (new)
scrapers/verra/__init__.py                  (new)
scrapers/verra/fetch.py                     (new)
scrapers/verra/known_centroids.py           (new)
scrapers/scripts/run_weekly_verra.sh        (new, executable)
docs/scraper-patterns.md                    (new)
docs/stories/reports/T06-implementation-report.md  (this file)
.gitignore                                  (modified: added scrapers/.venv, scrapers/**/__pycache__)
```

No other files touched.

## 10. What the auditor should scrutinise

1. **`_resolve_centroid` priority order.** Is preferring Verra's `location` over the
   hand-curated `KNOWN_CENTROIDS` the right call? It gives us 100 % centroid
   coverage but means the audit of hand-curated coords in §3 above doesn't actually
   drive real rows for most projects.

2. **`upsert_project` `ON CONFLICT (slug)` vs the fuzzy-match path.** The scraper
   hits the slug-based upsert *after* the fuzzy-match decision; when fuzzy reports
   sim > 0.95 we take `update_existing_project_metadata` instead. But if two
   different Verra projects slugify to the same value (e.g. two projects named
   "REDD+ project in Central Kalimantan"), the second `upsert_project` call will
   update the first one's row rather than insert a fresh row. `_unique_slug`
   guards against this on insert but not on the fuzzy-match sim<=0.95 re-insert
   branch. In practice Verra's project names are unique-enough, but the auditor
   should consider whether a composite-key constraint on (registry_name,
   external_id) → projects.id would be more robust for v0.2.

3. **Status mapping coverage.** Many Indonesian projects returned
   statuses not in the spec's map: "Under validation" (added), "Late to verify"
   (unmapped → suspended with warning), "Verification approval requested"
   (unmapped → suspended — this is why Katingan ends up `suspended`).
   The auditor may want to extend the status map or have the scraper fail loudly
   on unknown statuses rather than default to suspended.

4. **Two queued match-queue rows.** Confirm both are distinct projects and decide
   whether AC-7 should be amended or the rows should be pre-resolved as `rejected`
   in a follow-up commit.

5. **`pyproject.toml` package layout (`common`, `verra` as top-level packages
   rather than under a `karbonlens_scrapers/` parent).** This means
   `python -m verra.fetch` works when cwd is `scrapers/`, but a consumer that
   `pip install`s the wheel would import `from verra import fetch`. For the cron
   use case this is fine; for any future import-from-application-code use case it
   should be reorganised.

## T06 follow-ups (code-audit non-blockers)

These items were identified during the PASS-WITH-FIXES code audit (2026-04-19) and are
recorded here for traceability. None blocked the merge.

### SF-3 status-map gaps (must fix before T11/T12)

18 of 64 Indonesian Verra projects are currently stored as `status=suspended` when they
are actually in active verification (e.g. Katingan is "Verification approval requested",
which is mid-cycle — not suspended). The root cause is that `STATUS_MAP` in
`scrapers/verra/fetch.py` covers only 4 of the 11 distinct Verra status strings observed
in the live dataset.

**Required additions to `STATUS_MAP`:**
```python
"Registration requested": "pipeline",
"Registration and verification approval requested": "pipeline",
"Verification approval requested": "active",
"Late to verify": "flagged",  # Andy's call: active may be more accurate
"Units Transferred from Approved GHG Program": "flagged",
```

**Action:** File follow-up story T06.1 or fold into T09's opening commit. Must land before
T11/T12 frontend goes live — the project explorer will show Katingan as suspended otherwise.
Re-running the scraper after the fix is sufficient (the upsert is idempotent; only the
`status` column will flip for the 18 affected rows).

### SF-1 validation_date semantics (T09 calibration note)

Verra's `/uiapi/resource/resourceSummary/{id}` endpoint exposes `PROJECT_REGISTRATION_DATE`
(the VCS registry registration date), not the original PDD validation date. Katingan's
`validation_date` in the DB is `2020-04-06` — the date of its Verra v4 re-registration —
not the 2015 date when the PDD was validated.

**Downstream impact for T09:** `validation_recency_score` will treat Katingan as a
"fresh 2020 project" rather than a "2015 project." T09 author must either:
- Accept `validation_date` as "registry age" and document this semantic shift in T09's
  scoring rubric, OR
- Add a manually-curated overlay table of true PDD validation dates for the flagship 10
  projects before T09's first scored run.

Cross-reference: T09 implementer should read §SF-1 in `docs/stories/reviews/T06-code-audit.md`
before calibrating `validation_recency_score`.

### SF-2 two queued match-queue pairs (pre-resolved, audit trail)

The code audit confirmed that both `project_match_queue` pending entries at merge time
represented legitimately distinct projects (two different wastewater-methane mills; two
serially-numbered cookstove programs from the same developer). The entity-resolution
threshold logic was working correctly — it correctly flagged near-but-not-identical names
for human review.

**Pre-resolution action (performed by T06 STAGE-5 docs/merge agent, 2026-04-19):**
Both rows were set to `status='rejected'` with `resolved_by='T06-code-audit (pre-merge)'`
so the T21 admin UI starts clean. `SELECT COUNT(*) FROM project_match_queue WHERE
status='pending'` → 0 confirmed.

### AC-6 validation_date nuance (methodology page note)

The Katingan project detail card (T12) and the methodology documentation page should note
that `validation_date` reflects the Verra Registry registration date, not the original PDD
validation date. Katingan was PDD-validated circa 2015 but re-registered under VCS v4 on
2020-04-06; the latter is what the scraper stores. This is the most accurate date the
Verra public API exposes without PDF parsing. A future v0.2 task may add a
`pdd_validation_date` overlay column populated from the `documentGroups` PDF URLs.
