---
id: T04
title: Drizzle schema + DB client + env plumbing
phase: 1
status: draft
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

1. **`lib/schema.ts`** — Drizzle TypeScript table definitions mirroring all 15 tables from `docs/architecture.md` §3 (including `schema_migrations`). Full column-type mapping specified in §5 below.
2. **`lib/db.ts`** — singleton Drizzle client; named export `db`; throws at import time if `DATABASE_URL` is missing.
3. **`drizzle.config.ts`** — Drizzle Kit config pointing at `lib/schema.ts` and the local database; output dir `drizzle/`. Used for `drizzle-kit introspect` to validate round-trips; _not_ used for migrations in v0.1.
4. **`app/api/health/route.ts`** — GET endpoint; executes `SELECT 1` via Drizzle raw query; returns JSON health payload; marked `force-dynamic`.
5. **`.env.example`** — confirm `DATABASE_URL` key is present with the `localhost` placeholder. Append only — do not remove keys added by T03.

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
 And the body contains an "error" field with a non-empty string message
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
Then those columns have an explicit TypeScript type (string for raw WKT/GeoJSON)
 And no column is typed as `unknown` or `any`
```

**AC-5: Server component import type-checks**
```
Given a throwaway server component or route that imports {db} from 'lib/db'
  And runs `await db.select().from(schema.projects).limit(1)`
When the implementer runs `npx tsc --noEmit`
Then the expression type-checks without error
 And the return type is inferred as an array of the projects row type
```

**AC-6: Missing DATABASE_URL throws at import time**
```
Given DATABASE_URL is not set in the environment
When any module that imports from 'lib/db' is evaluated
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

## 5. Inputs & outputs

### Inputs

- `DATABASE_URL` in `.env.local` — format: `postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens`
- `docs/architecture.md` §3 — canonical SQL schema (source of truth)
- `docs/architecture.md` §7 — full env var list
- T02 must be complete (tables exist in the live DB)
- T03 must be complete (Next.js monorepo and `package.json` with `drizzle-orm`, `postgres`, `drizzle-kit` already installed)

### Outputs — files created or modified

| File | Action | Notes |
|---|---|---|
| `lib/schema.ts` | Create | 15 Drizzle table definitions |
| `lib/db.ts` | Create | Singleton client, named export `db` |
| `drizzle.config.ts` | Create | Drizzle Kit config |
| `app/api/health/route.ts` | Create | GET handler, force-dynamic |
| `.env.example` | Append | Confirm DATABASE_URL key |
| `drizzle/.gitkeep` | Create | Keeps empty drizzle/ dir in git |

`drizzle/` (generated output) must be added to `.gitignore` except for the `.gitkeep`. Generated introspection artifacts are not committed.

### Drizzle column-type mapping (implementer reference)

The table below translates every SQL type from `docs/architecture.md` §3 to its Drizzle counterpart.

| SQL type | Drizzle helper | Notes |
|---|---|---|
| `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `uuid('id').primaryKey().defaultRandom()` | |
| `TEXT` | `text('col')` | |
| `TEXT[]` | `text('col').array()` | Use `.array()` helper; validated at app layer |
| `CHAR(2)` | `char('col', { length: 2 })` | |
| `NUMERIC` | `numeric('col')` | Returns string from DB; cast in app if needed |
| `INTEGER` | `integer('col')` | |
| `BIGINT` (accounts.expires_at) | `bigint('expires_at', { mode: 'number' })` | JS Number loses precision above 2^53; safe for Unix epoch seconds, not for arbitrary 64-bit ints. Document this caveat in a comment on the column. |
| `BOOLEAN` | `boolean('col')` | |
| `DATE` | `date('col')` | Returns string 'YYYY-MM-DD' in Drizzle's default mode |
| `TIMESTAMPTZ` | `timestamp('col', { withTimezone: true })` | |
| `JSONB` (known shape) | `jsonb('col').$type<MyShape>()` | Provide the generic when payload shape is known (e.g. score components) |
| `JSONB` (unknown shape) | `jsonb('col').$type<unknown>()` | For raw_payload columns where shape evolves |
| `GEOGRAPHY(POINT, 4326)` | `customType<{ data: string }>` | See pattern below |
| `NUMERIC GENERATED ALWAYS AS ... STORED` | Omit from schema or use `generatedAlwaysAs()` | The computed column `total_vcus_available` can be omitted from Drizzle inserts/updates; read it via `sql` if needed. Check Drizzle docs for `generatedAlwaysAs()` support at implementation time. |
| `TEXT PRIMARY KEY` (verification_tokens) | `text('identifier').notNull()` + composite PK | |

**PostGIS custom type pattern** — use this for `projects.centroid` and `satellite_alerts.location`:

```typescript
import { customType } from 'drizzle-orm/pg-core';

