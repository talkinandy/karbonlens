---
story: T04
auditor: code-auditor (claude-opus-4-7 [1M])
audited_commit: 3a9b048a264d04d47729875a03775c6ef129f88f
branch: feature/T04-drizzle-schema
verdict: FAIL
---

## Summary

T04 faithfully mirrors the SQL schema to Drizzle TypeScript — column names, types, FK cascade policies, composite PKs, CHECK constraint, generated column, and PostGIS customType all match `scrapers/migrations/001_init.sql` and the live Postgres. `/api/health` returns 200 with the correct JSON when the DB is up, and the missing-`DATABASE_URL` assertion at import time fires as spec'd.

But **two blocking runtime bugs** sit under that clean surface:

1. **Adapter field-name contract violated on `accounts` for six OAuth-token columns.** `@auth/drizzle-adapter` v1.11.2 (installed and shipped) calls `client.insert(accountsTable).values({ refresh_token, access_token, expires_at, token_type, id_token, session_state, ... })` with **snake_case keys** for those six fields. T04's `lib/schema.ts` declares them in **camelCase** (`refreshToken`, `accessToken`, `expiresAt`, `tokenType`, `idToken`, `sessionState`). Drizzle's `insert.values()` silently drops unknown keys — I reproduced the failure live: inserting a fake adapter payload succeeded with zero errors but wrote `NULL` for every snake_case field, only `scope` (spelled identically) persisted. This will cause T05 to store no OAuth tokens, silently breaking the refresh-token flow.

2. **Health classifier returns `"unknown"` for connection-refused.** The negative test with an unreachable Postgres port (localhost:9999) produced `{"error":"unknown"}`, not the spec-required `"connection refused"`. Root cause: postgres.js wraps ECONNREFUSED in an `AggregateError` whose `.message` is empty, with the `ECONNREFUSED` code living on `err.cause.code` and `err.cause.errors[].code`. The classifier's `.cause` chain-walk only concatenates `.message` strings — it never inspects `.code` or the `.errors[]` array. AC-2 fails for this case.

All 15 tables are present, PostGIS types work, `npm run build` succeeds, `tsc --noEmit` exits 0, `force-dynamic` is correctly set, and there are no leaks of the DATABASE_URL, stack traces, or credentials in the 503 response.

Recommendation: **do not merge** until both blocking findings are fixed.

---

## Blocking findings

### B1 — Adapter contract mismatch on `accounts` (six camelCase → snake_case fields)

**Evidence (live repro against local DB):**

Inserting into `accounts` via Drizzle with the exact `.values({...})` shape the shipped adapter uses:

```
user id: cf60359d-ac5c-4ee2-8925-a418adcf1d0e
insert OK
row persisted: {
  "providerAccountId": "probe-123",
  "refreshToken": null,   ← dropped (adapter passed refresh_token)
  "accessToken": null,    ← dropped
  "expiresAt": null,      ← dropped
  "tokenType": null,      ← dropped
  "scope": "openid email",  ← persisted (key spelled identically)
  "idToken": null,        ← dropped
  "sessionState": null    ← dropped
}
```

Source confirmation in `node_modules/@auth/drizzle-adapter/lib/pg.js` lines 22–28:
```js
refresh_token: text("refresh_token"),
access_token:  text("access_token"),
expires_at:    integer("expires_at"),
token_type:    text("token_type"),
id_token:      text("id_token"),
session_state: text("session_state"),
```

And the adapter's insert call (pg.js:144): `await client.insert(accountsTable).values(data)`.

Drizzle's `insert.values()` implementation (`node_modules/drizzle-orm/pg-core/query-builders/insert.cjs:58-69`) iterates `Object.keys(entry)` and only emits columns it finds — unknown keys map to `new Param(value, undefined)` and are silently elided from the generated SQL. No error is raised at compile time (the adapter types these with generic wide shapes) or runtime.

