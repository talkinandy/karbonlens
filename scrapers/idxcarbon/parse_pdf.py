"""IDXCarbon monthly PDF parser.

Public interface::

    parse(pdf_path: Path, source_url: str | None = None) -> dict

Returns a dict whose keys match the ``idx_monthly_snapshots`` columns
(excluding ``id`` and ``scraped_at``), plus a ``raw_payload`` sub-dict that
preserves the page-by-page text and every extracted value for audit.

Two regex branches are supported per the T08 spec (§3.3):

* **Old format (Sept 2023 - Dec 2024):** Indonesian inline text such as
  ``"Total Volume: 117.234,56 tCO2e"`` and ``"Total Nilai: Rp 4.700.000.000"``
  with period-as-thousands-separator and comma-as-decimal.
* **New format (Jan 2025+):** English "CARBON MARKET - TRADING SUMMARY" table
  with anchors like ``"Total Volume ton CO e"`` (a stray ``2`` subscript floats
  on the next line), ``"Total Value IDR"``, ``"No. of Trading Days"``.
  Numbers use comma-as-thousands-separator (English locale).

Format detection probes for ``"CARBON MARKET"`` / ``"TRADING SUMMARY"`` first;
if absent, it falls back to the old-format branch.

Mandatory fields (raise ``ParseError`` if the regex produces no match at all):
``period_month``, ``total_volume_tco2e``. A matched value of ``0`` is valid
(e.g. a month with zero trading activity) and must **not** be coerced to an
error via truthiness checks - see ``extract_field`` contract below.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import pdfplumber

# ---------------------------------------------------------------------------
# Month-name mapping (spec §3.3)
# ---------------------------------------------------------------------------

INDONESIAN_MONTHS: dict[str, int] = {
    # Bahasa Indonesia
    "januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6,
    "juli": 7, "agustus": 8, "september": 9, "oktober": 10, "november": 11,
    "desember": 12,
    # English fallback (new-format PDFs 2025+ are in English)
    "january": 1, "february": 2, "march": 3,
    # "april" / "september" / "october" / "november" already covered above in
    # english form via the overlapping keys; keep separate entries for the
    # ones that differ:
    "may": 5, "june": 6, "july": 7, "august": 8, "october": 10, "december": 12,
    # Short forms seen in new-format table headers (e.g. "Jan 2026")
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}


# ---------------------------------------------------------------------------
# Error types
# ---------------------------------------------------------------------------


class ParseError(Exception):
    """Raised when a mandatory field cannot be extracted from the PDF.

    Attributes match the spec §3.3 contract so callers can log the period,
    the reason, and a text snippet.
    """

    def __init__(
        self,
        field: str,
        reason: str,
        page_text: str = "",
    ) -> None:
        super().__init__(f"{field}: {reason}")
        self.field = field
        self.reason = reason
        self.page_text = page_text


# ---------------------------------------------------------------------------
# Number normalisation
# ---------------------------------------------------------------------------


_DIGITS_ONLY_RE = re.compile(r"[^\d.,-]")


def _normalise_number(raw: str, *, locale: str) -> Decimal | None:
    """Strip currency prefixes/suffixes and return a Decimal, or None.

    ``locale='id'`` uses period-as-thousands-separator and comma-as-decimal
    (e.g. ``"4.700.000.000,50"`` -> ``4700000000.50``).

    ``locale='en'`` uses comma-as-thousands-separator and period-as-decimal
    (e.g. ``"4,701,187,600"`` -> ``4701187600``).

    Returns ``None`` when ``raw`` is empty or normalises to a non-numeric
    string. A string of ``"0"`` returns ``Decimal(0)`` (a valid, insertable
    zero - not a parse failure).
    """
    if raw is None:
        return None
    s = raw.strip()
    # Strip leading "Rp" and any asterisk footnote markers
    s = re.sub(r"^Rp\.?\s*", "", s, flags=re.IGNORECASE)
    s = s.replace("*", "").strip()
    if not s or s == "-":
        return None
    # Keep only digits, comma, period, minus
    s = _DIGITS_ONLY_RE.sub("", s)
    if not s:
        return None
    if locale == "id":
        # "1.234.567,89" -> "1234567.89"
        s = s.replace(".", "").replace(",", ".")
    elif locale == "en":
        # "1,234,567.89" -> "1234567.89"
        s = s.replace(",", "")
    else:
        raise ValueError(f"unknown locale: {locale!r}")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


# ---------------------------------------------------------------------------
# extract_field helper (spec §3.3)
# ---------------------------------------------------------------------------


def extract_field(text: str, pattern: re.Pattern[str], *, locale: str = "en") -> int | None:
    """Return the parsed integer from ``pattern``'s first capture group, or None.

    Contract (spec §3.3):

    * Returns ``None`` when the regex produces **no match at all**.
    * Returns ``0`` (a valid integer) when the regex matches and the captured
      group normalises to zero.

    Callers **must** distinguish the two cases:

    .. code-block:: python

        vol = extract_field(page_text, VOLUME_PATTERN)
        if vol is None:
            raise ParseError('total_volume_tco2e',
                             f'regex no match: {page_text[:200]!r}')
        # vol == 0 is valid (zero-trading month); do NOT use `if not vol`.
    """
    match = pattern.search(text)
    if match is None:
        return None
    captured = match.group(1)
    value = _normalise_number(captured, locale=locale)
    if value is None:
        return None
    return int(value)


# ---------------------------------------------------------------------------
# Period (period_month) extraction
# ---------------------------------------------------------------------------


_PERIOD_INLINE_RE = re.compile(
    r"\b("
    r"Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|"
    r"January|February|March|April|May|June|July|August|September|October|November|December"
    r")\s+(\d{4})\b",
    re.IGNORECASE,
)

# New-format title page renders "J A N U A R Y\n2 0 2 6" - letters separated by
# spaces. This regex captures that spaced form too.
_PERIOD_SPACED_RE = re.compile(
    r"\b([A-Z](?:\s[A-Z]){2,8})\s+(\d\s\d\s\d\s\d)\b",
)


def _extract_period(text: str, *, cover_text: str | None = None) -> date | None:
    """Try several strategies to extract ``period_month`` from PDF text.

    Returns the first day of the detected month (``date``) or ``None`` when no
    pattern matches.

    Both 2025+ new-format and 2023-2024 old-format PDFs carry a cover page
    whose title spells the report month out as "J U N E\\n2 0 2 5" - letters
    separated by spaces. When ``cover_text`` (typically page 1 only) is
    supplied we probe it first with the spaced regex; this avoids being fooled
    by the many same-page-2-onwards occurrences of prior-year months
    ("Sept 2023", "May 2025", etc.) used as comparison columns.
    """
    # Strategy 1 (highest confidence): spaced title form on the cover page.
    if cover_text is not None:
        for match in _PERIOD_SPACED_RE.finditer(cover_text):
            letters = match.group(1).replace(" ", "")
            digits = match.group(2).replace(" ", "")
            month = INDONESIAN_MONTHS.get(letters.lower())
            if month and digits.isdigit() and len(digits) == 4:
                return date(int(digits), month, 1)
        # Strategy 2: inline "January 2026" on the cover page (covers any
        # future cover redesign that drops the spaced form).
        for match in _PERIOD_INLINE_RE.finditer(cover_text):
            month_name = match.group(1).lower()
            year = int(match.group(2))
            month = INDONESIAN_MONTHS.get(month_name)
            if month:
                return date(year, month, 1)

    # Strategy 3: spaced title anywhere in the document.
    for match in _PERIOD_SPACED_RE.finditer(text):
        letters = match.group(1).replace(" ", "")
        digits = match.group(2).replace(" ", "")
        month = INDONESIAN_MONTHS.get(letters.lower())
        if month and digits.isdigit() and len(digits) == 4:
            return date(int(digits), month, 1)

    # Strategy 4: inline "January 2026" anywhere - last resort; may pick a
    # prior-year reference, so prefer filename-derived period when available.
    for match in _PERIOD_INLINE_RE.finditer(text):
        month_name = match.group(1).lower()
        year = int(match.group(2))
        month = INDONESIAN_MONTHS.get(month_name)
        if month:
            return date(year, month, 1)

    return None


def period_from_filename(pdf_path: Path) -> date | None:
    """Best-effort: extract ``YYYY-MM`` from a filename like ``2026-01.pdf``."""
    stem = pdf_path.stem
    match = re.match(r"(\d{4})-(\d{2})$", stem)
    if not match:
        return None
    year, month = int(match.group(1)), int(match.group(2))
    if 1 <= month <= 12:
        return date(year, month, 1)
    return None


# ---------------------------------------------------------------------------
# Regex catalogues - new format (2025+) and old format (2023-2024)
# ---------------------------------------------------------------------------

# New-format anchors. pdfplumber extracts text preserving line breaks; the
# subscript "2" in "CO2" floats to its own line, so we treat "ton CO e" and
# "ton CO2e" / "tCO2e" as the same anchor. All numbers are English-locale.

_WS = r"[\s\n\r]*"
_EN_NUM = r"([\d,]+(?:\.\d+)?)"

_NEW_VOLUME_RE = re.compile(
    r"Total\s+Volume" + _WS + r"(?:ton\s+CO\s*2?\s*e?)?" + _WS + _EN_NUM,
    re.IGNORECASE,
)
_NEW_VALUE_RE = re.compile(
    r"Total\s+Value" + _WS + r"IDR" + _WS + _EN_NUM,
    re.IGNORECASE,
)
_NEW_FREQ_RE = re.compile(
    r"Total\s+Frequency" + _WS + r"times" + _WS + _EN_NUM,
    re.IGNORECASE,
)
_NEW_TRADING_DAYS_RE = re.compile(
    r"No\.?\s+of\s+Trading\s+Days(?!\s*\(YTD\))" + _WS + _EN_NUM,
    re.IGNORECASE,
)
_NEW_PARTICIPANTS_RE = re.compile(
    r"No\.?\s+of\s+Participant" + _WS + _EN_NUM,
    re.IGNORECASE,
)
_NEW_PROJECTS_RE = re.compile(
    r"No\.?\s+of\s+Listed\s+Project" + _WS + _EN_NUM,
    re.IGNORECASE,
)
_NEW_AVAILABLE_RE = re.compile(
    r"Available\s+Carbon\s+Unit" + _WS + r"(?:ton\s+CO\s*2?\s*e?)?" + _WS + _EN_NUM,
    re.IGNORECASE,
)
_NEW_RETIRED_RE = re.compile(
    r"Retired\s+Carbon\s+Unit" + _WS + r"(?:ton\s+CO\s*2?\s*e?)?" + _WS + _EN_NUM,
    re.IGNORECASE,
)


# Old-format anchors (Indonesian inline text). Numbers use Indonesian locale:
# thousands separator = period, decimal separator = comma.

_ID_NUM = r"([\d.]+(?:,\d+)?)"

_OLD_VOLUME_RE = re.compile(
    r"(?:Total\s+Volume(?:\s+Transaksi)?)\s*:?" + _WS + _ID_NUM + r"\s*tCO",
    re.IGNORECASE,
)
_OLD_VALUE_RE = re.compile(
    r"(?:Total\s+Nilai(?:\s+Transaksi)?)\s*:?" + _WS + r"Rp\.?" + _WS + _ID_NUM,
    re.IGNORECASE,
)
_OLD_TRANSACTIONS_RE = re.compile(
    r"(?:Jumlah\s+Transaksi|Total\s+Transaksi)\s*:?" + _WS + _ID_NUM,
    re.IGNORECASE,
)
_OLD_TRADING_DAYS_RE = re.compile(
    r"Jumlah\s+Hari\s+Perdagangan\s*:?" + _WS + _ID_NUM,
    re.IGNORECASE,
)
_OLD_PARTICIPANTS_RE = re.compile(
    r"Peserta\s+Terdaftar\s*:?" + _WS + _ID_NUM,
    re.IGNORECASE,
)
_OLD_PROJECTS_RE = re.compile(
    r"Proyek\s+Terdaftar\s*:?" + _WS + _ID_NUM,
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Format detection + parsing
# ---------------------------------------------------------------------------


def _looks_like_new_format(text: str) -> bool:
    """Heuristic: the 2025+ "Monthly Report" PDFs carry the table header
    ``"CARBON MARKET - TRADING SUMMARY"`` on page 2."""
    low = text.upper()
    return ("CARBON MARKET" in low and "TRADING SUMMARY" in low) or "MONTHLY\nREPORT" in low


@dataclass
class _Extracted:
    period_month: date | None
    total_volume_tco2e: int | None
    total_value_idr: int | None
    total_transactions: int | None
    trading_days: int | None
    registered_participants: int | None
    registered_projects: int | None
    available_units: int | None
    retired_units: int | None
    format_branch: str


def _parse_new_format(text: str, *, cover_text: str | None = None) -> _Extracted:
    return _Extracted(
        period_month=_extract_period(text, cover_text=cover_text),
        total_volume_tco2e=extract_field(text, _NEW_VOLUME_RE, locale="en"),
        total_value_idr=extract_field(text, _NEW_VALUE_RE, locale="en"),
        total_transactions=extract_field(text, _NEW_FREQ_RE, locale="en"),
        trading_days=extract_field(text, _NEW_TRADING_DAYS_RE, locale="en"),
        registered_participants=extract_field(text, _NEW_PARTICIPANTS_RE, locale="en"),
        registered_projects=extract_field(text, _NEW_PROJECTS_RE, locale="en"),
        available_units=extract_field(text, _NEW_AVAILABLE_RE, locale="en"),
        retired_units=extract_field(text, _NEW_RETIRED_RE, locale="en"),
        format_branch="new",
    )


def _parse_old_format(text: str, *, cover_text: str | None = None) -> _Extracted:
    return _Extracted(
        period_month=_extract_period(text, cover_text=cover_text),
        total_volume_tco2e=extract_field(text, _OLD_VOLUME_RE, locale="id"),
        total_value_idr=extract_field(text, _OLD_VALUE_RE, locale="id"),
        total_transactions=extract_field(text, _OLD_TRANSACTIONS_RE, locale="id"),
        trading_days=extract_field(text, _OLD_TRADING_DAYS_RE, locale="id"),
        registered_participants=extract_field(text, _OLD_PARTICIPANTS_RE, locale="id"),
        registered_projects=extract_field(text, _OLD_PROJECTS_RE, locale="id"),
        available_units=None,  # not published in old format
        retired_units=None,  # not published in old format
        format_branch="old",
    )


def _merge_pages(pages: Iterable[str]) -> str:
    return "\n".join(pages)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def parse(pdf_path: Path, source_url: str | None = None) -> dict[str, Any]:
    """Parse ``pdf_path`` and return a dict matching ``idx_monthly_snapshots``.

    Raises :class:`ParseError` when a mandatory field (``period_month`` or
    ``total_volume_tco2e``) cannot be extracted from either format branch.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    full_text = _merge_pages(page_texts)
    cover_text = page_texts[0] if page_texts else ""

    # Try new-format branch first when the characteristic table header is
    # present; otherwise try old-format branch. If either branch succeeds at
    # extracting the mandatory fields, use it. If both fail, raise.
    if _looks_like_new_format(full_text):
        primary = _parse_new_format(full_text, cover_text=cover_text)
        fallback = _parse_old_format
    else:
        primary = _parse_old_format(full_text, cover_text=cover_text)
        fallback = _parse_new_format

    extracted = primary
    if extracted.total_volume_tco2e is None or extracted.period_month is None:
        alternative = fallback(full_text, cover_text=cover_text)
        # Only switch branches if the alternative filled in the mandatory
        # fields that the primary missed.
        if (
            alternative.total_volume_tco2e is not None
            and alternative.period_month is not None
        ):
            extracted = alternative

    # Filename fallback for period if regexes couldn't find it in text.
    if extracted.period_month is None:
        extracted.period_month = period_from_filename(pdf_path)

    snippet = full_text[:500]

    if extracted.period_month is None:
        raise ParseError(
            "period_month",
            f"no month-name found in PDF text or filename (branch={extracted.format_branch})",
            snippet,
        )
    if extracted.total_volume_tco2e is None:
        raise ParseError(
            "total_volume_tco2e",
            f"regex produced no match on any page (branch={extracted.format_branch})",
            snippet,
        )

    # Derive avg_price_idr (spec §3.3): total_value_idr / total_volume_tco2e
    # with zero-guard. Prefer the derived value over any PDF-published figure.
    avg_price_idr: int | None
    if (
        extracted.total_value_idr is not None
        and extracted.total_volume_tco2e is not None
        and extracted.total_volume_tco2e > 0
    ):
        avg_price_idr = int(
            Decimal(extracted.total_value_idr) / Decimal(extracted.total_volume_tco2e)
        )
    else:
        avg_price_idr = None

    raw_payload = {
        "format_branch": extracted.format_branch,
        "source_url": source_url,
        "page_count": len(page_texts),
        "page_texts": page_texts,
        "extracted": {
            "period_month": extracted.period_month.isoformat(),
            "total_volume_tco2e": extracted.total_volume_tco2e,
            "total_value_idr": extracted.total_value_idr,
            "total_transactions": extracted.total_transactions,
            "trading_days": extracted.trading_days,
            "registered_participants": extracted.registered_participants,
            "registered_projects": extracted.registered_projects,
            "available_units": extracted.available_units,
            "retired_units": extracted.retired_units,
            "avg_price_idr_derived": avg_price_idr,
        },
    }

    return {
        "period_month": extracted.period_month,
        "total_volume_tco2e": extracted.total_volume_tco2e,
        "total_value_idr": extracted.total_value_idr,
        "total_transactions": extracted.total_transactions,
        "trading_days": extracted.trading_days,
        "registered_participants": extracted.registered_participants,
        "registered_projects": extracted.registered_projects,
        "available_units": extracted.available_units,
        "retired_units": extracted.retired_units,
        "avg_price_idr": avg_price_idr,
        "raw_report_url": source_url,
        "raw_payload": raw_payload,
    }
