---
audit_of: T04
title: Adversarial spec audit — Drizzle schema + DB client + env plumbing
auditor: adversarial-spec-auditor
date: 2026-04-19
verdict: CONDITIONAL PASS
blocking_findings: 3
advisory_findings: 9
---

# T04 Spec Audit — Adversarial Review

## Verdict

**CONDITIONAL PASS.** The spec is substantially well-written. Three findings are **blocking** (they will cause a broken build or runtime failure if not resolved before implementation). Nine are advisory. The most dangerous issue is the `emailVerified` column gap cascading from T02 into T04's schema — the spec acknowledges it but leaves it unresolved, which is insufficient for an implementer who must ship working code.

---

## Findings

### F01 — BLOCKING: `emailVerified` column missing from `users` table; T04 schema cannot declare it

**Severity:** Blocking  
**Source:** T04 §5 (type mapping table), T05 OQ-1, architecture §3

The `@auth/drizzle-adapter` v5 expects a `emailVerified` field (mapped to an `email_verified TIMESTAMPTZ` SQL column) on the `users` table. Architecture §3 does not define this column. T02 (which mechanically transcribes §3) will therefore not create it. T04 inherits the same gap: if the implementer faithfully mirrors the SQL schema into Drizzle TypeScript, there is no `emailVerified` column to define. If the implementer adds it to `lib/schema.ts` without a corresponding SQL column, the TypeScript will compile but the adapter will throw a runtime column-not-found error on first login.

T05 OQ-1 flags this as **High Risk** and says "add `email_verified TIMESTAMPTZ` to the users table in a new migration 001 amendment or migration 002 before this story is implemented." That is the correct fix, but T04's spec does not mention it or cross-reference T05 OQ-1. An implementer working only from T04 will produce a broken schema.

**Required action:** T04 spec must explicitly state: (a) the `emailVerified timestamptz` column must exist in SQL before T04 finalises `lib/schema.ts`; (b) if migration 001 has not yet been applied to the VPS, amend it; if already applied, create `002_add_email_verified.sql`; (c) T04's Drizzle definition for `users` must include `emailVerified: timestamp('email_verified', { withTimezone: true })`. This must be resolved before T04 implementation begins, not left to the T05 implementer to discover at runtime.

---

### F02 — BLOCKING: `generatedAlwaysAs()` guidance is non-committal; implementer has no clear path

**Severity:** Blocking  
**Source:** T04 §5 (type mapping table, row for `NUMERIC GENERATED ALWAYS AS ... STORED`), §7 edge case (vi)

The spec says: "Check Drizzle docs for `generatedAlwaysAs()` support at implementation time. If not, simply omit this column from inserts/updates and read it explicitly with `sql<string>\`total_vcus_available\`` in select queries."

As of Drizzle ORM v0.30+, `generatedAlwaysAs()` is available for Postgres. However, Drizzle's insert type inference will include the column in the insertable type unless it is explicitly marked `.generatedAlwaysAs(sql\`...\`)` or omitted from the table definition. The spec's fallback ("simply omit") is too vague: if the column is omitted entirely, select queries that reference `schema.projects.totalVcusAvailable` will fail to type-check. If it is included without `generatedAlwaysAs()`, Drizzle allows inserts into a column Postgres will reject.

**Required action:** The spec must pick one approach and commit to it: either use `generatedAlwaysAs(sql\`total_vcus_issued - total_vcus_retired\`, { mode: 'stored' })` with a comment explaining it is read-only, or declare the column as a virtual/computed select-only alias via `sql<string>\`total_vcus_available\``. Leaving the choice to the implementer at runtime creates schema drift risk.

---

### F03 — BLOCKING: `.env.example` dual-ownership with T03 is unresolved at write level

**Severity:** Blocking  
**Source:** T04 §3 (scope item 5), T03 §3 (scope item 7), T03 §5 (outputs)

T03 commits `.env.example` with `DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens` already present (T03 scope item 7 and AC-4 verification confirm this). T04 scope item 5 says: "confirm `DATABASE_URL` key is present with the `localhost` placeholder. Append only — do not remove keys added by T03."

