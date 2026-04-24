"""Environment / configuration loader for all scrapers.

Loads `.env.local` first, then `.env`, so repo-local overrides win. Exposes
module-level constants that every scraper imports. Raises `RuntimeError` at
import time if `DATABASE_URL` is absent — we want to fail loudly in cron, not
only once a scraper tries to `psycopg.connect()`.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Look for env files relative to the repo root (parent of `scrapers/`).
# Fall back to CWD behavior if that resolution fails for any reason.
_REPO_ROOT = Path(__file__).resolve().parents[2]

# Load .env.local first with override=True so it wins over anything already set,
# then .env without override as a default source. This mirrors Next.js behavior
# and matches what the rest of the stack (lib/env.ts) does.
load_dotenv(_REPO_ROOT / ".env.local", override=True)
load_dotenv(_REPO_ROOT / ".env", override=False)

_DATABASE_URL = os.environ.get("DATABASE_URL")
if not _DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required. Populate .env.local at the repo root "
        "(see .env.example) before running any scraper."
    )
DATABASE_URL: str = _DATABASE_URL

# Polite User-Agent per docs/architecture.md §7. Prefer the env override if set,
# so ops can tweak contact info without a code change.
SCRAPER_USER_AGENT: str = os.environ.get(
    "SCRAPER_USER_AGENT",
    "KarbonLens-scraper/0.1 (+https://karbonlens.netlify.app)",
)

SCRAPER_LOG_DIR: str = os.environ.get("SCRAPER_LOG_DIR", "/var/log/karbonlens")


def load_env() -> None:
    """Idempotent re-load. Provided for scripts that want an explicit entry point."""
    load_dotenv(_REPO_ROOT / ".env.local", override=True)
    load_dotenv(_REPO_ROOT / ".env", override=False)
