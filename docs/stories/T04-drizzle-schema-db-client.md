---
id: T04
title: Drizzle schema + DB client + env plumbing
phase: 1
status: audited
blocked_by: [T02, T03]
blocks: [T05, T09, T11, T12, T14, T15, T16]
owner: implementer-agent
effort_estimate: 2h
---

## 1. User story

As a Next.js server component or API route, I want a type-safe Drizzle client connected to the local Postgres database, so that downstream tasks can query real data without writing raw SQL strings.

## 2. Context & rationale

T02 created the Postgres schema in SQL. T03 bootstrapped the Next.js monorepo. This task bridges them: it translates the canonical SQL schema (`docs/architecture.md` §3) into Drizzle TypeScript definitions and wires up a singleton client.

**Local-dev-first constraint (Andy override):** The app runs on the same Hetzner box as Postgres. For v0.1, `DATABASE_URL` always points to `localhost:5432`. There is no public Postgres exposure, no SSL tunnel, and no Netlify-to-VPS connectivity requirement. Netlify production deploy is deferred to v0.2 — see §3 Out of scope and §9 Open questions.

**Why Drizzle?** TypeScript-native, zero-overhead query building, and lets us drop to tagged-template raw SQL when PostGIS functions are needed. No active-record magic that obscures what hits the wire.

**PostGIS types:** Drizzle does not ship built-in PostGIS column types. `GEOGRAPHY(POINT, 4326)` columns must be handled with `customType` so TypeScript does not silently cast them as `unknown`. The spec below details the pattern.

## 3. Scope

### In scope

1. **`lib/schema.ts`** — Drizzle TypeScript table definitions mirroring all 15 tables from `docs/architecture.md` §3 (including `schema_migrations`). Full column-type mapping specified in §5 below. All four auth-related tables (`users`, `accounts`, `sessions`, `verification_tokens`) must use the exact camelCase field names required by `@auth/drizzle-adapter` v5 — enumerated in §5.

2. **`lib/db.ts`** — singleton Drizzle client; named export `db`; throws at module load time if `DATABASE_URL` is missing:
   ```typescript
   if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
   ```

3. **`drizzle.config.ts`** — Drizzle Kit config pointing at `lib/schema.ts` and the local database; output dir `drizzle/`. Used for `drizzle-kit introspect` to validate round-trips during development; **not used for migrations in v0.1**. A prominent comment at the top of the file must warn against running `drizzle-kit generate` or `drizzle-kit migrate`.

4. **`app/api/health/route.ts`** — GET endpoint; executes `SELECT 1` via Drizzle raw query; returns JSON health payload; marked `force-dynamic`. Error field in 503 responses must be a sanitised classifier string (not raw `err.message`) — see §7(viii).

5. **`.env.example` — verify only.** T03 writes `DATABASE_URL` into `.env.example`. T04's only responsibility is to assert:
   - (a) `.env.example` contains a `DATABASE_URL` key (if absent for any reason, append it — otherwise no change).
   - (b) `.env.local` is listed in `.gitignore`.
   - (c) `lib/db.ts` reads `process.env.DATABASE_URL` at module load.
   T04 does **not** append any new keys to `.env.example`. The file is owned by T03; T04 is verify-only.

### Out of scope (explicit non-goals)

- **Netlify production connectivity.** Connecting Netlify's serverless functions to a VPS Postgres (via Tailscale, a proxy, or public exposure) is a v0.2 decision. Do not spec or implement it here. Do not expose Postgres on the public interface. The TASKS.md note about "Tailscale vs public Postgres" is superseded by this override.
- **NextAuth config** (`lib/auth.ts`) — T05 owns that file. Do not create or modify it.
- **Drizzle Kit migrations** — v0.1 applies migrations via plain `psql -f`. `drizzle-kit generate` and `drizzle-kit migrate` are not part of this task.
- **Any query logic beyond the health check** — no data-fetching helpers, no repository layer.
- **Automated tests** — no tests for v0.1 per project convention.
- **`lib/schema.test.sql`** — recommended to skip; see §9 for rationale.

