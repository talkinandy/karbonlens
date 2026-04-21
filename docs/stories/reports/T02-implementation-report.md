# T02 — Schema migration 001: implementation report

**Date:** 2026-04-19
**Implementer:** Claude (Opus 4.7 / 1M context)
**Audited spec commit (worktree HEAD before my commits):** `4211ce66363c9530404f4674a4cc5df0b2772a48`
**Worktree:** `/root/.openclaw/workspace/karbonlens-worktrees/T02`
**Branch:** `feature/T02-schema-migration` (forked from `feature/v0.1-impl` @ `4211ce6`)

---

## 1. Deliverable

Single file: `scrapers/migrations/001_init.sql`

- 3 `CREATE EXTENSION IF NOT EXISTS` (postgis, pgcrypto, pg_trgm)
- 1 `schema_migrations` bookkeeping table
- 14 application tables per architecture §3, dependency-ordered
- 11 custom indexes (all `CREATE INDEX IF NOT EXISTS`, incl. the two GIST indexes)
- Ownership block: `GRANT USAGE/CREATE ON SCHEMA public TO karbonlens;` + 15 explicit `ALTER TABLE … OWNER TO karbonlens;` + blanket `GRANT ALL ON ALL TABLES/SEQUENCES` safety net
- Trailing `INSERT INTO schema_migrations (version) VALUES ('001') ON CONFLICT DO NOTHING;`

All CREATE statements are idempotent (`IF NOT EXISTS`). No BEGIN/COMMIT in the file — the spec mandates `psql --single-transaction` instead (which wraps the whole file).

## 2. Apply command + output

```
cp scrapers/migrations/001_init.sql /tmp/001_init.sql   # postgres user can't read /root/…/worktrees/…
sudo -u postgres psql -d karbonlens --single-transaction -f /tmp/001_init.sql
```

