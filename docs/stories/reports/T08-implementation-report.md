# T08 - Implementation report: IDXCarbon monthly PDF scraper

**Implementer:** agent (Opus 4.7)
**Date:** 2026-04-19
**Story:** [T08-idxcarbon-pdf-scraper.md](../T08-idxcarbon-pdf-scraper.md)
**Worktree:** `/root/.openclaw/workspace/karbonlens-worktrees/T08`
**Branch:** `feature/T08-idxcarbon-pdf-scraper` (off `feature/v0.1-impl`)

## 1. Summary

Built the IDXCarbon monthly scraper (`scrapers/idxcarbon/fetch_monthly.py`
+ `parse_pdf.py`), plus a cron wrapper. The scraper fetches the listing page,
downloads every monthly PDF (always re-downloading, per the revised spec
§3 cross-phase decision 3), parses the aggregate fields with `pdfplumber` +
regex, and upserts one row per month into `idx_monthly_snapshots`. All live
PDFs parse cleanly.

Stand-out finding: IDXCarbon's public `data-monthly` listing today exposes
only the most recent **10** months (June 2025 - March 2026), not the 31
months from September 2023 that the spec assumed. This means **AC-2**
(`>= 24 rows`) cannot be satisfied from the public listing alone. AC-2
should be downgraded to "all months exposed by the listing are ingested."
The scraper itself has no bug.

## 2. Files added

- `scrapers/idxcarbon/__init__.py`
- `scrapers/idxcarbon/fetch_monthly.py`
- `scrapers/idxcarbon/parse_pdf.py`
- `scrapers/scripts/run_monthly_idxcarbon.sh` (chmod +x)
- `scrapers/common/__init__.py` (stub - see §6 below)
- `scrapers/common/config.py` (stub)
- `scrapers/common/db.py` (stub)
- `scrapers/common/logging.py` (stub)

## 3. PDF parsing approach

Parser opens each PDF with `pdfplumber`, extracts text page-by-page, then
picks a regex branch based on the presence of the table header
`CARBON MARKET - TRADING SUMMARY` on page 2:

- **New format (2025+, English):** anchors such as `Total Volume ton CO e`,
  `Total Value IDR`, `Total Frequency times`, `No. of Trading Days`,
  `No. of Participant`, `No. of Listed Project`, `Available Carbon Unit`,
  `Retired Carbon Unit`. Numbers parsed in English locale (comma =
  thousands separator). The stray subscript `2` in `CO2` floats onto a
  separate line; the regex tolerates that via `[\s\n\r]*` between tokens.
- **Old format (2023-2024, Indonesian):** anchors `Total Volume:`,
  `Total Nilai: Rp`, `Jumlah Hari Perdagangan`, `Peserta Terdaftar`,
  `Proyek Terdaftar`. Numbers parsed in Indonesian locale (period =
  thousands separator, comma = decimal). **No old-format PDFs are currently
  available on the listing page** (see §4), so the old-format branch is
  present but not exercised against real data.

Period extraction uses a layered strategy that avoids picking up
comparison-column years (`Sept 2023`, `May 2025`, etc.) that appear on
inner pages:

1. Spaced title regex (e.g. `J A N U A R Y\n2 0 2 6`) against page 1 only.
2. Inline month name against page 1 only.
3. Spaced title anywhere in the document.
4. Inline month name anywhere (last resort).
5. Filename fallback (`YYYY-MM.pdf`).

The fetcher also sanity-checks the parsed period against the period
derived from the listing label and overrides to the listing value on
disagreement (logging a warning and recording the override in
`raw_payload.listing_period_override`).

`extract_field(text, pattern, locale)` distinguishes "no regex match"
(returns `None`, caller raises `ParseError` on mandatory fields) from
"matched value of 0" (returns `0`, a valid insertable zero) per spec
§3.3. `avg_price_idr` is always derived as
`int(total_value_idr / total_volume_tco2e)` with a zero/NULL guard.

## 4. Format split - what actually parsed

All 10 PDFs on the listing went through the **new-format (2025+)** branch.

