---
id: T06
title: Verra scraper — fetch, parse, and upsert Indonesian VCS projects
phase: 2
status: done
blocked_by: [T02]
blocks: [T07, T09, T11, T12, T13, T19, T21]
owner: spec-writer agent
effort_estimate: 6h
---

## 1. User story

As an operator of KarbonLens, I want a weekly Python scraper that fetches all Indonesian VCS projects from the Verra registry, parses their metadata and issuance history, resolves entities against the existing database, and upserts the results into `projects`, `registries`, and `issuances`, so that Phase 3 frontend stories have real carbon project data to display.

---

## 2. Context & rationale

Phase 1 created the schema (T02) and the Next.js scaffold (T03–T05). The database has all 15 tables but zero application data. This story is the first and most foundational data pipeline: every downstream story — maps (T13), scores (T09), alerts (T07), project explorer (T11), and project detail (T12) — depend on the rows written here.

Verra publishes no public API. The registry at `registry.verra.org` is a standard HTML application. Scraping the search page (filtered by Indonesia) and each project's detail page is the only path to structured data.

The implementer should read `docs/architecture.md` §4 (scraper patterns) and `docs/scraper-patterns.md` (produced by this story) before writing a line of code. All conventions there are hard requirements, not suggestions.

Key constraints carried forward from Phase 1:
- Target host: Hetzner CX32 VPS, Python 3.12 already installed, `uv` already installed at `/root/.local/bin/uv` (confirmed present — use it; no fallback to plain pip needed).
- `pg_trgm` extension is already enabled by migration 001 (`similarity()` is available).
- No Verra API key required. No secrets for this story.
- No automated tests for v0.1. Acceptance criteria are manual shell + SQL checks only.

---

## 3. Scope

### In scope

#### 3.1 Bootstrap `scrapers/` Python project

Initialize the Python project in `scrapers/`. `uv` is confirmed present on the VPS at `/root/.local/bin/uv`; use it exclusively. Do not fall back to `python -m venv`.

```bash
cd scrapers
uv init --no-workspace   # creates pyproject.toml + .python-version
uv add "psycopg[binary]>=3.1" httpx beautifulsoup4 lxml shapely pyproj pdfplumber structlog python-dotenv
uv add --dev ruff
```

`uv` creates `scrapers/.venv/` automatically on first `uv run` or `uv sync`. The venv path `/opt/karbonlens/scrapers/.venv/bin/python` is used by the wrapper script (§3.4).

Commit `pyproject.toml`, `uv.lock`, and `.python-version`. Add `scrapers/.venv/` to `.gitignore` (root `.gitignore` already likely has `.venv`; confirm).

**T06 owns `scrapers/pyproject.toml` and initiates it with ALL Phase 2 runtime dependencies pre-declared.** T07 and T08 do NOT touch `pyproject.toml` — they consume deps already present. This eliminates merge conflicts when T07/T08 are developed in parallel worktrees.

**`pyproject.toml` canonical initial state:**

```toml
[project]
name = "karbonlens-scrapers"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "psycopg[binary]>=3.1",
    "httpx>=0.27",
    "beautifulsoup4>=4.12",
    "lxml>=5",
    "shapely>=2",
    "pyproj>=3.6",
    "pdfplumber>=0.11",
    "structlog>=24",
    "python-dotenv>=1",
]

[project.optional-dependencies]
dev = ["ruff>=0.5"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]
```

Pre-declaring `shapely>=2`, `pyproj>=3.6` (needed by T07 — GFW geostore), and `pdfplumber>=0.11` (needed by T08 — IDXCarbon PDF) ensures T07 and T08 implementers never need to run `uv add` and never modify files owned by T06. Exact pinned versions are resolved by `uv` at lock time; the constraints above are minimums.

#### 3.2 `scrapers/common/` helpers

Create the following files. They are shared by all scrapers (T06, T07, T08, T09).

**`scrapers/common/__init__.py`** — empty.

**`scrapers/common/config.py`**

Loads environment from `.env` and `.env.local` using `python-dotenv`. Exposes:
- `DATABASE_URL: str` — raises `RuntimeError` if absent.
- `SCRAPER_USER_AGENT: str` — defaults to `"KarbonLens/0.1 (+https://karbonlens.id)"` if env var unset (matches `docs/architecture.md` §7).
- `SCRAPER_LOG_DIR: str` — defaults to `/var/log/karbonlens`.

