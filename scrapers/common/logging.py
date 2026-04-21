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
    - Routes stdlib log records (httpx, psycopg) through the same JSON
      pipeline so AC-8 "every line is valid JSON" holds on the wire.
    """
    # Shared processor chain. `ProcessorFormatter.wrap_for_formatter` on the
    # stdlib side and the last processor on the structlog side both feed into
    # `ProcessorFormatter(processor=JSONRenderer())`, so every record — native
    # structlog or routed-from-stdlib — is rendered as JSON.
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=structlog.processors.JSONRenderer(),
        foreign_pre_chain=shared_processors,
    )

    # Replace all handlers on the root logger so httpx/psycopg INFO lines
    # go through the JSON formatter rather than the default text format.
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    # Bind the scraper name once so every subsequent log line carries it.
    structlog.contextvars.bind_contextvars(scraper=scraper_name)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a structlog bound logger for the given module name."""
    return structlog.get_logger(name)
