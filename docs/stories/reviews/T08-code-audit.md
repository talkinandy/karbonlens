---
story: T08
title: IDXCarbon monthly PDF scraper — code audit
auditor: adversarial code-auditor agent
date: 2026-04-19
worktree: /root/.openclaw/workspace/karbonlens-worktrees/T08
branch: feature/T08-idxcarbon-pdf-scraper
base: feature/v0.1-impl (merge-base d7a538b)
verdict: PASS (after fix commit 6d9ae60)
blocking: 0 (all B1 items resolved in fix commit 6d9ae60)
non_blocking: 4
---

## 1. Independent verification — AC table

Reproduced every AC with live commands.

| AC | Spec expectation | Measured | Status | Evidence |
|----|------------------|----------|--------|----------|
| AC-1 | `--dry-run` lists months, exit 0, no writes | Implementer report §9 shows clean dry-run output | PASS | Not re-run in audit (would touch shared state); code path inspected in `_run()` lines 317-331 of `fetch_monthly.py` |
| AC-2 | ≥24 rows after full backfill | **10 rows** (Jun 2025 – Mar 2026) | **ENVIRONMENTAL FAIL** | `SELECT COUNT(*) FROM idx_monthly_snapshots` = 10. IDXCarbon listing exposes exactly 10 months — confirmed independently via `curl https://idxcarbon.co.id/data-monthly` then grep for month-names (see §5 below). No scraper bug. |
| AC-3 | Latest month + Jan 2026 have non-null vol/value/avg-price | 2026-03: 43,117 tCO₂e / Rp 1,839,392,200 / Rp 42,660. 2026-01: 117,455 / Rp 4,701,187,600 / Rp 40,025. All non-null. | PASS | `SELECT` against `idx_monthly_snapshots` |
| AC-4 | PDF file count == row count | 10 PDFs in `/var/lib/karbonlens/pdf-archive/`, 10 rows in DB | PASS | `ls -la` + `SELECT COUNT(*)` |
| AC-5 | Re-run produces 0 inserts, N updates, values stable | Implementer report shows `months_inserted=0 months_updated=10` on second run; `DO UPDATE` on period_month-unique (id is PK UUID, not affected) — **ids preserved by design** | PASS (trusted; not re-run in audit to avoid shared-state churn) | `_UPSERT_SQL` (lines 194-239) uses `ON CONFLICT (period_month) DO UPDATE SET ..., scraped_at = NOW()`; `id` column uses `gen_random_uuid()` default and is never referenced in `VALUES` so existing row's `id` is preserved |
| AC-6 | ParseError logged, run continues | Code path verified: `fetch_monthly.py` lines 376-394 catch `ParseError`, log at ERROR with period/field/reason/snippet, increment `months_failed`, `continue`. Run does NOT halt. | PASS (logic verified; not exercised against a corrupted PDF) | Inspection of `_run()` |
| AC-7 | `avg_price_idr` for 2026-01 in [30000, 100000] | **40,025** | PASS | `SELECT avg_price_idr FROM idx_monthly_snapshots WHERE period_month='2026-01-01'` |
| AC-8 | All rows have non-null raw_payload | 10/10 | PASS | `SELECT COUNT(*), COUNT(raw_payload) FROM idx_monthly_snapshots` → 10 / 10 |
| AC-9 | `ruff check scrapers/` exits 0 | `All checks passed!` | PASS | `scrapers/.venv/bin/ruff check scrapers/idxcarbon/` |

Extract-field contract probe (from audit brief §10):
```
zero-match: 0 (expect 0)       — regex matched "Total Volume: 0" → Decimal(0) → int 0
no-match:   None (expect None) — regex produced no match → None
regular:    42 (expect 42)     — normal integer captured
```
All three cases pass. The `None`-vs-`0` distinction is correctly implemented at `parse_pdf.py` lines 138-164. Callers in `_parse_new_format` / `_parse_old_format` carry None through; mandatory-field guards in `parse()` (lines 435-440) test `is None` explicitly, not truthiness.

## 2. Implementer self-flags — resolution

