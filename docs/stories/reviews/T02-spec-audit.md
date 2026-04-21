---
audit_id: T02-spec-audit
story: T02-schema-migration-001.md
auditor: adversarial-spec-auditor
audit_date: 2026-04-19
verdict: FAIL
blocking_findings: 7
---

# T02 — Schema Migration 001: Adversarial Spec Audit

## Summary

T02 is a well-structured spec with thorough narrative, good idempotence language, and a clear dependency model. However it contains **7 blocking defects** that would cause either runtime failures, silent data loss, or incompatibility with the adapter that T05 depends on. The most critical are: the `users` table is missing `emailVerified TIMESTAMPTZ`, the apply command runs as `postgres` instead of `karbonlens` causing ownership problems for subsequent scraper `ALTER TABLE` operations, and there is no `IF NOT EXISTS` guard on any of the four BTree indexes in the story text (the spec mandates idempotence as "non-negotiable" but the DDL section does not show `IF NOT EXISTS` on the index statements). There are also meaningful cross-story concerns for T04 and T05.

---

## Blocking Findings

### B-01 — `users.emailVerified` is missing (NextAuth v5 DrizzleAdapter compat)

**Location:** §3 Scope → table list, §4 AC-6, §9 OQ-1 (absent)

The `@auth/drizzle-adapter` v5 requires a column `emailVerified TIMESTAMPTZ` (camelCase at the Drizzle field layer, snake_case column name `email_verified` acceptable if the field is named `emailVerified` in the TypeScript schema). The architecture §3 `users` DDL does **not** include this column. Google OAuth always supplies an email-verified timestamp and the adapter will attempt to write it. Without the column, every first-login attempt will throw a Postgres `column "emailVerified" does not exist` error, blocking all authentication (T05 is entirely gated on this).

T05 §9 OQ-1 explicitly surfaces this as a High-risk gap and says "Action: add `email_verified TIMESTAMPTZ` to the users table in a new migration 001 amendment or migration 002 before this story is implemented." T02 must resolve this gap — it is the correct vehicle because the tables are not yet deployed at the time T02 is written.

**Required fix:** Add `email_verified TIMESTAMPTZ` to `users` in `001_init.sql` and update `architecture.md` §3 to match. The column is nullable (Google OAuth sets it; email/password providers may not — even though email/password is out of scope for v0.1, leaving it nullable costs nothing and avoids a migration later). Also update AC-2 in T05 to verify the column is populated after login.

**Cross-story action:** Amend `docs/architecture.md` §3 `users` table. Notify T04 that `lib/schema.ts` must expose `emailVerified: timestamp('email_verified', { withTimezone: true })`.

---

### B-02 — Apply command runs as `postgres`; tables will be owned by `postgres`, not `karbonlens`

**Location:** §5 Apply command, §2 Context (target host)

The spec prescribes:
```bash
sudo -u postgres psql -d karbonlens -f /opt/karbonlens/migrations/001_init.sql
```
When a `CREATE TABLE` is executed by the `postgres` superuser, the table is owned by `postgres`. The scraper user `karbonlens` needs to `INSERT`, `UPDATE`, and `SELECT` on all tables — but it does **not** need `ALTER TABLE` on application tables, so ownership by `postgres` is not a blocker for DML. However:

1. T07 adds `gfw_geostore_id` via `ALTER TABLE projects ADD COLUMN` in `002_add_geostore.sql`. If the T07 implementer follows the same pattern and runs as `postgres`, this works; but if they run as `karbonlens`, `ALTER TABLE` will fail because `karbonlens` does not own the table.
2. The spec says "Scrapers connect as `karbonlens`" — but provides no `GRANT ALL ON ALL TABLES` anywhere in the migration. If tables are owned by `postgres` and there are no grants, the `karbonlens` role can only access tables that `postgres` explicitly grants. The spec is silent on this.