If `DATABASE_URL` is already in T03's `.env.example`, T04's action is a no-op for that key. But the spec says "Append only" without defining what is actually appended. T04 must state clearly: "If `DATABASE_URL` is already present from T03, no change to `.env.example` is required for this key. The only `.env.example` change owned by T04 is the `DATABASE_URL` key; if T03 omitted it for any reason, T04 adds it." As written, an implementer following instructions literally may attempt an append of a duplicate key, or be confused about what the deliverable is.

T05 also adds four keys to `.env.example`. Three tasks touch the same file sequentially — the ownership model is clear (append-only), but the redundancy of T04's responsibility is not acknowledged. The Definition of Done (§8) lists "`.env.example` contains `DATABASE_URL=...`" as a checkbox — which will always pass since T03 already puts it there. This is a false coverage signal.

**Required action:** Revise scope item 5 and the §8 DoD checkbox to be explicit: "Verify `DATABASE_URL` is present in `.env.example` (added by T03). If absent, append it. No other `.env.example` changes in this task."

---

### F04 — ADVISORY: PostGIS `customType` return type is `string` — but return shape is ambiguous

**Severity:** Advisory  
**Source:** T04 §5 (PostGIS custom type pattern), AC-4

The spec defines `customType<{ data: string }>` and AC-4 asserts "those columns have an explicit TypeScript type (string for raw WKT/GeoJSON)." The parenthetical is ambiguous: will a plain `SELECT location FROM satellite_alerts` return WKB hex (Postgres default), WKT, or GeoJSON? The answer is WKB hex — not WKT, not GeoJSON. Downstream tasks (T07 reading `satellite_alerts.location`, T12 rendering a project detail map) will need to handle WKB hex unless they explicitly call `ST_AsGeoJSON()` or `ST_AsText()`. The spec does mention using `sql` tag for reads, but AC-4 calls the type "string for raw WKT/GeoJSON" — this is misleading because bare selects return WKB hex.

**Required action (advisory):** Amend AC-4 to say "string containing raw WKB hex; consumers must call `ST_AsGeoJSON()` or `ST_AsText()` via `sql` tag to obtain human-readable geometry." Add a code comment to the `geography` customType explaining this.

---

### F05 — ADVISORY: `bigint({ mode: 'number' })` caveat documented but adapter compatibility deferred

**Severity:** Advisory  
**Source:** T04 §5 (BIGINT row), §7 edge case (iv)

The spec correctly documents the precision caveat and notes: "If NextAuth v5's DrizzleAdapter expects `BigInt` mode, switch to `{ mode: 'bigint' }` — check the adapter source at implementation time." The adapter source (`@auth/drizzle-adapter` v5 as of early 2026) does in fact expect `expires_at` to be a JS `number` in the `accounts` table, so `mode: 'number'` is likely correct. However, leaving this as "check at implementation time" without pinning the adapter version means the spec is not verifiable. If the adapter version changes between when T03 installs it and when T04 implements, behavior could differ.

**Required action (advisory):** Pin the `@auth/drizzle-adapter` version in T03's install command, or at minimum note the version that was current when the spec was written so the T04 implementer has a reference baseline.

---

### F06 — ADVISORY: DB connection pool `max: 10` inappropriate for Netlify production (acknowledged but not noted in code)

**Severity:** Advisory  
**Source:** T04 §7 edge case (i), §3 Out of scope

The spec correctly states Netlify is out of scope for v0.1 and the pool of 10 is fine for local dev. However, the code snippet in §7:

```typescript
const client = postgres(connectionString, { max: 10 });
```

has no comment explaining why `max: 10` was chosen or that it must be reconsidered before Netlify deployment. When v0.2 arrives and someone copy-pastes this into a production deploy, the absence of a warning comment creates a latent `max_connections` exhaustion risk.

**Required action (advisory):** Add an inline comment to the `postgres(connectionString, { max: 10 })` line: `// max: 10 is appropriate for local dev / single-process VPS. Reduce to 2–3 if deploying to serverless (Netlify, Vercel) to avoid exhausting Postgres max_connections.`

---

### F07 — ADVISORY: Health endpoint leaks error message to unauthenticated callers