**Why the T02/T04 spec enumeration got this wrong:** T02 §6 and T04 §5 both enumerated `refreshToken, accessToken, expiresAt, tokenType, idToken, sessionState` as correct camelCase mappings based on a generic "camelCase JS ↔ snake_case SQL" rule. The actual adapter at v1.11.2 mixes conventions — it uses `userId, providerAccountId` (camelCase) but `refresh_token, access_token, expires_at, token_type, id_token, session_state` (snake_case). The spec got 2 of 8 adapter fields right by coincidence; the other 6 fields are declared in a way the adapter's `.values({...})` call silently discards.

**Fix:** rename the six JS fields to snake_case while keeping the SQL column name argument unchanged:

```typescript
// lib/schema.ts — accounts table
refresh_token: text('refresh_token'),
access_token:  text('access_token'),
expires_at:    bigint('expires_at', { mode: 'number' }),
token_type:    text('token_type'),
id_token:      text('id_token'),
session_state: text('session_state'),
```

After the fix, add a throwaway probe identical to the one run during this audit to confirm `{ refresh_token, access_token, expires_at, token_type, id_token, session_state }` persist with non-null values.

**Downstream impact:** T05's AC-3 only asserts `provider = 'google'` and `provider_account_id IS NOT NULL` — it will pass even with the tokens dropped. The hidden failure mode only surfaces when Google tries to refresh the access token (after ~1 hour) and the server has no `refresh_token` to use; the session silently fails. T05 should add an AC checking that `refresh_token IS NOT NULL` on the post-login `accounts` row.

### B2 — Health classifier returns `"unknown"` for ECONNREFUSED

**Evidence (live probe):**

Starting `npm run dev` with `DATABASE_URL=postgresql://karbonlens:x@localhost:9999/...` (unreachable port), then:

```
$ curl -si http://localhost:3057/api/health
HTTP/1.1 503 Service Unavailable
{"ok":false,"db":"error","error":"unknown"}
```

Expected by T04 spec §7(viii) and AC-2: `"error":"connection refused"`.

**Root cause** (probed directly against postgres.js + drizzle):

```
--- top error ---
name: Error
message: "Failed query: SELECT 1\nparams: "
has cause: true
cause name: AggregateError
cause message: ""
cause code: ECONNREFUSED
cause.errors: [{"errno":-111,"code":"ECONNREFUSED","syscall":"connect","address":"::1","port":9999}, ...]
```

The classifier (`app/api/health/route.ts:20-38`) only reads `.message` properties while walking `.cause`. For ECONNREFUSED, both message strings are empty or generic — the only diagnostic signal (`code: 'ECONNREFUSED'`, `errors[].code: 'ECONNREFUSED'`) is never consulted.

**Fix:** also collect `.code` strings (and, where present, `.errors[].code`) from each level of the chain, then match `econnrefused` against that combined signal bag:

```typescript
const signals: string[] = [];
let current: unknown = err;
for (let i = 0; i < 5 && current; i++) {
  const c = current as { message?: unknown; code?: unknown; errors?: Array<{ code?: unknown }> };
  if (typeof c.message === 'string') signals.push(c.message.toLowerCase());
  if (typeof c.code === 'string') signals.push(c.code.toLowerCase());
  if (Array.isArray(c.errors)) {
    for (const e of c.errors) if (typeof e?.code === 'string') signals.push(e.code.toLowerCase());
  }
  current = (current as { cause?: unknown })?.cause;
}
const signal = signals.join(' | ');
if (signal.includes('econnrefused')) return 'connection refused';
// …rest unchanged
```

Then re-verify AC-2 for the connection-refused branch. Auth-failed classification is unaffected because that path hits via `.message` containing "password authentication failed".

---

## Schema-drift table

Column-by-column comparison against live DB (via `information_schema.columns`) and SQL migration 001. All 15 application tables present.