```python
# scrapers/common/config.py
from dotenv import load_dotenv
import os

load_dotenv(".env.local", override=True)
load_dotenv(".env", override=False)

_DATABASE_URL = os.environ.get("DATABASE_URL")
if not _DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required")
DATABASE_URL: str = _DATABASE_URL

SCRAPER_USER_AGENT: str = os.environ.get(
    "SCRAPER_USER_AGENT", "KarbonLens/0.1 (+https://karbonlens.id)"
)
SCRAPER_LOG_DIR: str = os.environ.get("SCRAPER_LOG_DIR", "/var/log/karbonlens")
```

**`scrapers/common/db.py`**

Provides a context manager that yields a psycopg connection with autocommit disabled (use explicit transactions). Reads `DATABASE_URL` from `config.py`.

Exposes:
- `get_connection()` — context manager returning `psycopg.Connection`. Caller is responsible for `conn.commit()` / `conn.rollback()`.
- `execute(conn, sql, params=None)` — thin wrapper calling `conn.execute()` that logs the SQL at DEBUG level before execution. Returns the cursor.
- `execute_with_retry(conn, sql, params=None, *, retries=3)` — calls `execute()` with up to `retries` attempts on `psycopg.OperationalError` (transient connection drops). Raises on final failure.

```python
# scrapers/common/db.py
from contextlib import contextmanager
import time
import psycopg
import structlog
from .config import DATABASE_URL

log = structlog.get_logger(__name__)

@contextmanager
def get_connection():
    """Open a psycopg connection. Caller commits/rolls back explicitly."""
    with psycopg.connect(DATABASE_URL) as conn:
        yield conn

def execute(conn: psycopg.Connection, sql: str, params=None):
    """Log SQL at DEBUG level, then execute. Returns the cursor."""
    log.debug("sql", query=sql[:200], params=params)
    cur = conn.execute(sql, params)
    return cur

def execute_with_retry(
    conn: psycopg.Connection,
    sql: str,
    params=None,
    *,
    retries: int = 3,
):
    """execute() with exponential-backoff retry on OperationalError."""
    for attempt in range(retries):
        try:
            return execute(conn, sql, params)
        except psycopg.OperationalError:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
```

Do not use a module-level singleton connection. Each scraper run should open and close one connection. T07, T08, and T09 import `get_connection`, `execute`, and `execute_with_retry` from this module — do not rename them.

**`scrapers/common/logging.py`**

Configures `structlog` with a JSON renderer. Must be called once at the top of each scraper entry point via `configure_logging()`.

Exposes:
- `configure_logging(scraper_name: str) -> None` — configures structlog with `JSONRenderer`, ISO timestamps, and a bound `scraper` key.
- `get_logger(name: str)` — returns a bound structlog logger. Alias for `structlog.get_logger(name)`.

The final JSON line per scraper run must include at minimum:
```json
{
  "scraper": "verra",
  "started_at": "...",
  "finished_at": "...",
  "status": "ok|error",
  "records_in": 42,
  "records_inserted": 10,
  "records_updated": 32,
  "errors": []
}
```

<!-- scraper_runs.py stub removed: no scraper_runs table exists in migration 001 and no Phase 2 story owns its creation. See §9 OQ-4. -->

#### 3.3 `scrapers/verra/` — core scraper

Create `scrapers/verra/__init__.py` (empty) and the files below.

---

**`scrapers/verra/known_centroids.py`**

A static Python dict of hand-curated centroids for flagship Indonesian carbon projects. These are v0.1 proxies sourced from public project design documents; they will be superseded by digitized polygons in v0.2.