## 4. Acceptance criteria (Gherkin)

**AC-1: Health endpoint — DB up**
```
Given `npm run dev` is running
  And Postgres is accepting connections on localhost:5432
  And DATABASE_URL is set correctly in .env.local
When the implementer runs `curl -s localhost:3000/api/health`
Then the response status is 200
 And the response body is {"ok":true,"db":"connected"}
```

**AC-2: Health endpoint — DB down**
```
Given `npm run dev` is running
  And Postgres has been stopped (e.g. `systemctl stop postgresql`)
When the implementer runs `curl -s localhost:3000/api/health`
Then the response status is 503
 And the response body contains {"ok":false,"db":"error"}
 And the body contains an "error" field with a sanitised classifier string
   such as "connection refused", "auth failed", or "unknown"
 And the "error" field does NOT contain the DATABASE_URL value,
   a stack trace, or any credential material
```

**AC-3: TypeScript compiles clean**
```
Given the implementer has run `npm install`
  And lib/schema.ts and lib/db.ts exist as specified
When the implementer runs `npx tsc --noEmit`
Then the command exits with code 0
 And no type errors are reported in lib/schema.ts or lib/db.ts
```

**AC-4: PostGIS custom types compile**
```
Given lib/schema.ts defines customType declarations for
      projects.centroid and satellite_alerts.location
When the implementer runs `npx tsc --noEmit`
Then those columns have an explicit TypeScript type (string containing
     raw WKB hex — consumers must call ST_AsGeoJSON() or ST_AsText()
     via sql tag to obtain human-readable geometry)
 And no column is typed as `unknown` or `any`
```

**AC-5: Server component import type-checks**
```
Given a throwaway server component or route that imports {db} from '@/lib/db'
  And runs `await db.select().from(schema.projects).limit(1)`
When the implementer runs `npx tsc --noEmit`
Then the expression type-checks without error
 And the return type is inferred as an array of the projects row type
```

**AC-6: Missing DATABASE_URL throws at import time**
```
Given DATABASE_URL is not set in the environment
When any module that imports from '@/lib/db' is evaluated
Then the process throws an Error with a message indicating DATABASE_URL is missing
 And it does not silently produce an undefined connection string
```

**AC-7: drizzle-kit introspect (nice-to-have)**
```
Given Postgres is running and DATABASE_URL is set
When the implementer runs `npx drizzle-kit introspect`
Then the command exits without error
 And introspected output is written to the drizzle/ directory
Note: This AC is advisory — it validates the drizzle.config.ts is correctly wired
      but does not block story sign-off.
```

**AC-8: Generated column is not insertable**
```
Given lib/schema.ts uses generatedAlwaysAs() on projects.totalVcusAvailable
When the implementer runs `npx tsc --noEmit`
Then the TypeScript type for a projects insert does NOT include totalVcusAvailable
 And attempting to assign a value to totalVcusAvailable in an insert expression
     produces a compile-time type error
```

## 5. Inputs & outputs

### Inputs

- `DATABASE_URL` in `.env.local` — format: `postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens?sslmode=disable`
- `docs/architecture.md` §3 — canonical SQL schema (source of truth)
- `docs/architecture.md` §7 — full env var list
- T02 must be complete (tables exist in the live DB, including `email_verified` on `users`)
- T03 must be complete (Next.js monorepo and `package.json` with `drizzle-orm`, `postgres`, `drizzle-kit` already installed; `.env.example` already contains `DATABASE_URL`)

### Outputs — files created or modified

| File | Action | Notes |
|---|---|---|
| `lib/schema.ts` | Create | 15 Drizzle table definitions |
| `lib/db.ts` | Create | Singleton client, named export `db` |
| `drizzle.config.ts` | Create | Drizzle Kit config |
| `app/api/health/route.ts` | Create | GET handler, force-dynamic |
| `.env.example` | Verify only | Confirm DATABASE_URL key is present (written by T03); no new keys added |
| `drizzle/.gitkeep` | Create | Keeps empty drizzle/ dir in git |