| Table | Column | SQL type | Drizzle type | Parity |
|---|---|---|---|---|
| projects | id | uuid PK default gen_random_uuid() | `uuid('id').primaryKey().defaultRandom()` | OK |
| projects | slug | text NOT NULL UNIQUE | `text().notNull().unique()` | OK |
| projects | name_canonical | text NOT NULL | `text().notNull()` | OK |
| projects | name_aliases | text[] | `text().array()` | OK |
| projects | country | char(2) NOT NULL DEFAULT 'ID' | `char({length:2}).notNull().default('ID')` | OK |
| projects | centroid | geography(Point,4326) | `geographyPoint('centroid')` | OK |
| projects | buffer_km | numeric DEFAULT 10 | `numeric().default('10')` | OK (numeric literal as string is Drizzle convention) |
| projects | total_vcus_issued | numeric DEFAULT 0 | `numeric().default('0')` | OK |
| projects | total_vcus_retired | numeric DEFAULT 0 | `numeric().default('0')` | OK |
| projects | total_vcus_available | numeric GENERATED ALWAYS AS (...) STORED | `numeric().generatedAlwaysAs(sql\`total_vcus_issued - total_vcus_retired\`)` | OK |
| projects | created_at / updated_at | timestamptz DEFAULT now() | `timestamp({withTimezone:true}).defaultNow()` | OK |
| registries | project_id | uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE | `.references(...{onDelete:'cascade'})` | OK |
| registries | UNIQUE(registry_name, external_id) | constraint | DB-only (not declared in Drizzle, inline comment notes this) | OK (non-blocking — DB enforces) |
| idx_monthly_snapshots | period_month DATE NOT NULL UNIQUE | | `.notNull().unique()` | OK |
| satellite_alerts | project_id FK ON DELETE SET NULL | | `.references(...{onDelete:'set null'})` | OK |
| satellite_alerts | location | geography(Point,4326) | `geographyPoint('location')` | OK |
| project_scores | PRIMARY KEY (project_id, score_date) | composite | `primaryKey({ columns: [t.projectId, t.scoreDate] })` | OK |
| project_scores | integrity_score CHECK (0–100) | | `check('integrity_score_range', sql\`${t.integrityScore} BETWEEN 0 AND 100\`)` | OK |
| project_match_queue | candidate_a_id / candidate_b_id FKs, no ON DELETE | | `.references(...)` (no onDelete, defaults to RESTRICT) | OK |
| users | email_verified timestamptz | | `emailVerified: timestamp('email_verified',{withTimezone:true})` | OK |
| accounts | userId, type, provider, providerAccountId | camelCase JS | camelCase JS | OK |
| accounts | **refresh_token, access_token, expires_at, token_type, id_token, session_state** | snake_case per adapter v1.11.2 | **camelCase JS** (`refreshToken`, `accessToken`, `expiresAt`, `tokenType`, `idToken`, `sessionState`) | **MISMATCH — see B1** |
| sessions | session_token UNIQUE NOT NULL | | `sessionToken: text().notNull().unique()` | OK |
| sessions | user_id FK ON DELETE CASCADE | | `.references(...{onDelete:'cascade'})` | OK |
| verification_tokens | PRIMARY KEY (identifier, token) | composite | `primaryKey({ columns: [t.identifier, t.token] })` | OK |
| notifications | project_id FK ON DELETE SET NULL | | `.references(...{onDelete:'set null'})` | OK |
| schema_migrations | version text PK, applied_at timestamptz default now() | | `version: text().primaryKey()`, `appliedAt: ...defaultNow()` | OK |

Indexes: 9 of 11 declared in Drizzle table-config arrays. The 2 missing are GIST indexes on geography columns (`idx_projects_centroid`, `idx_sat_location`) — DB-enforced; Drizzle's `index()` builder cannot express `USING GIST` over a customType without hand-written op-class plumbing. Acceptable and documented inline.

---

## Adapter field-name contract verification

Cross-referenced `lib/schema.ts` against `node_modules/@auth/drizzle-adapter/lib/pg.js` (v1.11.2 installed).