```python
# scrapers/verra/known_centroids.py
# Hand-curated project centroids (lat, lon) for flagship Indonesian VCS projects.
# Source: project design documents, public satellite imagery references, REDD+ project pages.
# Accuracy: ±5–20 km; adequate as a centroid proxy for v0.1 alert buffering (10 km radius).
# Replace in v0.2 when digitized polygons are available.

KNOWN_CENTROIDS: dict[str, tuple[float, float]] = {
    # (latitude, longitude) — WGS84
    # NOTE (OQ-1): Andy reviews and corrects this list at code-audit stage.
    # Coordinates are best-guess from public PDDs; accuracy ±5–20 km.
    "VCS1477": (-1.8500,  112.9500),   # Katingan Mentaya (Central Kalimantan)
    "VCS612":  (-2.7000,  112.3000),   # Rimba Raya Biodiversity Reserve (C. Kalimantan)
    "VCS1350": (-3.1500,  104.8500),   # Merang Peatland (South Sumatra)
    "VCS944":  (-2.9500,  104.7500),   # Sumatera Merang (South Sumatra)
    "VCS2562": (-5.5000,  134.5000),   # Cendrawasih Aru (Maluku)
    "VCS1764": (-0.5000,  116.5000),   # Berau Forest Carbon (East Kalimantan)
    "VCS1392": (-1.2500,  116.0000),   # East Kalimantan Forest (Berau region)
    "VCS2250": (-0.8000,  113.5000),   # Rimba Karbon (Central Kalimantan)
    "VCS2571": (-2.3000,  115.0000),   # Katingan Watershed extension
    "VCS2316": ( 0.5000,  109.5000),   # West Kalimantan REDD+ cluster
}

# Province-level fallback centroids (used when no project-specific entry exists).
# Based on provincial capitals as a rough geographic proxy.
PROVINCE_CENTROIDS: dict[str, tuple[float, float]] = {
    "Central Kalimantan":  (-1.6813,  113.3823),
    "East Kalimantan":     ( 0.5387,  116.4194),
    "West Kalimantan":     ( 0.0256,  109.3426),
    "South Kalimantan":    (-3.3194,  114.5908),
    "North Kalimantan":    ( 3.0731,  116.0413),
    "South Sumatra":       (-3.3194,  104.9144),
    "Riau":                ( 0.5333,  101.4500),
    "Riau Islands":        ( 0.9167,  104.4503),
    "Jambi":               (-1.6101,  103.6131),
    "Aceh":                ( 5.5483,   95.3238),
    "Papua":               (-4.2699,  138.0804),
    "West Papua":          (-1.3361,  132.1747),
    "Maluku":              (-3.2385,  130.1453),
    "North Maluku":        ( 0.8917,  127.7404),
    "Sulawesi":            (-1.4300,  121.4456),   # broad fallback
}
```

> **Open question OQ-1:** Andy to confirm or amend this list of flagship VCS IDs and their centroids before implementation. The list above is a best-effort v0.1 seed. See §9.

---

**`scrapers/verra/fetch.py`** — entry point

Module entrypoint: `python -m scrapers.verra.fetch`

```
Usage: python -m scrapers.verra.fetch [--since YYYY-MM-DD] [--dry-run] [--limit N]

  --since   Only process projects whose last_synced_at is older than this date.
            Defaults to processing all (weekly full refresh).
  --dry-run Parse and log candidate rows; write nothing to the DB.
  --limit N Process at most N projects (useful for smoke testing).
```

**High-level execution flow:**

```
1. configure_logging("verra")
2. Parse CLI flags
3. Open DB connection (skip if --dry-run)
4. Fetch project list page → parse project IDs + list-level fields
5. For each project_id (respecting --limit):
   a. Fetch detail page (3-second delay between fetches)
   b. Parse detail fields
   c. Resolve centroid (known_centroids.py → province fallback → NULL)
   d. Entity-resolve against projects table
   e. Upsert project, registry, issuances (skip if --dry-run)
   f. Log one JSON line per project
6. Log final summary JSON line
7. Exit 0 on success, 1 on any unhandled exception
```

**URL constants** (place near top of file, above imports):

```python
# Verra registry search page — Indonesia filter.
# WARNING: Verra's site structure changes without notice. If this URL stops
# returning results, inspect the live page at registry.verra.org and update
# the URL and CSS selectors below accordingly.
VERRA_SEARCH_URL = (
    "https://registry.verra.org/app/search/VCS/Registered+project"
    "?filter%5BcountryCode%5D=ID"
)

# Verra project detail page (append project's numeric ID)
VERRA_DETAIL_BASE = "https://registry.verra.org/app/projectDetail/VCS/"

# Verra issuance table endpoint (append project's numeric ID)
VERRA_ISSUANCE_BASE = "https://registry.verra.org/app/issuanceDetail/VCS/"
```

**Fetch layer** (`httpx` with headers):

```python
HEADERS = {
    "User-Agent": config.SCRAPER_USER_AGENT,
    "Accept": "text/html,application/xhtml+xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.5",
}

FETCH_DELAY_SECONDS = 3          # between each detail-page fetch
RETRY_MAX = 3
RETRY_BACKOFF_BASE = 5           # seconds; doubles on each retry (5, 10, 20)
```

Implement a `_fetch(url: str, *, retries: int = RETRY_MAX) -> str` helper:
- On `httpx.TimeoutException` or 5xx response: wait `RETRY_BACKOFF_BASE * 2^attempt` seconds, retry.
- After all retries exhausted: log error, return `None`.
- Caller checks for `None` and skips the project.

**Parsing — project list page:**

Use `beautifulsoup4` with the `lxml` parser. Parse the results table (`<table class="...">` — actual class name TBD by implementer from live inspection). For each row extract:
- `vcs_id` (e.g. `VCS1477`) — also used to construct the detail URL
- `name` (raw string from the table cell)
- `status` text (e.g. "Registered", "Under Development", "On Hold", "Withdrawn")
- `methodology` (e.g. "VM0007")
- `project_type` (e.g. "AFOLU")
- `country` (should be "Indonesia" — verify; skip if not)

