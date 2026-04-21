---
id: T02
title: Create schema migration 001 (initial tables)
phase: 1
status: draft
blocked_by: [T01]
blocks: [T04, T06, T07, T08, T09, T10, T21]
owner: spec-writer agent
effort_estimate: 1h
---

## 1. User story

As Andy (the solo founder running the Hetzner VPS), I want a single idempotent SQL file that creates all v0.1 tables and extensions, so that every downstream scraper and the Next.js app can rely on a stable, reproducible database schema from day one.

---

## 2. Context & rationale

The canonical schema lives in `docs/architecture.md` §3. This task mechanically converts that authoritative DDL into `scrapers/migrations/001_init.sql` and applies it to the Hetzner Postgres instance.

Key constraints:

- **Target host:** Hetzner CX32, Postgres 16, applied as `sudo -u postgres psql -d karbonlens -f 001_init.sql`.
- **No migration runner.** For v0.1 migrations are applied manually with `psql`. The `schema_migrations` table provides lightweight bookkeeping.
- **Idempotence is non-negotiable.** Every object must use `IF NOT EXISTS` so the file can be re-run safely (e.g. after a partial failure, or for verification on a fresh staging DB).
- **`pg_trgm` goes here, not in a later amendment.** T06 needs `similarity()` for fuzzy entity resolution, and T07/T21 need it for match-queue queries. Adding it now prevents a mid-sprint amendment migration.
- **No credentials in the file.** The `DATABASE_URL` used at apply-time is stubbed as `DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens` in `.env.example`. The real password is set during T01 and stored outside the repo.

---

## 3. Scope

### In scope

- Create `scrapers/migrations/001_init.sql` containing:
  - `CREATE EXTENSION IF NOT EXISTS postgis;`
  - `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
  - `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
  - `schema_migrations` bookkeeping table (first, so later tables can reference it in comments)
  - All 14 application tables from `docs/architecture.md` §3, in dependency order:
    1. `projects`
    2. `registries`
    3. `issuances`
    4. `retirements`
    5. `idx_monthly_snapshots`
    6. `satellite_alerts`
    7. `regulatory_events`
    8. `project_scores`
    9. `project_match_queue`
    10. `users`
    11. `accounts`
    12. `sessions`
    13. `verification_tokens`
    14. `notifications`
  - All indexes from `docs/architecture.md` §3 (every `CREATE INDEX IF NOT EXISTS`)
  - Trailing `INSERT INTO schema_migrations (version) VALUES ('001') ON CONFLICT DO NOTHING;`
- Create `scrapers/migrations/.gitkeep` if the directory does not yet exist in the repo (keeps the directory tracked before the SQL file is present).

### Out of scope (explicit non-goals)

- **Seeding data.** T10 seeds `regulatory_events`; T06–T08 seed project/market data via scrapers. Migration 001 creates structure only.
- **Drizzle TypeScript schema** (`lib/schema.ts`). That is T04. `lib/schema.ts` must not be produced or modified here.
- **Adding `gfw_geostore_id` to `projects`.** T07 adds this via migration `002_add_geostore.sql`.
- **Backup strategy.** T20.
- **Running the migration.** The spec defines the file; Andy applies it on the VPS per the apply command in §5.
- **Automated tests.** No tests for v0.1; acceptance is verified with manual `psql` queries listed in §4.

---

## 4. Acceptance criteria (Gherkin)

**AC-1: All 15 tables exist after first apply**

```
Given T01 is complete (karbonlens DB exists with the karbonlens PG user)
When Andy runs:
    sudo -u postgres psql -d karbonlens -f /opt/karbonlens/migrations/001_init.sql
Then psql -U karbonlens -d karbonlens -c "\dt" lists exactly 15 tables:
    accounts, idx_monthly_snapshots, issuances, notifications,
    project_match_queue, project_scores, projects, registries,
    regulatory_events, retirements, satellite_alerts, schema_migrations,
    sessions, users, verification_tokens
```

**AC-2: All indexes exist**

```
Given AC-1 has passed
When Andy runs: psql -U karbonlens -d karbonlens -c "\di"
Then the output includes all indexes from docs/architecture.md §3:
    idx_projects_province, idx_projects_type, idx_projects_status,
    idx_projects_centroid (GIST), idx_registries_project,
    idx_issuances_project_vintage, idx_retirements_project_date,
    idx_sat_project_date, idx_sat_location (GIST),
    idx_notifications_user_read, idx_notifications_user_created
```

**AC-3: Required extensions are installed**

```
Given AC-1 has passed
When Andy runs: psql -U karbonlens -d karbonlens -c "\dx"
Then the output lists: postgis, pgcrypto, pg_trgm
```