| Adapter expects (JS key in `.values()` / column lookup) | T04 schema defines (JS key) | Match? |
|---|---|---|
| `users.emailVerified` | `emailVerified` | OK |
| `users.email` | `email` | OK |
| `users.name` | `name` | OK |
| `users.image` | `image` | OK |
| `users.id` | `id` | OK |
| `accounts.userId` | `userId` | OK |
| `accounts.type` | `type` | OK |
| `accounts.provider` | `provider` | OK |
| `accounts.providerAccountId` | `providerAccountId` | OK |
| `accounts.refresh_token` | `refreshToken` | **FAIL (B1)** |
| `accounts.access_token` | `accessToken` | **FAIL (B1)** |
| `accounts.expires_at` | `expiresAt` | **FAIL (B1)** |
| `accounts.token_type` | `tokenType` | **FAIL (B1)** |
| `accounts.scope` | `scope` | OK |
| `accounts.id_token` | `idToken` | **FAIL (B1)** |
| `accounts.session_state` | `sessionState` | **FAIL (B1)** |
| `sessions.sessionToken` | `sessionToken` | OK |
| `sessions.userId` | `userId` | OK |
| `sessions.expires` | `expires` | OK |
| `verificationTokens.identifier` | `identifier` | OK |
| `verificationTokens.token` | `token` | OK |
| `verificationTokens.expires` | `expires` | OK |

Net: 16 of 22 adapter-required fields match; 6 of 22 fail, all on `accounts` — all related to OAuth token persistence. The six failing fields are all dropped silently at runtime by Drizzle's `insert.values()` because unknown keys in the values object are not validated.

One type-level note (non-blocking): the adapter typedef declares `expires_at` as `PgInteger` (JS `number`). T04 uses `bigint({ mode: 'number' })` which is `PgBigInt53`. The Drizzle type for `PgBigInt53` still produces JS `number` at the data level and accepts `number` on insert, so the runtime contract holds. After the B1 rename, if T05 hits a TS error complaining about the adapter type, a `satisfies` cast or local type alias is the fix — but the schema spec explicitly allowed bigint mode and the runtime is fine.

---

## /api/health verification (against localhost:3055/3056/3057 on dev server)

**Positive — correct DATABASE_URL:**
```
$ curl -si http://localhost:3055/api/health
HTTP/1.1 200 OK
content-type: application/json
{"ok":true,"db":"connected"}
```
PASS.

**Negative — wrong password:**
```
$ curl -si http://localhost:3056/api/health
HTTP/1.1 503 Service Unavailable
{"ok":false,"db":"error","error":"auth failed"}
```
PASS. No DATABASE_URL, stack trace, or password material in the body. The classifier's chain-walk correctly picks up "password authentication failed" from `err.cause.message`.

**Negative — unreachable port (ECONNREFUSED):**
```
$ curl -si http://localhost:3057/api/health
HTTP/1.1 503 Service Unavailable
{"ok":false,"db":"error","error":"unknown"}
```
**FAIL** — expected `"connection refused"`. See B2.

Sanitisation envelope is intact in all three cases: response body contains only the three enum strings from the classifier, never raw error text.

---

## Build / runtime verification

| Check | Result |
|---|---|
| `npm install` (idempotent; T03 owned lockfile) | `up to date, audited 392 packages in 1s` |
| `npx tsc --noEmit` | exit 0, no diagnostics |
| `npm run build` (next 16.2.4, Turbopack) | exit 0; `/api/health` marked ƒ (Dynamic); 8/8 static pages generated |
| `.env.local` gitignored | `git ls-files .env.local` → empty; file present with real password, chmod 600 |
| DATABASE_URL-missing assertion | `npx tsx` probe importing `lib/db` with `delete process.env.DATABASE_URL` → throws `DATABASE_URL is required. Add it to .env.local.` — PASS (AC-6) |
| Drizzle + PostGIS round-trip | raw SQL `SELECT COUNT(*) FROM projects` → `{n: 0}`; `SELECT ST_AsText(ST_Point(106.8, -6.2)::geography)` → `POINT(106.8 -6.2)`; bare `SELECT ST_Point(...)::geography` returns string WKB hex `0101000020E61000003333333333B3…` — matches customType contract |
| `drizzle-kit` not-run | `drizzle/` directory contains only `.gitkeep`; no generated migrations committed |
| Classifier infinite-loop safety | bounded to 5 iterations, null-safe cause reads, safe against circular cause chains |