Store raw HTML of each page in a local variable for error reporting. If BeautifulSoup cannot find the expected table structure, log `{"event": "parse_error", "url": url, "html_snippet": html[:2000]}` and return an empty list.

**Parsing — project detail page:**

For each project, fetch `VERRA_DETAIL_BASE + numeric_id`. Extract:
- `developer` (project proponent)
- `hectares` (project area in ha — may be labelled "Total Area")
- `validation_date` (parse to `datetime.date`)
- `first_issuance_date` (from issuance history if not shown on detail)
- `total_vcus_issued` (cumulative VCUs issued)
- `total_vcus_retired` (cumulative VCUs retired)
- `description` (project overview paragraph, first 500 chars)

Also attempt to fetch `VERRA_ISSUANCE_BASE + numeric_id` to get the issuance table (vintage year, credits issued, issuance date, serial range). Parse each row into an `Issuance` dataclass.

If any field is missing or unparseable, set it to `None` (never crash the whole run on a single bad field). Preserve the raw HTML in `raw_metadata` for replay.

**Status mapping:**

| Verra status text | DB `projects.status` |
|---|---|
| `Registered` | `active` |
| `Under Development` | `pipeline` |
| `On Hold` | `suspended` |
| `Inactive` | `suspended` |
| `Withdrawn` | `flagged` |
| anything else | `suspended` (log a warning) |

**Centroid resolution** (in priority order):

1. Check `known_centroids.KNOWN_CENTROIDS[vcs_id]` — use if present.
2. If province is parseable from the detail page, look up `known_centroids.PROVINCE_CENTROIDS[province]`.
3. Otherwise set `centroid = None`. Project is still inserted. T07 will skip centroid-null projects.

**Slug generation:**

```python
import re, unicodedata

def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:100]
```

If the generated slug already exists for a different project, append `-2`, `-3`, etc.

**Entity resolution:**

> **Note on threshold divergence:** `docs/architecture.md` §5.1 references a single 0.85 threshold. T06 uses a two-threshold system (auto-merge >0.95, review queue 0.70–0.95) which is more nuanced and is canonical for all Phase 2 scrapers. Andy should update `architecture.md` §5.1 when T06 is marked done. Until then, treat this spec as the authoritative source for entity-resolution thresholds.

Before any insert, query the `projects` table for a fuzzy name match using `pg_trgm`:

```sql
SELECT id, name_canonical, similarity(name_canonical, %(name)s) AS sim
FROM projects
WHERE similarity(name_canonical, %(name)s) > 0.70
ORDER BY sim DESC
LIMIT 1;
```

Decision table:

| `sim` value | Action |
|---|---|
| `> 0.95` | Skip insert. Call `_update_project_metadata(existing_id, ...)` to bump `updated_at`, refresh `total_vcus_issued`, `total_vcus_retired`. |
| `0.70 < sim <= 0.95` | **Insert the incoming Verra project first** as a new row into `projects` (using the normal insert path). Then insert into `project_match_queue` with `candidate_a_id = existing_project.id`, `candidate_b_id = newly_inserted.id`, `similarity = sim`, `match_reason = 'name_fuzzy'`, `status = 'pending'`. Log `{"event": "ambiguous_match", "existing_id": ..., "new_id": ..., "sim": sim}`. The T21 admin UI will later merge or reject by comparing both candidates side by side. **Do not discard the incoming project data.** |
| `< 0.70` or no match | Insert new project row (normal path). |

The `candidate_b_id = NULL` pattern is explicitly prohibited. A queue row without a resolvable `candidate_b` gives the T21 reviewer nothing to act on, and the incoming project data is silently lost across weekly reruns.

This logic runs even on `--dry-run`; in dry-run mode log the decision but skip all DB writes.

**Upsert `registries`:**

```sql
INSERT INTO registries (project_id, registry_name, external_id, status, url, raw_metadata, last_synced_at)
VALUES (%(project_id)s, 'Verra', %(external_id)s, %(status)s, %(url)s, %(raw_metadata)s, NOW())
ON CONFLICT (registry_name, external_id)
DO UPDATE SET
    status         = EXCLUDED.status,
    raw_metadata   = EXCLUDED.raw_metadata,
    last_synced_at = NOW();
```

`raw_metadata` must include at minimum:
```json
{
  "html_snippet": "<first 5000 chars of detail page HTML>",
  "scraped_at": "ISO-8601 timestamp",
  "vcs_id": "VCS1477",
  "source_url": "https://..."
}
```

**Upsert `issuances`:**