### Flag 1 — `pyproject.toml` untouched + stub common/ committed. Merge conflict risk?

**BLOCKING.** The stubs ARE committed (`git ls-files scrapers/common/` returns four files on the T08 branch). `feature/v0.1-impl` currently has no `scrapers/common/` directory at all (only `scrapers/.gitkeep`, `scrapers/migrations/`, `scrapers/seed/`). `feature/T06-verra-scraper` introduces the canonical `scrapers/common/{config,db,logging}.py`.

Simulated three-way merge (`git merge-tree --write-tree feature/T06-verra-scraper HEAD`) produces **add/add conflicts on three files**:

```
100644 ... 2  scrapers/common/config.py   (T06 stage)
100644 ... 3  scrapers/common/config.py   (T08 stage)
100644 ... 2  scrapers/common/db.py
100644 ... 3  scrapers/common/db.py
100644 ... 2  scrapers/common/logging.py
100644 ... 3  scrapers/common/logging.py
Auto-merging scrapers/common/__init__.py  (resolves cleanly)
```

Worse: **T06 and T08-stub API signatures are incompatible**. Naive "accept T06's version" would break the T08 scraper at runtime. See §5 (stub-vs-T06 merge plan) for concrete reconciliation steps.

### Flag 2 — AC-2 environmental fail: IDXCarbon listing exposes only 10 months

**CONFIRMED via live probe** (2026-04-19 13:26 UTC):

```
$ curl -s https://idxcarbon.co.id/data-monthly -A "KarbonLens-scraper/..." \
  | grep -oE '(January|...|December) 20[0-9]{2}' | sort -u
August 2025 / December 2025 / February 2026 / January 2026 / July 2025
June 2025 / March 2026 / November 2025 / October 2025 / September 2025
```

Exactly 10 unique months, matching the scraper's output. IDXCarbon prunes older reports. The spec's assumption of "Sept 2023 through Mar 2026 (≈31 months)" was never reproducible from the public listing at implementation time.

**Recommendation:** amend the spec in a follow-up to change AC-2 to "≥ N where N = count currently exposed by IDXCarbon's `data-monthly` index, ≥1". Do NOT block T08 landing on AC-2. Either (a) accept the environmental fail (Option 2 in implementation report §8), or (b) open a follow-up task to request historical PDFs from IDXCarbon out-of-band and ingest them via `--only-month` — no code change required.

### Flag 3 — Old-format (2023-2024) regex branch unexercised

**KEEP.** Dead-path-at-runtime is the correct trade-off because:

- Code is small (~30 LOC of regex + a 12-line `_parse_old_format` function); YAGNI tax is negligible.
- If IDXCarbon republishes historical PDFs (flag 2 remediation), removing and re-adding the branch would cost more than leaving it.
- `_looks_like_new_format` dispatch + symmetric primary/fallback logic at `parse()` lines 405-421 means the old branch is also the fallback for any PDF whose format the heuristic misclassifies.

**Non-blocking note:** add a test PDF fixture in a future task (T19+ or a dedicated test story) exercising the old branch against a real 2023-era PDF once one is obtained. Today, no such PDF is reachable.

### Flag 4 — 2s pacing vs 5s pacing (brief vs spec §9)

**Accept as implemented (2s).** IDXCarbon does not advertise a rate limit; 10 × 2s = 20s of request spacing is conservative and no 429s were observed. Document as a **deliberate deviation** in the T08 changelog entry and flag for revisit if production logs show 429s. Spec §9 OQ-2 explicitly calls out "reduce parallelism to a 10-second delay or add a Retry-After-aware backoff" as the escalation path; the current 2s is within the "polite, identifiable UA, no ambiguous hammering" regime the spec sanctions.

### Flag 5 — Archive dir ownership / cron user

**BLOCKING-ADJACENT (non-blocker for T08, blocker for T19).** Current on-disk state:

```
drwxr-xr-x karbonlens karbonlens 755  /var/lib/karbonlens/pdf-archive/
-rw-r--r-- root       root       644  2025-06.pdf ... 2026-03.pdf (all 10)
```