`drizzle/` (generated output) must be added to `.gitignore` except for the `.gitkeep`. Generated introspection artifacts are not committed.

### Adapter field-name enumeration (auth tables)

`@auth/drizzle-adapter` v5 reads table columns by the camelCase JavaScript property name on the Drizzle table object. T04 must use the exact names below. Cross-reference: T02 §3 (camelCase ↔ snake_case mapping). The implementer must mirror these in `lib/schema.ts`:

| Table | Drizzle TS field | SQL column |
|---|---|---|
| `users` | `emailVerified` | `email_verified` |
| `accounts` | `userId` | `user_id` |
| `accounts` | `providerAccountId` | `provider_account_id` |
| `sessions` | `sessionToken` | `session_token` |
| `sessions` | `userId` | `user_id` |
| `verification_tokens` | `identifier` | `identifier` |
| `verification_tokens` | `token` | `token` |

### Drizzle column-type mapping (implementer reference)

The table below translates every SQL type from `docs/architecture.md` §3 to its Drizzle counterpart.

| SQL type | Drizzle helper | Notes |
|---|---|---|
| `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `uuid('id').primaryKey().defaultRandom()` | |
| `TEXT` | `text('col')` | |
| `TEXT[]` | `text('col').array()` | Use `.array()` helper; Drizzle's postgres-js driver handles the `{}` wire format automatically |
| `CHAR(2)` | `char('col', { length: 2 })` | |
| `NUMERIC` | `numeric('col')` | Returns string from DB; cast in app if needed |
| `INTEGER` | `integer('col')` | |
| `BIGINT` (accounts.expires_at) | `bigint('expires_at', { mode: 'number' })` | JS Number loses precision above 2^53; safe for Unix epoch seconds, not for arbitrary 64-bit ints. Add an inline comment on the column explaining this — see §7(iv). |
| `BOOLEAN` | `boolean('col')` | |
| `DATE` | `date('col')` | Returns string 'YYYY-MM-DD' in Drizzle's default mode |
| `TIMESTAMPTZ` | `timestamp('col', { withTimezone: true })` | |
| `JSONB` (known shape) | `jsonb('col').$type<MyShape>()` | Provide the generic when payload shape is known (e.g. score components) |
| `JSONB` (unknown/evolving shape) | `jsonb('col').$type<Record<string, unknown>>()` | For raw_payload columns where shape evolves; use `Record<string, unknown>` not `unknown` |
| `GEOGRAPHY(POINT, 4326)` | `customType<{ data: string }>` | Returns raw WKB hex on bare SELECT; see PostGIS pattern below |
| `NUMERIC GENERATED ALWAYS AS ... STORED` | `generatedAlwaysAs(sql\`total_vcus_issued - total_vcus_retired\`)` | Drizzle automatically excludes this from the insertable type — do not add `.notNull()` or a default |
| `TEXT PRIMARY KEY` (verification_tokens composite) | `text('identifier').notNull()` + composite PK in table config | See composite PK pattern below |

**PostGIS custom type pattern** — use this for `projects.centroid` and `satellite_alerts.location`:

```typescript
import { customType } from 'drizzle-orm/pg-core';

// Returns raw WKB hex on a plain SELECT.
// To get human-readable geometry use the sql tag:
//   sql<string>`ST_AsGeoJSON(${projects.centroid})`
//   sql<string>`ST_AsText(${projects.centroid})`
// Writing uses: sql`ST_Point(${lon}, ${lat})::geography`
const geography = customType<{ data: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

// Usage in table definition:
centroid: geography('centroid'),
location: geography('location'),
```

**Generated column pattern** for `projects.totalVcusAvailable`:

```typescript
import { sql } from 'drizzle-orm';

// Drizzle marks this column as not-insertable at the type level.
// Do not attempt to write to it — Postgres will reject the statement.
totalVcusAvailable: numeric('total_vcus_available')
  .generatedAlwaysAs(sql`total_vcus_issued - total_vcus_retired`),
```

**Composite PK pattern** — use Drizzle's second-argument config object:

```typescript
import { primaryKey } from 'drizzle-orm/pg-core';

// verification_tokens
export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token:      text('token').notNull(),
  expires:    timestamp('expires', { withTimezone: true }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.identifier, t.token] }),
}));

// project_scores
export const projectScores = pgTable('project_scores', {
  projectId:   uuid('project_id').notNull().references(() => projects.id),
  scoreDate:   date('score_date').notNull(),
  // ... remaining columns
}, (t) => ({
  pk: primaryKey({ columns: [t.projectId, t.scoreDate] }),
}));
```

### Table inventory (15 tables)

All 15 must appear in `lib/schema.ts` as named exports:

`schemaMigrations`, `projects`, `registries`, `issuances`, `retirements`, `idxMonthlySnapshots`, `satelliteAlerts`, `regulatoryEvents`, `projectScores`, `projectMatchQueue`, `users`, `accounts`, `sessions`, `verificationTokens`, `notifications`.

Each must be a named export so downstream tasks can import individually (e.g. `import { projects, notifications } from '@/lib/schema'`).

## 6. Dependencies & interactions

### Blocked by
- **T02** — tables must exist in the DB before the health check can pass; specifically `users.email_verified` must be present in the SQL schema before T04 finalises `lib/schema.ts`
- **T03** — `drizzle-orm`, `postgres`, `drizzle-kit` must be installed; Next.js project must exist; `.env.example` must already contain `DATABASE_URL`

### Blocks
- **T05** — NextAuth DrizzleAdapter needs `db` and the auth-related table definitions (`users`, `accounts`, `sessions`, `verification_tokens`) with correct camelCase field names
- **T09** — Score job imports `project_scores` table type for insert
- **T11** — Projects explorer queries `projects`, `project_scores`, `registries`
- **T12** — Project detail queries `issuances`, `satellite_alerts`, `notifications`
- **T14** — Price screen queries `idx_monthly_snapshots`
- **T15** — Regulatory screen queries `regulatory_events`
- **T16** — Alerts inbox queries `notifications`, updates `read_at`

### File ownership

T04 exclusively owns the following paths. No other concurrent task may create or modify them:

- `lib/schema.ts`
- `lib/db.ts`
- `drizzle.config.ts`
- `app/api/health/route.ts`
- `drizzle/` directory

T05 will create `lib/auth.ts` — do not create or pre-populate that file here.

`.env.example` is owned by T03 (written) and T05 (appends auth keys). T04 is verify-only for this file.

## 7. Edge cases & failure modes

**(i) Missing DATABASE_URL**
`lib/db.ts` must check `process.env.DATABASE_URL` before constructing the client. Throw an explicit error if undefined or empty. Do not use the `!` non-null assertion silently — make the failure visible. This means the server process crashes early with a clear message rather than propagating a cryptic connection error later.

```typescript
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required. Add it to .env.local.');
}
// max: 10 is appropriate for local dev / single-process VPS.
// Reduce to 2–3 if deploying to serverless (Netlify, Vercel) to avoid
// exhausting Postgres max_connections.
const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
```

**(ii) Postgres down during Next.js build**
`app/api/health/route.ts` must include `export const dynamic = 'force-dynamic'`. This prevents Next.js from calling the route at build time (static pre-rendering). Without this, a Postgres-dependent route called during `next build` will cause a build failure when the DB is not available at build time.

**(iii) TEXT[] columns**
Use Drizzle's `.array()` modifier: `text('name_aliases').array()`. Do not model them as comma-separated strings or JSONB. Drizzle's postgres-js driver handles the `{}` wire format automatically.

**(iv) BIGINT for accounts.expires_at**
Use `bigint('expires_at', { mode: 'number' })`. JavaScript's `Number` can represent integers up to 2^53 − 1 safely. Unix epoch seconds will not exceed this for any foreseeable expiry. Add an inline comment:
```typescript
// expires_at is a Unix timestamp in seconds. Safe as JS Number until year 285,428,751.
// If @auth/drizzle-adapter v5 requires BigInt mode, switch to { mode: 'bigint' }
// and verify against adapter source at the installed version.
expiresAt: bigint('expires_at', { mode: 'number' }),
```

**(v) JSONB typing**
- `project_scores.components` — type with a known interface `ScoreComponents` defined in the same file or imported from `lib/score.ts`.
- `raw_payload` columns (registries, issuances, retirements, satellite_alerts, idx_monthly_snapshots) — type as `.$type<Record<string, unknown>>()` since scraper payload shapes evolve. Use `Record<string, unknown>` rather than `unknown` or `any`.
- `raw_metadata` on registries — same: `.$type<Record<string, unknown>>()`.

**(vi) Computed column total_vcus_available**
Use `generatedAlwaysAs(sql\`total_vcus_issued - total_vcus_retired\`)` on the `totalVcusAvailable` column. Drizzle automatically excludes generated columns from the insert type — no manual `Omit<>` is needed. Do not attempt to write a value to this column in any insert or update expression; Postgres will reject it.

**(vii) schema_migrations table**
Include a minimal Drizzle definition for `schema_migrations` for completeness, even though T04 never writes to it:
```typescript
export const schemaMigrations = pgTable('schema_migrations', {
  version:   text('version').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow(),
});
```

**(viii) Health endpoint error sanitisation**
The 503 response `error` field must contain a sanitised classifier, not raw `err.message`. The raw message may include the connection string, Postgres version banner, or stack trace. Map errors as follows:

```typescript
function classifyDbError(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (msg.includes('connection refused') || msg.includes('econnrefused')) return 'connection refused';
  if (msg.includes('password') || msg.includes('authentication')) return 'auth failed';
  return 'unknown';
}
```

Return: `{ ok: false, db: 'error', error: classifyDbError(err) }`.

**(ix) SSL mode — localhost vs production**
For v0.1, `DATABASE_URL` uses `sslmode=disable` since Postgres is on the same host. For v0.2+ production, switch to `sslmode=require`. Document this as a TODO comment in `lib/db.ts`:
```typescript
// TODO v0.2: switch DATABASE_URL to sslmode=require for production VPS connectivity.
```

**(x) drizzle-kit generate / migrate are off-limits**
v0.1 applies migrations via raw `.sql` files under `scrapers/migrations/` executed with `psql`. `drizzle-kit push` and `drizzle-kit generate` are NOT part of the migration pipeline. `drizzle.config.ts` exists solely to support `drizzle-kit introspect` during development. The file must carry a top-of-file comment:
```typescript
// READ-ONLY in v0.1. Do NOT run drizzle-kit generate or migrate —
// migrations are applied via psql -f scrapers/migrations/*.sql.
// Safe to use: npx drizzle-kit introspect (advisory validation only).
```

## 8. Definition of done

- [ ] All acceptance criteria pass (AC-1 through AC-6, AC-8; AC-7 advisory).
- [ ] `lib/schema.ts`, `lib/db.ts`, `drizzle.config.ts`, `app/api/health/route.ts` landed in `feature/v0.1-impl`.
- [ ] `.env.example` verified to contain `DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens?sslmode=disable` (written by T03; T04 does not modify the file unless the key is absent).
- [ ] `drizzle/.gitkeep` committed; `drizzle/` output is gitignored.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] TASKS.md status for T04 flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

