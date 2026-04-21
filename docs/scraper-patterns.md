# KarbonLens scraper patterns — v0.1

This document codifies the six conventions every scraper in `scrapers/` must
follow. It is the single source of truth for T07 (GFW), T08 (IDXCarbon), and
T09 (scoring) implementers. `docs/architecture.md` §4 motivates these rules
at a higher level; this file is the short hands-on reference.

If you are adding a new scraper, read this page, then `scrapers/verra/fetch.py`
as the canonical worked example.

---

## 1. Idempotence — re-runs must not duplicate data

A scraper re-run on the same day must leave row counts stable; only
`updated_at` / `last_synced_at` advances.

Two acceptable implementation patterns:

- **`INSERT ... ON CONFLICT DO UPDATE`** when the target table has a unique
  index or primary key that covers the natural key of the incoming record.
  The Verra scraper uses this on `registries(registry_name, external_id)`
  and on `projects(slug)`.

- **`WHERE NOT EXISTS`** when no unique constraint exists. This is the v0.1
  pattern for `issuances` (migration 001 has no unique index on
  `(project_id, vintage_year, issuance_date, registry_name)`; T07's
  migration 002 will add one, at which point scrapers can switch to
  `ON CONFLICT ON CONSTRAINT`).

Do not implement ad-hoc "check before insert" logic in Python. The DB
decides. If your upsert needs Python-side branching (e.g. entity-resolution
fuzzy-match), do the match query, then issue a deterministic upsert based on
its result — see `scrapers/verra/fetch.py::process_project`.

Do not `TRUNCATE` before re-inserting. The tables are shared across
scrapers; a truncate-then-reinsert strategy destroys rows that other
scrapers own.

---

## 2. Raw payload preservation — always store the untransformed response

Every row that comes from an external source must carry the raw upstream
payload in a `raw_payload` or `raw_metadata` JSONB column:

| Table                  | Column          |
| ---------------------- | --------------- |
| `registries`           | `raw_metadata`  |
| `issuances`            | `raw_payload`   |
| `retirements`          | `raw_payload`   |
| `satellite_alerts`     | `raw_payload`   |
| `idx_monthly_snapshots`| `raw_payload`   |

The payload must be enough to re-parse the normalised columns without
re-fetching. Include at minimum a `scraped_at` ISO-8601 timestamp and the
`source_url`. For HTML scrapers, include the first 5,000 characters of HTML
(full HTML if it fits). For JSON APIs, include the full JSON response.

Rationale: the normalised schema will evolve over v0.2 / v0.3 and we cannot
assume upstream sources retain historical records.

---

## 3. Structured logging — one JSON line per record + one summary line

Every scraper entry point calls `common.logging.configure_logging("<name>")`
once at startup. That gives you a structlog pipeline with ISO-8601
timestamps and a JSON renderer; `get_logger(__name__)` returns a bound
logger.

Per-record log line shape (emit one per record processed):

```json
{
  "event": "project_processed",
  "vcs_id": "VCS1477",
  "name": "Katingan Peatland Restoration and Conservation Project",
  "action": "inserted|updated|skipped|queued",
  "issuances_written": 3,
  "centroid_source": "api|known|province|null",
  "status": "active"
}
```

Final summary line shape (emit exactly one per run, as the last log call):

```json
{
  "event": "run_complete",
  "scraper": "verra",
  "started_at": "2026-04-21T13:00:00Z",
  "finished_at": "2026-04-21T13:04:00Z",
  "status": "ok|error",
  "records_in": 64,
  "records_inserted": 0,
  "records_updated": 64,
  "records_queued": 0,
  "issuances_written": 0,
  "errors": []
}
```

`errors[]` is a list of `{event, ...context}` dicts — one per recoverable
per-record failure. Do not collapse them into a string.

Do not use `print()` or plain stdlib `logging.info()` for scraper output;
they will not be JSON-structured.

---

## 4. Fail loudly — non-zero exit on unhandled errors