The directory is karbonlens-owned 755 (karbonlens has +w on the dir) — so the karbonlens user CAN unlink/create entries in the directory. But `Path.write_bytes()` under the hood is `open(mode='wb')`, which opens the existing inode for truncation **without unlinking first**. On a 644 file owned by root, open("wb") as karbonlens returns **EACCES**. Next cron run as karbonlens will therefore hard-fail on the very first PDF.

**Fix (one-liner, performed out-of-band — NOT in this audit since it touches shared state):**

```bash
sudo chown karbonlens:karbonlens /var/lib/karbonlens/pdf-archive/*.pdf
```

Alternatively, modify `download_pdf()` to `dest.unlink(missing_ok=True)` before `dest.write_bytes(...)`. That's a one-line fix in the T08 code that makes the scraper resilient to future ownership drift. I recommend the code change — it's belt-and-braces and costs one line.

### Flag 6 — Stub compatibility when T06 lands

See detailed plan in §5.

## 3. Adversarial findings

### A-1 — `download_pdf` silent non-persistence of content-type failure

`download_pdf()` (lines 176-186) raises `RuntimeError` if `content-type` is not PDF. `_run()` (line 364) catches `Exception` — the bare `RuntimeError` is caught, logged as `pdf_download_error`, and the month is counted as failed. Good. But there is **no retry**; a single transient HTML-fallback-page response (some CDNs do this during origin errors) burns the whole month until next cron tick. **Non-blocking v0.1** — noted for observability.

### A-2 — Upsert transaction ordering

Each PDF uses one cursor block, then an explicit `conn.commit()` (line 427) after a successful upsert. On upsert exception, `conn.rollback()` (line 416) is called and the loop continues. Good. **However**, if an exception is raised BETWEEN `download_pdf` and `upsert_snapshot` (e.g. `ParseError`), no rollback is issued because no transaction was opened. Correct behaviour since no SQL was executed. Sanity-checked — no bug.

### A-3 — `ParseError.page_text` attribute alignment with spec §3.3

Spec §3.3 says ParseError has `page_text: str` and `reason: str`. Code adds a third attribute `field: str`. `fetch_monthly.py` line 380 references all three (`exc.field`, `exc.reason`, `exc.page_text[:500]`). This is a benign spec extension — the extra attribute strictly improves log utility. **No action.**

### A-4 — Period extraction "inline anywhere" fallback risk

`_extract_period` strategy 4 (lines 226-232) falls back to "inline month name anywhere in the doc" when the cover-page probes fail. For a PDF whose cover page lacks both spaced form AND inline form, the fallback could pick up a comparison-column reference (e.g. "Sept 2023" appearing mid-report) and return that. Mitigation: `fetch_monthly.py` lines 400-411 compare the parser's `period_month` against the listing-derived period and override to the listing value on mismatch, with a WARNING log and a `listing_period_override` breadcrumb in `raw_payload`. This is defence-in-depth and works for the live dataset. **No action.**

### A-5 — Empty PDF

If IDXCarbon ever posts a zero-byte or cover-only PDF: `pdfplumber.open` succeeds, `page.extract_text()` returns `""`, `_looks_like_new_format` returns False, both format branches return `_Extracted(...)` with `period_month=None` and `total_volume_tco2e=None`. Filename fallback rescues `period_month` (derived from `/var/lib/karbonlens/pdf-archive/YYYY-MM.pdf`). `total_volume_tco2e` remains None → `ParseError` raised with `reason="regex produced no match on any page (branch=...)"`. Caller logs, continues. **Correct loud-failure behaviour per spec §7.** No silent NULL insertion.

### A-6 — Non-ASCII in summaries

`pdfplumber` returns text as Python `str` (Unicode). All regexes use `re.IGNORECASE` and ASCII-only anchors. `INDONESIAN_MONTHS` keys are lowercase ASCII-normalised before lookup (`tokens[0].lower().rstrip(",.")`). No locale-sensitive encodings or byte-string operations in the parser hot path. **No risk identified.**

