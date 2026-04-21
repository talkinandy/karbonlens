---
id: T07
title: GFW alerts scraper — geostore + query + upsert
phase: 2
status: draft
blocked_by: [T02, T06]
blocks: [T09, T12, T13, T16]
owner: spec-writer agent
effort_estimate: 4h
---

## 1. User story

As Andy (the solo founder running KarbonLens), I want a weekly scraper that fetches the last 90 days of GFW integrated deforestation alerts for each project in the database and stores them as `satellite_alerts` rows, so that the project detail screen and integrity scores have real satellite signal and users receive in-app notifications when new alerts appear.

---

## 2. Context & rationale

GFW (Global Forest Watch) publishes the world's most comprehensive open deforestation alert dataset via the GFW Data API. The integrated alerts layer fuses RADD, GLAD-S2, and GLAD-L alerts into a single feed. For KarbonLens v0.1, this is the primary (and only) real-time reversal signal.

The scraper runs weekly (Mondays 03:00 Asia/Jakarta) via cron. It depends on:

- **T02** — `satellite_alerts` and `notifications` tables in `001_init.sql`.
- **T06** — `projects.centroid` populated for flagship projects and the `scrapers/common/` helpers (`db.py`, `config.py`, `logging.py`).

This story also adds **migration 002** — a single `ALTER TABLE` that adds `projects.gfw_geostore_id`. The column caches the GFW geostore ID after first creation so subsequent weekly runs skip the POST-to-geostore step.

Architecture §5.2 documents the GFW workflow at a high level. This story specifies it precisely enough for a single-session implementation.

---

## 3. Scope

### In scope

1. **Migration `scrapers/migrations/002_add_geostore.sql`** — adds `gfw_geostore_id TEXT` column to `projects` (nullable). Idempotent (`ADD COLUMN IF NOT EXISTS`). Appends `'002'` row to `schema_migrations`.

