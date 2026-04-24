"""IDXCarbon monthly aggregate PDF scraper - fetch + ingest.

Entry point::

    python -m scrapers.idxcarbon.fetch_monthly [flags]

Flags (spec §3.2):

* ``--from-month YYYY-MM``  skip months before this value (default ``2023-09``).
* ``--only-month YYYY-MM``  process a single month and exit.
* ``--dry-run``             list discovered months + would-insert flag; no writes.

Behaviour:

1. Fetch ``https://idxcarbon.co.id/data-monthly`` HTML with a polite UA and a
   30-second timeout.
2. Parse monthly PDF anchors from the DataTables ``<table id="example">``
   element. Each row exposes the report month (English or Indonesian label)
   plus a ``document/share/<id>/<uuid>`` URL. Extract ``period_month`` from
   the label; the filename is not used by IDXCarbon's share URLs.
3. Filter by ``--from-month`` / ``--only-month``.
4. For each PDF: **always re-download** to
   ``/var/lib/karbonlens/pdf-archive/YYYY-MM.pdf`` (overwrite any existing
   cached file - spec §3.2 cross-phase decision 3 ensures corrected PDFs are
   always ingested).
5. Parse via :mod:`scrapers.idxcarbon.parse_pdf`.
6. Upsert into ``idx_monthly_snapshots`` using
   ``INSERT ... ON CONFLICT (period_month) DO UPDATE SET ..., scraped_at = NOW()``.

Historical backfill: ``python -m scrapers.idxcarbon.fetch_monthly
--from-month 2023-09`` discovers whatever the listing page currently exposes.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, date, datetime
from pathlib import Path

import httpx
from bs4 import BeautifulSoup
from psycopg.types.json import Json
from scrapers.common import config, db
from scrapers.common.logging import configure_logging, get_logger
from scrapers.idxcarbon import parse_pdf

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LISTING_URL = "https://idxcarbon.co.id/data-monthly"
USER_AGENT = "KarbonLens-scraper/0.1 (+https://karbonlens.netlify.app)"
HTTP_TIMEOUT = 30.0
PDF_ARCHIVE_DIR = Path("/var/lib/karbonlens/pdf-archive")
# between PDF downloads (implementation-brief override of spec §9 5-sec guidance)
POLITE_DELAY_SECONDS = 2.0
DEFAULT_FROM_MONTH = date(2023, 9, 1)

# Module-level logger used only for import-time plumbing. The real scraper
# log binding is created inside `main()` once `configure_logging()` has run.
LOG = get_logger("idxcarbon")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_ym(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m").replace(day=1).date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"expected YYYY-MM, got {value!r}: {exc}"
        ) from exc


def _build_argparser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m scrapers.idxcarbon.fetch_monthly",
        description="Fetch and ingest IDXCarbon monthly aggregate PDFs.",
    )
    parser.add_argument(
        "--from-month",
        type=_parse_ym,
        default=DEFAULT_FROM_MONTH,
        help="Skip months before this value (default: 2023-09).",
    )
    parser.add_argument(
        "--only-month",
        type=_parse_ym,
        default=None,
        help="Process a single month (YYYY-MM) and exit.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List discovered months without downloading or writing.",
    )
    return parser


# ---------------------------------------------------------------------------
# Listing-page parsing
# ---------------------------------------------------------------------------

# Indonesian + English month-name lookup reused from parse_pdf.
_MONTH_LOOKUP = parse_pdf.INDONESIAN_MONTHS


def _parse_month_label(label: str) -> date | None:
    """Parse "March 2026", "Maret 2026", "Mar 2026" etc. into a first-of-month
    ``date``. Returns ``None`` for unrecognised strings."""
    tokens = label.strip().split()
    if len(tokens) < 2:
        return None
    month_token = tokens[0].lower().rstrip(",.")
    year_token = tokens[-1]
    month = _MONTH_LOOKUP.get(month_token)
    if not month or not year_token.isdigit() or len(year_token) != 4:
        return None
    return date(int(year_token), month, 1)


def discover_listing(html: str) -> list[dict[str, object]]:
    """Return a list of ``{"period_month": date, "pdf_url": str, "label": str}``
    entries from the listing page HTML."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", id="example")
    if table is None:
        raise RuntimeError(
            "listing page HTML has no <table id='example'> - IDXCarbon layout changed"
        )
    tbody = table.find("tbody")
    if tbody is None:
        return []
    discovered: list[dict[str, object]] = []
    for tr in tbody.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue
        label = tds[1].get_text(strip=True)
        anchor = tds[2].find("a", href=True)
        if anchor is None:
            continue
        href = anchor["href"].strip()
        period = _parse_month_label(label)
        if period is None:
            LOG.warning("listing_unparseable_label", label=label, href=href)
            continue
        discovered.append(
            {"period_month": period, "pdf_url": href, "label": label}
        )
    return discovered


def fetch_listing(client: httpx.Client) -> list[dict[str, object]]:
    """GET the listing page and return discovered PDF rows."""
    resp = client.get(LISTING_URL, follow_redirects=True)
    resp.raise_for_status()
    return discover_listing(resp.text)