**AC-4: Migration is idempotent**

```
Given AC-1 has passed (migration applied once)
When Andy re-runs:
    sudo -u postgres psql -d karbonlens -f /opt/karbonlens/migrations/001_init.sql
Then the command exits 0 with no errors and no "already exists" failures
And the table count is still 15
```

**AC-5: Schema migrations bookkeeping**

```
Given AC-1 has passed
When Andy runs:
    psql -U karbonlens -d karbonlens -c "SELECT version FROM schema_migrations;"
Then one row is returned with value: 001
```

**AC-6: PostGIS and pgcrypto spot-check insert into projects**

```
Given AC-1 has passed
When Andy runs:
    psql -U karbonlens -d karbonlens -c "
      INSERT INTO projects (slug, name_canonical, country, centroid)
      VALUES (
        'test-project',
        'Test Project',
        'ID',
        ST_SetSRID(ST_MakePoint(112.5, -2.5), 4326)::geography
      )
      RETURNING id, slug, centroid::text;
    "
Then the INSERT returns a row with a valid UUID (from gen_random_uuid()),
     slug = 'test-project', and a non-null centroid geometry
And there are no type errors or extension-missing errors
```

**AC-7: pg_trgm available for similarity queries**

```
Given AC-1 has passed
When Andy runs:
    psql -U karbonlens -d karbonlens -c "
      SELECT similarity('Katingan Peatland', 'Katingan Peatlands');
    "
Then a numeric similarity score is returned (no "function does not exist" error)
```

---

## 5. Inputs & outputs

### Inputs

- `docs/architecture.md` §3 — authoritative DDL source. If architecture §3 and this story conflict, §3 wins; update this story to match.
- `DATABASE_URL` env var — placeholder only in `.env.example`:
  ```
  DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens
  ```
  Real value set in T01 and kept off-repo.
- T01 complete: Postgres 16 running, `karbonlens` database and user created, PostGIS package installed at the OS level.

### Outputs

| File | Description |
|---|---|
| `scrapers/migrations/001_init.sql` | The migration. Single deliverable of this story. |
| `scrapers/migrations/.gitkeep` | Only if directory not yet committed to the repo. |

**`lib/schema.ts` is NOT produced here.** That is T04.

### Apply command (for the record — Andy runs this, not the implementer)

```bash
# Copy file to VPS
scp scrapers/migrations/001_init.sql karbonlens@<vps-ip>:/opt/karbonlens/migrations/

# Apply
sudo -u postgres psql -d karbonlens -f /opt/karbonlens/migrations/001_init.sql
```

---

## 6. Dependencies & interactions

### Blocked by

- **T01** — Postgres 16 + PostGIS OS package must be installed and the `karbonlens` database must exist before this migration can be applied.

### Blocks (nothing downstream can start until T02 is applied)

- **T04** — Drizzle schema mirrors these tables; cannot be written without knowing the final DDL.
- **T06** — Verra scraper writes to `projects`, `registries`, `issuances`. Also depends on `pg_trgm` being present for `similarity()`.
- **T07** — GFW scraper writes to `satellite_alerts`; references `projects`.
- **T08** — IDXCarbon scraper writes to `idx_monthly_snapshots`.
- **T09** — Score job writes to `project_scores`; reads `satellite_alerts`.
- **T10** — Regulatory seed writes to `regulatory_events`.
- **T21** — Entity resolution admin reads `project_match_queue`.

### File ownership

Only this story may create or modify:

- `scrapers/migrations/001_init.sql`
- `scrapers/migrations/.gitkeep`

No other story should touch these files. Future schema changes go in `002_*.sql`, `003_*.sql`, etc.

---

## 7. Edge cases & failure modes

**E1 — DB already has hand-crafted tables from earlier experimentation.**
If Andy ran ad-hoc DDL before T02, some tables may already exist with potentially different column definitions. `CREATE TABLE IF NOT EXISTS` will silently skip the create. This is the intended behavior for idempotence on a clean re-apply.

*Known limitation:* if an existing table has a column with the wrong type (e.g., `centroid GEOMETRY` instead of `GEOGRAPHY(POINT, 4326)`), the migration will not detect or fix it — it will silently skip the entire `CREATE TABLE` statement. Type drift will surface as runtime errors when scrapers try to insert. **Resolution:** drop and recreate the offending table manually, or write a targeted `ALTER TABLE` in a new migration file (not here). This is an accepted tradeoff of simple idempotent migrations; Drizzle Kit migration automation in v0.2 will handle column-level diffs properly.