**Required fix:** Choose one of:
- (Preferred) Run the migration as the `karbonlens` role (`sudo -u postgres psql -U karbonlens -d karbonlens -f ...`) so tables are owned by `karbonlens`. This matches the database being owned by `karbonlens` (per T01).
- (Alternative) Keep running as `postgres` but add to the migration: `GRANT ALL ON ALL TABLES IN SCHEMA public TO karbonlens; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO karbonlens;` and `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO karbonlens;`.

The spec must be explicit. Currently it is neither.

---

### B-03 — `CREATE INDEX IF NOT EXISTS` not verified for all indexes; idempotence claim is not bulletproof

**Location:** §2 Key constraints ("Idempotence is non-negotiable"), §4 AC-4, §3 Scope

The spec asserts idempotence as a hard requirement and says "Every object must use `IF NOT EXISTS`". However:

1. The spec does not show any DDL inline — it delegates construction to the implementer. The only formal DDL reference is to `architecture.md` §3, which shows bare `CREATE INDEX` statements (no `IF NOT EXISTS`). Postgres 9.5+ supports `CREATE INDEX IF NOT EXISTS` but many implementers copy the architecture DDL verbatim and miss the guard.
2. AC-4 validates idempotence by re-running the file, but does not enumerate which index names must be guarded. Without explicit DDL in the spec or an explicit requirement that every `CREATE INDEX` include `IF NOT EXISTS`, the implementer may miss it.
3. The GIST indexes (`idx_projects_centroid`, `idx_sat_location`) are the most likely to be forgotten because they use `USING GIST` syntax and implementers may not know the `IF NOT EXISTS` form works for those too.

**Required fix:** The spec must either (a) include the actual DDL inline (strongly preferred for a migration spec), or (b) explicitly list every index name with a statement that each must use `CREATE INDEX IF NOT EXISTS`. The acceptance criteria for AC-4 should include a post-re-run `\di` check to verify index count, not just table count.

---

### B-04 — `schema_migrations` table must be created before any other table; spec ordering is ambiguous

**Location:** §3 Scope ordering list

The scope lists `schema_migrations` as created "first, so later tables can reference it in comments." This is informal. More critically: if the migration fails partway through (E4 edge case), the `schema_migrations` INSERT at the bottom will not execute, leaving no record of partial application. This is the correct behavior for bookkeeping, but the spec does not address the converse: on re-run, `schema_migrations` is created `IF NOT EXISTS` (fine), then all tables are created `IF NOT EXISTS` (fine), then the INSERT with `ON CONFLICT DO NOTHING` fires (fine). This loop is actually correct as described.

However, the spec says "create `schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())` at the top if not exists" but this phrasing appears in TASKS.md §T02, not in the story itself. The T02 story spec does not spell out the `schema_migrations` DDL columns. An implementer reading only T02 must infer the schema from TASKS.md.