Issuances dedupe on `(project_id, vintage_year, issuance_date, registry_name)`. Migration 001 has no unique constraint on this tuple. **T07 owns migration 002** which adds a unique index on `issuances` (among other indexes). Until migration 002 is merged, T06 uses the `WHERE NOT EXISTS` pattern:

```sql
INSERT INTO issuances (project_id, registry_name, vintage_year, credits, issuance_date,
                       serial_start, serial_end, raw_payload)
SELECT %(project_id)s, 'Verra', %(vintage_year)s, %(credits)s, %(issuance_date)s,
       %(serial_start)s, %(serial_end)s, %(raw_payload)s
WHERE NOT EXISTS (
    SELECT 1 FROM issuances
    WHERE project_id    = %(project_id)s
      AND vintage_year  = %(vintage_year)s
      AND issuance_date = %(issuance_date)s
      AND registry_name = 'Verra'
);
```

After migration 002 merges, the scraper can be updated to use `ON CONFLICT ON CONSTRAINT` instead. For v0.1, the `WHERE NOT EXISTS` approach is canonical and correct.

**NOTE:** Concurrent scraper runs (two cron fires within the same minute) could produce a race on the `WHERE NOT EXISTS` check. The weekly cron cadence makes this extremely unlikely on a single VPS, but if it occurs the second insert simply produces a duplicate row that the next idempotency run will detect via the `sim > 0.95` entity-resolution path. A `BEGIN; SELECT ... FOR UPDATE; INSERT; COMMIT` lock pattern is not required for v0.1 given the low race probability.

**Structured logging per project:**

Every project processed emits one log line:
```json
{
  "event": "project_processed",
  "vcs_id": "VCS1477",
  "name": "Katingan Mentaya",
  "action": "inserted|updated|skipped|queued",
  "issuances_written": 12,
  "centroid_source": "known|province|null"
}
```

Final summary line:
```json
{
  "event": "run_complete",
  "scraper": "verra",
  "started_at": "...",
  "finished_at": "...",
  "status": "ok",
  "records_in": 42,
  "records_inserted": 42,
  "records_updated": 0,
  "errors": []
}
```

---

#### 3.4 `scrapers/scripts/run_weekly_verra.sh`

Bash wrapper that is the cron target (T19 installs the cron entry; T06 just produces the file).

```bash
#!/bin/bash
# Weekly Verra scraper — cron target.
# Cron schedule (installed by T19): 0 2 * * 1  (Mondays 02:00 VPS local time)
# See /etc/cron.d/karbonlens

set -euo pipefail

ENV_FILE=/opt/karbonlens/.env
VENV_PYTHON=/opt/karbonlens/scrapers/.venv/bin/python
REPO=/opt/karbonlens
LOG=/var/log/karbonlens/verra.log

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found" >&2
    exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

cd "$REPO"

echo "--- $(date --iso-8601=seconds) verra scraper start ---" >> "$LOG"
"$VENV_PYTHON" -m scrapers.verra.fetch >> "$LOG" 2>&1
SCRAPER_EXIT=$?
echo "--- $(date --iso-8601=seconds) verra scraper end (exit $SCRAPER_EXIT) ---" >> "$LOG"
exit $SCRAPER_EXIT
```

Make executable: `chmod +x scrapers/scripts/run_weekly_verra.sh`.

---

#### 3.5 `docs/scraper-patterns.md`

Create this file if it does not already exist. Its content codifies the conventions from `docs/architecture.md` §4 so future scrapers can reference it as the single source of scraper conventions, without needing to read the full architecture doc. See §6 for the file path; see §5 for the content contract.

---

### Out of scope (explicit non-goals)

- SRN-PPI scraper (v0.2 backlog)
- Gold Standard Registry (v0.3 backlog)
- Real project polygon digitization (v0.2)
- `gfw_geostore_id` column on `projects` — T07 adds this via migration 002
- GFW alert fetching — T07
- Score computation — T09
- Cron installation — T19
- Entity-resolution admin UI — T21 (this story only populates `project_match_queue`)
- Any frontend changes
- `scraper_runs` table and `common/scraper_runs.py` — no `scraper_runs` table exists in migration 001; no Phase 2 story owns its creation (see §9 OQ-4)
- Retirement data scraping (schema exists; Verra retirements are a v0.2 priority)

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Dry-run completes with parsed output, no DB writes**
```
Given the scrapers venv is active and DATABASE_URL is set
When  cd scrapers && python -m scrapers.verra.fetch --dry-run --limit 3
Then  the process exits with code 0
And   stdout/stderr contains a JSON log line with "records_in": 3
And   no rows are added to projects, registries, or issuances
```

