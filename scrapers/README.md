# karbonlens-scrapers

Python scrapers for KarbonLens (Verra, GFW alerts, IDXCarbon, score computation).

See `docs/scraper-patterns.md` at the repo root for conventions that every scraper
in this directory must follow.

## Quickstart

```bash
# First time
uv sync --extra dev

# Run the Verra scraper (smoke test)
uv run python -m verra.fetch --dry-run --limit 3

# Full run
uv run python -m verra.fetch
```

## Layout

```
scrapers/
  common/      shared helpers (db, config, logging)
  verra/       Verra registry scraper (T06)
  scripts/     bash wrappers for cron (installed by T19)
  migrations/  SQL migrations (owned by T02, T07)
```