**Required fix:** The T02 story must explicitly state the `schema_migrations` DDL:
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);
```
Do not rely on TASKS.md for schema details not repeated in the story.

---

### B-05 — Table count mismatch: §3 says 14 tables but AC-1 says 15

**Location:** §3 Scope ("All 14 application tables"), §4 AC-1 ("exactly 15 tables")

Section 3 says "All 14 application tables from `docs/architecture.md` §3" and lists 14 items (projects through notifications). AC-1 says "lists exactly 15 tables" — the 15th is `schema_migrations`. This inconsistency is confusing. An implementer relying on §3's count of 14 might not include `schema_migrations` in the formal dependency-ordered list.

**Required fix:** Either:
- §3 lists all 15 tables (including `schema_migrations` as item 0 or a preamble entry), or
- §3 explicitly says "14 application tables + `schema_migrations` = 15 total."

Both AC-1 and the scope section must agree on the count and list the same tables.

---

### B-06 — `accounts` table is missing `refresh_token_expires_in` column required by some NextAuth providers

**Location:** §3 Scope → `accounts` table, cross-ref T05 §9 OQ-1

The `@auth/drizzle-adapter` documentation includes `refresh_token_expires_in` as an optional column on `accounts`. For the Google provider specifically, the token response may include `refresh_token_expires_in` (an integer, seconds until refresh token expiry). The adapter writes whatever columns are present in the schema definition — columns that don't exist in the Drizzle schema are silently dropped on insert. However, losing this value means silent data loss on every login.

More critically: T05 §9 OQ-1 raises the `providerAccountId` vs `provider_account_id` naming concern. The architecture §3 SQL uses `provider_account_id` (snake_case). The Drizzle adapter reads the TypeScript *field name*, not the SQL column name. If T04's `lib/schema.ts` defines the field as `provider_account_id` (snake_case) instead of `providerAccountId` (camelCase), the adapter will not find it and will fail at runtime. This naming contract must be locked in T02's spec so T04 implements it correctly.

**Required fix:** T02 must add a note (or explicit column comment in the DDL) documenting the column-naming contract for all auth tables:

| SQL column | Required Drizzle field name (T04) |
|---|---|
| `user_id` | `userId` |
| `provider_account_id` | `providerAccountId` |
| `session_token` | `sessionToken` |
| `email_verified` (new, B-01) | `emailVerified` |

These are not T04 concerns alone — T02 writes the SQL, T04 mirrors it. If T02's column names are correct but the field naming contract is undocumented, the risk falls entirely on T04 to get right without explicit guidance. T02 should document this bridge.

---

### B-07 — `total_vcus_available` generated column: Drizzle cross-story concern is not adequately flagged

**Location:** §7 E5, §3 Scope

E5 correctly notes that `GENERATED ALWAYS AS (...) STORED` requires Postgres 12+ (fine). But it does not flag the Drizzle incompatibility in sufficient detail for T04's implementer. Drizzle's `generatedAlwaysAs()` API was introduced in drizzle-orm 0.30.0 and has known issues: it requires a `sql` template literal, and introspection does not round-trip generated columns reliably. More importantly: if T04 omits `total_vcus_available` from `lib/schema.ts` entirely (the simpler workaround), queries using `db.select().from(projects)` will not include `total_vcus_available` in the result type, forcing every caller to use a raw `sql` tag. This affects T11, T12, and the scoring job.

This is only a "blocking" finding because T02's spec says "If architecture §3 and this story conflict, §3 wins; update this story to match." Architecture §3 includes the generated column. T02 must either:
- Formally flag that T04 must handle this column specially and specify the agreed approach (omit-and-use-sql vs generatedAlwaysAs), or
- Defer to T04's OQ-1 but cross-reference it explicitly so T04 does not miss it.

Currently T02 mentions this only in E5 with "Do not backport to older Postgres" — which is irrelevant to the actual risk — without flagging the Drizzle representation problem at all.

**Required fix:** Add to §9 Open Questions: "OQ-3 — Drizzle representation of `total_vcus_available` generated column: T04 must decide between `generatedAlwaysAs()` (if supported by installed drizzle-orm version) or omitting the column and using raw SQL. T02 does not need to change its DDL, but must document this as a T04 dependency."

---

## Non-Blocking Suggestions

### N-01 — Apply command should include `set -e` / transaction wrapping recommendation

The spec notes (E4) that `psql -f` is not wrapped in a single transaction by default and a connection drop leaves partial state. The fix is to prepend `BEGIN;` and append `COMMIT;` to the migration file, or to call `psql --single-transaction`. For a migration spec that calls idempotence "non-negotiable," not recommending `--single-transaction` is an oversight. Add to §5 Apply command: `sudo -u postgres psql --single-transaction -d karbonlens -f ...`.

### N-02 — AC-2 indexes list is incomplete

AC-2 lists 11 indexes by name but architecture §3 has 11 total (`idx_projects_province`, `idx_projects_type`, `idx_projects_status`, `idx_projects_centroid`, `idx_registries_project`, `idx_issuances_project_vintage`, `idx_retirements_project_date`, `idx_sat_project_date`, `idx_sat_location`, `idx_notifications_user_read`, `idx_notifications_user_created`). The count matches, so this is a consistency check: verify no index from architecture §3 is missing from the AC-2 list. On visual inspection all 11 are present. No change needed — confirmed OK.

### N-03 — OQ-2 (`pg_trgm` OS package) should be a blocking pre-condition, not an open question

`pg_trgm` is in T01's scope (T01 §3 In scope lists `pg_trgm` explicitly). OQ-2 in T02 asks whether T01's AC should verify pg_trgm availability. This has already been resolved by T01's spec. T02 should simply state: "T01 installs `pg_trgm` via `postgresql-16-contrib`. This migration's `CREATE EXTENSION IF NOT EXISTS pg_trgm` will succeed if T01 is complete." Close OQ-2.

### N-04 — `project_scores` has no explicit `IF NOT EXISTS` guard concern for composite PK

`project_scores` uses `PRIMARY KEY (project_id, score_date)` — a composite primary key. This means there is no UUID primary key column. The `CREATE TABLE IF NOT EXISTS` guard handles idempotence correctly, but the spec does not note this intentional divergence from the "UUID PRIMARY KEY DEFAULT gen_random_uuid()" pattern used by all other tables. A passing mention in §7 edge cases would help T04's implementer know to handle this table differently in `lib/schema.ts`.

### N-05 — `idx_monthly_snapshots` has no foreign key; spec should confirm this is intentional

`idx_monthly_snapshots` has no foreign key to any project. This is correct per architecture §3 (it's aggregate market data, not per-project), but it's worth a one-line acknowledgment in §7 to prevent a future implementer from thinking it's a bug.

### N-06 — `project_match_queue` FK columns have no explicit cascade policy

`candidate_a_id` and `candidate_b_id` reference `projects(id)` with no `ON DELETE` clause. The spec §9 OQ-1 documents cascade policies for many tables but omits `project_match_queue`. Architecture §3 also shows no `ON DELETE` clause for these columns, meaning Postgres defaults to `ON DELETE RESTRICT`. This means: deleting a project that is in the match queue will fail with a FK violation. Depending on the entity resolution workflow, this may be intentional (force review before delete) or an oversight. Recommend adding to OQ-1 table.

### N-07 — `accounts.expires_at BIGINT` vs NextAuth adapter expectation

The adapter may use `expires_at` as either a Unix timestamp (integer seconds) or a Date object depending on version. T04's §7 (iv) correctly handles this, but T02 should cross-reference T04's note so the DDL choice is traceable.

---

## Cross-Story Issues

### X-01 — `emailVerified` gap: T02 must amend before T05 is implementable

**Stories affected:** T02 (source), T04 (schema), T05 (runtime failure)

**Action required in T02:** Add `email_verified TIMESTAMPTZ` to the `users` DDL in `001_init.sql`. Update architecture §3 simultaneously. This is the highest-priority cross-story fix in the sprint — without it, T05 cannot pass AC-1 (Google OAuth round-trip).

### X-02 — Auth table field-naming contract must be documented in T02 for T04

**Stories affected:** T02 (SQL contract owner), T04 (schema mirror)

**Action required in T02:** Add a table in §6 Dependencies (or §9 OQ) documenting the camelCase Drizzle field names required for each snake_case SQL column in the auth tables. T04's implementer currently must deduce this from the adapter source.

### X-03 — `gfw_geostore_id` absence: confirm T07's migration 002 pattern is set up correctly

**Stories affected:** T02 (table owner), T07 (adds column)

T02 correctly excludes `gfw_geostore_id` (§3 Out of scope). T07 adds it via `002_add_geostore.sql`. However T02 does not mention the `ALTER TABLE` ownership issue: if tables are owned by `postgres` (see B-02), T07's `002_add_geostore.sql` must also run as `postgres` (or grants must exist). This is another symptom of B-02 being unresolved.

### X-04 — T01 already installs `pg_trgm`; T02 should not create a dependency ambiguity

**Stories affected:** T01 (installs extension), T02 (issues `CREATE EXTENSION IF NOT EXISTS pg_trgm`)

T01 explicitly installs `pg_trgm` in the database at provisioning time. T02's `CREATE EXTENSION IF NOT EXISTS pg_trgm` is therefore a safe no-op in the normal flow, but OQ-2 in T02 implies uncertainty about whether T01 does this. This is resolved: T01 does. Close OQ-2 and add a confirming note.

### X-05 — T04's `generatedAlwaysAs()` risk traced back to T02

**Stories affected:** T02 (DDL owner), T04 (schema mirror), T11/T12/T09 (read `total_vcus_available`)

T04 §7 (vi) flags this but leaves it to "check at implementation time." T02 should pre-empt by documenting the agreed approach. If the installed drizzle-orm version (from T03's `npm i drizzle-orm`) does not support `generatedAlwaysAs()`, T04 will silently omit the column, and T11/T12 server components that try to read `project.total_vcus_available` will get `undefined`. Recommend T02 specify: "T04 must read `total_vcus_available` via `sql\`"total_vcus_available"\`` in select queries if `generatedAlwaysAs()` is unavailable; T11/T12 must not assume the field appears in Drizzle's inferred row type."