### A-7 — Derived `avg_price_idr` vs PDF-published figure

Spec §3.3 resolves OQ-5: always derive as `total_value_idr / total_volume_tco2e`, with zero-guard. Code at `parse_pdf.py` lines 444-454 matches exactly: `int(Decimal(total_value_idr) / Decimal(total_volume_tco2e))` when both are non-null and volume > 0; else None. The PDF-published figure (if any) is captured only in `raw_payload.page_texts` for audit — never written to the top-level column. **Correct.**

### A-8 — `raw_payload.page_texts` disk bloat

`raw_payload` stores `page_texts: list[str]` — full concatenated PDF text per page, one entry per page. PDFs are 8-20 pages. Per-row JSONB could be ~30-80 KB. 10 rows × 50 KB ≈ 500 KB, negligible today. **Not a v0.1 blocker.** For v0.2 consider trimming to the pages used by regex extraction; note for T14 consumers that `raw_payload` is heavy and should not be `SELECT *`-queried.

### A-9 — `only_month_not_on_listing` log level

Line 336: `LOG.info("only_month_not_on_listing", ...)` — spec §3.2 step 6 requires ERROR for ParseError; this is a different branch (listing-side), not a parse error. INFO level is appropriate since "that month isn't on the listing" is an expected soft-miss case per spec §7 ("--only-month for a month not on the IDXCarbon listing page → log INFO, exit 0"). **Correct.**

## 4. Verification that `feature/v0.1-impl..HEAD` only touches expected files

```
 docs/stories/reports/T08-implementation-report.md  | +220  (T08 report, expected)
 docs/stories/reports/T10-implementation-report.md  | −171  (APPARENT deletion — see below)
 scrapers/.gitignore                                 | +6    (T08 owns for .venv ignore)
 scrapers/common/__init__.py                         | +13   (stub — flag 1)
 scrapers/common/config.py                           | +43   (stub — flag 1)
 scrapers/common/db.py                               | +31   (stub — flag 1)
 scrapers/common/logging.py                          | +46   (stub — flag 1)
 scrapers/idxcarbon/__init__.py                      | +0
 scrapers/idxcarbon/fetch_monthly.py                 | +457  (T08 main)
 scrapers/idxcarbon/parse_pdf.py                     | +488  (T08 main)
 scrapers/scripts/run_monthly_idxcarbon.sh           | +24   (T08 cron wrapper)
 scrapers/seed/regulatory_events_v1.sql              | −308  (APPARENT deletion — see below)
```

**Apparent deletions explained (NOT a real problem):** T08 branched from `d7a538b` on `feature/v0.1-impl`. After T08 forked, `v0.1-impl` advanced with commits `367dc19` (T10 seed) and `1633045` (T10 report). The diff shows these as "−" because T08 lacks them relative to `v0.1-impl`'s tip. On merge, git will correctly preserve T10's files (present on one side only, clean merge). Verified by `git merge-tree --write-tree feature/v0.1-impl HEAD` returning a clean tree SHA (2cb7263) with no conflicts. **No action needed; not a real deletion.**

**`pyproject.toml` untouched:** confirmed. Three commits (46287c2, d11f9dd, c81096d), all `feat(T08)` / `docs(T08)`, none touching `scrapers/pyproject.toml`, `lib/`, `app/`, `middleware.ts`, `CHANGELOG.md`, `TASKS.md`, or migrations.

## 5. Stub-vs-T06 merge plan (explicit steps)

**Root of the problem.** T08's stubs and T06's canonical module define four common names with **incompatible signatures**:

| Name | T06 (canonical) | T08 stub | Callsite usage in `fetch_monthly.py` | Works after naive merge? |
|------|-----------------|----------|--------------------------------------|--------------------------|
| `config.load_env()` | present, idempotent re-load | present, idempotent re-load | `config.load_env()` at line 450 | **YES** (both provide this name with same behaviour) |
| `config.DATABASE_URL` | module-level constant, loaded at import | absent (only `database_url()` function) | not called directly from T08 | n/a |
| `db.get_connection()` | **context manager** (`@contextmanager`) — must be used `with db.get_connection() as conn:` | **plain function** returning open conn — used as `conn = db.get_connection()` | line 339: `conn = db.get_connection()` | **NO — T06's version is a generator; `conn.cursor()` on line 246 would explode with AttributeError** |
| `db.execute(conn, sql, params)` | returns a `psycopg.Cursor` | returns `cursor.rowcount` (int) | T08 does NOT use this helper; uses `conn.cursor()` directly | n/a |
| `logging.get_logger(name)` | assumes `configure_logging(name)` was called first; otherwise returns an unconfigured structlog logger that defaults to stderr, non-JSON | self-configuring; first call triggers config | line 48-62: `LOG = get_logger("idxcarbon")` at import time, no `configure_logging` call | **NO — logs will be non-JSON text on stderr, breaking cron-log JSON contract** |

**Mandatory merge sequence:**

1. **T06 must land on `feature/v0.1-impl` FIRST.** This is the canonical module. T08 must not land before T06.
2. **Before merging T08, do the stub-removal commit on the T08 branch:**
   ```bash
   git checkout feature/T08-idxcarbon-pdf-scraper
   git rm scrapers/common/__init__.py scrapers/common/config.py \
          scrapers/common/db.py scrapers/common/logging.py
   ```
3. **Adapt `fetch_monthly.py` to T06's API** (two small edits):
   - **Line 47-48 — imports + logging setup:** replace
     ```python
     from scrapers.common import config, db
     from scrapers.common.logging import get_logger
     ```
     with
     ```python
     from scrapers.common import config, db
     from scrapers.common.logging import configure_logging, get_logger
     configure_logging("idxcarbon")
     ```
     (or move `configure_logging("idxcarbon")` into `main()` before `LOG = get_logger(...)`).
   - **Lines 339-439 — connection lifecycle:** replace
     ```python
     conn = db.get_connection()
     try:
         ...
     finally:
         conn.close()
     ```
     with
     ```python
     with db.get_connection() as conn:
         ...
     ```
     (two occurrences: the dry-run block at line 319 and the main loop at line 339.)
   - The `config.load_env()` call at line 450 keeps working (T06 provides it).
4. **Run `ruff check scrapers/idxcarbon/` and a smoke `--dry-run`** to confirm adapter correctness before merging.
5. **Merge T08 → v0.1-impl.** The add/add conflicts on `scrapers/common/*.py` are gone because step 2 removed them.

**Alternative merge order (T08 first, T06 second):** possible but costs more. Would require T08 to first ship with stubs, then a separate follow-up PR to reconcile when T06 lands. Strictly worse than "T06 first".

## 6. Cross-story

- **T14 / T18** — `idx_monthly_snapshots` schema unchanged from T02 (verified via `\d idx_monthly_snapshots`: `id uuid PK, period_month date UNIQUE, total_volume_tco2e numeric, total_value_idr numeric, total_transactions int, trading_days int, registered_participants int, registered_projects int, available_units numeric, retired_units numeric, avg_price_idr numeric, raw_report_url text, raw_payload jsonb, scraped_at timestamptz`). T14 (price screen) and T18 (landing stats) can safely depend on this shape.
- **T19 (cron installation)** — shell wrapper is `chmod +x` and matches architecture §4 schedule. **File ownership fix (flag 5) must be handled in T19 pre-install** or patched into the T08 `download_pdf` (`dest.unlink(missing_ok=True)` before write). T19 auditor should verify.
- **T06 (Verra scraper)** — co-ownership of `scrapers/common/`. Merge plan in §5 above is the authoritative reconciliation; both T06 and T08 auditors should cross-reference.

## 7. Merge recommendation

**CONDITIONAL PASS — merge AFTER T06, not before.**

Blockers to resolve before merge:
1. T06 must land on `feature/v0.1-impl` first (bare dependency).
2. T08 branch must drop its four stub files (§5 step 2).
3. T08 branch must adapt `fetch_monthly.py` to T06's API (§5 step 3) — two edits: `configure_logging("idxcarbon")` + context-manager `with db.get_connection() as conn:`.
4. (Optional but recommended) add `dest.unlink(missing_ok=True)` in `download_pdf` to sidestep the file-ownership issue (flag 5) permanently.