# ---------------------------------------------------------------------------
# PDF download + archive
# ---------------------------------------------------------------------------


def archive_path(period: date) -> Path:
    """Return the canonical ``/var/lib/karbonlens/pdf-archive/YYYY-MM.pdf``
    path for ``period``."""
    return PDF_ARCHIVE_DIR / f"{period.year:04d}-{period.month:02d}.pdf"


def download_pdf(client: httpx.Client, url: str, dest: Path) -> None:
    """Download ``url`` to ``dest``. Always overwrites (spec §3.2).

    Unlinks any existing file before writing so that PDFs originally created
    by a different OS user (e.g. root during manual testing) can be replaced
    cleanly when cron runs as the `karbonlens` user. `Path.write_bytes` opens
    the existing inode with `mode='wb'` which would EACCES on a root-owned
    644 file; unlink-then-write side-steps that entirely.
    """
    resp = client.get(url, follow_redirects=True)
    resp.raise_for_status()
    content_type = resp.headers.get("content-type", "")
    if "pdf" not in content_type.lower():
        raise RuntimeError(
            f"expected application/pdf from {url}, got {content_type!r}"
        )
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.unlink(missing_ok=True)
    dest.write_bytes(resp.content)


# ---------------------------------------------------------------------------
# Database upsert
# ---------------------------------------------------------------------------


_UPSERT_SQL = """
    INSERT INTO idx_monthly_snapshots (
        period_month,
        total_volume_tco2e,
        total_value_idr,
        total_transactions,
        trading_days,
        registered_participants,
        registered_projects,
        available_units,
        retired_units,
        avg_price_idr,
        raw_report_url,
        raw_payload,
        scraped_at
    )
    VALUES (
        %(period_month)s,
        %(total_volume_tco2e)s,
        %(total_value_idr)s,
        %(total_transactions)s,
        %(trading_days)s,
        %(registered_participants)s,
        %(registered_projects)s,
        %(available_units)s,
        %(retired_units)s,
        %(avg_price_idr)s,
        %(raw_report_url)s,
        %(raw_payload)s,
        NOW()
    )
    ON CONFLICT (period_month) DO UPDATE SET
        total_volume_tco2e      = EXCLUDED.total_volume_tco2e,
        total_value_idr         = EXCLUDED.total_value_idr,
        total_transactions      = EXCLUDED.total_transactions,
        trading_days            = EXCLUDED.trading_days,
        registered_participants = EXCLUDED.registered_participants,
        registered_projects     = EXCLUDED.registered_projects,
        available_units         = EXCLUDED.available_units,
        retired_units           = EXCLUDED.retired_units,
        avg_price_idr           = EXCLUDED.avg_price_idr,
        raw_report_url          = EXCLUDED.raw_report_url,
        raw_payload             = EXCLUDED.raw_payload,
        scraped_at              = NOW()
    RETURNING (xmax = 0) AS inserted
"""


def upsert_snapshot(conn, parsed: dict[str, object]) -> bool:
    """Insert or update one row; return True if a fresh insert, False if update."""
    params = dict(parsed)
    params["raw_payload"] = Json(params["raw_payload"])
    with conn.cursor() as cur:
        cur.execute(_UPSERT_SQL, params)
        row = cur.fetchone()
    inserted = bool(row[0]) if row is not None else False
    return inserted


def existing_periods(conn) -> set[date]:
    """Return the set of ``period_month`` values already in the table."""
    with conn.cursor() as cur:
        cur.execute("SELECT period_month FROM idx_monthly_snapshots")
        return {row[0] for row in cur.fetchall()}


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def _filter_listing(
    discovered: list[dict[str, object]],
    *,
    from_month: date,
    only_month: date | None,
) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    for entry in discovered:
        period = entry["period_month"]
        assert isinstance(period, date)
        if only_month is not None:
            if period != only_month:
                continue
        elif period < from_month:
            continue
        out.append(entry)
    # Sort oldest-first so the log is chronological
    out.sort(key=lambda e: e["period_month"])  # type: ignore[index]
    return out