**AC-2: Full run populates projects table**
```
Given an empty database (first run after T02 migration)
When  python -m scrapers.verra.fetch
Then  the process exits with code 0
And   SELECT COUNT(*) FROM projects WHERE country='ID'; returns >= 40
```
(≥40 matches PRD §4 success criterion and architecture §5.1 "~40 Indonesian VCS projects at v0.1 launch."
Verra alone is expected to yield ≥40 active Indonesian projects. If the live count is 38–39,
Andy may accept at code-audit stage; document the actual Verra count in the implementation report.)

**AC-3: Full run populates registries table**
```
Given AC-2 has completed
When  SELECT COUNT(*) FROM registries WHERE registry_name='Verra';
Then  the result is >= 40
And   every row has a non-null external_id matching 'VCS\d+' pattern
```

**AC-4: Full run populates issuances table**
```
Given AC-2 has completed
When  SELECT COUNT(*) FROM issuances;
Then  the result is >= 50
(Verra projects have multi-vintage issuance histories; 50 is a conservative floor)
```

**AC-5: Idempotency — second run creates no duplicates**
```
Given AC-2 has completed (first run counts recorded)
When  python -m scrapers.verra.fetch is run a second time on the same day
Then  project, registry, and issuance counts are unchanged
And   only updated_at / last_synced_at timestamps have advanced
And   the final log line shows "records_inserted": 0 and "records_updated": > 0
```

**AC-6: Katingan Peatland flagship data**
```
Given AC-2 has completed
When  SELECT name_canonical, developer, hectares, validation_date, total_vcus_issued
      FROM projects
      WHERE slug LIKE '%katingan%' OR name_canonical ILIKE '%katingan%';
Then  a row is returned with:
      - hectares approximately 149,800 (within ±5% of Verra's published figure)
      - developer containing 'Rimba Makmur' or 'PT RMU' or 'Wet Tropics'
      - validation_date between 2013-01-01 and 2015-12-31
      - total_vcus_issued > 0
```

**AC-7: project_match_queue is empty on first clean fill**
```
Given AC-2 has completed (first run against an empty database)
When  SELECT COUNT(*) FROM project_match_queue WHERE status='pending';
Then  the result is 0
(No ambiguous duplicates expected on first fill of an empty database;
 any non-zero result indicates a logic bug in entity resolution)
```

**AC-8: Per-project structured log output**
```
Given python -m scrapers.verra.fetch is run with stdout captured
When  the output is inspected
Then  each line is valid JSON
And   at least one line contains "event": "project_processed" with vcs_id, action, and centroid_source
And   the final line contains "event": "run_complete" with scraper, status, records_in,
      records_inserted, records_updated, and errors fields
```

**AC-9: ruff lint passes**
```
Given the scrapers/ directory is populated
When  ruff check scrapers/
Then  exit code is 0 with 0 errors reported
```

---

## 5. Inputs & outputs

**Inputs:**
- `DATABASE_URL` env var (required; scraper raises `RuntimeError` if absent)
- `SCRAPER_USER_AGENT` env var (optional; defaults to `KarbonLens/0.1 (+https://karbonlens.id)`)
- Verra public HTML at `registry.verra.org` (no credentials required)
- `.env` or `.env.local` in the working directory (loaded by `common/config.py`)

**Outputs:**
- Rows written to `projects` (country `ID`), `registries` (registry_name `Verra`), `issuances`
- Rows optionally written to `project_match_queue` (ambiguous entity matches)
- Structured JSON log appended to `/var/log/karbonlens/verra.log` when run via the wrapper script; to stdout when run interactively
- `scrapers/pyproject.toml`, `scrapers/uv.lock`, `scrapers/.python-version` (Python project metadata, committed to git)
- No secrets written anywhere; no files in `legacy/` modified

**Env vars added to `.env.example`** (if not already present):
```bash
# Scraper config — used by all Python scrapers
SCRAPER_USER_AGENT="KarbonLens/0.1 (+https://karbonlens.id)"
SCRAPER_LOG_DIR=/var/log/karbonlens
```

---

## 6. Dependencies & interactions

**Blocked by:**
- T02 (schema migration 001) — `projects`, `registries`, `issuances`, and `project_match_queue` tables must exist; `pg_trgm` extension must be enabled. Both confirmed done as of 2026-04-21.

**Blocks:**
- T07 — GFW scraper needs `projects` rows with non-null `centroid` to build geostores
- T09 — Score computation needs `projects` and `issuances` rows
- T11 — Projects explorer needs `projects` rows
- T12 — Project detail needs `projects`, `registries`, and `issuances` rows
- T13 — Map integration needs project `centroid` populated
- T19 — Cron installation needs `scrapers/scripts/run_weekly_verra.sh` to exist
- T21 — Entity resolution admin page needs `project_match_queue` rows to review