---

## Files changed review

```
 .gitignore                                        |   4 +
 app/api/health/route.ts                           |  50 +
 docs/stories/reports/T04-implementation-report.md | 189 +
 drizzle.config.ts                                 |  14 +
 drizzle/.gitkeep                                  |   0
 lib/db.ts                                         |  30 +
 lib/schema.ts                                     | 354 +
```

All files are on the expected ownership list. No out-of-scope modifications. `.env.example` untouched (verified via `git log feature/v0.1-impl..HEAD -- .env.example` → no output). `lib/auth.ts` absent (T05). `middleware.ts` absent (T05). Top-of-file warning comment present in `drizzle.config.ts`. `.gitignore` appended with `/drizzle/*` + `!/drizzle/.gitkeep` — correctly preserves the `.gitkeep` sentinel.

---

## Non-blocking findings

### NB-1 — Spec-level trap: T02 §6 and T04 §5 adapter field tables are both wrong for the six token fields

Both upstream specs enumerated `refreshToken, accessToken, expiresAt, tokenType, idToken, sessionState` as the correct camelCase JS field names. They are not — the adapter v1.11.2 expects snake_case for exactly those six fields. This is a spec bug that T04 faithfully implemented. After the B1 fix lands, update T02 §6 and T04 §5 to reflect the actual adapter contract and add a pointer to `node_modules/@auth/drizzle-adapter/lib/pg.js` as the authoritative source. Consider adding a small scratch-script helper under `scripts/` (committed, not a test) that reproduces the adapter's `linkAccount` call against the live schema — catches this class of drift on adapter upgrades.

### NB-2 — Health classifier miss on ECONNRESET / timeout

The classifier has a secondary "connection refused" branch for `connection` + (`refused` | `reset`). Postgres.js does not appear to emit `ECONNRESET` in the message; it uses `.code`. After the B2 `.code` fix, the `reset` / `refused` message-substring branch becomes redundant (still fine to leave as defence in depth). No action required beyond B2.

### NB-3 — `drizzle-kit introspect` not run (AC-7 advisory)

Implementation report marks this NOT RUN (acceptable per spec). I didn't run it either — it would try to re-generate `lib/schema.ts` based on the live DB and warn on the geography custom type per OQ-4. The advisory value is low; skip is fine.

### NB-4 — `schema.ts` `customType` shape `{ data: string; notNull: false }`

The `notNull: false` on the geography customType fixes the insert-null typecheck for `satellite_alerts.location` (which is nullable). It is a Drizzle-internal hint, not a column constraint override — verified by selecting a null location against the live DB without issue. No action.

### NB-5 — Implementation report notes `npm run dev` defaulted to port 3001

The implementer's probe used `localhost:3001`, not `:3000` (Next.js picks next free port). Spec AC-1 uses `:3000` but the port is incidental — both 3000 and 3001 exercise identical code paths. I used `:3055/3056/3057` for the same reason. Cosmetic.

### NB-6 — Generated column insert-exclusion proof is manual

AC-8 was verified via a throwaway file with `@ts-expect-error` that the implementer deleted. I did not re-run this because (a) Drizzle's `generatedAlwaysAs` has been tested upstream for this behaviour, (b) the TypeScript type `InferInsertModel<typeof projects>` inspection shows `totalVcusAvailable` absent. Low risk; no action.

---

## Verdict

**FAIL.** Two blocking runtime bugs: adapter field-name mismatch on six `accounts` columns silently drops OAuth tokens (B1), and `/api/health` classifies connection-refused as `"unknown"` (B2). Both are fixable with ≤20 lines of code each. The rest of T04 — schema parity, PostGIS customType, generated column, composite PKs, CHECK constraint, FK cascade policies, DATABASE_URL enforcement, build/typecheck/dynamic-route wiring — is solid and meets spec.

Do not merge. Fix B1 and B2 in a follow-up commit on `feature/T04-drizzle-schema`, re-verify both (the adapter probe and the connection-refused `/api/health` negative test), then re-audit.
