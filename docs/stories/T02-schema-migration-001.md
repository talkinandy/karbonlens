---
id: T02
title: Create schema migration 001 (initial tables)
phase: 1
status: done
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
  - `schema_migrations` bookkeeping table (created first, before any application table):

    ```sql
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
    ```

  - All 14 application tables from `docs/architecture.md` §3, in dependency order, giving **15 total** (14 application tables + `schema_migrations`):
    0. `schema_migrations` *(created first — see above)*
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
  - All indexes from `docs/architecture.md` §3. **Every index DDL must use `CREATE INDEX IF NOT EXISTS`** — including the GIST indexes (`idx_projects_centroid`, `idx_sat_location`). This is mandatory for idempotence and is verified in AC-4.
  - Trailing `INSERT INTO schema_migrations (version) VALUES ('001') ON CONFLICT DO NOTHING;`
  - Ownership block at the very end of the file: `ALTER TABLE ... OWNER TO karbonlens;` for all 15 tables and all sequences — see §5 Apply command for the full pattern.
- Create `scrapers/migrations/.gitkeep` if the directory does not yet exist in the repo (keeps the directory tracked before the SQL file is present).

#### `users` table — `email_verified` column (required for NextAuth adapter)

The `users` table **must include** `email_verified TIMESTAMPTZ` as a nullable column. This is required by `@auth/drizzle-adapter` v5, which writes an `emailVerified` timestamp on every first login via Google OAuth. Source of truth: `docs/architecture.md` §3 (updated).

```sql
CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT UNIQUE NOT NULL,
  email_verified       TIMESTAMPTZ,          -- required by @auth/drizzle-adapter v5
  name                 TEXT,
  image                TEXT,
  organization         TEXT,
  persona              TEXT,
  email_digest_opt_in  BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at         TIMESTAMPTZ DEFAULT NOW()
);
```

SQL column name is `email_verified` (snake_case). T04 must expose this as Drizzle field `emailVerified` (camelCase) — see §6 Auth table field-naming contract below.

#### `project_scores` and `verification_tokens` — composite primary keys

Both tables use composite primary keys (no `id UUID` column). Implementers creating these tables must **not** add a separate `id` column:

- `project_scores PRIMARY KEY (project_id, score_date)` — no UUID `id`.
- `verification_tokens PRIMARY KEY (identifier, token)` — no UUID `id`.

T04 must mirror these composite PKs in Drizzle; see §6 for the cross-story note.

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
    sudo -u postgres psql --single-transaction -d karbonlens \
      -f /opt/karbonlens/migrations/001_init.sql
Then the command exits 0 with no errors and no "already exists" failures
And psql -U karbonlens -d karbonlens -c "\dt" still lists exactly 15 tables
And psql -U karbonlens -d karbonlens -c "\di" still lists all 11 indexes from AC-2
     (verifies every CREATE INDEX uses IF NOT EXISTS, including the GIST indexes)
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

The migration runs as the `postgres` superuser (required to create extensions). Ownership is transferred to the `karbonlens` role at the end of the file via explicit `ALTER TABLE ... OWNER TO` statements. This approach is preferred because it keeps all ownership changes auditable in one place at the bottom of the migration.

```bash
# Copy file to VPS
scp scrapers/migrations/001_init.sql karbonlens@<vps-ip>:/opt/karbonlens/migrations/

# Apply as postgres (extensions require superuser; ownership block runs at end)
sudo -u postgres psql --single-transaction -d karbonlens \
  -f /opt/karbonlens/migrations/001_init.sql
```

The `--single-transaction` flag wraps the entire file in `BEGIN`/`COMMIT`, making partial-apply (E4) impossible. If any statement fails the whole migration rolls back cleanly.

**Ownership block** — the tail of `001_init.sql` must contain:

