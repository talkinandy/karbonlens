"""Daily score computation job.

KEEP IN SYNC WITH lib/score.ts AND scrapers/scoring/weights.py.

Entry point: ``python -m scrapers.scoring.compute``

Flags:
  --project-id <uuid>   Score only this project (debug mode). Exit non-zero if
                        the UUID does not exist. See edge case E7.
  --dry-run             Compute and log planned writes but do not INSERT/UPDATE.
  --date YYYY-MM-DD     Override the score_date column (default: today).

Sub-score contract is documented in docs/stories/T09-score-computation.md
Appendix B. Weights live in weights.py and COMMUNITY_OVERRIDES there.

E6 — Concurrent scraper writes: the weekly scrapers (Verra 03:00 Mon, GFW
03:30 Mon) complete well before this job's 04:00 cron window; score-job reads
never conflict with scraper writes in practice for v0.1. No explicit advisory
lock is taken.
"""

from __future__ import annotations

import argparse
import sys
import uuid as uuid_mod
from datetime import date, datetime
from typing import Any

from psycopg.types.json import Jsonb
from scrapers.common.db import execute, get_connection
from scrapers.common.logging import configure_logging, get_logger
from scrapers.scoring.weights import COMMUNITY_OVERRIDES, VERSION, WEIGHTS

log = get_logger(__name__)


# ─── Sub-score functions ─────────────────────────────────────────────────────


def validation_recency_score(validation_date: date | None) -> int:
    """Bucketed recency score per Appendix B.

    None -> 50 (unknown-neutral, edge case E2).
    <3y  -> 100
    <5y  -> 85
    <8y  -> 70
    <12y -> 50
    else -> 30 (floor, edge case E4)
    """
    if validation_date is None:
        log.debug(
            "validation_date_null",
            note="returning neutral score 50 per edge case E2",
        )
        return 50
    years_since = (date.today() - validation_date).days / 365.25
    if years_since < 3:
        return 100
    if years_since < 5:
        return 85
    if years_since < 8:
        return 70
    if years_since < 12:
        return 50
    return 30


def reversal_score(
    alerts_90d_count: int,
    high_conf_count: int,
    has_coverage: bool,
) -> int:
    """Bucketed reversal-risk score per Appendix B.

    has_coverage = False (projects.gfw_geostore_id IS NULL) -> 50 (E1a).
    Otherwise:
      0 alerts                                 -> 100  (E1: absence of evidence
                                                         is not evidence of
                                                         absence; calibrates
                                                         over time)
      0 high-conf AND <10 total                -> 85
      <5 high-conf                             -> 70
      <20 high-conf                            -> 45
      else                                     -> 20
    """
    if not has_coverage:
        return 50
    if alerts_90d_count == 0:
        return 100
    if high_conf_count == 0 and alerts_90d_count < 10:
        return 85
    if high_conf_count < 5:
        return 70
    if high_conf_count < 20:
        return 45
    return 20


def community_score(slug: str) -> int:
    """Exact-slug lookup in COMMUNITY_OVERRIDES; default 75."""
    return COMMUNITY_OVERRIDES.get(slug, 75)


def transparency_score(registry_count: int, active_registries: int) -> int:
    """Bucketed transparency score per Appendix B."""
    if registry_count >= 2 and active_registries >= 1:
        return 85
    if registry_count == 1 and active_registries == 1:
        return 70
    if registry_count >= 1:
        return 55
    return 40  # see edge case E3


def integrity_score(components: dict[str, int], registry_count: int) -> int:
    """Weighted composite, clamped 0..100. Applies zero-registry cap (E3).

    Zero-data trap fix: when registry_count == 0 the project has literally no
    coverage surface (no registry rows, implies no satellite coverage either,
    per E1a). Cap at 60 after the weighted composite so the unknown-neutral
    reversal floor (50) cannot inflate a no-data project into the 70s.
    """
    raw = (
        components["validation_recency"] * WEIGHTS["validation_recency"]
        + components["reversal_risk"] * WEIGHTS["reversal_risk"]
        + components["community_flags"] * WEIGHTS["community_flags"]
        + components["transparency"] * WEIGHTS["transparency"]
    )
    score = max(0, min(100, round(raw)))
    if registry_count == 0:
        # zero-registry cap: insufficient data coverage; clamping final score to 60
        score = min(score, 60)
    return score