---

## Proposed Spec Edits (Minimal, Target T02 Only)

1. **§3 Scope / Users table DDL** — add `email_verified TIMESTAMPTZ` to the users table definition (and update architecture §3 §3 simultaneously — this is a required companion edit).

2. **§5 Apply command** — change to run as `karbonlens` user (or add explicit `GRANT ALL ON ALL TABLES/SEQUENCES` to migration body):
   ```bash
   sudo -u postgres psql -U karbonlens -d karbonlens --single-transaction \
     -f /opt/karbonlens/migrations/001_init.sql
   ```
   Add `--single-transaction` for atomicity.

3. **§3 Scope** — change "All 14 application tables" to "All 15 tables (14 application + `schema_migrations`)". Include `schema_migrations` DDL inline.

4. **§9 Open questions** — close OQ-2 (pg_trgm is handled by T01). Add:
   - OQ-3: Drizzle `generatedAlwaysAs()` — document agreed approach for T04.
   - OQ-4 (new): Auth table field-naming contract — list camelCase field names T04 must use for snake_case SQL columns.

5. **§7 Edge cases** — add E6: "Re-running on a DB where tables exist with wrong column types (e.g. `users` missing `email_verified`) will silently skip. If migration 001 is being amended post-deployment to add `email_verified`, a separate `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified TIMESTAMPTZ;` must be issued manually."

6. **§9 OQ-1** (FK policies) — add `project_match_queue.candidate_a_id` and `candidate_b_id` with their cascade policy (currently RESTRICT by default; confirm intentional).

---

## Sign-Off Conditions

T02 may advance to implementation only after all of the following are resolved:

- [ ] `users.email_verified TIMESTAMPTZ` column added to `001_init.sql` DDL and `architecture.md` §3.
- [ ] Apply command corrected: either run as `karbonlens` role or add `GRANT ALL ON ALL TABLES` to migration.
- [ ] `--single-transaction` added to the apply command.
- [ ] Table count in §3 and AC-1 reconciled to 15, with `schema_migrations` DDL written explicitly in the spec.
- [ ] Auth table camelCase field-naming contract documented (OQ-4 or §6).
- [ ] Drizzle generated-column approach documented (OQ-3).
- [ ] Andy decision on `project_match_queue` FK cascade policy.

Andy must also confirm: amend migration 001 for `email_verified` (preferred, since database is not yet deployed) vs create migration 002. If deployed, create 002 — but since T02 is status: draft and T01 is also status: todo, amending 001 is the correct path.