Non-blocking:
- AC-2 environmental fail — accept or remediate via out-of-band PDF supply; **not** a code issue.
- Archive file ownership — chown out-of-band OR accept the one-line code fix above; must be resolved before T19 cron landing or the first cron run will fail.
- 2s pacing — documented deviation; OK.
- Old-format regex — unexercised but cheap; keep.

**Do NOT merge T08 before T06.** Doing so leaves stubs in `feature/v0.1-impl` that T06 will then collide with, and T06's merge would have to destructively overwrite them. The clean sequence is: T06 → (adapt T08 on its branch per §5) → T08.

## Re-audit note (2026-04-19, post-fix)

T06 landed on `feature/v0.1-impl` at merge commit `241dbbe`. T08 branch was
rebased onto that tip and the §5 reconciliation patch applied in fix commit
**`6d9ae60`**. Concrete actions:

1. **Rebase onto `feature/v0.1-impl`:** three add/add conflicts on
   `scrapers/common/{config,db,logging}.py` as predicted. Resolved by
   copying T06's canonical versions from the main tree (stubs superseded).
   Rebase completed cleanly; the commit for `feat(T08): scrapers/idxcarbon/
   scraper + PDF parser` retains authorship but now commits T06's helpers
   instead of the stubs.
2. **`configure_logging('idxcarbon')` injected at the top of `main()`** —
   before `config.load_env()` — so the JSON handler is installed before
   any log line is emitted (module-level `get_logger("idxcarbon")` remains
   for the `LOG` name binding; it's safe because structlog lazy-binds until
   first use, by which time `main()` has already configured the handler).
3. **Context-manager `with db.get_connection() as conn:`** at both sites
   (dry-run existing-periods read-only block at lines 321-326, and main
   upsert loop at lines 345-447). Removed the paired `try/finally:
   conn.close()` since psycopg's `with` block closes on exit.
4. **`dest.unlink(missing_ok=True)` before `dest.write_bytes(...)`** in
   `download_pdf()` so a root-owned 644 PDF from prior testing can be
   replaced by the karbonlens cron user. Verified by a re-run of
   `--only-month 2026-03` that overwrote the existing root-owned
   `2026-03.pdf` without EACCES.
5. **Ruff autofix fallout:** inheriting T06's pyproject.toml activated
   `select = ["E","F","I","UP"]`, which the pre-rebase ruff run (no
   pyproject, defaults only) had not exercised. Six findings auto-fixed
   (import ordering, `datetime.UTC` alias, `collections.abc.Iterable`)
   plus one manual line-length fix on the `POLITE_DELAY_SECONDS` comment.

**Runtime re-verification:**

| Check | Result |
|-------|--------|
| `python -m scrapers.idxcarbon.fetch_monthly --dry-run` | PASS — JSON on stderr/stdout, 10 months discovered, `months_listed=10`, `summary.months_inserted=0` |
| `python -m scrapers.idxcarbon.fetch_monthly --only-month 2026-03` | PASS — `months_updated=1`, `months_inserted=0`, `months_failed=0`; `scraped_at` bumped |
| `SELECT COUNT(*) FROM idx_monthly_snapshots` (via psycopg `with db.get_connection()`) | 10 |
| `ls -la /var/lib/karbonlens/pdf-archive/2026-03.pdf` | re-written successfully; file still root-owned because the session's Python runs as root but future cron runs as karbonlens will replace via unlink-then-write regardless of prior ownership |
| `ruff check scrapers/idxcarbon/` | `All checks passed!` |
| `git log --oneline feature/v0.1-impl..HEAD` | 4 commits: 3 T08 originals (rebased) + 1 fix commit |

**Verdict updated to PASS.** All B1 blockers resolved; non-blockers (AC-2
environmental cap, old-format regex unexercised, 2s pacing, raw_payload
size) remain as Phase-2 follow-ups documented in the implementation
report.