const geography = customType<{ data: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

// Usage in table definition:
centroid: geography('centroid'),
location: geography('location'),
```

Queries that need to read these columns as GeoJSON should use Drizzle's `sql` tag to call `ST_AsGeoJSON()` or `ST_AsText()`. Writing uses `ST_Point(lon, lat)::geography` via `sql`.

### Table inventory (15 tables)

`schema_migrations`, `projects`, `registries`, `issuances`, `retirements`, `idx_monthly_snapshots`, `satellite_alerts`, `regulatory_events`, `project_scores`, `project_match_queue`, `users`, `accounts`, `sessions`, `verification_tokens`, `notifications`.

All must appear in `lib/schema.ts` as named exports so downstream tasks can import them individually (e.g. `import { projects, notifications } from '@/lib/schema'`).

## 6. Dependencies & interactions

### Blocked by
- **T02** — tables must exist in the DB before the health check can pass
- **T03** — `drizzle-orm`, `postgres`, `drizzle-kit` must be installed; Next.js project must exist

### Blocks
- **T05** — NextAuth DrizzleAdapter needs `db` and the auth-related table definitions (`users`, `accounts`, `sessions`, `verification_tokens`)
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
- `.env.example` (append-only; do not modify keys added by T03)

T05 will create `lib/auth.ts` — do not create or pre-populate that file here.

## 7. Edge cases & failure modes

**(i) Missing DATABASE_URL**
`lib/db.ts` must check `process.env.DATABASE_URL` before constructing the client. Throw an explicit `Error('DATABASE_URL is not set')` if undefined or empty. Do not use the `!` non-null assertion silently — make the failure visible. This means the server process crashes early with a clear message rather than propagating a cryptic connection error later.

```typescript
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Add it to .env.local.');
}
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
expiresAt: bigint('expires_at', { mode: 'number' }),
```
If NextAuth v5's DrizzleAdapter expects `BigInt` mode, switch to `{ mode: 'bigint' }` — check the adapter source at implementation time.

**(v) JSONB typing**
- `project_scores.components` — type with a known interface `ScoreComponents` defined in the same file or imported from `lib/score.ts`.
- `raw_payload` columns (registries, issuances, retirements, satellite_alerts, idx_monthly_snapshots) — type as `.$type<unknown>()` since scraper payload shapes evolve.
- `raw_metadata` on registries — same: `.$type<unknown>()`.

**(vi) Computed column total_vcus_available**
The SQL column is `GENERATED ALWAYS AS (total_vcus_issued - total_vcus_retired) STORED`. Drizzle's support for generated columns varies by version. At implementation time, check whether `generatedAlwaysAs()` is available in the installed version. If not, simply omit this column from inserts/updates and read it explicitly with `sql<string>\`total_vcus_available\`` in select queries. Document whichever approach is used with a comment.

**(vii) schema_migrations table**
Include a minimal Drizzle definition for `schema_migrations` for completeness, even though T04 never writes to it:
```typescript
export const schemaMigrations = pgTable('schema_migrations', {
  version: text('version').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow(),
});
```

## 8. Definition of done

- [ ] All acceptance criteria pass (AC-1 through AC-6; AC-7 advisory).
- [ ] `lib/schema.ts`, `lib/db.ts`, `drizzle.config.ts`, `app/api/health/route.ts` landed in `feature/v0.1-impl`.
- [ ] `.env.example` contains `DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens`.
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

**OQ-3: NextAuth DrizzleAdapter column naming.**
The `@auth/drizzle-adapter` for NextAuth v5 has specific expectations about column names and types in the `users`, `accounts`, `sessions`, and `verification_tokens` tables. The architecture schema in `docs/architecture.md` §3 was written to match these expectations, but there may be minor mismatches (e.g., `emailVerified` vs `email_verified`, camelCase vs snake_case field names, `expires` vs `expires_at`). The implementer must verify against the adapter source before finalizing `lib/schema.ts`. Flag any required migrations as a new SQL file rather than modifying `001_init.sql`.

**OQ-4: `drizzle-kit introspect` and PostGIS types.**
When `drizzle-kit introspect` encounters `geography(Point, 4326)` columns, it may emit unsupported-type warnings or fall back to `text`. This is expected — the introspect output is for reference only; `lib/schema.ts` is hand-authored and supersedes it.

## 10. References

- `docs/architecture.md` §3 — canonical SQL schema (source of truth for all column names and types)
- `docs/architecture.md` §7 — full environment variable list
- `docs/TASKS.md` §T04 — original task description (superseded by Andy's local-dev-first override on connectivity)
- `docs/TASKS.md` §T05 — NextAuth config (shows expected shape of `lib/auth.ts` that T04 must not pre-create)
- Drizzle ORM docs: `customType` API — https://orm.drizzle.team/docs/custom-types
- Drizzle ORM docs: `postgres-js` driver — https://orm.drizzle.team/docs/get-started-postgresql#postgresjs
- NextAuth v5 DrizzleAdapter — https://authjs.dev/getting-started/adapters/drizzle