| # | Period     | Format   | Volume  | Value (IDR)    | Avg price (IDR) | Trading days | Parse result |
| - | ---------- | -------- | ------- | -------------- | --------------- | ------------ | ------------ |
| 1 | 2025-06    | new      |       8 |        490,800 |          61,350 |      18      | OK           |
| 2 | 2025-07    | new      |      35 |      2,921,000 |          83,457 |      23      | OK           |
| 3 | 2025-08    | new      |   5,465 |    427,699,800 |          78,261 |      20      | OK           |
| 4 | 2025-09    | new      |   1,234 |     82,736,000 |          67,047 |      21      | OK           |
| 5 | 2025-10    | new      |     601 |     37,753,600 |          62,817 |      23      | OK           |
| 6 | 2025-11    | new      |  15,012 |  1,015,714,200 |          67,660 |      20      | OK           |
| 7 | 2025-12    | new      | 190,264 |  7,486,216,776 |          39,346 |      20      | OK           |
| 8 | 2026-01    | new      | 117,455 |  4,701,187,600 |          40,025 |      20      | OK           |
| 9 | 2026-02    | new      |   2,218 |    164,176,400 |          74,020 |      18      | OK           |
|10 | 2026-03    | new      |  43,117 |  1,839,392,200 |          42,660 |      17      | OK           |

- Old-format PDFs in DB: **0** (none on listing page)
- Parse failures: **0**
- No PDFs rejected for non-PDF content-type or HTTP errors.

## 5. AC results

| AC    | Status | Notes |
| ----- | ------ | ----- |
| AC-1  | PASS   | `--dry-run` lists all 10 periods with "would insert" / "already in DB" markers; exit 0; no writes. |
| AC-2  | FAIL (environmental) | Listing page currently exposes 10 months, not >=24. No scraper bug; IDXCarbon has not published an archive beyond the most recent 10 months. Recommend spec amendment. |
| AC-3  | PASS   | Jan 2026 + Mar 2026 (latest) both have non-null, > 0 values for volume, value, avg_price. |
| AC-4  | PASS   | `ls /var/lib/karbonlens/pdf-archive/*.pdf \| wc -l` = 10; `COUNT(*) FROM idx_monthly_snapshots` = 10. |
| AC-5  | PASS   | Re-run produced 0 inserts, 10 updates; row count unchanged; values stable. |
| AC-6  | n/a    | "Future verification" - not exercised. Log-and-continue path is implemented; a corrupted PDF would emit a structured ERROR log line and the run would exit 0. |
| AC-7  | PASS   | `avg_price_idr` for 2026-01-01 = 40,025 (within 30,000 - 100,000). |
| AC-8  | PASS   | 10/10 rows have non-null `raw_payload`. |
| AC-9  | PASS   | `ruff check scrapers/` -> All checks passed! |

## 6. `pyproject.toml` strategy + common/ stubs

T06 has not merged into `feature/v0.1-impl` yet, so there is no
`scrapers/pyproject.toml` and no `scrapers/common/` in this worktree.
Per the implementation brief option (a), I:

1. Created a throwaway worktree venv at `scrapers/.venv` (gitignored - not
   committed) and `uv pip install`ed `pdfplumber`, `psycopg[binary]`,
   `httpx`, `beautifulsoup4`, `python-dotenv`, `structlog`, `ruff`. No
   changes to `scrapers/pyproject.toml` - T06 owns that file.
2. Wrote minimal `scrapers/common/{__init__.py,config.py,db.py,logging.py}`
   **stubs** matching T06's documented API contract (`config.load_env`,
   `db.get_connection`, `db.execute`, `logging.get_logger`). When T06
   lands it should supersede these stubs. The T08 scraper code imports
   these helpers via `from scrapers.common import ...` so the merge will
   be a drop-in replacement with no caller changes.

**Auditor should check:** once T06 lands, confirm that T06's
`scrapers/common/*.py` exposes the same four entry points with the same
signatures. If T06 has diverged, a brief reconciliation will be needed
(likely a one-line import rename in `fetch_monthly.py`).

## 7. Deviations from the spec

- **Polite pacing:** spec §9 OQ-2 suggests 5 seconds between requests; the
  implementation brief reduces this to **2 seconds**. I followed the
  brief. The full 10-PDF run took ~95 seconds, well below any plausible
  rate-limit. No 429s observed.