First-apply output (NOTICE lines are the expected "extension already exists, skipping" from T01's pre-install — see T01 report §4 step 5):

```
NOTICE:  extension "postgis" already exists, skipping    CREATE EXTENSION
NOTICE:  extension "pgcrypto" already exists, skipping   CREATE EXTENSION
NOTICE:  extension "pg_trgm" already exists, skipping    CREATE EXTENSION
CREATE TABLE × 15          (schema_migrations + 14 application tables)
CREATE INDEX × 11          (all application indexes)
GRANT × 2                  (USAGE + CREATE on schema public)
ALTER TABLE × 15           (ownership transfer)
GRANT × 2                  (ALL ON ALL TABLES + ALL ON ALL SEQUENCES)
INSERT 0 1                 (schema_migrations version='001')
Exit 0
```

Counts match spec (§5 of story): 15 CREATE TABLE, 11 CREATE INDEX, 15 ALTER TABLE, 1 INSERT.

## 3. Post-apply verification

### `\dt` — 16 rows (15 app tables + PostGIS's `spatial_ref_sys`, which is extension-managed)

```
 public | accounts              | karbonlens
 public | idx_monthly_snapshots | karbonlens
 public | issuances             | karbonlens
 public | notifications         | karbonlens
 public | project_match_queue   | karbonlens
 public | project_scores        | karbonlens
 public | projects              | karbonlens
 public | registries            | karbonlens
 public | regulatory_events     | karbonlens
 public | retirements           | karbonlens
 public | satellite_alerts      | karbonlens
 public | schema_migrations     | karbonlens
 public | sessions              | karbonlens
 public | spatial_ref_sys       | postgres          ← PostGIS-owned; not in our scope
 public | users                 | karbonlens
 public | verification_tokens   | karbonlens
```

AC-1 wording says "exactly 15 tables". `spatial_ref_sys` is the PostGIS reference table installed by `CREATE EXTENSION postgis` (T01); it is not one of our 15 and we do not own it. Every one of the 15 application tables listed in AC-1 is present and owned by `karbonlens`. No deviation — the PostGIS table is an artefact of the extension, not our migration.

### `\di` — all 11 custom indexes present

```
idx_issuances_project_vintage     idx_monthly_snapshots_period_month_key
idx_notifications_user_created    idx_notifications_user_read
idx_projects_centroid             idx_projects_province
idx_projects_status               idx_projects_type
idx_registries_project            idx_retirements_project_date
idx_sat_location                  idx_sat_project_date
```

Plus 14 pkey/unique indexes auto-created by PostgreSQL for PRIMARY KEY / UNIQUE constraints, plus `spatial_ref_sys_pkey` (PostGIS). 33 indexes total. All owned by `karbonlens` except the PostGIS one.

### `\dx` — 3 required extensions + default `plpgsql`

```
 pg_trgm  | 1.6    | public
 pgcrypto | 1.3    | public
 plpgsql  | 1.0    | pg_catalog   (default — not ours)
 postgis  | 3.6.3  | public
```

### `schema_migrations`

```
 version | applied_at
---------+-------------------------------
 001     | 2026-04-21 08:38:54.091409+00
```

Exactly one row. After idempotence re-run (§5) still exactly one row (`INSERT 0 0` — `ON CONFLICT DO NOTHING` fired).

## 4. Acceptance criteria — all PASS

| AC | Check | Result |
|----|-------|--------|
| AC-1 | `\dt` lists all 15 application tables | **PASS** |
| AC-2 | `\di` lists all 11 indexes from arch §3 (incl. both GIST) | **PASS** |
| AC-3 | `\dx` lists postgis, pgcrypto, pg_trgm | **PASS** |
| AC-4 | Re-apply exits 0, no "already exists" errors, tables/indexes unchanged | **PASS** (see §5) |
| AC-5 | `SELECT version FROM schema_migrations;` returns `001` | **PASS** |
| AC-6 | PostGIS + pgcrypto spot-check insert on `projects` | **PASS** (see §6) |
| AC-7 | `pg_trgm.similarity('Katingan Peatland','Katingan Peatlands')` returns a score | **PASS** → `0.85` |

## 5. Idempotence re-run — PASS

```
sudo -u postgres psql -d karbonlens --single-transaction -f /tmp/001_init.sql
# Exit 0
# Output: 3 × "extension already exists, skipping"
#         15 × "relation <table> already exists, skipping"
#         11 × "relation <index> already exists, skipping"
#         GRANT × 2, ALTER TABLE × 15, GRANT × 2
#         INSERT 0 0   ← ON CONFLICT DO NOTHING fired (no duplicate bookkeeping row)
```

After re-run: `SELECT COUNT(*) FROM schema_migrations;` → `1`. `\dt` still shows the same 15 app tables. AC-4 satisfied (including every `CREATE INDEX IF NOT EXISTS` — the GIST indexes `idx_projects_centroid` and `idx_sat_location` were both in the "already exists, skipping" set).

## 6. Spot-checks (all as `karbonlens` role via PGPASSWORD + `-h localhost`)

### Connection credentials (AC bridge requirement)

```
PGPASSWORD=… psql -U karbonlens -h localhost -d karbonlens \
  -c "SELECT COUNT(*) FROM projects;"
 count
-------
     0
```

Confirms the app role authenticates over TCP with scram-sha-256 (per T01) and can read every table it now owns.

### AC-6 — PostGIS round-trip

```
INSERT INTO projects (slug, name_canonical, centroid)
  VALUES ('test-katingan', 'Test Katingan',
          ST_SetSRID(ST_MakePoint(113.5, -2.0), 4326)::geography);
→ INSERT 0 1
SELECT slug, name_canonical, ST_AsText(centroid::geometry) FROM projects WHERE slug='test-katingan';
→ test-katingan | Test Katingan | POINT(113.5 -2)
DELETE FROM projects WHERE slug='test-katingan';
→ DELETE 1
```

Point round-trips cleanly, `gen_random_uuid()` default fired (pgcrypto), delete succeeds.

### Generated column — `total_vcus_available`

```
INSERT INTO projects (slug, name_canonical, total_vcus_issued, total_vcus_retired)
  VALUES ('test-vcu', 'Test VCU', 1000, 300) RETURNING total_vcus_available;
→ 700
DELETE FROM projects WHERE slug='test-vcu';
→ DELETE 1
```

`GENERATED ALWAYS AS (total_vcus_issued - total_vcus_retired) STORED` evaluates correctly.

### AC-7 — pg_trgm

```
SELECT similarity('Katingan Peatland', 'Katingan Peatlands');
→ 0.85
```

## 7. Ownership verification — all 15 application tables owned by `karbonlens`

```
 tablename             | tableowner
-----------------------+------------
 schema_migrations     | karbonlens
 projects              | karbonlens
 registries            | karbonlens
 issuances             | karbonlens
 retirements           | karbonlens
 idx_monthly_snapshots | karbonlens
 satellite_alerts      | karbonlens
 regulatory_events     | karbonlens
 project_scores        | karbonlens
 project_match_queue   | karbonlens
 users                 | karbonlens
 accounts              | karbonlens
 sessions              | karbonlens
 verification_tokens   | karbonlens
 notifications         | karbonlens
 (spatial_ref_sys      | postgres)   ← PostGIS extension table, expected
```

Every index inherits ownership from its table — all 32 non-PostGIS indexes owned by `karbonlens`.

A future `ALTER TABLE projects ADD COLUMN gfw_geostore_id TEXT` (T07's migration 002) run as `karbonlens` will succeed because `karbonlens` now owns the `projects` table.

## 8. Deviations from spec

None. All 7 sign-off conditions in `docs/stories/reviews/T02-spec-audit.md` §Sign-Off were already resolved in the audited spec, and the implementation matches the revised spec line-for-line.

Two mechanical notes:

1. The migration file lives at `scrapers/migrations/001_init.sql` (inside the repo). The apply command reads from `/tmp/001_init.sql` because the worktree path `/root/.openclaw/workspace/karbonlens-worktrees/T02/…` is not readable by the `postgres` OS user (the `/root` directory is `0700` for user `root`). This matches the spec's intended deploy flow, which copies the file to `/opt/karbonlens/migrations/` before applying. Copying to `/tmp` is the dev-box equivalent.
2. A `scrapers/migrations/.gitkeep` file was not created — the story says "only if directory not yet committed" and `scrapers/` is already tracked in the repo (shipped empty by T03). Adding `001_init.sql` to it is sufficient to keep the migrations subdirectory in git.

## 9. What the code-auditor should scrutinise

1. **The `ALTER TABLE … OWNER TO karbonlens` block at the bottom of `001_init.sql`.** Confirm every one of the 15 tables listed in the spec (schema_migrations + 14 app tables) has an explicit `ALTER TABLE` line. The blanket `GRANT ALL ON ALL TABLES IN SCHEMA public TO karbonlens` below it is a safety net, not a substitute for ownership — grants let karbonlens INSERT/SELECT/UPDATE, but only the **owner** can ALTER. T07's `002_add_geostore.sql` must be able to `ALTER TABLE projects` as the karbonlens role.
2. **`spatial_ref_sys` ownership.** This table belongs to the PostGIS extension, was installed by `sudo -u postgres psql … CREATE EXTENSION postgis` during T01 (see T01 report §9 note 2), and is correctly left owned by `postgres`. It is **not** one of the 15 tables in the story. Attempting to transfer its ownership would be a scope violation and probably break the extension on upgrade. Expected behaviour.
3. **`CREATE INDEX IF NOT EXISTS` on both GIST indexes.** Spec audit B-03 specifically flagged this risk (`idx_projects_centroid` and `idx_sat_location` using `USING GIST`). Confirm both carry `IF NOT EXISTS`; the idempotence re-run output above shows both emitted "relation already exists, skipping" on second apply — proof the guard is in place.
4. **Generated column `total_vcus_available`.** DDL preserves the architecture §3 spelling verbatim (`NUMERIC GENERATED ALWAYS AS (total_vcus_issued - total_vcus_retired) STORED`). T04 must handle this specially — this migration does not; that's correct per spec.
5. **No `BEGIN`/`COMMIT` in the SQL.** The file relies on `psql --single-transaction` for atomicity, per spec §5. A future hand-apply that omits `--single-transaction` would still be idempotent (every CREATE uses `IF NOT EXISTS`) but a mid-file failure would leave a partial state and no bookkeeping row. Acceptable tradeoff; spec explicitly chose this.
6. **Auth field-naming contract.** SQL column names are snake_case (`email_verified`, `user_id`, `provider_account_id`, `session_token`). Every one of these is listed in the spec's §6 bridge table with the exact camelCase Drizzle field name T04 must use. Confirm no typos.
7. **`pg_hba.conf` trust-line ordering.** Not a T02 concern directly, but every `PGPASSWORD=…` psql call in §6 relied on T01's scram-sha-256 line appearing **before** the multi-tenant `host all all 127.0.0.1/32 trust` line. T01 report §6 explains the fix. If a later edit moves those lines around, the spot-check authentication evidence in this report becomes meaningless. Flag for the cross-story audit, not this one.

## 10. Follow-ups (none blocking)

- **F1** — `/root/.openclaw/workspace/karbonlens-worktrees/…` is not readable by the `postgres` OS user. Future migrations should be staged via `/tmp` or `/opt/karbonlens/migrations/` on the real VPS (the spec already prescribes `/opt/karbonlens/migrations/`). Noted only because this implementation applied via `/tmp` on the dev box.
- **F2** — No explicit sequences exist (every primary key uses `gen_random_uuid()`), so `GRANT ALL ON ALL SEQUENCES` is currently a no-op. If a future table uses `BIGSERIAL`/`IDENTITY`, the grant is already in place — no action needed, but worth noting so a reviewer doesn't think it's dead code.