```sql
-- Grant schema usage, then transfer ownership of every table and sequence
-- to the karbonlens role so scrapers and the Next.js app can ALTER/INSERT freely.
GRANT USAGE ON SCHEMA public TO karbonlens;

ALTER TABLE schema_migrations           OWNER TO karbonlens;
ALTER TABLE projects                    OWNER TO karbonlens;
ALTER TABLE registries                  OWNER TO karbonlens;
ALTER TABLE issuances                   OWNER TO karbonlens;
ALTER TABLE retirements                 OWNER TO karbonlens;
ALTER TABLE idx_monthly_snapshots       OWNER TO karbonlens;
ALTER TABLE satellite_alerts            OWNER TO karbonlens;
ALTER TABLE regulatory_events           OWNER TO karbonlens;
ALTER TABLE project_scores              OWNER TO karbonlens;
ALTER TABLE project_match_queue         OWNER TO karbonlens;
ALTER TABLE users                       OWNER TO karbonlens;
ALTER TABLE accounts                    OWNER TO karbonlens;
ALTER TABLE sessions                    OWNER TO karbonlens;
ALTER TABLE verification_tokens         OWNER TO karbonlens;
ALTER TABLE notifications               OWNER TO karbonlens;

-- Sequences (auto-created for UUID defaults via gen_random_uuid() — none needed,
-- but enumerate any explicit sequences if added later).
-- Safety net: grant DML on all tables and sequences to karbonlens.
GRANT ALL ON ALL TABLES    IN SCHEMA public TO karbonlens;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO karbonlens;
```

This pattern ensures that future migrations (`002_*.sql`) applied as `postgres` can also add `ALTER TABLE ... OWNER TO karbonlens;` without surprises. T07's `002_add_geostore.sql` must follow the same ownership convention.

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

### Auth table field-naming contract (T02 → T04 bridge)

T02 writes SQL column names in snake_case. T04's `lib/schema.ts` must expose the auth-table columns under camelCase Drizzle field names that `@auth/drizzle-adapter` v5 reads by exact JavaScript property name. Mismatches cause silent adapter failures at runtime.

**Required mapping — T04 must implement these field names exactly:**

| Table | SQL column | Drizzle field name (T04) |
|---|---|---|
| `users` | `email_verified` | `emailVerified` |
| `accounts` | `user_id` | `userId` |
| `accounts` | `provider_account_id` | `providerAccountId` |
| `accounts` | `refresh_token` | `refreshToken` |
| `accounts` | `access_token` | `accessToken` |
| `accounts` | `expires_at` (BIGINT) | `expiresAt` |
| `accounts` | `token_type` | `tokenType` |
| `accounts` | `id_token` | `idToken` |
| `accounts` | `session_state` | `sessionState` |
| `sessions` | `session_token` | `sessionToken` |
| `sessions` | `user_id` | `userId` |
| `sessions` | `expires` | `expires` |
| `verification_tokens` | `identifier` | `identifier` |
| `verification_tokens` | `token` | `token` |
| `verification_tokens` | `expires` | `expires` |

`verification_tokens` uses a composite primary key `PRIMARY KEY (identifier, token)`. T04 must declare this using Drizzle's `primaryKey({ columns: [t.identifier, t.token] })` callback — not `.primaryKey()` on a single column.

`project_scores` likewise uses a composite primary key `PRIMARY KEY (project_id, score_date)`. T04 must use `primaryKey({ columns: [t.projectId, t.scoreDate] })`.

### T04 cross-reference — `total_vcus_available` generated column

`projects.total_vcus_available` is a `NUMERIC GENERATED ALWAYS AS (total_vcus_issued - total_vcus_retired) STORED` column. T02's SQL DDL retains this as-is. T04 must use Drizzle's `generatedAlwaysAs()` (available in drizzle-orm ≥ 0.30) to mark it read-only and prevent inserts/updates on that column. If `generatedAlwaysAs()` is unavailable in the installed version, T04 must omit the column from the table definition and read it explicitly via `sql\`"total_vcus_available"\`` in select queries — not assume it appears in the inferred row type. Document whichever approach is used in a comment in `lib/schema.ts`. Downstream stories T11, T12, and T09 must not assume `totalVcusAvailable` is in Drizzle's default select output.

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
`CREATE EXTENSION pg_trgm` will fail if the required Postgres module files are absent. On this box (Postgres 16, Debian/Ubuntu), `pg_trgm` ships with the core `postgresql-16` package — **no separate `postgresql-16-contrib` package is required**. T01 installs `postgresql-16`, so `CREATE EXTENSION IF NOT EXISTS pg_trgm` is a safe no-op in the normal T01-complete flow. If extension creation fails unexpectedly, verify the full `postgresql-16` package is installed and re-run.

**E4 — Partial apply due to connection drop.**
`psql -f` is not wrapped in a single transaction by default. If the session drops mid-file, some tables will exist and some will not. Re-running the file is safe (IF NOT EXISTS covers all objects) but verify with AC-1's `\dt` check.

