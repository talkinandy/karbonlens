---
id: T08
title: IDXCarbon monthly PDF scraper
phase: 2
status: draft
blocked_by: [T02]
blocks: [T14, T18, T19]
owner: agent
effort_estimate: 4h
---

## 1. User story

As Andy (platform operator), I want IDXCarbon's monthly aggregate PDF reports automatically fetched, parsed, and stored in `idx_monthly_snapshots`, so that the price intelligence screen (T14) and landing-page stats (T18) have real IDXCarbon data without manual effort.

## 2. Context & rationale

IDXCarbon (Indonesia Stock Exchange's carbon market, launched September 2023) publishes a monthly aggregate report as a PDF at `https://idxcarbon.co.id/data-monthly`. These are the only public, machine-readable price and volume signals for Indonesian exchange-traded carbon credits.

There is no public API and no per-transaction data at the free tier. The scraper must:
- Scrape the HTML listing page to discover PDF URLs.
- Download and archive each PDF locally.
- Parse aggregate fields from the PDF using `pdfplumber` + regex.
- Insert one row per month into `idx_monthly_snapshots`.

T02 is the only blocker (table must exist). T06's `scrapers/common/` helpers are a convenience but not a hard dependency — T08 may need to bootstrap its own `db.py`, `config.py`, and `logging.py` if T06 has not landed yet (see §9 Open questions).

Historical seed: all available monthly reports from September 2023 (IDXCarbon launch) through March 2026 — approximately 31 months. April 2026's report will be published in the first week of May; the cron job will pick it up then.

Per architecture §4, scrapers must fail loudly, be idempotent, and preserve raw payloads.

## 3. Scope

### In scope

1. **`pdfplumber` dependency** — append to `scrapers/pyproject.toml` via `uv add pdfplumber`. If T06's `pyproject.toml` already exists, append to it. If it does not exist, create `scrapers/pyproject.toml` with the minimum required deps (`pdfplumber`, `psycopg[binary]`, `httpx`, `structlog`, `python-dotenv`) plus `ruff` as a dev dep. Coordinate in §9 to avoid double-initialisation with T06.

2. **`scrapers/idxcarbon/fetch_monthly.py`** — main entry point.
   - Invoked as `python -m scrapers.idxcarbon.fetch_monthly`.
   - CLI flags:
     - `--from-month YYYY-MM` — skip months before this value (default: `2023-09`).
     - `--only-month YYYY-MM` — process a single month and exit.
     - `--dry-run` — list available months and indicate which would be inserted; exit 0 without writing anything.
   - Behaviour:
     1. Fetch `https://idxcarbon.co.id/data-monthly` HTML with a 30-second timeout, User-Agent `KarbonLens/0.1 (+https://karbonlens.id)`.
     2. Parse the page to extract PDF URLs. Each link points to a monthly report; extract the period as `YYYY-MM` from the filename (e.g. `monthly-report-2026-01.pdf`) or from surrounding link text (e.g. "Monthly Report January 2026" or "Laporan Januari 2026") using the static Indonesian/English month-name mapping defined in `parse_pdf.py`.
     3. Iterate over discovered PDFs, filtered by `--from-month` / `--only-month` if provided.
     4. For each PDF: query `idx_monthly_snapshots` by `period_month` — **if row exists, skip** (idempotence; log "skipped already-ingested YYYY-MM").
     5. Download PDF to `/var/lib/karbonlens/pdf-archive/YYYY-MM.pdf`. Overwrite on re-download only if the file is absent; otherwise reuse cached copy.
     6. Call `parse_pdf.parse(pdf_path)` → structured dict.
     7. On `ParseError`: log at ERROR level including the period, reason, and first 500 chars of the page text that failed; **continue to next month** — do not halt the run.
     8. On successful parse: `INSERT INTO idx_monthly_snapshots (...) ON CONFLICT (period_month) DO NOTHING`.
     9. Emit a structured JSON log summary: `{scraper, started_at, finished_at, months_discovered, months_skipped, months_inserted, months_failed, errors}`.

3. **`scrapers/idxcarbon/parse_pdf.py`** — PDF parser.
   - Public interface: `parse(pdf_path: Path) -> dict` — returns a dict whose keys match `idx_monthly_snapshots` columns (excluding `id` and `scraped_at`).
   - Opens the PDF with `pdfplumber`, extracts full text page-by-page, concatenates.
   - Defines `ParseError(Exception)` with attributes `page_text: str` and `reason: str`. Caller catches this and logs.
   - **Mandatory fields** (raise `ParseError` if missing): `period_month`, `total_volume_tco2e`.
   - **Non-mandatory fields** (insert NULL if missing, do not raise): `trading_days`, `registered_participants`.
   - **Regex strategy — two format families:**
     - **Old format (Sept 2023 – Dec 2024):** Inline text like `"Total Volume: 117.234,56 tCO2e"` and `"Total Nilai: Rp 4.700.000.000"`. Numbers use Indonesian decimal notation (period as thousands separator, comma as decimal separator).
     - **New format (Jan 2025+):** Summary table with column headers `Volume`, `Nilai`, `Transaksi`, `Peserta`, `Proyek`. Parser must detect which format is active by probing for the table-header string before choosing a regex branch.
     - Alias variants to handle: `Volume Transaksi` = `Volume`, `Nilai Transaksi` = `Nilai`, `Jumlah Hari Perdagangan` = `trading_days`, `Peserta Terdaftar` = `registered_participants`, `Proyek Terdaftar` = `registered_projects`.
   - **Indonesian month-name mapping** (static dict, used by both parser and fetcher):
     ```
     Januari→01, Februari→02, Maret→03, April→04, Mei→05, Juni→06,
     Juli→07, Agustus→08, September→09, Oktober→10, November→11, Desember→12
     ```
   - **Number normalisation helper:** strip `Rp`, spaces, and period-as-thousands-sep; replace comma-as-decimal with dot; return `Decimal`.
   - Returns dict keys: `period_month` (date), `total_volume_tco2e`, `total_value_idr`, `total_transactions`, `trading_days`, `registered_participants`, `registered_projects`, `available_units`, `retired_units`, `avg_price_idr`, `raw_report_url`, `raw_payload` (full structured extract as a JSON-serialisable dict including all regex match groups and raw text).

4. **Historical backfill** — handled by running `python -m scrapers.idxcarbon.fetch_monthly --from-month 2023-09` (no dedicated separate script required). The `fetch_monthly.py` entry point covers backfill when run with default `--from-month 2023-09`. Document this in the module docstring.

5. **`scrapers/scripts/run_monthly_idxcarbon.sh`** — cron wrapper.
   ```bash
   #!/bin/bash
   set -euo pipefail
   source /opt/karbonlens/.env
   cd /opt/karbonlens
   /opt/karbonlens/scrapers/.venv/bin/python -m scrapers.idxcarbon.fetch_monthly \
     >> /var/log/karbonlens/idxcarbon.log 2>&1
   ```
   - Must be executable (`chmod +x`).
   - Cron entry (already defined in architecture §4): `0 4 1 * * karbonlens /opt/karbonlens/scrapers/scripts/run_monthly_idxcarbon.sh`

### Out of scope (explicit non-goals)

- Per-transaction data — IDXCarbon does not publish this publicly.
- Real-time or sub-monthly updates.
- Parsing per-credit-type breakdowns (IDTBS-RE vs IDTBS vs IDNBS) — v0.1 stores aggregate only; frontend (T14) notes "breakdown coming in v0.2".
- Pricing alerts or threshold notifications.
- S3 / object-store archival of PDFs — local filesystem only for v0.1.
- Automated tests — per Andy's override, no tests for v0.1; verification is SQL + filesystem.
- Multi-language summarisation of report narrative sections.
- Any write to tables other than `idx_monthly_snapshots`.

## 4. Acceptance criteria (Gherkin)

**AC-1: Dry-run lists available months**
```
Given the scraper is installed and DATABASE_URL is set
When  python -m scrapers.idxcarbon.fetch_monthly --dry-run
Then  stdout lists each discovered period (YYYY-MM) and marks each as
        "would insert" or "already in DB"
And   the process exits 0
And   idx_monthly_snapshots row count is unchanged
```

**AC-2: Full backfill populates at least 24 rows**
```
Given idx_monthly_snapshots is empty
When  python -m scrapers.idxcarbon.fetch_monthly --from-month 2023-09
Then  the process exits 0
And   SELECT COUNT(*) FROM idx_monthly_snapshots; returns >= 24
```
_(Sept 2023 → March 2026 = 31 months; threshold 24 guards against a few unavailable older reports.)_

**AC-3: Latest month and January 2026 have sensible values**
```
Given AC-2 has run
When  SELECT total_volume_tco2e, total_value_idr, avg_price_idr
      FROM idx_monthly_snapshots
      WHERE period_month = '2026-01-01';
Then  total_volume_tco2e is approximately 117000 (+/- 5%)
And   total_value_idr is approximately 4700000000 (+/- 5%)
And   avg_price_idr is between 30000 and 100000
And   for the latest IDXCarbon-published month at run time,
        total_volume_tco2e IS NOT NULL
And   total_value_idr IS NOT NULL
And   avg_price_idr IS NOT NULL
```

**AC-4: PDF archive count matches DB row count**
```
Given AC-2 has run
When  ls /var/lib/karbonlens/pdf-archive/*.pdf | wc -l
Then  the count equals
        SELECT COUNT(*) FROM idx_monthly_snapshots;
```

**AC-5: Re-run is fully idempotent**
```
Given AC-2 has run (N rows in DB, N PDFs on disk)
When  python -m scrapers.idxcarbon.fetch_monthly --from-month 2023-09
Then  the process exits 0
And   the structured log shows months_inserted = 0, months_skipped = N
And   SELECT COUNT(*) FROM idx_monthly_snapshots; is unchanged
And   no new files appear in /var/lib/karbonlens/pdf-archive/
```

**AC-6: ParseError is logged and run continues (future verification)**
```
Given a PDF in the archive is replaced with a file that has no parseable fields
When  python -m scrapers.idxcarbon.fetch_monthly --only-month <that month>
Then  a ParseError is logged at ERROR level with the period and reason
And   the process exits 0 (non-fatal for a single month failure)
And   no row is inserted for that month
```
_Note: AC-6 is marked "future verification" — simulate only if a corrupted PDF can be staged easily. Verify by inspecting log output; do not block story sign-off on this AC alone._

**AC-7: avg_price_idr for January 2026 is within market range**
```
Given AC-2 has run
When  SELECT avg_price_idr FROM idx_monthly_snapshots
      WHERE period_month = '2026-01-01';
Then  the value is between 30000 and 100000
```
_(Rp 30,000 – Rp 100,000 per tCO2e is the plausible range for IDXCarbon v0.1.)_

**AC-8: Every row has a populated raw_payload**
```
Given AC-2 has run
When  SELECT COUNT(*) FROM idx_monthly_snapshots WHERE raw_payload IS NOT NULL;
Then  the count equals SELECT COUNT(*) FROM idx_monthly_snapshots;
```

**AC-9: Linter passes**
```
Given the implementation files are written
When  ruff check scrapers/
Then  exit code is 0 with no errors
```

## 5. Inputs & outputs

**Inputs:**
- `DATABASE_URL` environment variable (psycopg connection string).
- Public HTML at `https://idxcarbon.co.id/data-monthly` (no auth required).
- Public PDF URLs parsed from that page (no auth required).

**Outputs:**
- Rows written to `idx_monthly_snapshots` (one per month processed).
- PDF files at `/var/lib/karbonlens/pdf-archive/YYYY-MM.pdf` (directory created by T01, owned `karbonlens:karbonlens 755`).
- Structured JSON log lines to stdout (captured by cron wrapper to `/var/log/karbonlens/idxcarbon.log`).
- No changes to `.env.example` (no new env vars required; `DATABASE_URL` already present).

## 6. Dependencies & interactions

**Blocked by:**
- T02 — `idx_monthly_snapshots` table must exist before any insert.

**Blocks:**
- T14 — Price intelligence screen queries `idx_monthly_snapshots`.
- T18 — Landing page live stats include latest IDXCarbon volume and price.
- T19 — Cron installation wires up `run_monthly_idxcarbon.sh`.

**Parallel tasks (no conflict expected):**
- T06 — Verra scraper. Both tasks touch `scrapers/pyproject.toml` and `scrapers/common/`. Coordinate so only one task initialises the Python project. If T06 lands first, T08 only appends `pdfplumber` to the existing pyproject and reuses `common/db.py`, `common/config.py`, `common/logging.py`. If T08 lands first, it bootstraps those files using the structure specified in T06's task block. **Do not let both tasks create `scrapers/pyproject.toml` independently** — coordinate via the open question in §9.
- T07 — No shared files.

**Files owned by this story** (implementer must not touch other files without noting a deviation):
- `scrapers/idxcarbon/__init__.py` (empty, new)
- `scrapers/idxcarbon/fetch_monthly.py` (new)
- `scrapers/idxcarbon/parse_pdf.py` (new)
- `scrapers/scripts/run_monthly_idxcarbon.sh` (new)
- `scrapers/pyproject.toml` — append `pdfplumber` dep only; if file does not exist, create with full content (see §3.1)

**Files T08 may read but not modify (owned by T06 if it lands first):**
- `scrapers/common/db.py`
- `scrapers/common/config.py`
- `scrapers/common/logging.py`

## 7. Edge cases & failure modes

| Scenario | Expected behaviour |
|---|---|
| PDF link is 404 | Log WARNING with URL and period; skip that month; continue to next. Do not raise an exception that halts the run. |
| PDF download returns non-200 (e.g. 503) | Same as 404: log, skip, continue. |
| IDXCarbon stops publishing monthly PDFs | Cron re-run discovers no new links; months_inserted = 0; exits 0. The archive preserves previously downloaded PDFs. |
| Old format PDF (2023–2024) | Parser detects absence of table-header strings and falls back to inline-text regex branch. Both branches tested against real PDFs during implementation. |
| New format PDF (2025+) | Parser detects table-header strings and uses table-extraction branch. |
| Future format change | Both regex branches fail to find `total_volume_tco2e` → `ParseError` raised → logged with page text → manual regex update required. This is the intended loud-failure path per architecture §4. |
| Partial parse (volume found, avg_price missing) | Insert row with NULL for non-mandatory fields. Raise `ParseError` only if mandatory fields (`period_month`, `total_volume_tco2e`) are absent. |
| Indonesian month name in PDF title | Apply static mapping (Januari → 01, …, Desember → 12). If an unknown month name is encountered, raise `ParseError` with reason `"unknown_month_name"`. |
| Period parsed from filename vs link text disagreement | Prefer filename-derived period; fall back to link-text-derived period. Log the source used. |
| `/var/lib/karbonlens/pdf-archive` not writable | Python `PermissionError` propagates; log at CRITICAL level; exit non-zero. This indicates a T01 setup issue. |
| Disk pressure | Unlikely at v0.1 scale (<31 PDFs, each <1 MB, total <31 MB). Not a concern. |
| `period_month` conflict on INSERT | `ON CONFLICT (period_month) DO NOTHING` — silent skip, counted in `months_skipped` in the log summary. |
| `--only-month` for a month not on the IDXCarbon listing page | Log INFO "not found on listing page"; exit 0. |
| Number format edge case: value printed as "0" or "-" for a month with no trading | Parse as 0 for numeric fields. `total_volume_tco2e = 0` is valid and should not raise `ParseError`. |

## 8. Definition of done

- [ ] All acceptance criteria pass (AC-6 marked as future-verification per §4 note).
- [ ] Story files landed in `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] TASKS.md status for T08 flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

## 9. Open questions

1. **T06 coordination on `scrapers/pyproject.toml`:** Which story initialises the Python project? If T06 lands first (likely, as it is earlier in the sprint), T08 implementer should run `uv add pdfplumber` against the existing venv and not recreate `pyproject.toml`. If T08 lands first, it bootstraps the full file. Andy should confirm expected landing order before implementation begins, or the implementer should check for the file's existence and branch accordingly.

2. **IDXCarbon rate limiting:** No published rate limit found for `idxcarbon.co.id`. Use a conservative 5-second inter-request delay (per architecture §4 guidance for IDXCarbon). If the site returns 429 or begins blocking during backfill, reduce parallelism to a 10-second delay or add a Retry-After-aware backoff. The UA string `KarbonLens/0.1 (+https://karbonlens.id)` should be sent on all requests.

3. **"Latest available month" definition:** IDXCarbon typically publishes with ~1-week lag after month-end. The cron job runs on the 1st of each month; the previous month's report may not yet be available. The scraper should treat "not found on listing page" as a soft miss (log, skip, no error) so cron re-runs silently until the report appears. Andy to confirm if a retry-on-first-of-month cadence is sufficient or if a mid-month second attempt is needed.

4. **S3 / object-store archival:** v0.1 uses local filesystem (`/var/lib/karbonlens/pdf-archive`). If the VPS is rebuilt, PDFs would need to be restored from backup. A Hetzner Object Storage bucket would make the archive portable and durable. Flag as v0.2 consideration — no action required now.

5. **avg_price_idr computation:** The PDF may report a weighted average directly, or it may need to be derived as `total_value_idr / total_volume_tco2e`. If the PDF provides a direct avg_price figure, use it; otherwise derive it. If derivation is used and either input is zero/null, set `avg_price_idr = NULL` rather than divide-by-zero. Implementer to confirm after inspecting a real PDF.

## 10. References

- Architecture §3 — `idx_monthly_snapshots` schema (confirmed against `scrapers/migrations/001_init.sql` lines 105–120)
- Architecture §4 — Scraper patterns (idempotence, raw payload, structured logging, fail-loudly, pacing)
- Architecture §5.3 — IDXCarbon data source contract
- PRD §3 — v0.1 data pipeline scope (IDXCarbon included)
- TASKS.md T08 — original task block and acceptance criteria
- TASKS.md T14 — downstream consumer: price intelligence screen
- TASKS.md T18 — downstream consumer: landing page live stats
- TASKS.md T19 — cron installation (wires up `run_monthly_idxcarbon.sh`)