# ─── Query helpers ───────────────────────────────────────────────────────────


# Single round-trip aggregate: pulls every scoring input per project.
# - alerts_90d_count / high_conf_count are from satellite_alerts restricted
#   to the last 90 days of alert_date.
# - registry_count / active_registries count rows in registries, where
#   "active" = LOWER(status) = 'active'.
# - LEFT JOINs so a project with zero registries or zero alerts still returns
#   a row with count = 0.
_AGGREGATE_SQL = """
SELECT
    p.id,
    p.slug,
    p.validation_date,
    p.gfw_geostore_id,
    COALESCE(a.total_alerts, 0)                AS alerts_90d_count,
    COALESCE(a.high_conf_alerts, 0)            AS high_conf_count,
    COALESCE(r.registry_count, 0)              AS registry_count,
    COALESCE(r.active_registries, 0)           AS active_registries
FROM projects p
LEFT JOIN (
    SELECT
        project_id,
        COUNT(*)                                            AS total_alerts,
        COUNT(*) FILTER (WHERE confidence = 'high')         AS high_conf_alerts
    FROM satellite_alerts
    WHERE alert_date >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY project_id
) a ON a.project_id = p.id
LEFT JOIN (
    SELECT
        project_id,
        COUNT(*)                                            AS registry_count,
        COUNT(*) FILTER (WHERE LOWER(status) = 'active')    AS active_registries
    FROM registries
    GROUP BY project_id
) r ON r.project_id = p.id
"""


_UPSERT_SQL = """
INSERT INTO project_scores
  (project_id, score_date, integrity_score, validation_recency_score,
   reversal_score, community_score, transparency_score, components,
   methodology_version)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (project_id, score_date) DO UPDATE SET
  integrity_score          = EXCLUDED.integrity_score,
  validation_recency_score = EXCLUDED.validation_recency_score,
  reversal_score           = EXCLUDED.reversal_score,
  community_score          = EXCLUDED.community_score,
  transparency_score       = EXCLUDED.transparency_score,
  components               = EXCLUDED.components,
  methodology_version      = EXCLUDED.methodology_version
"""


def _compute_row(row: dict[str, Any]) -> dict[str, Any]:
    """Compute sub-scores, components payload, and integrity for one project row."""
    validation_date: date | None = row["validation_date"]
    has_coverage = row["gfw_geostore_id"] is not None
    alerts_90d = int(row["alerts_90d_count"])
    high_conf = int(row["high_conf_count"])
    registry_count = int(row["registry_count"])
    active_registries = int(row["active_registries"])

    vr = validation_recency_score(validation_date)
    rv = reversal_score(alerts_90d, high_conf, has_coverage)
    cm = community_score(row["slug"])
    tr = transparency_score(registry_count, active_registries)

    years_since: float | None = None
    if validation_date is not None:
        years_since = round((date.today() - validation_date).days / 365.25, 2)

    components = {
        "validation_recency": vr,
        "reversal_risk": rv,
        "community_flags": cm,
        "transparency": tr,
        "inputs": {
            "alerts_90d_count": alerts_90d,
            "high_conf_count": high_conf,
            "registry_count": registry_count,
            "years_since_validation": years_since,
        },
    }

    score_components = {
        "validation_recency": vr,
        "reversal_risk": rv,
        "community_flags": cm,
        "transparency": tr,
    }
    integrity = integrity_score(score_components, registry_count)

    return {
        "project_id": row["id"],
        "slug": row["slug"],
        "integrity": integrity,
        "validation_recency": vr,
        "reversal": rv,
        "community": cm,
        "transparency": tr,
        "components": components,
        "registry_count": registry_count,
    }


