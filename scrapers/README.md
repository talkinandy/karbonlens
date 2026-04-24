# scrapers/

This directory contains only the **database schema migrations** and
**static seed data** used by the public KarbonLens application.

- `migrations/` — canonical SQL schema migrations. The Drizzle schema
  in `lib/schema.ts` mirrors these files; when they disagree, the SQL
  wins and the Drizzle side is updated.
- `seed/` — hand-curated reference data (regulatory events, etc.)
  applied as idempotent SQL.

## Where is the actual ingestion code?

The Python scrapers, scoring job, cron wrappers, and the GLAD-S2
pipeline live in a companion repository that is **not public**. The
public app consumes the data produced by those pipelines; it does not
run them itself.

This split keeps upstream-registry terms of service outside the public
surface and lets the ingestion moat evolve independently of the app.
