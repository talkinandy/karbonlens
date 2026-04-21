"""structlog configuration shared by all scrapers.

Every scraper entry point calls `configure_logging("<scraper-name>")` once at
startup, then uses `get_logger(__name__)` to obtain a bound logger. The output
format is line-delimited JSON suitable for log aggregation.
"""

from __future__ import annotations

import logging
import sys

import structlog


def configure_logging(scraper_name: str) -> None:
    """Configure structlog + stdlib logging for a scraper run.

    - ISO-8601 timestamps
    - JSON renderer on stdout (one object per line)
    - Binds `scraper=<name>` to every log record so downstream greps are easy
    """
    # Route stdlib logs through the same pipeline. Some deps (httpx, psycopg)
    # use stdlib logging; having them JSON-rendered keeps cron logs uniform.
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Bind the scraper name once so every subsequent log line carries it.
    structlog.contextvars.bind_contextvars(scraper=scraper_name)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a structlog bound logger for the given module name."""
    return structlog.get_logger(name)