# ─── Main loop ───────────────────────────────────────────────────────────────


def _warn_on_unmatched_overrides(seen_slugs: set[str]) -> None:
    """Log a WARNING for each COMMUNITY_OVERRIDES slug that matched no project.

    Edge case E5 — slug mismatch should not abort the run; it is silently
    ignored and the project (if it existed) would default to 75.
    """
    for slug in COMMUNITY_OVERRIDES:
        if slug not in seen_slugs:
            log.warning(
                "community_override_unmatched",
                slug=slug,
                note="listed in COMMUNITY_OVERRIDES but no matching project in DB",
            )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="scrapers.scoring.compute",
        description="Compute daily integrity scores for every project.",
    )
    p.add_argument(
        "--project-id",
        type=str,
        default=None,
        help="Score only this project UUID (debug mode).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute + log but do not write to project_scores.",
    )
    p.add_argument(
        "--date",
        type=str,
        default=None,
        help="Override score_date (YYYY-MM-DD). Default: today.",
    )
    return p.parse_args(argv)


def _resolve_score_date(raw: str | None) -> date:
    if raw is None:
        return date.today()
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as exc:
        raise SystemExit(f"invalid --date value {raw!r}: {exc}") from None


def main(argv: list[str] | None = None) -> int:
    configure_logging("score-compute")
    args = _parse_args(argv)
    score_date = _resolve_score_date(args.date)

    # Validate --project-id early; psycopg would raise on malformed UUID at
    # execute time but we want a clear "bad flag" message.
    project_uuid: uuid_mod.UUID | None = None
    if args.project_id is not None:
        try:
            project_uuid = uuid_mod.UUID(args.project_id)
        except ValueError as exc:
            log.error("invalid_project_id", value=args.project_id, error=str(exc))
            return 2

    log.info(
        "score_job_start",
        dry_run=args.dry_run,
        project_id=str(project_uuid) if project_uuid else None,
        score_date=score_date.isoformat(),
        methodology_version=VERSION,
    )

    sql = _AGGREGATE_SQL
    params: tuple[Any, ...] = ()
    if project_uuid is not None:
        sql = sql + " WHERE p.id = %s"
        params = (project_uuid,)

    written = 0
    seen_slugs: set[str] = set()

    with get_connection() as conn:
        cur = execute(conn, sql, params)
        cols = [d.name for d in cur.description] if cur.description else []
        rows = [dict(zip(cols, r, strict=True)) for r in cur.fetchall()]

        if project_uuid is not None and not rows:
            # E7 — unknown UUID → non-zero exit
            log.error("project_not_found", project_id=str(project_uuid))
            return 1

        for row in rows:
            seen_slugs.add(row["slug"])
            result = _compute_row(row)

            log.info(
                "score_computed",
                project_id=str(result["project_id"]),
                slug=result["slug"],
                integrity_score=result["integrity"],
                validation_recency=result["validation_recency"],
                reversal=result["reversal"],
                community=result["community"],
                transparency=result["transparency"],
                registry_count=result["registry_count"],
                dry_run=args.dry_run,
            )

            if args.dry_run:
                continue

            execute(
                conn,
                _UPSERT_SQL,
                (
                    result["project_id"],
                    score_date,
                    result["integrity"],
                    result["validation_recency"],
                    result["reversal"],
                    result["community"],
                    result["transparency"],
                    Jsonb(result["components"]),
                    VERSION,
                ),
            )
            written += 1

        if not args.dry_run:
            conn.commit()

    _warn_on_unmatched_overrides(seen_slugs)

    log.info(
        "score_job_done",
        projects_processed=len(rows),
        rows_upserted=written,
        dry_run=args.dry_run,
        score_date=score_date.isoformat(),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