def _run(args: argparse.Namespace) -> int:
    started_at = datetime.now(UTC)
    summary: dict[str, object] = {
        "scraper": "idxcarbon",
        "started_at": started_at.isoformat(),
        "months_discovered": 0,
        "months_skipped": 0,
        "months_inserted": 0,
        "months_updated": 0,
        "months_failed": 0,
        "errors": [],
    }

    headers = {"User-Agent": USER_AGENT}
    with httpx.Client(headers=headers, timeout=HTTP_TIMEOUT) as client:
        LOG.info("listing_fetch_start", url=LISTING_URL)
        discovered = fetch_listing(client)
        summary["months_discovered"] = len(discovered)
        LOG.info(
            "listing_fetch_done",
            count=len(discovered),
            periods=[e["period_month"].isoformat() for e in discovered],  # type: ignore[union-attr]
        )

        to_process = _filter_listing(
            discovered,
            from_month=args.from_month,
            only_month=args.only_month,
        )
        summary["months_skipped"] = len(discovered) - len(to_process)

        if args.dry_run:
            # Need DB to tell "would insert" vs "already in DB"; but read-only
            with db.get_connection() as conn:
                existing = existing_periods(conn)
            for entry in to_process:
                period: date = entry["period_month"]  # type: ignore[assignment]
                status = "already in DB" if period in existing else "would insert"
                print(f"{period.isoformat()}  {status}  ({entry['pdf_url']})")
            LOG.info("dry_run_complete", months_listed=len(to_process))
            summary["finished_at"] = datetime.now(UTC).isoformat()
            print(json.dumps({"summary": summary}, default=str))
            return 0

        if args.only_month is not None and not to_process:
            LOG.info(
                "only_month_not_on_listing",
                only_month=args.only_month.isoformat(),
            )

        with db.get_connection() as conn:
            for index, entry in enumerate(to_process):
                period = entry["period_month"]  # type: ignore[assignment]
                url = entry["pdf_url"]  # type: ignore[assignment]
                assert isinstance(period, date) and isinstance(url, str)
                dest = archive_path(period)
                bound = LOG.bind(period=period.isoformat(), pdf_url=url)
                bound.info("pdf_download_start", dest=str(dest))
                try:
                    download_pdf(client, url, dest)
                except httpx.HTTPStatusError as exc:
                    bound.warning(
                        "pdf_download_http_error",
                        status=exc.response.status_code,
                    )
                    summary["months_failed"] = int(summary["months_failed"]) + 1
                    summary["errors"].append(  # type: ignore[union-attr]
                        {
                            "period": period.isoformat(),
                            "stage": "download",
                            "reason": f"HTTP {exc.response.status_code}",
                        }
                    )
                    continue
                except Exception as exc:  # noqa: BLE001 - log-and-continue policy
                    bound.warning("pdf_download_error", error=str(exc))
                    summary["months_failed"] = int(summary["months_failed"]) + 1
                    summary["errors"].append(  # type: ignore[union-attr]
                        {
                            "period": period.isoformat(),
                            "stage": "download",
                            "reason": str(exc),
                        }
                    )
                    continue

                try:
                    parsed = parse_pdf.parse(dest, source_url=url)
                except parse_pdf.ParseError as exc:
                    bound.error(
                        "pdf_parse_error",
                        field=exc.field,
                        reason=exc.reason,
                        page_text_snippet=exc.page_text[:500],
                    )
                    summary["months_failed"] = int(summary["months_failed"]) + 1
                    summary["errors"].append(  # type: ignore[union-attr]
                        {
                            "period": period.isoformat(),
                            "stage": "parse",
                            "field": exc.field,
                            "reason": exc.reason,
                        }
                    )
                    continue

                # Double-check: the period parsed from the PDF should match
                # the period derived from the listing label. Mismatches are a
                # loud error - we trust the listing label (canonical) and log
                # the parser discrepancy.
                parsed_period = parsed["period_month"]
                if parsed_period != period:
                    bound.warning(
                        "pdf_period_mismatch",
                        listing_period=period.isoformat(),
                        parsed_period=parsed_period.isoformat(),  # type: ignore[union-attr]
                    )
                    parsed["period_month"] = period
                    # Also patch raw_payload so the mismatch is preserved.
                    raw_payload = parsed["raw_payload"]
                    assert isinstance(raw_payload, dict)
                    raw_payload["listing_period_override"] = period.isoformat()

                try:
                    inserted = upsert_snapshot(conn, parsed)
                except Exception as exc:  # noqa: BLE001
                    conn.rollback()
                    bound.error("pdf_upsert_error", error=str(exc))
                    summary["months_failed"] = int(summary["months_failed"]) + 1
                    summary["errors"].append(  # type: ignore[union-attr]
                        {
                            "period": period.isoformat(),
                            "stage": "upsert",
                            "reason": str(exc),
                        }
                    )
                    continue
                conn.commit()
                if inserted:
                    summary["months_inserted"] = int(summary["months_inserted"]) + 1
                    bound.info("pdf_ingest_inserted")
                else:
                    summary["months_updated"] = int(summary["months_updated"]) + 1
                    bound.info("pdf_ingest_updated")

                # Polite pacing between downloads.
                if index < len(to_process) - 1:
                    time.sleep(POLITE_DELAY_SECONDS)

    summary["finished_at"] = datetime.now(UTC).isoformat()
    LOG.info("run_complete", **{k: v for k, v in summary.items() if k != "errors"})
    # Emit the full structured summary on stdout as a single JSON line so
    # post-run assertions / dashboards can parse it.
    print(json.dumps({"summary": summary}, default=str))
    return 0


def main(argv: list[str] | None = None) -> int:
    configure_logging("idxcarbon")
    config.load_env()
    parser = _build_argparser()
    args = parser.parse_args(argv)
    return _run(args)


if __name__ == "__main__":
    sys.exit(main())