**Files owned by this story** (parallel implementers must not touch these):

```
scrapers/pyproject.toml              ← T06 owns; pre-declares ALL Phase 2 deps
scrapers/uv.lock
scrapers/.python-version
scrapers/common/__init__.py
scrapers/common/config.py
scrapers/common/db.py
scrapers/common/logging.py
scrapers/verra/__init__.py
scrapers/verra/fetch.py
scrapers/verra/known_centroids.py
scrapers/scripts/run_weekly_verra.sh
docs/scraper-patterns.md
```

Files this story must NOT modify:
- `scrapers/migrations/001_init.sql` (T02 owns this; it is already applied)
- Any file outside `scrapers/` and `docs/scraper-patterns.md`
- Any Next.js / TypeScript source files
- `docs/architecture.md`, `docs/TASKS.md`, or other existing docs

---

## 7. Edge cases & failure modes

**E1: Verra HTML structure changes mid-scrape**
The scraper must not crash the entire run when a single project's detail page has an unexpected structure. Pattern: wrap each project's parsing in a `try/except Exception`, log `{"event": "parse_error", "vcs_id": ..., "html_snippet": html[:2000], "error": str(e)}`, and continue to the next project. The raw HTML snippet goes into `raw_metadata.html_snippet` on the registry row if a partial upsert was possible; otherwise it goes only to the log.

**E2: Indonesia filter returns more than 60 projects**
Do not cap. The `--limit` flag exists for smoke testing only. Production runs always ingest the full result set regardless of count.

**E3: Same VCS ID from a prior incomplete run**
The `ON CONFLICT` upsert on `registries(registry_name, external_id)` handles this cleanly. For `projects`, the entity-resolution query will find the existing row with `sim > 0.95` and update metadata instead of inserting a duplicate.

**E4: Projects without a valid centroid**
Insert with `centroid = NULL`. The `centroid` column has no `NOT NULL` constraint. Log `{"event": "project_processed", "centroid_source": "null"}`. T07 skips these projects (its loop filters `WHERE centroid IS NOT NULL`).

**E5: Connection timeout to Verra**
The `_fetch()` helper retries up to 3 times with exponential backoff (5s, 10s, 20s). After all retries are exhausted, log the failure at WARNING level and return `None`. The caller skips the project and continues the run. The final summary line accumulates failed projects in the `errors` array.

**E6: DB constraint violation (FK or unique)**
Wrap each DB write in a `try/except psycopg.errors.UniqueViolation` (and a broader `psycopg.DatabaseError` catch). Log the error and continue; do not crash the run. The final `errors` array captures all DB errors.

**E7: PostGIS extension absent**
If the DB does not have PostGIS installed, `ST_SetSRID(ST_MakePoint(...), 4326)` will raise a `psycopg.DatabaseError`. The scraper should catch this on the first centroid insert, log a clear `FATAL: PostGIS extension not available — centroid inserts will fail` message, and fall back to inserting `centroid = NULL` for the rest of the run. (This should not happen on the live box where T01 confirmed PostGIS is installed.)

**E8: Malformed `DATABASE_URL`**
`common/config.py` raises `RuntimeError` at import time if the variable is absent. A bad but present URL will cause psycopg to raise `psycopg.OperationalError` on connection open; this propagates as an unhandled exception, the scraper exits with code 1, and the shell wrapper logs the failure.

**E9: `project_match_queue` non-zero on first run**
If AC-7 fails (non-zero pending queue on first fill), it indicates a bug in the similarity threshold logic. The implementer should add a debug log that prints the actual similarity score for every match candidate so the threshold can be tuned. Do not raise the 0.70 floor above 0.95 to mask the issue.

**E10: Concurrent scraper runs (race on `WHERE NOT EXISTS`)**
Two cron fires within seconds of each other (e.g. system clock drift or a manual re-run during an in-flight cron) could both pass the `WHERE NOT EXISTS` check and produce duplicate issuance rows. The weekly cadence and single-VPS setup make this extremely unlikely for v0.1. The chosen mitigation is documentation only: the log's `records_in` / `records_inserted` counts will diverge from reality, and the next weekly run's idempotency check (entity resolution `sim > 0.95`) will catch the duplicate project rows. Duplicate issuance rows will need a one-time `DELETE` if migration 002's unique index subsequently fails to apply. If Andy wants a stronger guarantee, a `SELECT pg_advisory_lock(hashtext('verra_scraper'))` at the top of the run provides a process-level mutex. Not required for v0.1.

---

## 8. Definition of done