**Severity:** Advisory  
**Source:** T04 §4 AC-2, §3 scope item 4

AC-2 requires the 503 body to contain `"error"` with "a non-empty string message." For v0.1 local dev this is acceptable and useful for debugging. However, the spec does not note that the raw exception message (which may include the connection string, hostname, or Postgres version) should not be exposed verbatim. The implementer may simply do `error: err.message` which could include sensitive connection details.

**Required action (advisory):** Specify in AC-2 or §7 that the `error` field must contain a sanitised message (e.g., `"Database connection failed"`) rather than the raw `err.message`. Note this as a v0.1 acceptable shortcut only if running in non-production, and add a TODO comment for v0.2.

---

### F08 — ADVISORY: `drizzle.config.ts` justification is thin

**Severity:** Advisory  
**Source:** T04 §3 scope item 3, §9 OQ note

The spec includes `drizzle.config.ts` as a deliverable with the explanation: "Used for `drizzle-kit introspect` to validate round-trips; not used for migrations in v0.1." AC-7 is marked advisory and does not block sign-off. This is acceptable reasoning, but the file adds surface area (a config pointing at a live DB with `DATABASE_URL`) that could mislead future maintainers into running `drizzle-kit generate` or `drizzle-kit push` when migrations are supposed to be SQL-file-only.

**Required action (advisory):** Add a prominent comment at the top of `drizzle.config.ts`: `// READ-ONLY in v0.1. Do NOT run drizzle-kit generate or migrate — migrations are applied via psql. Use: npx drizzle-kit introspect (advisory only).`

---

### F09 — ADVISORY: `schema_migrations` Drizzle definition is incomplete relative to T02's DDL

**Severity:** Advisory  
**Source:** T04 §7 edge case (vii), T02 §3

T04 §7(vii) specifies `appliedAt` with `defaultNow()` but T02 defines `schema_migrations` as `(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`. The Drizzle definition matches, but the column name uses `appliedAt` (camelCase TS) mapping to `applied_at` (SQL) which is correct Drizzle convention. This is fine. However, T02's schema_migrations is included in T02's table count (it lists 15 tables including schema_migrations in AC-1). T04 §5 says "15 tables including `schema_migrations`." Both agree — no drift here, but worth confirming the implementer does not skip schema_migrations in lib/schema.ts since it is a bookkeeping table that no query layer typically touches.

**Status:** No action required. Confirmed consistent.

---

### F10 — ADVISORY: `verification_tokens` composite PK mapping not fully specified

**Severity:** Advisory  
**Source:** T04 §5 (type mapping table, last row)

The type mapping table says: `TEXT PRIMARY KEY (verification_tokens) → text('identifier').notNull() + composite PK`. The word "composite" is correct — the SQL is `PRIMARY KEY (identifier, token)` — but the spec does not show the Drizzle syntax for declaring it. Drizzle v0.x uses `primaryKey({ columns: [t.identifier, t.token] })` in the table callback. An implementer unfamiliar with Drizzle composite PKs may default to adding `.primaryKey()` on just `identifier`, which would create a wrong schema (single-column PK instead of composite) and break the adapter's token lookup.

**Required action (advisory):** Add the composite PK Drizzle snippet to the type mapping table or the PostGIS pattern section:
```typescript
export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }));
```

---

### F11 — ADVISORY: `project_scores` composite PK not mentioned in type mapping

**Severity:** Advisory  
**Source:** T04 §5, architecture §3

`project_scores` has `PRIMARY KEY (project_id, score_date)` in SQL. Like `verification_tokens`, the spec's type mapping table does not show the Drizzle composite PK syntax for this table. Same risk as F10 — an implementer may add a separate `id` UUID column or place `.primaryKey()` on `project_id` only.

**Required action (advisory):** Add the composite PK pattern for `project_scores` to the spec, similar to the fix recommended in F10.

---

### F12 — ADVISORY: Acceptance criteria AC-5 and AC-6 both test `lib/db.ts` import but neither specifies the module entry path

**Severity:** Advisory (testability)  
**Source:** T04 §4 AC-5, AC-6

