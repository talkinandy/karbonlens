"""Thin psycopg wrapper used by every scraper.

The spec (§3.2) names three helpers:

- `get_connection()` — context manager, caller commits/rolls back explicitly.
- `execute(conn, sql, params=None)` — debug-log then delegate to psycopg.
- `execute_with_retry(conn, sql, params=None, retries=3)` — exponential backoff
  on `psycopg.OperationalError` (transient connection drops).

T07, T08, T09 import these names; do not rename them without updating those stories.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg
import structlog

from .config import DATABASE_URL

log = structlog.get_logger(__name__)


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    """Open a psycopg connection. Caller commits/rolls back explicitly.

    The `with psycopg.connect(...)` block auto-closes on exit; if the caller did
    not commit an open transaction, psycopg rolls it back on close. This is the
    v0.1 convention — no module-level singleton.
    """
    with psycopg.connect(DATABASE_URL) as conn:
        yield conn


def execute(
    conn: psycopg.Connection,
    sql: str,
    params: Any = None,
) -> psycopg.Cursor:
    """Log SQL at DEBUG then execute. Returns the cursor from psycopg."""
    log.debug("sql", query=sql[:200], params=params)
    return conn.execute(sql, params)


def execute_with_retry(
    conn: psycopg.Connection,
    sql: str,
    params: Any = None,
    *,
    retries: int = 3,
) -> psycopg.Cursor:
    """execute() with exponential-backoff retry on OperationalError.

    Retries the call up to `retries` times, sleeping `2 ** attempt` seconds
    between attempts. Re-raises on the final attempt.
    """
    last_exc: psycopg.OperationalError | None = None
    for attempt in range(retries):
        try:
            return execute(conn, sql, params)
        except psycopg.OperationalError as exc:
            last_exc = exc
            if attempt == retries - 1:
                break
            backoff = 2**attempt
            log.warning("db_retry", attempt=attempt + 1, backoff_s=backoff, error=str(exc))
            time.sleep(backoff)
    # Unreachable unless every attempt raised; satisfies the type checker.
    assert last_exc is not None
    raise last_exc