- [ ] All 9 acceptance criteria pass (verified manually against the Hetzner staging DB)
- [ ] `ruff check scrapers/` exits 0
- [ ] Story's files (§6 file list) are committed to `feature/v0.1-impl`
- [ ] `uv.lock` is committed (ensures reproducible installs on the VPS)
- [ ] `docs/scraper-patterns.md` exists and codifies the 6 conventions from `docs/architecture.md` §4
- [ ] CHANGELOG entry added under `[Unreleased]`
- [ ] `docs/TASKS.md` T06 status flipped from `todo` → `done`
- [ ] Story frontmatter `status` set to `done`

---

## 9. Open questions

**OQ-1 (non-blocking — Andy reviews at code-audit stage):** The `KNOWN_CENTROIDS` dict in `known_centroids.py` is a best-guess seed of 10 projects (VCS1477, VCS612, VCS1350, VCS944, VCS2562, VCS1764, VCS1392, VCS2250, VCS2571, VCS2316). Duplicate key VCS1764 has been removed (was a spec bug). The implementer proceeds with this list; Andy corrects VCS IDs and/or coordinates at merge time. This is no longer a pre-implementation gate.

**OQ-2 (non-blocking):** Andy's preference for scraper user-agent string on Verra requests. The architecture doc §7 already specifies `"KarbonLens/0.1 (+https://karbonlens.id)"`. If Andy wants a different polite UA (e.g. including a contact email), update `SCRAPER_USER_AGENT` in `.env.example` before deployment. The spec defaults to the value already in the architecture doc.

**OQ-3 (non-blocking — resolved for v0.1):** The `WHERE NOT EXISTS` pattern is canonical for v0.1 issuance deduplication. Migration 002 (owned by T07) adds a unique index on `issuances`; after it merges, the scraper can be updated to use `ON CONFLICT ON CONSTRAINT`. No action needed before T06 implementation starts.

**OQ-4 (non-blocking — future story):** The `scraper_runs` table referenced in `docs/architecture.md` §4 convention 4 does not exist in migration 001 and has no owner in Phase 2 (T06–T10). The `common/scraper_runs.py` stub has been removed from T06 scope to avoid dead-code accumulation. Andy should assign a `scraper_runs` migration to a Phase 3 story or a dedicated `T-later` task before the feature is needed. Structured logging (§3.2 `common/logging.py`) is a sufficient run-record mechanism for v0.1.

---

## 10. References

- `docs/architecture.md` §3 — canonical DB schema (`projects`, `registries`, `issuances`, `project_match_queue`)
- `docs/architecture.md` §4 — scraper patterns (idempotence, structured logging, respectful pacing, raw-payload preservation, entry-point convention)
- `docs/architecture.md` §5.1 — Verra data source contract
- `docs/architecture.md` §7 — environment variables including `SCRAPER_USER_AGENT`
- `scrapers/migrations/001_init.sql` — applied schema; `pg_trgm` confirmed present
- `docs/TASKS.md` T06 — original task specification
- `docs/scraper-patterns.md` — created by this story; conventions reference for T07, T08, T09

---

### Appendix A — `docs/scraper-patterns.md` content contract

The file `docs/scraper-patterns.md` created by this story must cover the following six conventions (derived verbatim from `docs/architecture.md` §4). Future scraper stories (T07, T08, T09) will reference this file, not the architecture doc, for scraper conventions.

1. **Idempotence** — Use `INSERT ... ON CONFLICT DO UPDATE` or `WHERE NOT EXISTS` patterns. A scraper must be safely re-runnable on any day without duplicating data.

2. **Raw payload preservation** — Always store the unprocessed response (JSON, HTML text, PDF text) in a `raw_payload` or `raw_metadata` JSONB column. When the normalized schema evolves, historical data can be re-parsed without re-fetching.

3. **Structured logging** — Use `structlog` with the JSON renderer configured in `common/logging.py`. Every scraper run must emit a final summary JSON line with: `scraper`, `started_at`, `finished_at`, `status`, `records_in`, `records_inserted`, `records_updated`, `errors`.

4. **Fail loudly on unrecoverable errors** — On an unhandled exception, log the full traceback and exit non-zero. Cron captures the exit code. Per-record errors (broken HTML, FK violation) are caught, logged, and accumulated in `errors[]`; they do not halt the run but they do appear in the summary line.

5. **Respectful pacing** — Verra detail pages: 3 seconds between fetches. GFW API: 1 request/second. IDXCarbon site: 1 request per 5 seconds. Never parallelize fetches from a single source without explicit rate-limit confirmation.

6. **Entry-point convention** — Every scraper exposes `python -m scrapers.<source>.fetch` with optional flags `--since YYYY-MM-DD`, `--dry-run`, `--limit N`. The `--dry-run` flag must suppress all DB writes while still exercising the full parse path.