## 9. Open questions

**OQ-1 (Critical — Andy decision): Netlify production connectivity strategy.**
The original TASKS.md §T04 suggested exposing Postgres publicly (with `pg_hba.conf` IP allowlist) as the "pragmatic v0.1" approach. Andy has overridden this: public Postgres exposure is off the table. The production deploy to Netlify is deferred to v0.2. Andy must decide before T23 (replace prototype with live build) which of these approaches to take:

- **Option A — Tailscale:** Install Tailscale on the VPS and on a Netlify-compatible compute target (Netlify currently does not support Tailscale in serverless functions; would require migrating frontend to Fly.io, Railway, or Render, or using Netlify's Build Plugin workarounds).
- **Option B — Thin proxy:** Run a small HTTP API on the VPS (Node.js/Hono or FastAPI) that the Netlify functions call over HTTPS. Postgres stays on localhost; the proxy handles auth. Adds one more moving part.
- **Option C — Platform migration:** Move the Next.js app to a platform that supports persistent compute close to the DB (Fly.io, Railway, Render). Netlify is naturally stateless and serverless — poorly matched to a VPS Postgres.
- **Option D — Managed Postgres:** Migrate the database from the VPS to a managed provider (Neon, Supabase, PlanetScale Postgres-compatible). Expensive relative to v0.1 budget; eliminates the connectivity problem entirely.

**Until Andy decides, v0.1 operates fully on localhost. All testing against the health endpoint is local (`curl localhost:3000/api/health`). The Netlify deploy target in TASKS.md AC-1 (`curl https://karbonlens.netlify.app/api/health`) is deferred.**

**OQ-2: `lib/schema.test.sql` spot-query helper.**
The prompt asks whether to add a helper SQL file that spot-queries each table to validate Drizzle schema types stay in sync. Recommendation: skip for v0.1. Rationale: (a) no automated tests in v0.1 by project convention, (b) `npx tsc --noEmit` already catches type drift at the TypeScript layer, (c) `drizzle-kit introspect` (AC-7) provides a manual validation path. Revisit in v0.2 when adding a pytest scraper test suite.

**OQ-3: NextAuth DrizzleAdapter column naming — RESOLVED.**
The camelCase ↔ snake_case mapping for all four auth tables is now enumerated in §5. The `emailVerified` field is explicitly required in the Drizzle `users` table and in the SQL schema (T02 §3). OQ-3 is closed.

**OQ-4: `drizzle-kit introspect` and PostGIS types.**
When `drizzle-kit introspect` encounters `geography(Point, 4326)` columns, it may emit unsupported-type warnings or fall back to `text`. This is expected — the introspect output is for reference only; `lib/schema.ts` is hand-authored and supersedes it.

**OQ-5: PostGIS return shape — DEFERRED to T11+.**
Bare `SELECT` on geography columns returns WKB hex. Consumers must call `ST_AsGeoJSON()` or `ST_AsText()` via the `sql` tag. A proper geometry serialiser/deserialiser is deferred to T11 (projects explorer) when the actual rendering requirements are known. AC-4 reflects WKB hex as the TS type contract.

## 10. References

- `docs/architecture.md` §3 — canonical SQL schema (source of truth for all column names and types)
- `docs/architecture.md` §7 — full environment variable list
- `docs/stories/T02-schema-migration-001.md` §3 — `users.email_verified` SQL definition and camelCase ↔ snake_case field-name mapping for auth tables
- `docs/stories/T05-nextauth-google-oauth.md` — shows expected shape of `lib/auth.ts` that T04 must not pre-create
- `docs/TASKS.md` §T04 — original task description (superseded by Andy's local-dev-first override on connectivity)
- Drizzle ORM docs: `customType` API — https://orm.drizzle.team/docs/custom-types
- Drizzle ORM docs: `generatedAlwaysAs()` — https://orm.drizzle.team/docs/column-types/pg#generated-columns
- Drizzle ORM docs: `primaryKey()` composite — https://orm.drizzle.team/docs/indexes-constraints#composite-primary-key
- Drizzle ORM docs: `postgres-js` driver — https://orm.drizzle.team/docs/get-started-postgresql#postgresjs
- NextAuth v5 DrizzleAdapter — https://authjs.dev/getting-started/adapters/drizzle