AC-5 says "a throwaway server component or route that imports `{db}` from `'lib/db'`". In a Next.js 15 project with `tsconfig.json` path aliases, the import path is typically `@/lib/db` not `lib/db`. If the implementer uses `@/lib/db` (the idiomatic Next.js path) and the AC says `lib/db`, the AC test script will fail even though the implementation is correct. AC-6 has the same issue — it says "any module that imports from `'lib/db'`."

**Required action (advisory):** Normalise all import paths in ACs to use the actual tsconfig alias (`@/lib/db`) or note both forms.

---

## Cross-story consistency check

### T02 ↔ T04 schema drift

The architecture §3 canonical DDL is the agreed source of truth. T02 transcribes it to SQL; T04 transcribes it to Drizzle TypeScript. Direct column-for-column comparison shows:

| Area | Status |
|---|---|
| All 15 tables listed | Consistent (T02 AC-1 and T04 §5 both say 15) |
| `projects.total_vcus_available` GENERATED column | T02 creates it; T04 specifies handling (see F02) |
| `projects.centroid` GEOGRAPHY | T02 creates it; T04 specifies customType — consistent |
| `satellite_alerts.location` GEOGRAPHY | T02 creates it; T04 specifies customType — consistent |
| `accounts.expires_at BIGINT` | T02 creates it; T04 maps to `bigint({ mode: 'number' })` — consistent |
| `users.emailVerified` | **Missing from architecture §3, missing from T02, missing from T04 — blocking gap (F01)** |
| `verification_tokens` composite PK | T02 creates `PRIMARY KEY(identifier, token)`; T04 type mapping is incomplete (F10) |
| `project_scores` composite PK | T02 creates `PRIMARY KEY(project_id, score_date)`; T04 type mapping is incomplete (F11) |

No other column-level drift detected between architecture §3 and T04's mapping table.

### T03 ↔ T04: `.env.example` ownership

T03 commits `.env.example` with `DATABASE_URL` already present. T04 treats "confirm DATABASE_URL key is present" as an in-scope deliverable, but this is a verification step, not a creation step. The confusion is minor but creates a misleading DoD checkbox. See F03.

### T05 ↔ T04: DrizzleAdapter schema requirements

T05 OQ-1 identifies `emailVerified`, `providerAccountId`, `sessionToken`, and `userId` as fields the adapter reads by camelCase JavaScript property name (not SQL column name). T04 must define these fields with the exact property names the adapter expects. T04's spec does not enumerate adapter-expected field names for `users`, `accounts`, `sessions`, or `verification_tokens` tables — it defers to T05 OQ-1. This creates a gap: the T04 implementer may name fields correctly or incorrectly without a spec-level constraint.

**Finding:** T04 should include a table of expected Drizzle field names for the four auth tables (cross-referenced from the adapter source), not defer this entirely to T05. The gap is most acute for `emailVerified` (F01) and `providerAccountId` (minor risk, standard Drizzle convention).

---

## Summary table

| # | Severity | Title |
|---|---|---|
| F01 | BLOCKING | `emailVerified` column gap — T02 and T04 will produce a schema the adapter cannot use |
| F02 | BLOCKING | `generatedAlwaysAs()` guidance non-committal — implementer has no clear path |
| F03 | BLOCKING | `.env.example` dual-ownership ambiguity — T04 deliverable is a no-op but not stated as such |
| F04 | Advisory | PostGIS return shape described as "WKT/GeoJSON" but bare select returns WKB hex |
| F05 | Advisory | `bigint mode: 'number'` adapter compatibility deferred without version pin |
| F06 | Advisory | Pool `max: 10` has no warning comment for future serverless deploy |
| F07 | Advisory | Health endpoint may leak raw exception message including connection string |
| F08 | Advisory | `drizzle.config.ts` needs comment warning against `generate`/`migrate` commands |
| F09 | Advisory | `schema_migrations` definition consistent — no action required |
| F10 | Advisory | `verification_tokens` composite PK Drizzle syntax not shown |
| F11 | Advisory | `project_scores` composite PK Drizzle syntax not shown |
| F12 | Advisory | AC-5/AC-6 use `'lib/db'` import path; should be `'@/lib/db'` |