2. **`scrapers/gfw/fetch.py`** — entry point `python -m scrapers.gfw.fetch`.
   - CLI flags: `--since YYYY-MM-DD` (default: 90 days ago), `--project-id <uuid>` (single-project debug mode), `--dry-run`.
   - **Geostore registration** (per project, where `centroid IS NOT NULL AND gfw_geostore_id IS NULL`):
     - Build a GeoJSON polygon as a geodesic circular ring (~32 points) around the project centroid at radius `buffer_km` km (default 10). Use `shapely` + `pyproj.Geod().fwd()` for geodesic accuracy. Output must be valid GeoJSON `{"type": "Polygon", "coordinates": [[...]]}`.
     - POST `{"geojson": <polygon>}` to `https://data-api.globalforestwatch.org/geostore` with header `x-api-key: $GFW_API_KEY`. Expect a JSON body containing `gfw_geostore_id` (or `data.id` — implementer confirms exact response path by inspecting a live response).
     - On success: `UPDATE projects SET gfw_geostore_id = $1 WHERE id = $2` — do NOT re-register on subsequent runs.
   - **Alert query** (per project with `gfw_geostore_id IS NOT NULL`):
     - `GET https://data-api.globalforestwatch.org/dataset/gfw_integrated_alerts/latest/query/json` with query params:
       - `geostore_id=<gfw_geostore_id>`
       - `sql=<urlencoded>` — the SQL below
     - Header: `x-api-key: $GFW_API_KEY`
     - SQL template:
       ```sql
       SELECT gfw_integrated_alerts__date,
              gfw_integrated_alerts__confidence,
              latitude,
              longitude
       FROM data
       WHERE gfw_integrated_alerts__date >= '<since>'
       ```
     - **Column-name brittleness note:** GFW column names evolve between dataset versions. On first run, log `row[0]` keys verbatim. If the columns differ from the template, the implementer adjusts the column names. This is a known brittleness — document with a `# FIXME: confirm column names` comment in the code.
   - **Upsert** into `satellite_alerts`:
     - `project_id` = project UUID
     - `alert_source` = `'INTEGRATED'` (or the specific sub-source if the response carries a `source` field; fallback `'INTEGRATED'`)
     - `alert_date` = parsed from `gfw_integrated_alerts__date`
     - `confidence` = mapped from numeric field: `2` → `'nominal'`, `3` → `'high'`, `< 2` → `'low'`
     - `location` = `ST_SetSRID(ST_MakePoint(<longitude>, <latitude>), 4326)::geography`
     - `inside_project_buffer` = `TRUE` (geostore pre-filters to the project polygon)
     - `area_ha` = `0.01` (one 10 m pixel ≈ 100 m² ≈ 0.01 ha; if the response row has a clustered count field, multiply accordingly)
     - `raw_payload` = full response row as JSONB
     - Dedupe: `INSERT ... ON CONFLICT DO NOTHING`. Since `satellite_alerts` has no unique constraint on `(project_id, alert_date, location)` in migration 001, use a SELECT-before-INSERT batch check or rely on the geography type comparison (implementer's choice; document which approach was used).
   - **Rate limit**: `time.sleep(1.0)` between project iterations (covers both the geostore POST and the query GET). Each iteration processes one project.
   - **Structured logging** per architecture §4: log `{scraper, project_id, project_slug, step, alerts_inserted, errors}` for each project; summary `{total_projects, total_alerts_inserted, total_errors}` at end.
   - **Missing API key guard**: if `GFW_API_KEY` is unset or empty, print `"GFW_API_KEY required — see docs/runbooks/gfw-api-key.md"` to stderr and `sys.exit(1)` before any network calls.

3. **Post-fetch notifications fan-out** — after each scraper run, for every alert inserted in this run, create `notifications` rows for all users with `email_digest_opt_in = TRUE`. Use a single query scoped to alerts inserted during this run (filter by `ingested_at > run_start_time`):

   ```sql
   INSERT INTO notifications (user_id, type, title, description, project_id, url)
   SELECT
     u.id,
     'reversal',
     'Deforestation alert — ' || p.name_canonical,
     ROUND(COUNT(sa.id)::NUMERIC, 2)::TEXT || ' alert(s) detected near ' || p.name_canonical,
     p.id,
     '/projects/' || p.slug
   FROM users u
   CROSS JOIN (
     SELECT sa.project_id, COUNT(*) AS alert_count
     FROM satellite_alerts sa
     WHERE sa.project_id = $1
       AND sa.ingested_at >= $2
     GROUP BY sa.project_id
   ) batch
   JOIN projects p ON p.id = batch.project_id
   WHERE u.email_digest_opt_in = TRUE
   ON CONFLICT DO NOTHING;
   ```

   Deduplicate so re-running the scraper on the same day does not create duplicate notifications. Suggested approach: add a unique index `(user_id, project_id, type, DATE(created_at))` or check existence before insert. Document which approach the implementer chose.

   If the `users` table is empty (Andy has not logged in yet), the `CROSS JOIN` returns zero rows and the fan-out is a silent no-op. This is the expected and correct behaviour.

4. **`scrapers/scripts/run_weekly_gfw.sh`** — bash wrapper:
   ```bash
   #!/bin/bash
   set -euo pipefail
   source /opt/karbonlens/.env
   cd /opt/karbonlens
   /opt/karbonlens/scrapers/.venv/bin/python -m scrapers.gfw.fetch \
     >> /var/log/karbonlens/gfw.log 2>&1
   ```

5. **`docs/runbooks/gfw-api-key.md`** — Andy's step-by-step to get a free GFW API key:
   - Go to `https://www.globalforestwatch.org/help/developers/` → "Request API access"
   - Fill out the form (name, organization, use case)
   - Wait for approval email (usually same day; key is free, renews annually)
   - Copy the key
   - On the VPS: add `GFW_API_KEY=<key>` to `/opt/karbonlens/.env`
   - Locally: add to `.env.local`
   - For future Netlify deploys: add as a Netlify environment variable (not needed by the scraper, but useful if a server-side route ever calls GFW directly)
   - Key lifetime: the key expires annually. Set a reminder to renew before the expiry date shown in the GFW developer portal.

### Out of scope (explicit non-goals)

- Real-time per-alert emails (v0.2 per PRD — T17 handles weekly digest only).
- Watchlists / per-user project filtering (v0.2).
- Polygon digitization beyond centroid + buffer (v0.2; `buffer_km` proxy is sufficient for v0.1).
- Sub-minute pacing or event-driven triggers (weekly cron is enough).
- Backfilling historical alerts beyond the `--since` window (default 90 days; past that is out of scope for v0.1).
- Automated tests (no tests for v0.1 per TASKS.md).

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Migration 002 applies cleanly and is idempotent**
```
Given migration 001 has been applied
When  sudo -u postgres psql -d karbonlens -f scrapers/migrations/002_add_geostore.sql --single-transaction
Then  the command exits 0
And   \d projects shows a column gfw_geostore_id of type text (nullable)
And   SELECT version FROM schema_migrations WHERE version = '002' returns one row
When  the same migration file is applied a second time
Then  it exits 0 with no errors (ADD COLUMN IF NOT EXISTS is idempotent)
```

**AC-2: Dry-run mode plans without writing**
```
Given GFW_API_KEY is set in the environment
And   at least one project has centroid IS NOT NULL
When  python -m scrapers.gfw.fetch --dry-run
Then  the process exits 0
And   stdout/stderr logs the list of projects that would be registered with GFW geostore
And   SELECT COUNT(*) FROM satellite_alerts returns the same value as before the run
And   no gfw_geostore_id values are written to projects
```

**AC-3: First run populates geostore IDs for all centroid-bearing projects**
```
Given GFW_API_KEY is set
And   N projects have centroid IS NOT NULL and gfw_geostore_id IS NULL
When  python -m scrapers.gfw.fetch
Then  the process exits 0
And   SELECT COUNT(*) FROM projects WHERE centroid IS NOT NULL AND gfw_geostore_id IS NULL returns 0
And   the wall-clock elapsed time is >= N seconds (rate-limit verification)
```

**AC-4: Alert volume meets threshold in 90-day window**
```
Given the scraper has completed successfully
When  SELECT COUNT(*) FROM satellite_alerts
Then  the result is > 50
```

**AC-5: Katingan (or another active peatland flagship) has alerts**
```
Given the scraper has completed successfully
When  SELECT COUNT(*) FROM satellite_alerts
      WHERE project_id IN (SELECT id FROM projects WHERE slug ILIKE '%katingan%')
Then  the result is > 0
```

**AC-6: Re-run does not duplicate alerts**
```
Given the scraper has run once successfully
And   SELECT COUNT(*) FROM satellite_alerts returns X
When  python -m scrapers.gfw.fetch is run again with the same --since date
Then  SELECT COUNT(*) FROM satellite_alerts still returns X (no duplicates)
```

**AC-7: Notifications fan-out**
```
Given at least one user with email_digest_opt_in = TRUE exists in users
And   the scraper inserts new alerts in this run
When  the scraper run completes
Then  SELECT COUNT(*) FROM notifications WHERE type = 'reversal' is > 0
And   each opted-in user has at most one notification per project per calendar day

Given users table is empty
When  python -m scrapers.gfw.fetch
Then  the scraper completes exit 0 with log message "0 users opted in — notifications skipped"
      (or equivalent; fan-out is a no-op)
```

**AC-8: Rate limiting is enforced**
```
Given N projects have gfw_geostore_id populated
When  python -m scrapers.gfw.fetch is run and timed with `time`
Then  the wall-clock elapsed time is >= N seconds
```

**AC-9: Missing API key produces a clear error**
```
Given GFW_API_KEY is not set (unset or empty string)
When  python -m scrapers.gfw.fetch
Then  the process exits non-zero (exit code 1)
And   stderr contains "GFW_API_KEY required" and the path "docs/runbooks/gfw-api-key.md"
And   no HTTP requests are made
```

**AC-10: Lint passes**
```
Given all T07 source files are committed
When  ruff check scrapers/
Then  the command exits 0 with no errors or warnings
```

---

## 5. Inputs & outputs

### Inputs

| Source | Variable / table | Notes |
|---|---|---|
| Environment | `DATABASE_URL` | Postgres connection string; read via `scrapers/common/config.py` |
| Environment | `GFW_API_KEY` | Free API key from globalforestwatch.org |
| DB (read) | `projects.centroid` | Populated by T06 Verra scraper (or manual seed for flagship projects) |
| DB (read/write) | `projects.gfw_geostore_id` | Read to skip re-registration; written on first registration |
| DB (read) | `projects.buffer_km` | Radius for geodesic buffer; default `10` |
| DB (read) | `projects.slug`, `projects.name_canonical` | Used in notification text |
| DB (read) | `users.id`, `users.email_digest_opt_in` | For notifications fan-out |

### Outputs

| Target | Description |
|---|---|
| `scrapers/migrations/002_add_geostore.sql` | Schema migration file |
| `projects.gfw_geostore_id` | Cached geostore ID, set once per project |
| `satellite_alerts` rows | One row per alert per project; deduped on re-run |
| `notifications` rows | One row per opted-in user per project per day with new alerts |
| `scrapers/gfw/fetch.py` | Entry-point module |
| `scrapers/scripts/run_weekly_gfw.sh` | Bash cron wrapper |
| `docs/runbooks/gfw-api-key.md` | API key registration runbook |

### New env vars (add to `.env.example` if not present)

```bash
GFW_API_KEY=<free key from globalforestwatch.org — see docs/runbooks/gfw-api-key.md>
```

---

## 6. Dependencies & interactions

### Blocked by

- **T02** — `satellite_alerts`, `notifications`, and `projects` tables must exist. `schema_migrations` must exist.
- **T06** — `projects.centroid` must be populated for at least the flagship projects. `scrapers/common/db.py`, `scrapers/common/config.py`, and `scrapers/common/logging.py` must exist. `scrapers/pyproject.toml` (managed by uv) must be present. If T06 has already added `shapely` and `pyproj` to `pyproject.toml`, T07 uses them without re-adding. If T06 has not landed yet, T07 adds them itself (`uv add shapely pyproj`).

### Blocks

- **T09** (Score computation) — `reversal_score` component reads from `satellite_alerts`.
- **T12** (Project detail screen) — recent alerts section reads from `satellite_alerts`.
- **T13** (Map integration) — alert dots on Map B come from `satellite_alerts`.
- **T16** (Notifications bell) — reads from `notifications` table populated by this scraper.

### File ownership (T07 exclusively owns these paths)

- `scrapers/migrations/002_add_geostore.sql`
- `scrapers/gfw/` (entire directory: `__init__.py`, `fetch.py`, any helpers)
- `scrapers/scripts/run_weekly_gfw.sh`
- `docs/runbooks/gfw-api-key.md`

T07 **may** append to `scrapers/pyproject.toml` (adding `shapely`, `pyproj`) if T06 has not done so. Coordinate with the T06 implementer to avoid a conflicting edit to that file.

---

## 7. Edge cases & failure modes

| Scenario | Expected behaviour |
|---|---|
| **GFW API 401** (bad or expired key) | Hard fail: log error with message directing Andy to `docs/runbooks/gfw-api-key.md`, exit non-zero. Do not continue to next project. |
| **GFW API 429** (rate limit exceeded) | Read `Retry-After` header; sleep for that duration (minimum 60 s if header absent); retry up to 3 times; if still 429, log and skip the current project, continue to next. |
| **Geostore POST rejected** (e.g. polygon too small, too large, unsupported geometry) | Log `{project_id, error, response_body}` at WARNING level, skip this project, continue loop. Do not write partial data. |
| **GFW SQL column names changed** | The first row of each response is logged at DEBUG level with all keys. The implementer compares to the expected names at implementation time. A `# FIXME` comment in the code flags this as a known brittleness point for future maintenance. |
| **Project has centroid but buffer_km is not 10** | Use `project.buffer_km` from the DB. The geodesic buffer construction must accept any radius, not a hardcoded `10`. |
| **Zero alerts returned for a project** | Log `{"project_id": ..., "alerts_found": 0, "status": "ok"}`. This is a success case — skip upsert and notifications fan-out for that project. |
| **Duplicate alerts on re-run** | `ON CONFLICT DO NOTHING` at INSERT time. If `satellite_alerts` lacks a unique constraint on `(project_id, alert_date, location)`, the implementer adds a SELECT-before-INSERT batch dedup. Document the chosen approach in a code comment. |
| **users table empty** | Fan-out query returns 0 rows. Log `"0 users opted in — notifications skipped"`. No error, no exit. |
| **Network timeout** | `httpx.AsyncClient` (or `requests`) should use `timeout=30` seconds. On timeout, log and skip the project; continue loop. |
| **ingestion-time clock skew** | GFW alert dates are UTC. Server clock is assumed correct. If `gfw_integrated_alerts__date > CURRENT_DATE`, log a WARNING but insert the row normally. |
| **`--project-id` flag used** | Only process the single named project. All other projects are skipped. Useful for debugging a specific project without the full rate-limited run. |
| **`--dry-run` flag used** | Log what would happen (geostore registration plans, estimated alert counts from prior DB data) but make zero writes to DB and zero external HTTP calls. |

---

## 8. Definition of done

- [ ] All 10 acceptance criteria pass.
- [ ] `scrapers/migrations/002_add_geostore.sql` is committed and applied on the Hetzner box.
- [ ] `python -m scrapers.gfw.fetch` runs end-to-end without error on the Hetzner box.
- [ ] `SELECT COUNT(*) FROM satellite_alerts` returns > 50.
- [ ] At least one flagship project (Katingan recommended) has > 0 alerts.
- [ ] `ruff check scrapers/` exits 0.
- [ ] `docs/runbooks/gfw-api-key.md` is committed.
- [ ] `scrapers/scripts/run_weekly_gfw.sh` is committed and executable (`chmod +x`).
- [ ] Story's files landed in `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] TASKS.md `T07` status flipped `todo` → `done`.
- [ ] This story's frontmatter `status` set to `done`.

---

## 9. Open questions

1. **`shapely` + `pyproj` vs `geopandas`** — spec assumes `shapely` + `pyproj` (lighter, no GDAL requirement). If T06 has already committed `geopandas`, use it instead of adding another dep. Confirm with T06 implementer before adding to `pyproject.toml`. *Awaiting: T06 implementation.*

2. **GFW geostore response path** — architecture §5.2 implies `gfw_geostore_id` is returned directly; the live API may nest it as `data.id` or `data.attributes.gfw_geostore_id`. Implementer must check with a live `curl` before writing the parser. *Awaiting: implementer probe.*

3. **GFW SQL column names for confidence** — spec uses `gfw_integrated_alerts__confidence`; the actual column may be `gfw_integrated_alerts__alert_conf` or similar. Implementer confirms via interactive API call. *Awaiting: implementer probe.*

4. **Notifications fan-out scope** — v0.1 spec says notify all users with `email_digest_opt_in = TRUE` for all projects with new alerts. Andy to confirm: is there any domain restriction or should only flagship (top-10) projects trigger notifications for v0.1? *Awaiting: Andy's call. Default spec: all projects.*

5. **`pyproject.toml` coordination** — if T06 and T07 are specced/implemented in parallel, one of them must own the initial `uv add shapely pyproj` commit. Whoever lands first wins; the other rebases. *Awaiting: merge order.*

6. **Pre-existing GFW account** — does Andy already have a Global Forest Watch developer account, or will he register fresh? Affects how quickly GFW_API_KEY becomes available for integration testing. *Awaiting: Andy's confirmation.*

---

## 10. References

- `docs/architecture.md` §3 — `satellite_alerts` and `notifications` table schemas
- `docs/architecture.md` §4 — scraper patterns, cron schedule, structured logging conventions
- `docs/architecture.md` §5.2 — GFW Data API workflow summary
- `docs/architecture.md` §9 — notification and digest pipeline
- `scrapers/migrations/001_init.sql` — live schema (note: `gfw_geostore_id` is absent from `projects` until migration 002 is applied)
- `docs/TASKS.md` T07 — task-level acceptance criteria (superseded by this story where they differ)
- GFW Data API docs: `https://www.globalforestwatch.org/help/developers/`
- GFW geostore endpoint: `https://data-api.globalforestwatch.org/geostore`
- GFW integrated alerts dataset: `https://data-api.globalforestwatch.org/dataset/gfw_integrated_alerts`