Per-record errors (broken HTML, FK violation on a single row) are caught,
logged as an entry in `errors[]`, and the run continues. The exit code is
still 0.

Unhandled exceptions (DB unreachable, upstream down for the whole run,
programmer error) propagate. The scraper catches them at the top level,
logs `event=run_complete status=error` with the traceback via
`log.exception(...)`, and exits with code 1. The cron wrapper script
appends the exit code to the log so ops can grep for failures.

Do not swallow unhandled exceptions to "keep cron quiet". Cron needs to
see a non-zero exit to alert.

*(The `scraper_runs` table referenced in `architecture.md` §4 is not yet
owned by any story. Structured logging is the run-record mechanism for
v0.1; add a migration + helper when the first consumer needs it.)*

---

## 5. Respectful pacing — never burst a source

Per-source request spacing:

| Source     | Minimum delay per request |
| ---------- | ------------------------- |
| Verra      | 3 seconds                 |
| GFW API    | 1 second                  |
| IDXCarbon  | 5 seconds                 |

Sleep between each fetch on the hot path. Do not parallelise requests to a
single source without first confirming a documented rate limit.

The User-Agent on every request must identify KarbonLens and include a
contact URL so the source's ops can reach us if we misbehave. Default is
`KarbonLens-scraper/0.1 (+https://karbonlens.netlify.app)`; override with
`SCRAPER_USER_AGENT` env var if a source asks for something specific.

For HTTP errors, retry up to 3 times with exponential backoff (5s, 10s,
20s) on 5xx and timeout. On 4xx, log and skip — 4xx means the request was
malformed and retrying won't help.

---

## 6. Entry-point convention — `python -m <scraper>.fetch`

Every scraper module exposes a `fetch` submodule that is runnable via
`python -m <scraper>.fetch`. The module accepts three optional flags:

```
--since YYYY-MM-DD     Only process records newer than this date.
                       If a scraper doesn't need this, accept and ignore it.
--dry-run              Parse and log candidate rows; write nothing to the DB.
                       Must not open a DB connection.
--limit N              Process at most N records (smoke-testing aid).
```

All three flags are `argparse.action` flags parsed in `main()`; `run(...)`
accepts them as keyword arguments so tests can call it directly.

`--dry-run` still exercises the full parse path (so it can catch HTML /
JSON structure changes early) and still emits one `event=project_processed`
log line per record. Its `action` field must be `"dry_run"`.

The bash wrapper under `scrapers/scripts/run_weekly_<source>.sh` is what
cron calls. It sources `/opt/karbonlens/.env`, runs the Python module, and
captures the exit code. See `run_weekly_verra.sh` as the canonical form.

---

## Where to put code

```
scrapers/
  pyproject.toml         Owned by T06; pre-declares all Phase 2 deps. Do not
                         run `uv add` from T07/T08/T09 unless T06 has not
                         merged yet.
  uv.lock                Committed; reproducible installs on the VPS.
  .python-version        3.12

  common/
    __init__.py
    config.py            DATABASE_URL + SCRAPER_USER_AGENT + SCRAPER_LOG_DIR.
    db.py                get_connection(), execute(), execute_with_retry().
    logging.py           configure_logging(), get_logger().

  <source>/
    __init__.py
    fetch.py             Entry point.
    (<source>-specific helpers — static data, parsers, whatever)

  scripts/
    run_weekly_<source>.sh   Cron target; T19 installs.

  migrations/
    001_init.sql         T02.
    002_*.sql            T07 onwards.
```

---

## Testing

v0.1 has no automated tests. A scraper is accepted when:

1. `uv run python -m <source>.fetch --dry-run --limit 3` exits 0 and logs a
   valid final `run_complete` JSON line.
2. A full run populates its target tables to the thresholds declared in the
   story's acceptance criteria.
3. An immediate second run logs `records_inserted: 0` (idempotence).
4. `uv run ruff check scrapers/` exits 0.

v0.2 adds pytest fixtures and a harness that can replay committed HTML/JSON
fixtures under `scrapers/<source>/fixtures/`.