**E5 — `total_vcus_available` generated column on older Postgres.**
`NUMERIC GENERATED ALWAYS AS (...) STORED` requires Postgres 12+. Hetzner is running Postgres 16, so this is fine. Do not backport to older Postgres.

**E6 — Re-running on a DB where `users` already exists without `email_verified`.**
If migration 001 was partially applied (e.g., from an earlier draft) before `email_verified` was added to the spec, `CREATE TABLE IF NOT EXISTS users` will silently skip the create — and the missing column will not be added. In this case, run a targeted fix manually before proceeding:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified TIMESTAMPTZ;
```

This is a one-time remediation for pre-spec-revision deployments; it is not part of `001_init.sql`. Since T01 and T02 are both still `draft`/`audited` and the database has not been deployed, amending migration 001 directly is the correct path — no migration 002 is needed for this column.

**E7 — `project_match_queue` FK cascade policy (RESTRICT by default).**
`candidate_a_id` and `candidate_b_id` reference `projects(id)` with no `ON DELETE` clause, so Postgres defaults to `ON DELETE RESTRICT`. Deleting a project that appears in the match queue will fail with a FK violation until the queue row is manually resolved or removed. This is intentional for v0.1 — it forces review before a project can be deleted. See OQ-1 for the full cascade policy table.

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
| `project_match_queue` | `candidate_a_id → projects` | `ON DELETE RESTRICT` (Postgres default — no clause specified) |
| `project_match_queue` | `candidate_b_id → projects` | `ON DELETE RESTRICT` (Postgres default — no clause specified) |

The `SET NULL` choices for `satellite_alerts.project_id` and `notifications.project_id` mean: if a project is deleted, historical alerts and notifications are retained (orphaned, project_id = NULL) rather than cascade-deleted. This is a strategic choice — alerts are forensic records; deleting a project should not erase its deforestation history.

The `RESTRICT` default for `project_match_queue` means deleting a project that appears in the queue will fail with a FK violation until the queue row is resolved. This is intentional (see E7).

**Question for Andy:** Are the cascade vs SET NULL choices above final, or should all project-linked tables use CASCADE (simpler) or all use SET NULL (maximum data retention)? Implementation will proceed with the architecture §3 choices unless Andy says otherwise.

**OQ-2 — CLOSED.** `pg_trgm` ships with `postgresql-16` on this box; no separate `postgresql-contrib` package is needed. T01 installs `postgresql-16`. `CREATE EXTENSION IF NOT EXISTS pg_trgm` will succeed without additional OS packages. See E3.

**OQ-3 — Drizzle `generatedAlwaysAs()` for `projects.total_vcus_available` (T04 action item).**
T02 keeps the SQL `GENERATED ALWAYS AS (total_vcus_issued - total_vcus_retired) STORED` as-is. T04 must decide at implementation time whether to use `generatedAlwaysAs(sql\`total_vcus_issued - total_vcus_retired\`, { mode: 'stored' })` (preferred if drizzle-orm ≥ 0.30 is installed) or to omit the column from the table definition and read it via raw `sql` tag. Whichever approach is chosen must be documented in a comment in `lib/schema.ts`. Downstream stories T09, T11, T12 must not assume `totalVcusAvailable` appears in Drizzle's default select output — they should use the approach T04 documents. This is a T04 concern; T02's DDL does not change.

---

## 10. References

- `docs/architecture.md` §3 — Database schema (DDL source of truth)
- `docs/architecture.md` §4 — Migration discipline
- `docs/architecture.md` §5.1 — Verra scraper entity resolution using `pg_trgm similarity()`
- `docs/TASKS.md` T02 — Raw task definition
- `docs/TASKS.md` T06, step 6 — pg_trgm requirement callout ("add `CREATE EXTENSION IF NOT EXISTS pg_trgm;` to migration 001")
- PostgreSQL docs — [`CREATE TABLE IF NOT EXISTS`](https://www.postgresql.org/docs/16/sql-createtable.html), [`GENERATED ALWAYS AS … STORED`](https://www.postgresql.org/docs/16/ddl-generated-columns.html), [`pg_trgm`](https://www.postgresql.org/docs/16/pgtrgm.html)
- PostGIS docs — [`GEOGRAPHY` type](https://postgis.net/docs/using_postgis_dbmanagement.html#Geography_Basics), `ST_SetSRID`, `ST_MakePoint`