- **PDF filename convention:** the spec §3.2 example filename was
  `monthly-report-2026-01.pdf`; IDXCarbon's share URLs encode
  `/document/share/<id>/<uuid>` with no filename, so I derive the
  archive filename from the canonical `YYYY-MM.pdf` form per the spec
  destination path. No functional impact.
- **Listing page has no pagination:** the spec assumed the listing would
  paginate back to Sept 2023. In reality the table renders exactly 10
  rows with no "next page" or "load more" control, and attempts to access
  older `document/share/<id>/` endpoints without the correct UUID return
  404. The scraper logs whatever the page exposes; that is the correct
  long-run behaviour (cron re-runs will pick up new months as IDXCarbon
  publishes them).

## 8. AC-2 remediation options (for Andy / spec owner)

If >=24 historical months are still required:

1. **Contact IDXCarbon directly** (human out-of-band) to obtain archived
   PDFs for Sept 2023 - May 2025. The scraper can ingest them via
   `--only-month YYYY-MM` if the PDFs are staged in
   `/var/lib/karbonlens/pdf-archive/` (the listing step would need to be
   bypassed - add a `--file <path>` flag in a follow-up, or drop them in
   and re-run with `ON CONFLICT DO UPDATE`).
2. **Revise AC-2** to `>= N` where `N` = rows currently exposed by the
   listing, plus a note that the scraper ingests future months as they
   are published.
3. **Wait and watch:** the IDXCarbon listing may grow its history over
   time; the monthly cron job will automatically pick up anything the
   page exposes.

Option (2) is the lowest-effort path and preserves the cron-driven
continuous-ingestion invariant.

## 9. Verification commands run

```sh
# Dry-run
scrapers/.venv/bin/python -m scrapers.idxcarbon.fetch_monthly --dry-run

# Full ingest (first run)
scrapers/.venv/bin/python -m scrapers.idxcarbon.fetch_monthly
# -> {"months_discovered": 10, "months_inserted": 10, "months_updated": 0, "months_failed": 0}

# Idempotency re-run
scrapers/.venv/bin/python -m scrapers.idxcarbon.fetch_monthly
# -> {"months_discovered": 10, "months_inserted": 0, "months_updated": 10, "months_failed": 0}

# Lint
scrapers/.venv/bin/ruff check scrapers/
# -> All checks passed!

# DB verification
sudo -u postgres psql -d karbonlens -c "SELECT COUNT(*) FROM idx_monthly_snapshots;"  # 10
sudo -u postgres psql -d karbonlens -c "SELECT avg_price_idr FROM idx_monthly_snapshots WHERE period_month='2026-01-01';"  # 40025
ls /var/lib/karbonlens/pdf-archive/*.pdf | wc -l  # 10
```

## 10. What the auditor should check

1. **Stub compatibility with T06** - once T06 lands, verify
   `scrapers/common/{config,db,logging}.py` still exposes `load_env`,
   `get_connection`, `execute`, `get_logger`. If T06 renames, update the
   imports in `fetch_monthly.py` and delete the stubs.
2. **AC-2 spec amendment** - see §8 above. The numeric threshold is not
   achievable today; the spec needs a decision on how to handle the gap.
3. **Old-format regex coverage** - the old-format branch is unexercised
   because no old-format PDFs are reachable. If Andy obtains archived
   2023-2024 PDFs, re-run the scraper and confirm the old branch extracts
   correctly; the regex may need tuning once a real PDF is available.
4. **Polite pacing** - the 2-second delay overrides spec §9's 5-second
   guidance per the implementation brief. Revisit if IDXCarbon returns
   429s in production.
5. **Permissions on `/var/lib/karbonlens/pdf-archive/`** - this run wrote
   as `root`; the cron wrapper runs as `karbonlens`. A fresh cron run
   on a VPS-deployed instance must be able to overwrite files owned by
   the previous run; T01 sets the directory to `karbonlens:karbonlens
   755`. No action for T08 but worth eyeballing in T19 integration.
6. **Commit hygiene** - three commits (code, cron wrapper, report) with
   `feat(T08)` / `docs(T08)` prefixes and Co-Authored-By footers; no
   modifications to `scrapers/pyproject.toml`, `lib/`, `app/`,
   `middleware.ts`, `CHANGELOG.md`, `TASKS.md`, other stories, or
   migrations.