**E2 — Extension already installed in another schema.**
`CREATE EXTENSION IF NOT EXISTS postgis/pgcrypto/pg_trgm` is safe whether or not the extension was installed during T01. PostgreSQL `IF NOT EXISTS` is a no-op if already present.

**E3 — `pg_trgm` OS package not installed.**
`CREATE EXTENSION pg_trgm` will fail if the `postgresql-16-pg_trgm` OS package is absent. Unlike PostGIS, this package may not have been installed in T01. If extension creation fails, the migration aborts. Fix: install the package (`apt install postgresql-16-contrib`, which includes pg_trgm) and re-run. Document in T01 notes.

**E4 — Partial apply due to connection drop.**
`psql -f` is not wrapped in a single transaction by default. If the session drops mid-file, some tables will exist and some will not. Re-running the file is safe (IF NOT EXISTS covers all objects) but verify with AC-1's `\dt` check.

**E5 — `total_vcus_available` generated column on older Postgres.**
`NUMERIC GENERATED ALWAYS AS (...) STORED` requires Postgres 12+. Hetzner is running Postgres 16, so this is fine. Do not backport to older Postgres.

---

## 8. Definition of done

- [ ] `scrapers/migrations/001_init.sql` exists in the repo on `feature/v0.1-impl`.
- [ ] The file passes all 7 acceptance criteria (AC-1 through AC-7) when applied to the Hetzner box.
- [ ] Re-running the file exits 0 (AC-4 verified).
- [ ] `scrapers/migrations/.gitkeep` is committed if directory was previously untracked.
- [ ] `CHANGELOG` entry added under `[Unreleased]`: `T02 — Schema migration 001 (initial tables)`.
- [ ] `TASKS.md` T02 status flipped from `todo` → `done`.
- [ ] This story's `status` frontmatter set to `done`.

---

## 9. Open questions

**OQ-1 — Foreign key deletion policies (needs Andy's call before implementation).**
Architecture §3 uses two deletion policies:

| Table | FK column | Policy |
|---|---|---|
| `registries` | `project_id → projects` | `ON DELETE CASCADE` |
| `issuances` | `project_id → projects` | `ON DELETE CASCADE` |
| `retirements` | `project_id → projects` | `ON DELETE CASCADE` |
| `project_scores` | `project_id → projects` | `ON DELETE CASCADE` |
| `satellite_alerts` | `project_id → projects` | `ON DELETE SET NULL` |
| `notifications` | `project_id → projects` | `ON DELETE SET NULL` |
| `accounts` | `user_id → users` | `ON DELETE CASCADE` |
| `sessions` | `user_id → users` | `ON DELETE CASCADE` |
| `notifications` | `user_id → users` | `ON DELETE CASCADE` |

The `SET NULL` choices for `satellite_alerts.project_id` and `notifications.project_id` mean: if a project is deleted, historical alerts and notifications are retained (orphaned, project_id = NULL) rather than cascade-deleted. This is a strategic choice — alerts are forensic records; deleting a project should not erase its deforestation history.

**Question for Andy:** Are the cascade vs SET NULL choices above final, or should all project-linked tables use CASCADE (simpler) or all use SET NULL (maximum data retention)? Implementation will proceed with the architecture §3 choices unless Andy says otherwise.

**OQ-2 — `pg_trgm` OS package in T01.**
T01 as written installs `postgresql-16-postgis-3` but does not mention `postgresql-contrib` (which ships `pg_trgm`). Should T01's acceptance criteria be updated to verify pg_trgm availability, or is it acceptable to resolve this during T02 apply if the extension fails?

---

## 10. References

- `docs/architecture.md` §3 — Database schema (DDL source of truth)
- `docs/architecture.md` §4 — Migration discipline
- `docs/architecture.md` §5.1 — Verra scraper entity resolution using `pg_trgm similarity()`
- `docs/TASKS.md` T02 — Raw task definition
- `docs/TASKS.md` T06, step 6 — pg_trgm requirement callout ("add `CREATE EXTENSION IF NOT EXISTS pg_trgm;` to migration 001")
- PostgreSQL docs — [`CREATE TABLE IF NOT EXISTS`](https://www.postgresql.org/docs/16/sql-createtable.html), [`GENERATED ALWAYS AS … STORED`](https://www.postgresql.org/docs/16/ddl-generated-columns.html), [`pg_trgm`](https://www.postgresql.org/docs/16/pgtrgm.html)
- PostGIS docs — [`GEOGRAPHY` type](https://postgis.net/docs/using_postgis_dbmanagement.html#Geography_Basics), `ST_SetSRID`, `ST_MakePoint`
