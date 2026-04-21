"""Verra VCS registry scraper — Indonesian projects, weekly.

Fetches all Indonesian VCS projects from the Verra registry, resolves them
against the existing `projects` table via pg_trgm fuzzy name match, and upserts
into `projects`, `registries`, `issuances`, and (for ambiguous matches)
`project_match_queue`.

Entry point:
    python -m verra.fetch [--since YYYY-MM-DD] [--dry-run] [--limit N]

Verra exposes an Angular SPA backed by a JSON API under /uiapi. The HTML-only
URLs cited in the spec (/app/search/VCS/Registered+project) now return a 404
404 shell. Endpoints we use (discovered 2026-04-19 by inspecting the live
main.<hash>.js bundle):

  - POST /uiapi/resource/resource/search    — project list (OData-style)
  - GET  /uiapi/resource/resourceSummary/N  — project detail (N = VCS numeric id)
  - POST /uiapi/asset/asset/search          — issuance (VCU) history

See docs/stories/reports/T06-implementation-report.md for the full site
inspection notes.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

import httpx
import psycopg

# The scraper is invoked as `python -m verra.fetch` (cwd = scrapers/), so the
# sibling `common/` package is importable as `common`.
from common import config as config_module
from common.db import execute, execute_with_retry, get_connection
from common.logging import configure_logging, get_logger

from .known_centroids import KNOWN_CENTROIDS, PROVINCE_CENTROIDS

# ----------------------------------------------------------------------------
# Endpoint + HTTP constants
# ----------------------------------------------------------------------------

# WARNING: Verra's SPA ships a new main.<hash>.js on every release. The
# /uiapi prefix and the three endpoints below have been stable since late 2023
# but are not documented publicly; if the scraper starts returning 404 or
# empty data, re-inspect the live bundle and adjust.
VERRA_BASE = "https://registry.verra.org"
VERRA_SEARCH_URL = f"{VERRA_BASE}/uiapi/resource/resource/search"
VERRA_DETAIL_URL_TEMPLATE = f"{VERRA_BASE}/uiapi/resource/resourceSummary/{{numeric_id}}"
VERRA_ISSUANCE_URL = f"{VERRA_BASE}/uiapi/asset/asset/search"

# Web-facing URL pattern written into registries.url for humans / auditors.
VERRA_PROJECT_WEB_URL = f"{VERRA_BASE}/app/projectDetail/VCS/{{numeric_id}}"

FETCH_DELAY_SECONDS = 3.0  # architecture.md section 4 + spec section 3.3
RETRY_MAX = 3
RETRY_BACKOFF_BASE = 5  # seconds; doubles per attempt (5, 10, 20)

HTTP_HEADERS = {
    "User-Agent": config_module.SCRAPER_USER_AGENT,
    "Accept": "application/json, text/html;q=0.9",
    "Accept-Language": "en-US,en;q=0.5",
    "Content-Type": "application/json",
}

# Status mapping (spec section 4)
STATUS_MAP: dict[str, str] = {
    "Registered": "active",
    "Under development": "pipeline",
    "Under Development": "pipeline",
    "Under validation": "pipeline",
    "On Hold": "suspended",
    "Inactive": "suspended",
    "Withdrawn": "flagged",
    "Rejected by Administrator": "flagged",
    "Rejected": "flagged",
}

# Fuzzy match thresholds (spec section 3.3)
SIM_AUTO_MERGE = 0.95
SIM_QUEUE_FLOOR = 0.70

log = get_logger(__name__)


# ----------------------------------------------------------------------------
# Dataclasses
# ----------------------------------------------------------------------------


@dataclass
class VerraProject:
    """Parsed Verra project, pre-DB-write."""

    vcs_id: str  # e.g. "VCS1477"
    numeric_id: str  # e.g. "1477"
    name: str
    status_raw: str | None
    status_db: str | None  # mapped projects.status
    developer: str | None
    project_type: str | None  # protocolCategories / AFOLU etc.
    methodology: str | None  # protocol / VM0007
    hectares: float | None
    country: str | None
    province: str | None
    validation_date: date | None
    first_issuance_date: date | None
    total_vcus_issued: float
    total_vcus_retired: float
    description: str | None
    centroid_lat: float | None
    centroid_lon: float | None
    centroid_source: str  # 'api' | 'known' | 'province' | 'null'
    raw_metadata: dict  # goes into registries.raw_metadata JSONB


@dataclass
class VerraIssuance:
    vintage_year: int
    credits: float
    issuance_date: date
    serial_start: str | None
    serial_end: str | None
    raw_payload: dict


@dataclass
class RunStats:
    started_at: str
    records_in: int = 0
    records_inserted: int = 0
    records_updated: int = 0
    records_queued: int = 0
    issuances_written: int = 0
    errors: list[dict] = field(default_factory=list)


# ----------------------------------------------------------------------------
# HTTP layer
# ----------------------------------------------------------------------------


def _fetch_post(
    client: httpx.Client,
    url: str,
    *,
    params: dict | None = None,
    json_body: dict | None = None,
    retries: int = RETRY_MAX,
) -> dict | None:
    """POST with exponential-backoff retry on timeout / 5xx. Returns parsed JSON."""
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            r = client.post(url, params=params, json=json_body, timeout=90.0)
            if r.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"status {r.status_code}", request=r.request, response=r
                )
            if r.status_code >= 400:
                log.warning("http_client_error", url=url, status=r.status_code, body=r.text[:200])
                return None
            return r.json()
        except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.TransportError) as exc:
            last_exc = exc
            backoff = RETRY_BACKOFF_BASE * (2**attempt)
            log.warning(
                "http_retry", url=url, attempt=attempt + 1, backoff_s=backoff, error=str(exc)
            )
            if attempt == retries - 1:
                break
            time.sleep(backoff)
    log.error("http_failed", url=url, error=str(last_exc))
    return None


def _fetch_get(
    client: httpx.Client,
    url: str,
    *,
    retries: int = RETRY_MAX,
) -> dict | None:
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            r = client.get(url, timeout=60.0)
            if r.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"status {r.status_code}", request=r.request, response=r
                )
            if r.status_code >= 400:
                log.warning("http_client_error", url=url, status=r.status_code)
                return None
            return r.json()
        except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.TransportError) as exc:
            last_exc = exc
            backoff = RETRY_BACKOFF_BASE * (2**attempt)
            log.warning(
                "http_retry", url=url, attempt=attempt + 1, backoff_s=backoff, error=str(exc)
            )
            if attempt == retries - 1:
                break
            time.sleep(backoff)
    log.error("http_failed", url=url, error=str(last_exc))
    return None


# ----------------------------------------------------------------------------
# Parsing helpers
# ----------------------------------------------------------------------------


_HECTARES_RE = re.compile(r"([0-9][0-9,\.]*)\s*(hectares|ha)\b", re.IGNORECASE)
_DESC_HECTARES_RE = re.compile(r"([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\s*hectares", re.IGNORECASE)


def _parse_hectares(raw: str | None) -> float | None:
    """'14980 Hectares' -> 14980.0. Strips commas. Returns None on failure."""
    if not raw:
        return None
    m = _HECTARES_RE.search(raw)
    if not m:
        # Some responses return just a number as string.
        try:
            return float(str(raw).replace(",", ""))
        except (TypeError, ValueError):
            return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _parse_date(raw: str | None) -> date | None:
    """Parse common Verra date formats; returns None on failure."""
    if not raw:
        return None
    s = str(raw).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d-%b-%Y", "%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _extract_attr(attrs: list[dict], code: str) -> str | None:
    """Find a participationSummaries attribute by code; return first string value."""
    for attr in attrs or []:
        if attr.get("code") != code:
            continue
        for v in attr.get("values") or []:
            if v.get("type") in ("string", "integer") and v.get("value") is not None:
                return str(v["value"])
    return None


def _map_status(raw: str | None) -> str | None:
    if not raw:
        return None
    mapped = STATUS_MAP.get(raw.strip())
    if mapped is None:
        log.warning("status_unmapped", raw=raw)
        return "suspended"
    return mapped


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:100] or "project"


def _unique_slug(conn: psycopg.Connection, base_slug: str, exclude_id: str | None = None) -> str:
    """Return base_slug if unused, else base_slug-2, -3, ..."""
    candidate = base_slug
    counter = 1
    while True:
        cur = execute(
            conn,
            "SELECT id FROM projects WHERE slug = %s AND (%s::uuid IS NULL OR id <> %s::uuid)",
            (candidate, exclude_id, exclude_id),
        )
        if cur.fetchone() is None:
            return candidate
        counter += 1
        candidate = f"{base_slug}-{counter}"


# ----------------------------------------------------------------------------
# Verra API wrappers
# ----------------------------------------------------------------------------


def fetch_indonesia_projects(client: httpx.Client) -> list[dict]:
    """Return every Indonesia VCS project from the list endpoint.

    We paginate via $skip/$top until we have `@count` rows.
    """
    all_rows: list[dict] = []
    page_size = 100
    skip = 0
    total = None
    while True:
        params = {
            "$count": "true",
            "$top": str(page_size),
            "$skip": str(skip),
            "$filter": "country eq 'Indonesia'",
        }
        body = {"program": "VCS", "resourceType": "PROJECT"}
        page = _fetch_post(client, VERRA_SEARCH_URL, params=params, json_body=body)
        if not page:
            log.error("search_fetch_failed", skip=skip)
            break
        rows = page.get("value") or []
        if total is None:
            total = int(page.get("@count") or len(rows))
            log.info("verra_search_total", count=total)
        all_rows.extend(rows)
        if not rows or len(all_rows) >= total:
            break
        skip += page_size
        # Gentle pacing even on the list endpoint.
        time.sleep(FETCH_DELAY_SECONDS)
    return all_rows


def fetch_project_detail(client: httpx.Client, numeric_id: str) -> dict | None:
    url = VERRA_DETAIL_URL_TEMPLATE.format(numeric_id=numeric_id)
    return _fetch_get(client, url)


def fetch_project_issuances(
    client: httpx.Client, numeric_id: str
) -> tuple[list[VerraIssuance], float, float, date | None]:
    """Query the issuance endpoint for one project and roll up totals.

    Returns (issuances, total_issued, total_retired, first_issuance_date).
    """
    params = {
        "$count": "true",
        "$top": "500",
        "$filter": f"resourceIdentifier eq '{numeric_id}'",
    }
    body = {"program": "VCS", "issuanceTypeCodes": ["ISSUE"]}
    page = _fetch_post(client, VERRA_ISSUANCE_URL, params=params, json_body=body)
    if not page:
        return [], 0.0, 0.0, None
    rows = page.get("value") or []
    # Dedupe on (issuanceDate, vintageStart, serialNumbers) since Verra
    # returns one row per serial block and many rows can share vintage/date.
    aggregated: dict[tuple[int, date | None], dict] = {}
    total_issued = 0.0
    total_retired = 0.0
    first_issuance: date | None = None
    for row in rows:
        issuance_date = _parse_date(row.get("issuanceDate"))
        vstart = _parse_date(row.get("vintageStart"))
        vintage_year = vstart.year if vstart else 0
        qty = float(row.get("quantity") or 0)
        retired = bool(row.get("retiredCancelled"))
        total_issued += qty
        if retired:
            total_retired += qty
        if issuance_date and (first_issuance is None or issuance_date < first_issuance):
            first_issuance = issuance_date
        # Group rows into one issuance record per (vintage_year, issuance_date)
        # for `issuances` writes. Preserve the first row's payload for raw.
        key = (vintage_year, issuance_date)
        if key not in aggregated:
            aggregated[key] = {
                "credits": 0.0,
                "serial_start": row.get("serialNumbers"),
                "serial_end": None,
                "raw_payload": row,
            }
        aggregated[key]["credits"] += qty
    issuances: list[VerraIssuance] = []
    for (vintage_year, issuance_date), agg in aggregated.items():
        if vintage_year == 0 or issuance_date is None:
            # Without a vintage year OR issuance_date we cannot satisfy the
            # NOT NULL constraints on the issuances table. Skip — the row is
            # still counted toward total_issued/retired above.
            continue
        issuances.append(
            VerraIssuance(
                vintage_year=vintage_year,
                credits=agg["credits"],
                issuance_date=issuance_date,
                serial_start=agg["serial_start"],
                serial_end=agg["serial_end"],
                raw_payload=agg["raw_payload"],
            )
        )
    return issuances, total_issued, total_retired, first_issuance


# ----------------------------------------------------------------------------
# Normalization
# ----------------------------------------------------------------------------


def _resolve_centroid(
    vcs_id: str, detail: dict, province: str | None
) -> tuple[float | None, float | None, str]:
    """Prefer live API location, then known-centroid, then province fallback."""
    loc = (detail or {}).get("location") or {}
    lat = loc.get("latitude")
    lon = loc.get("longitude")
    if isinstance(lat, int | float) and isinstance(lon, int | float):
        # Verra occasionally ships (0,0) or nulls dressed up as zeros. Treat
        # exact (0.0, 0.0) as missing since no Indonesian project sits there.
        if abs(lat) > 0.01 or abs(lon) > 0.01:
            return float(lat), float(lon), "api"
    if vcs_id in KNOWN_CENTROIDS:
        lat, lon = KNOWN_CENTROIDS[vcs_id]
        return lat, lon, "known"
    if province and province in PROVINCE_CENTROIDS:
        lat, lon = PROVINCE_CENTROIDS[province]
        return lat, lon, "province"
    return None, None, "null"


def normalise_project(list_row: dict, detail: dict | None) -> VerraProject | None:
    """Merge list-row + detail response into a VerraProject."""
    numeric_id = str(list_row.get("resourceIdentifier") or "").strip()
    if not numeric_id:
        return None
    vcs_id = f"VCS{numeric_id}"

    name = (detail or {}).get("resourceName") or list_row.get("resourceName") or ""
    # Full description used for hectares heuristic parsing below; only the
    # first 500 chars get stored on the projects row.
    description = (detail or {}).get("description")
    description_full = description or ""

    # Province / attributes live on detail.attributes[]
    province = None
    for a in (detail or {}).get("attributes") or []:
        if a.get("code") == "STATE_PROVINCE":
            vals = a.get("values") or []
            if vals and vals[0].get("value"):
                province = str(vals[0]["value"]).strip()
            break

    # Participation-summary attributes — prefer VCS program entry.
    vcs_ps_attrs: list[dict] = []
    for ps in (detail or {}).get("participationSummaries") or []:
        if ps.get("programCode") == "VCS":
            vcs_ps_attrs = ps.get("attributes") or []
            break

    developer = _extract_attr(vcs_ps_attrs, "PROPONENT_NAME") or list_row.get("proponent")
    status_raw = (
        _extract_attr(vcs_ps_attrs, "PROJECT_STATUS")
        or list_row.get("resourceStatus")
        or None
    )
    methodology = (
        _extract_attr(vcs_ps_attrs, "PROTOCOL_NAME")
        or list_row.get("protocols")
        or None
    )
    project_type = (
        _extract_attr(vcs_ps_attrs, "PRIMARY_PROJECT_CATEGORY_NAME")
        or list_row.get("protocolCategories")
        or None
    )
    hectares = _parse_hectares(_extract_attr(vcs_ps_attrs, "PROJECT_ACREAGE"))
    # Verra sometimes publishes inconsistent acreage numbers between the
    # description (often the authoritative PDD value, e.g. "149,800 hectares"
    # for Katingan) and the PROJECT_ACREAGE attribute (which for some rows is
    # missing a zero, e.g. "14980 Hectares"). Prefer the description-parsed
    # value when it exists and is >=2x the attribute (heuristic: they agree
    # within 2x, else description wins). This handles the known Verra data
    # bug without clobbering cases where PROJECT_ACREAGE is correct.
    if description_full:
        desc_match = _DESC_HECTARES_RE.search(description_full)
        if desc_match:
            desc_hectares = _parse_hectares(desc_match.group(0))
            if desc_hectares and (hectares is None or desc_hectares >= 2 * hectares):
                hectares = desc_hectares
    validation_date_raw = _extract_attr(vcs_ps_attrs, "PROJECT_REGISTRATION_DATE") or list_row.get(
        "projectRegistrationDate"
    )
    validation_date = _parse_date(validation_date_raw)

    status_db = _map_status(status_raw)

    lat, lon, centroid_source = _resolve_centroid(vcs_id, detail or {}, province)

    raw_metadata = {
        "vcs_id": vcs_id,
        "source_url": VERRA_PROJECT_WEB_URL.format(numeric_id=numeric_id),
        "scraped_at": datetime.now(UTC).isoformat(),
        "list_row": list_row,
        "detail": detail,
    }

    return VerraProject(
        vcs_id=vcs_id,
        numeric_id=numeric_id,
        name=name.strip(),
        status_raw=status_raw,
        status_db=status_db,
        developer=developer,
        project_type=project_type,
        methodology=methodology,
        hectares=hectares,
        country=list_row.get("country") or "Indonesia",
        province=province,
        validation_date=validation_date,
        first_issuance_date=None,  # set later from issuance endpoint
        total_vcus_issued=0.0,
        total_vcus_retired=0.0,
        description=description[:500] if description else None,
        centroid_lat=lat,
        centroid_lon=lon,
        centroid_source=centroid_source,
        raw_metadata=raw_metadata,
    )


# ----------------------------------------------------------------------------
# Entity resolution + DB writes
# ----------------------------------------------------------------------------


def fuzzy_match(
    conn: psycopg.Connection, name: str
) -> tuple[str | None, str | None, float | None]:
    """Query projects with similarity > 0.70; return (id, name, sim) of best match."""
    cur = execute_with_retry(
        conn,
        """
        SELECT id::text, name_canonical, similarity(name_canonical, %s) AS sim
        FROM projects
        WHERE similarity(name_canonical, %s) > %s
        ORDER BY sim DESC
        LIMIT 1
        """,
        (name, name, SIM_QUEUE_FLOOR),
    )
    row = cur.fetchone()
    if row is None:
        return None, None, None
    return row[0], row[1], float(row[2])


def upsert_project(conn: psycopg.Connection, p: VerraProject) -> tuple[str, str]:
    """Insert or update a projects row. Returns (project_id, action)."""
    base_slug = slugify(p.name or p.vcs_id)
    # A slug collision on update is resolved by _unique_slug; on insert we
    # pick the first free variant.
    slug = _unique_slug(conn, base_slug)

    # The Verra list row reports `country` as a full name ("Indonesia") rather
    # than an ISO-2 code. The projects.country column is CHAR(2) and v0.1 only
    # ingests Indonesian projects, so hard-code "ID" here. A future
    # multi-country scraper should maintain a name -> ISO-2 map.
    country_code = "ID"
    centroid_sql = "NULL"
    params: list = [
        slug,
        p.name,
        p.developer,
        country_code,
        p.province,
        p.project_type,
        p.methodology,
        p.hectares,
    ]
    if p.centroid_lat is not None and p.centroid_lon is not None:
        centroid_sql = "ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography"
        params.extend([p.centroid_lon, p.centroid_lat])  # PostGIS takes (lon, lat)
    params.extend(
        [
            p.status_db,
            p.validation_date,
            p.first_issuance_date,
            p.total_vcus_issued,
            p.total_vcus_retired,
            p.description,
        ]
    )

    sql = f"""
        INSERT INTO projects (
            slug, name_canonical, developer, country, province, project_type,
            methodology, hectares, centroid, status, validation_date,
            first_issuance_date, total_vcus_issued, total_vcus_retired, description
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, {centroid_sql}, %s, %s, %s, %s, %s, %s
        )
        ON CONFLICT (slug) DO UPDATE SET
            name_canonical       = EXCLUDED.name_canonical,
            developer            = COALESCE(EXCLUDED.developer, projects.developer),
            province             = COALESCE(EXCLUDED.province, projects.province),
            project_type         = COALESCE(EXCLUDED.project_type, projects.project_type),
            methodology          = COALESCE(EXCLUDED.methodology, projects.methodology),
            hectares             = COALESCE(EXCLUDED.hectares, projects.hectares),
            centroid             = COALESCE(EXCLUDED.centroid, projects.centroid),
            status               = COALESCE(EXCLUDED.status, projects.status),
            validation_date      = COALESCE(EXCLUDED.validation_date, projects.validation_date),
            first_issuance_date  = COALESCE(
                                     EXCLUDED.first_issuance_date, projects.first_issuance_date),
            total_vcus_issued    = EXCLUDED.total_vcus_issued,
            total_vcus_retired   = EXCLUDED.total_vcus_retired,
            description          = COALESCE(EXCLUDED.description, projects.description),
            updated_at           = NOW()
        RETURNING id::text, (xmax = 0) AS inserted
    """
    cur = execute_with_retry(conn, sql, tuple(params))
    row = cur.fetchone()
    assert row is not None
    project_id, inserted = row[0], bool(row[1])
    return project_id, "inserted" if inserted else "updated"


def update_existing_project_metadata(
    conn: psycopg.Connection, existing_id: str, p: VerraProject
) -> None:
    """Refresh totals + updated_at on the already-resolved row.

    Only fields that Verra is authoritative for are overwritten; everything
    else is kept via COALESCE so a manual override on the row survives.
    """
    execute_with_retry(
        conn,
        """
        UPDATE projects SET
            total_vcus_issued  = %s,
            total_vcus_retired = %s,
            country            = 'ID',
            hectares           = COALESCE(%s, hectares),
            province           = COALESCE(%s, province),
            developer          = COALESCE(%s, developer),
            project_type       = COALESCE(%s, project_type),
            methodology        = COALESCE(%s, methodology),
            updated_at         = NOW(),
            status             = COALESCE(%s, status),
            validation_date    = COALESCE(%s, validation_date),
            first_issuance_date = COALESCE(%s, first_issuance_date)
        WHERE id = %s
        """,
        (
            p.total_vcus_issued,
            p.total_vcus_retired,
            p.hectares,
            p.province,
            p.developer,
            p.project_type,
            p.methodology,
            p.status_db,
            p.validation_date,
            p.first_issuance_date,
            existing_id,
        ),
    )


def upsert_registry_row(conn: psycopg.Connection, project_id: str, p: VerraProject) -> None:
    source_url = VERRA_PROJECT_WEB_URL.format(numeric_id=p.numeric_id)
    execute_with_retry(
        conn,
        """
        INSERT INTO registries (
            project_id, registry_name, external_id, status, url, raw_metadata, last_synced_at
        )
        VALUES (%s, 'Verra', %s, %s, %s, %s::jsonb, NOW())
        ON CONFLICT (registry_name, external_id) DO UPDATE SET
            project_id     = EXCLUDED.project_id,
            status         = EXCLUDED.status,
            url            = EXCLUDED.url,
            raw_metadata   = EXCLUDED.raw_metadata,
            last_synced_at = NOW()
        """,
        (
            project_id,
            p.vcs_id,
            p.status_raw,
            source_url,
            json.dumps(p.raw_metadata, default=str),
        ),
    )


def upsert_issuance_row(
    conn: psycopg.Connection, project_id: str, iss: VerraIssuance
) -> bool:
    """Insert one issuance iff (project_id, vintage_year, issuance_date, 'Verra')
    is not already present. Returns True iff a new row was written.

    Migration 001 has no unique constraint on this tuple, so we use WHERE NOT
    EXISTS (spec section 3.3 / OQ-3). T07's migration 002 will add a unique
    index; after that merges the scraper can switch to ON CONFLICT.
    """
    cur = execute_with_retry(
        conn,
        """
        INSERT INTO issuances (
            project_id, registry_name, vintage_year, credits, issuance_date,
            serial_start, serial_end, raw_payload
        )
        SELECT %s, 'Verra', %s, %s, %s, %s, %s, %s::jsonb
        WHERE NOT EXISTS (
            SELECT 1 FROM issuances
            WHERE project_id    = %s
              AND vintage_year  = %s
              AND issuance_date = %s
              AND registry_name = 'Verra'
        )
        RETURNING id
        """,
        (
            project_id,
            iss.vintage_year,
            iss.credits,
            iss.issuance_date,
            iss.serial_start,
            iss.serial_end,
            json.dumps(iss.raw_payload, default=str),
            project_id,
            iss.vintage_year,
            iss.issuance_date,
        ),
    )
    return cur.fetchone() is not None


def insert_match_queue_row(
    conn: psycopg.Connection, existing_id: str, new_id: str, similarity: float
) -> None:
    execute_with_retry(
        conn,
        """
        INSERT INTO project_match_queue (
            candidate_a_id, candidate_b_id, similarity, match_reason, status
        )
        VALUES (%s, %s, %s, 'name_fuzzy', 'pending')
        """,
        (existing_id, new_id, similarity),
    )


# ----------------------------------------------------------------------------
# Main run loop
# ----------------------------------------------------------------------------


def process_project(
    conn: psycopg.Connection | None,
    client: httpx.Client,
    list_row: dict,
    dry_run: bool,
    stats: RunStats,
) -> None:
    numeric_id = str(list_row.get("resourceIdentifier") or "").strip()
    if not numeric_id:
        stats.errors.append({"event": "missing_id", "list_row": list_row})
        return

    detail = fetch_project_detail(client, numeric_id)
    time.sleep(FETCH_DELAY_SECONDS)

    project = normalise_project(list_row, detail)
    if project is None:
        stats.errors.append({"event": "normalise_failed", "numeric_id": numeric_id})
        return

    # Pull issuance history
    issuances, issued, retired, first_date = fetch_project_issuances(client, numeric_id)
    project.total_vcus_issued = issued
    project.total_vcus_retired = retired
    project.first_issuance_date = first_date

    action = "dry_run"
    issuances_written = 0
    if not dry_run and conn is not None:
        try:
            # Entity resolution
            match_id, match_name, sim = fuzzy_match(conn, project.name)
            if sim is not None and sim > SIM_AUTO_MERGE and match_id:
                update_existing_project_metadata(conn, match_id, project)
                project_id = match_id
                action = "updated"
                stats.records_updated += 1
            else:
                # Either no match, or ambiguous match in the queue band.
                project_id, upsert_action = upsert_project(conn, project)
                if upsert_action == "inserted":
                    action = "inserted"
                    stats.records_inserted += 1
                else:
                    action = "updated"
                    stats.records_updated += 1
                if sim is not None and SIM_QUEUE_FLOOR < sim <= SIM_AUTO_MERGE and match_id:
                    # Ambiguous band — both candidates now exist, queue for review.
                    insert_match_queue_row(conn, match_id, project_id, sim)
                    stats.records_queued += 1
                    log.info(
                        "ambiguous_match",
                        existing_id=match_id,
                        existing_name=match_name,
                        new_id=project_id,
                        sim=sim,
                        vcs_id=project.vcs_id,
                    )
                    action = "queued"

            upsert_registry_row(conn, project_id, project)

            for iss in issuances:
                if upsert_issuance_row(conn, project_id, iss):
                    issuances_written += 1
            stats.issuances_written += issuances_written
            conn.commit()
        except psycopg.DatabaseError as exc:
            conn.rollback()
            stats.errors.append(
                {"event": "db_error", "vcs_id": project.vcs_id, "error": str(exc)}
            )
            log.error("db_error", vcs_id=project.vcs_id, error=str(exc))
            return

    log.info(
        "project_processed",
        vcs_id=project.vcs_id,
        name=project.name,
        action=action,
        issuances_written=issuances_written,
        centroid_source=project.centroid_source,
        status=project.status_db,
    )


def run(since: str | None, dry_run: bool, limit: int | None) -> int:
    configure_logging("verra")
    started = datetime.now(UTC).isoformat()
    stats = RunStats(started_at=started)
    log.info(
        "run_start",
        dry_run=dry_run,
        limit=limit,
        since=since,
        user_agent=config_module.SCRAPER_USER_AGENT,
    )

    client = httpx.Client(headers=HTTP_HEADERS, follow_redirects=True)

    try:
        list_rows = fetch_indonesia_projects(client)
        stats.records_in = len(list_rows)
        log.info("list_fetched", count=len(list_rows))
        if limit:
            list_rows = list_rows[:limit]
            stats.records_in = len(list_rows)

        if dry_run:
            # Still exercise detail + issuance fetch for a couple rows so we
            # produce the per-project log lines the AC-1 check expects.
            # We DO NOT open a DB connection in dry-run.
            for row in list_rows:
                process_project(None, client, row, dry_run=True, stats=stats)
        else:
            with get_connection() as conn:
                for row in list_rows:
                    process_project(conn, client, row, dry_run=False, stats=stats)

        finished = datetime.now(UTC).isoformat()
        log.info(
            "run_complete",
            scraper="verra",
            started_at=started,
            finished_at=finished,
            status="ok",
            records_in=stats.records_in,
            records_inserted=stats.records_inserted,
            records_updated=stats.records_updated,
            records_queued=stats.records_queued,
            issuances_written=stats.issuances_written,
            errors=stats.errors,
        )
        return 0
    except Exception as exc:  # noqa: BLE001 — fail loudly, log the traceback
        finished = datetime.now(UTC).isoformat()
        log.exception(
            "run_complete",
            scraper="verra",
            started_at=started,
            finished_at=finished,
            status="error",
            records_in=stats.records_in,
            records_inserted=stats.records_inserted,
            records_updated=stats.records_updated,
            errors=stats.errors + [{"event": "unhandled", "error": str(exc)}],
        )
        return 1
    finally:
        client.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="verra.fetch",
        description="Fetch Indonesian VCS projects from the Verra registry.",
    )
    parser.add_argument("--since", type=str, default=None, help="YYYY-MM-DD (unused in v0.1)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    sys.exit(run(since=args.since, dry_run=args.dry_run, limit=args.limit))


if __name__ == "__main__":
    main()
