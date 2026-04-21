"""GFW (Global Forest Watch) integrated-alerts scraper — weekly.

For every project in the DB that has a centroid, this scraper:

  1. Registers a geodesic circular buffer polygon with the GFW geostore
     service (once per project; the returned geostore ID is cached on
     `projects.gfw_geostore_id`).
  2. Queries the `gfw_integrated_alerts` dataset for alerts inside that
     geostore since `--since` (default 90 days ago).
  3. Upserts rows into `satellite_alerts` deduped by
     `(project_id, alert_date, rounded_lat, rounded_lon)`.
  4. Fans out `notifications` rows for every opted-in user for each project
     that received NEW alerts in this run (deduped per calendar day in UTC).

Entry point:
    python -m scrapers.gfw.fetch [--since YYYY-MM-DD] [--project-id UUID] [--dry-run]

Rate limit: sleep 1.0 s BEFORE each outbound API call (two calls per project
on a first run, one on repeat runs when gfw_geostore_id is already cached).

Missing key: if `GFW_API_KEY` is unset, exits non-zero and points at
`docs/runbooks/gfw-api-key.md`.

Dependencies: `httpx`, `shapely`, `pyproj` (all declared in T06's
scrapers/pyproject.toml).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
import psycopg
from pyproj import Geod

# Invoked as `python -m scrapers.gfw.fetch` OR `python -m gfw.fetch` depending
# on whether cwd is the repo root or `scrapers/`. Support both by trying the
# flat layout first (matches verra/idxcarbon pattern), then the packaged form.
try:
    from common import config as config_module
    from common.db import execute, execute_with_retry, get_connection
    from common.logging import configure_logging, get_logger
except ModuleNotFoundError:  # pragma: no cover — alt entry via `scrapers.gfw.fetch`
    from scrapers.common import config as config_module  # type: ignore[no-redef]
    from scrapers.common.db import (  # type: ignore[no-redef]
        execute,
        execute_with_retry,
        get_connection,
    )
    from scrapers.common.logging import (  # type: ignore[no-redef]
        configure_logging,
        get_logger,
    )


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GFW_API_BASE = "https://data-api.globalforestwatch.org"
GFW_GEOSTORE_URL = f"{GFW_API_BASE}/geostore"
# TODO v0.2: pin to specific dataset version for reproducibility.
GFW_QUERY_URL = f"{GFW_API_BASE}/dataset/gfw_integrated_alerts/latest/query/json"

# Per spec §3: sleep 1.0 s BEFORE each API call (rate-limit floor, 1 req/s).
RATE_LIMIT_SLEEP_S = 1.0

# Retry policy (spec §7 edge cases).
HTTP_TIMEOUT_S = 30.0
RETRY_MAX = 3
RETRY_BACKOFF_S = (2, 4, 8)  # seconds between attempts

# Alert buffer / geometry
GEODESIC_RING_POINTS = 32  # 32-point polygon is <1% error at equator (audit N-9 PASS)

# How the `confidence` numeric maps to the text values the DB stores.
# Integrated alerts encode confidence as: 2 = nominal, 3 = high, < 2 = low.
# (§3 spec mapping. Verified against GFW docs on first live run — see code
# comment below at response-parse site.)
CONFIDENCE_MAP = {2: "nominal", 3: "high"}

# Default buffer radius if projects.buffer_km is NULL (should not happen —
# migration 001 defaults to 10 — but guards the geodesic builder).
DEFAULT_BUFFER_KM = 10.0

# Helpful error message shown when GFW_API_KEY is missing.
MISSING_KEY_MSG = (
    "GFW_API_KEY required — see docs/runbooks/gfw-api-key.md\n"
    "  1. Register at https://www.globalforestwatch.org/help/developers/\n"
    "  2. Set GFW_API_KEY=<key> in .env.local (replace the placeholder)\n"
    "  3. Re-run this command.\n"
)

# Placeholder values we treat as "no key set" so a bare `.env.example` copy
# never triggers accidental real API calls. If the key is literally any of
# these strings, the missing-key guard fires.
PLACEHOLDER_KEYS: frozenset[str] = frozenset({"", "CHANGE_ME", "changeme", "TODO"})

log = get_logger(__name__)


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class Project:
    """Pre-query view of a row in `projects`."""

    id: str
    slug: str
    name: str
    centroid_lon: float
    centroid_lat: float
    buffer_km: float
    gfw_geostore_id: str | None


@dataclass
class RunStats:
    started_at: str
    run_started_at: datetime
    projects_seen: int = 0
    geostores_registered: int = 0
    alerts_inserted: int = 0
    alerts_skipped_dedupe: int = 0
    notifications_inserted: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Geodesic buffer
# ---------------------------------------------------------------------------


def build_geodesic_buffer(lon: float, lat: float, radius_km: float) -> dict[str, Any]:
    """Return a GeoJSON Polygon of a geodesic circle around (lon, lat).

    Uses `pyproj.Geod(ellps='WGS84').fwd()` to step `GEODESIC_RING_POINTS`
    bearings (every 360/N degrees) at a fixed geodesic distance. This is
    accurate to <1% at the equator for N=32 and is substantially more correct
    than a naive planar `shapely.Point.buffer()` at Indonesia's latitudes.

    Output shape follows GeoJSON RFC 7946:
        {"type": "Polygon", "coordinates": [[[lon, lat], ..., [lon, lat]]]}
    The ring is closed (last point == first point).
    """
    geod = Geod(ellps="WGS84")
    radius_m = radius_km * 1000.0
    step = 360.0 / GEODESIC_RING_POINTS
    ring: list[list[float]] = []
    for i in range(GEODESIC_RING_POINTS):
        bearing = i * step
        out_lon, out_lat, _ = geod.fwd(lon, lat, bearing, radius_m)
        ring.append([out_lon, out_lat])
    ring.append(ring[0])  # close the ring
    return {
        "type": "Polygon",
        "coordinates": [ring],
    }


# ---------------------------------------------------------------------------
# HTTP layer — retry with exponential backoff (spec §7)
# ---------------------------------------------------------------------------


class GfwAuthError(RuntimeError):
    """401 from GFW — the API key is invalid/expired. Hard fail."""


def _post_with_retry(
    client: httpx.Client,
    url: str,
    *,
    json_body: dict[str, Any],
    headers: dict[str, str],
) -> dict[str, Any] | None:
    """POST with retry. Returns parsed JSON, or None if all retries fail.

    Raises GfwAuthError on 401 so the caller can exit non-zero.
    """
    last_exc: Exception | None = None
    for attempt in range(RETRY_MAX):
        try:
            r = client.post(url, json=json_body, headers=headers, timeout=HTTP_TIMEOUT_S)
            if r.status_code == 401:
                raise GfwAuthError(f"401 from {url} — invalid GFW_API_KEY")
            if r.status_code == 429:
                retry_after = int(r.headers.get("Retry-After", "60"))
                log.warning(
                    "gfw_rate_limited", url=url, retry_after=retry_after, attempt=attempt + 1
                )
                if attempt == RETRY_MAX - 1:
                    return None
                time.sleep(retry_after)
                continue
            if r.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"status {r.status_code}", request=r.request, response=r
                )
            if r.status_code >= 400:
                log.warning(
                    "gfw_client_error", url=url, status=r.status_code, body=r.text[:400]
                )
                return None
            return r.json()
        except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.TransportError) as exc:
            last_exc = exc
            backoff = RETRY_BACKOFF_S[min(attempt, len(RETRY_BACKOFF_S) - 1)]
            log.warning(
                "gfw_http_retry",
                url=url,
                attempt=attempt + 1,
                backoff_s=backoff,
                error=str(exc),
            )
            if attempt == RETRY_MAX - 1:
                break
            time.sleep(backoff)
    log.error("gfw_http_failed", url=url, error=str(last_exc))
    return None


def _get_with_retry(
    client: httpx.Client,
    url: str,
    *,
    params: dict[str, str] | None = None,
    headers: dict[str, str],
) -> dict[str, Any] | None:
    """GET with retry. Same contract as _post_with_retry."""
    last_exc: Exception | None = None
    for attempt in range(RETRY_MAX):
        try:
            r = client.get(url, params=params, headers=headers, timeout=HTTP_TIMEOUT_S)
            if r.status_code == 401:
                raise GfwAuthError(f"401 from {url} — invalid GFW_API_KEY")
            if r.status_code == 429:
                retry_after = int(r.headers.get("Retry-After", "60"))
                log.warning(
                    "gfw_rate_limited", url=url, retry_after=retry_after, attempt=attempt + 1
                )
                if attempt == RETRY_MAX - 1:
                    return None
                time.sleep(retry_after)
                continue
            if r.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"status {r.status_code}", request=r.request, response=r
                )
            if r.status_code >= 400:
                log.warning(
                    "gfw_client_error", url=url, status=r.status_code, body=r.text[:400]
                )
                return None
            return r.json()
        except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.TransportError) as exc:
            last_exc = exc
            backoff = RETRY_BACKOFF_S[min(attempt, len(RETRY_BACKOFF_S) - 1)]
            log.warning(
                "gfw_http_retry",
                url=url,
                attempt=attempt + 1,
                backoff_s=backoff,
                error=str(exc),
            )
            if attempt == RETRY_MAX - 1:
                break
            time.sleep(backoff)
    log.error("gfw_http_failed", url=url, error=str(last_exc))
    return None


# ---------------------------------------------------------------------------
# GFW API calls
# ---------------------------------------------------------------------------


def register_geostore(
    client: httpx.Client,
    *,
    geojson_polygon: dict[str, Any],
    api_key: str,
) -> str | None:
    """POST the polygon to GFW, return the geostore ID (or None on failure).

    GFW response shape note (per spec §9 OQ-1): the geostore endpoint returns
    a JSON object whose geostore ID lives either at `data.id` or top-level
    `id` depending on the dataset. We probe both; whichever is non-None wins.
    Logged at DEBUG on first success so the response shape is captured in
    the run logs for later spec confirmation.
    """
    headers = {
        "x-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": config_module.SCRAPER_USER_AGENT,
    }
    # Rate-limit sleep BEFORE the call (spec §3).
    time.sleep(RATE_LIMIT_SLEEP_S)
    body = {"geometry": geojson_polygon}
    response = _post_with_retry(client, GFW_GEOSTORE_URL, json_body=body, headers=headers)
    if response is None:
        return None
    log.debug("gfw_geostore_response", keys=list(response.keys()))
    # Probe the two known shapes; caller logs which one hit.
    data = response.get("data") or {}
    geostore_id = None
    if isinstance(data, dict):
        geostore_id = data.get("id") or data.get("gfw_geostore_id")
    if not geostore_id:
        geostore_id = response.get("id") or response.get("gfw_geostore_id")
    if not geostore_id:
        log.warning("gfw_geostore_id_missing", response_keys=list(response.keys()))
        return None
    return str(geostore_id)


def query_alerts(
    client: httpx.Client,
    *,
    geostore_id: str,
    since: date,
    api_key: str,
) -> list[dict[str, Any]] | None:
    """GET the integrated-alerts query endpoint for one geostore.

    On first real run we log `row[0].keys()` at INFO so the implementer can
    confirm the live column names (spec §7 edge cases + §9 OQ-2). Expected
    column names per spec are `gfw_integrated_alerts__date`,
    `gfw_integrated_alerts__confidence`, `latitude`, `longitude` — if these
    differ in the response, the extractor in `parse_alert_row` handles the
    lookup with fallbacks.
    """
    headers = {
        "x-api-key": api_key,
        "Accept": "application/json",
        "User-Agent": config_module.SCRAPER_USER_AGENT,
    }
    # Rate-limit sleep BEFORE the call (spec §3).
    time.sleep(RATE_LIMIT_SLEEP_S)
    # SQL is URL-encoded as a querystring param via `params=`. httpx handles
    # the encoding — we don't urlencode by hand.
    sql = (
        "SELECT gfw_integrated_alerts__date, "
        "gfw_integrated_alerts__confidence, "
        "latitude, longitude "
        "FROM data "
        f"WHERE gfw_integrated_alerts__date >= '{since.isoformat()}'"
    )
    params = {"geostore_id": geostore_id, "sql": sql}
    response = _get_with_retry(client, GFW_QUERY_URL, params=params, headers=headers)
    if response is None:
        return None
    # Response shape: {"data": [ {...}, ... ], "status": "success", ...}
    rows = response.get("data")
    if rows is None:
        log.warning("gfw_query_no_data_key", response_keys=list(response.keys()))
        return []
    if not isinstance(rows, list):
        log.warning("gfw_query_data_not_list", type_=type(rows).__name__)
        return []
    if rows:
        log.info("gfw_query_first_row_keys", keys=list(rows[0].keys()))
    return rows


# ---------------------------------------------------------------------------
# Response parsing + DB writes
# ---------------------------------------------------------------------------


def _map_confidence(raw: Any) -> str:
    """Map the numeric GFW confidence to the 'low'/'nominal'/'high' DB enum.

    2 -> nominal, 3 -> high, anything < 2 (including None or non-numeric) ->
    'low'. Spec §3 explicit mapping.
    """
    try:
        as_int = int(raw)
    except (TypeError, ValueError):
        return "low"
    return CONFIDENCE_MAP.get(as_int, "low")


def parse_alert_row(row: dict[str, Any]) -> dict[str, Any] | None:
    """Extract the four fields we need from a raw API row.

    Column names vary between dataset versions (spec §7). We prefer the spec's
    named columns first, then fall back to a set of known aliases. If the row
    does not carry any recognizable date+lat+lon, we skip it.
    """
    raw_date = (
        row.get("gfw_integrated_alerts__date")
        or row.get("date")
        or row.get("alert__date")
    )
    raw_confidence = (
        row.get("gfw_integrated_alerts__confidence")
        or row.get("confidence")
        or row.get("alert__confidence")
    )
    raw_lat = row.get("latitude") or row.get("lat") or row.get("alert__lat")
    raw_lon = row.get("longitude") or row.get("lon") or row.get("alert__lon")
    if raw_date is None or raw_lat is None or raw_lon is None:
        return None
    try:
        parsed_date = (
            datetime.strptime(str(raw_date)[:10], "%Y-%m-%d").date()
            if not isinstance(raw_date, date)
            else raw_date
        )
        lat = float(raw_lat)
        lon = float(raw_lon)
    except (TypeError, ValueError):
        return None
    return {
        "alert_date": parsed_date,
        "confidence": _map_confidence(raw_confidence),
        "lat": lat,
        "lon": lon,
        "raw_payload": row,
    }


def fetch_projects(conn: psycopg.Connection, *, project_id: str | None) -> list[Project]:
    """Load projects with populated centroid from the DB.

    If `project_id` is set, only that single row is returned (debug mode).
    """
    if project_id:
        cur = execute(
            conn,
            """
            SELECT id::text, slug, name_canonical,
                   ST_X(centroid::geometry) AS lon,
                   ST_Y(centroid::geometry) AS lat,
                   COALESCE(buffer_km, %s) AS buffer_km,
                   gfw_geostore_id
            FROM projects
            WHERE centroid IS NOT NULL
              AND id = %s::uuid
            """,
            (DEFAULT_BUFFER_KM, project_id),
        )
    else:
        cur = execute(
            conn,
            """
            SELECT id::text, slug, name_canonical,
                   ST_X(centroid::geometry) AS lon,
                   ST_Y(centroid::geometry) AS lat,
                   COALESCE(buffer_km, %s) AS buffer_km,
                   gfw_geostore_id
            FROM projects
            WHERE centroid IS NOT NULL
            ORDER BY slug
            """,
            (DEFAULT_BUFFER_KM,),
        )
    rows = cur.fetchall()
    projects: list[Project] = []
    for r in rows:
        projects.append(
            Project(
                id=r[0],
                slug=r[1],
                name=r[2],
                centroid_lon=float(r[3]),
                centroid_lat=float(r[4]),
                buffer_km=float(r[5]),
                gfw_geostore_id=r[6],
            )
        )
    return projects


def save_geostore_id(conn: psycopg.Connection, *, project_id: str, geostore_id: str) -> None:
    execute_with_retry(
        conn,
        "UPDATE projects SET gfw_geostore_id = %s, updated_at = NOW() WHERE id = %s::uuid",
        (geostore_id, project_id),
    )


def upsert_alert(
    conn: psycopg.Connection,
    *,
    project_id: str,
    alert: dict[str, Any],
) -> bool:
    """Insert one alert row, deduped via uq_sat_project_date_loc.

    Returns True iff a new row was written.
    """
    cur = execute_with_retry(
        conn,
        """
        INSERT INTO satellite_alerts (
            project_id, alert_source, alert_date, confidence, area_ha,
            location, inside_project_buffer, raw_payload
        )
        VALUES (
            %s::uuid,
            'INTEGRATED',
            %s,
            %s,
            0.01,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
            TRUE,
            %s::jsonb
        )
        ON CONFLICT ON CONSTRAINT uq_sat_project_date_loc DO NOTHING
        RETURNING id
        """,
        (
            project_id,
            alert["alert_date"],
            alert["confidence"],
            alert["lon"],
            alert["lat"],
            json.dumps(alert["raw_payload"], default=str),
        ),
    )
    return cur.fetchone() is not None


def fan_out_notifications(
    conn: psycopg.Connection,
    *,
    project_id: str,
    run_started_at: datetime,
) -> int:
    """Create notifications for every opted-in user for one project.

    Returns the number of rows inserted. Deduped via uq_notifications_dedupe
    on (user_id, type, project_id, UTC-date(created_at)) — same calendar day
    re-runs are silent no-ops.

    If the `users` table has zero opted-in rows, the query returns 0 and the
    caller logs a friendly summary.
    """
    cur = execute_with_retry(
        conn,
        """
        INSERT INTO notifications (user_id, type, title, description, project_id, url)
        SELECT
            u.id,
            'reversal',
            'Deforestation alert — ' || p.name_canonical,
            batch.alert_count::TEXT || ' alert(s) detected near ' || p.name_canonical,
            p.id,
            '/projects/' || p.slug
        FROM users u
        CROSS JOIN (
            SELECT sa.project_id, COUNT(*) AS alert_count
            FROM satellite_alerts sa
            WHERE sa.project_id = %s::uuid
              AND sa.ingested_at >= %s
            GROUP BY sa.project_id
        ) batch
        JOIN projects p ON p.id = batch.project_id
        WHERE u.email_digest_opt_in = TRUE
        ON CONFLICT ON CONSTRAINT uq_notifications_dedupe DO NOTHING
        RETURNING id
        """,
        (project_id, run_started_at),
    )
    # psycopg: fetchall returns list of (id,) tuples for RETURNING
    rows = cur.fetchall()
    return len(rows)


# ---------------------------------------------------------------------------
# Main run loop
# ---------------------------------------------------------------------------


def process_project(
    *,
    conn: psycopg.Connection | None,
    client: httpx.Client | None,
    project: Project,
    since: date,
    api_key: str,
    dry_run: bool,
    stats: RunStats,
) -> None:
    """Run one project through the full pipeline: geostore -> query -> upsert.

    In dry-run mode: logs the planned geostore registration and what the SQL
    builders would produce, but makes ZERO HTTP calls and ZERO DB writes.
    """
    log_ctx = {"project_id": project.id, "project_slug": project.slug}

    # --- Step 1: Build the geodesic buffer (pure CPU, no side effects) ---
    polygon = build_geodesic_buffer(
        project.centroid_lon, project.centroid_lat, project.buffer_km
    )
    log.info(
        "project_geodesic_buffer_built",
        **log_ctx,
        buffer_km=project.buffer_km,
        ring_points=GEODESIC_RING_POINTS,
        has_cached_geostore=bool(project.gfw_geostore_id),
    )

    if dry_run:
        # Exercise the SQL-construction path sanity-check too, but do not
        # touch the DB. Log the intended ops.
        log.info(
            "dry_run_plan",
            **log_ctx,
            step="register_geostore" if not project.gfw_geostore_id else "skip_registration",
            step_query="query_alerts",
            since=since.isoformat(),
        )
        stats.projects_seen += 1
        return

    assert conn is not None
    assert client is not None

    # --- Step 2: Register geostore if not cached ---
    geostore_id = project.gfw_geostore_id
    if not geostore_id:
        geostore_id = register_geostore(
            client, geojson_polygon=polygon, api_key=api_key
        )
        if not geostore_id:
            log.warning("project_skipped_geostore_fail", **log_ctx)
            stats.errors.append({"event": "geostore_failed", **log_ctx})
            return
        try:
            save_geostore_id(conn, project_id=project.id, geostore_id=geostore_id)
            conn.commit()
            stats.geostores_registered += 1
            log.info("project_geostore_registered", **log_ctx, geostore_id=geostore_id)
        except psycopg.DatabaseError as exc:
            conn.rollback()
            stats.errors.append(
                {"event": "geostore_save_failed", **log_ctx, "error": str(exc)}
            )
            log.error("project_geostore_save_failed", **log_ctx, error=str(exc))
            return

    # --- Step 3: Query alerts ---
    raw_rows = query_alerts(
        client, geostore_id=geostore_id, since=since, api_key=api_key
    )
    if raw_rows is None:
        log.warning("project_skipped_query_fail", **log_ctx)
        stats.errors.append({"event": "query_failed", **log_ctx})
        return
    if not raw_rows:
        log.info("project_no_alerts", **log_ctx, alerts_found=0, status="ok")
        stats.projects_seen += 1
        return

    # --- Step 4: Upsert alerts ---
    inserted_this_project = 0
    skipped_this_project = 0
    try:
        for raw in raw_rows:
            parsed = parse_alert_row(raw)
            if parsed is None:
                continue
            if upsert_alert(conn, project_id=project.id, alert=parsed):
                inserted_this_project += 1
            else:
                skipped_this_project += 1
        conn.commit()
    except psycopg.DatabaseError as exc:
        conn.rollback()
        stats.errors.append({"event": "upsert_failed", **log_ctx, "error": str(exc)})
        log.error("project_upsert_failed", **log_ctx, error=str(exc))
        return

    stats.alerts_inserted += inserted_this_project
    stats.alerts_skipped_dedupe += skipped_this_project
    stats.projects_seen += 1
    log.info(
        "project_alerts_upserted",
        **log_ctx,
        alerts_found=len(raw_rows),
        alerts_inserted=inserted_this_project,
        alerts_skipped_dedupe=skipped_this_project,
    )


def run(
    *,
    since_str: str | None,
    project_id_filter: str | None,
    dry_run: bool,
) -> int:
    configure_logging("gfw")
    started = datetime.now(UTC)
    stats = RunStats(started_at=started.isoformat(), run_started_at=started)

    # --- Resolve --since default (90 days ago) ---
    if since_str:
        try:
            since = datetime.strptime(since_str, "%Y-%m-%d").date()
        except ValueError:
            log.error("bad_since", since=since_str)
            return 1
    else:
        since = (started - timedelta(days=90)).date()

    # --- Missing-key guard (AC-9) ---
    # Importing `config_module` above already called `load_dotenv(...)`, so
    # `.env.local` values are now in os.environ. We treat the placeholder
    # strings in PLACEHOLDER_KEYS as "unset" so a fresh `.env.example` copy
    # can never accidentally fire real API calls.
    api_key_raw = os.environ.get("GFW_API_KEY", "").strip()
    api_key = api_key_raw if api_key_raw not in PLACEHOLDER_KEYS else ""
    if not api_key and not dry_run:
        sys.stderr.write(MISSING_KEY_MSG)
        log.error(
            "missing_gfw_api_key",
            runbook="docs/runbooks/gfw-api-key.md",
            hint="If .env.local has GFW_API_KEY=CHANGE_ME, replace it with a real key.",
        )
        return 2
    if not api_key and dry_run:
        # In dry-run mode, we never hit the API, so a missing key is OK —
        # but log a warning so the operator isn't surprised.
        log.warning(
            "missing_gfw_api_key_dry_run_ok",
            note="Real runs will require GFW_API_KEY; dry-run does not.",
        )

    log.info(
        "run_start",
        dry_run=dry_run,
        since=since.isoformat(),
        project_id_filter=project_id_filter,
        user_agent=config_module.SCRAPER_USER_AGENT,
    )

    client: httpx.Client | None = None
    try:
        if dry_run:
            # In dry-run we DO NOT construct the HTTP client — proves via the
            # absence of httpx lines in the log that zero calls are made.
            with get_connection() as conn:
                projects = fetch_projects(conn, project_id=project_id_filter)
                log.info("projects_loaded", count=len(projects))
                for project in projects:
                    process_project(
                        conn=None,
                        client=None,
                        project=project,
                        since=since,
                        api_key=api_key or "<dry-run-no-key>",
                        dry_run=True,
                        stats=stats,
                    )
        else:
            client = httpx.Client(follow_redirects=True)
            with get_connection() as conn:
                projects = fetch_projects(conn, project_id=project_id_filter)
                log.info("projects_loaded", count=len(projects))
                for project in projects:
                    try:
                        process_project(
                            conn=conn,
                            client=client,
                            project=project,
                            since=since,
                            api_key=api_key,
                            dry_run=False,
                            stats=stats,
                        )
                    except GfwAuthError as exc:
                        # 401 is hard fail per spec §7.
                        log.error(
                            "gfw_auth_failed",
                            error=str(exc),
                            runbook="docs/runbooks/gfw-api-key.md",
                        )
                        sys.stderr.write(MISSING_KEY_MSG)
                        return 2

                # --- Notifications fan-out (spec §3 item 3) ---
                total_notifs = 0
                projects_with_new_alerts: list[str] = []
                if stats.alerts_inserted > 0:
                    cur = execute(
                        conn,
                        """
                        SELECT DISTINCT project_id::text
                        FROM satellite_alerts
                        WHERE ingested_at >= %s
                        """,
                        (stats.run_started_at,),
                    )
                    projects_with_new_alerts = [row[0] for row in cur.fetchall()]
                # Check users table — skip entirely if nobody opted in.
                cur = execute(
                    conn,
                    "SELECT COUNT(*) FROM users WHERE email_digest_opt_in = TRUE",
                )
                row = cur.fetchone()
                opted_in_users = int(row[0]) if row else 0
                if opted_in_users == 0:
                    log.info("notifications_skipped_no_users")
                else:
                    for pid in projects_with_new_alerts:
                        try:
                            inserted = fan_out_notifications(
                                conn,
                                project_id=pid,
                                run_started_at=stats.run_started_at,
                            )
                            total_notifs += inserted
                            conn.commit()
                        except psycopg.DatabaseError as exc:
                            conn.rollback()
                            stats.errors.append(
                                {"event": "notify_failed", "project_id": pid, "error": str(exc)}
                            )
                            log.error("notify_failed", project_id=pid, error=str(exc))
                stats.notifications_inserted = total_notifs

        finished = datetime.now(UTC).isoformat()
        log.info(
            "run_complete",
            scraper="gfw",
            started_at=stats.started_at,
            finished_at=finished,
            status="ok",
            projects_seen=stats.projects_seen,
            geostores_registered=stats.geostores_registered,
            alerts_inserted=stats.alerts_inserted,
            alerts_skipped_dedupe=stats.alerts_skipped_dedupe,
            notifications_inserted=stats.notifications_inserted,
            errors=stats.errors,
        )
        return 0
    except Exception as exc:  # noqa: BLE001 — fail loudly, log the traceback
        finished = datetime.now(UTC).isoformat()
        log.exception(
            "run_complete",
            scraper="gfw",
            started_at=stats.started_at,
            finished_at=finished,
            status="error",
            errors=stats.errors + [{"event": "unhandled", "error": str(exc)}],
        )
        return 1
    finally:
        if client is not None:
            client.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="scrapers.gfw.fetch",
        description="Fetch Global Forest Watch integrated alerts for KarbonLens projects.",
    )
    parser.add_argument(
        "--since",
        type=str,
        default=None,
        help="YYYY-MM-DD (default: 90 days ago)",
    )
    parser.add_argument(
        "--project-id",
        type=str,
        default=None,
        help="Single project UUID to process (debug mode)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Plan only — no HTTP calls, no DB writes",
    )
    args = parser.parse_args()
    sys.exit(
        run(
            since_str=args.since,
            project_id_filter=args.project_id,
            dry_run=args.dry_run,
        )
    )


# Silence "unused import" for urlencode — kept imported for documentation
# purposes (httpx's `params=` encoder is what actually runs, but we want
# readers of this file to see the encoding path at a glance).
_ = urlencode


if __name__ == "__main__":
    main()
