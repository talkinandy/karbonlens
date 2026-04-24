# T04 — Implementation Report

**Story:** T04 — Drizzle schema + DB client + env plumbing
**Audited spec SHA:** `c26af69` (docs(stories): revise T01-T05 specs per audit; status -> audited)
**Worktree branch:** `feature/T04-drizzle-schema`
**Worktree path:** `/root/.openclaw/workspace/karbonlens-worktrees/T04`

---

## Environment

| Field | Value |
|---|---|
| Node | v22.22.2 |
| npm | 10.9.7 |
| `drizzle-orm` | 0.45.2 |
| `drizzle-kit` | 0.31.10 |
| `postgres` (driver) | 3.4.9 |
| `@auth/drizzle-adapter` (reported only; T05 consumes) | 1.11.2 |
| `next` | 16.2.4 |
| Postgres | 16 on localhost:5432 (`karbonlens` DB) |
| PostGIS | 3.4 (extension active per migration 001) |

`npm install` after worktree checkout was near-no-op; all runtime deps were already declared in `package.json` by T03.

---

## Files created / modified

| Path | Action | Size |
|---|---|---|
| `lib/schema.ts` | Create | 15 tables, ~315 lines |
| `lib/db.ts` | Create | Singleton Drizzle client |
| `drizzle.config.ts` | Create | Introspect-only Drizzle Kit config |
| `app/api/health/route.ts` | Create | `GET /api/health` + sanitised classifier |
| `drizzle/.gitkeep` | Create | Keeps empty dir; generated output ignored |
| `.gitignore` | Modify | `/drizzle/*` + `!/drizzle/.gitkeep` |
| `.env.local` | Create (gitignored) | Real DATABASE_URL with secret password |
| `.env.example` | Verify only | T03 value confirmed present, not modified |
| `package-lock.json` | Reverted | npm normalized a metadata field during install; not T04's concern |

---

## Auth-table field ↔ column mapping (adapter contract proof)

| Table | Drizzle JS field | SQL column | Notes |
|---|---|---|---|
| `users` | `emailVerified` | `email_verified` | `timestamp(..., { withTimezone: true })`, nullable — required by adapter v5 |
| `users` | `email` | `email` | `text().notNull().unique()` |
| `accounts` | `userId` | `user_id` | FK → `users.id` ON DELETE CASCADE |
| `accounts` | `providerAccountId` | `provider_account_id` | `text().notNull()` |
| `accounts` | `expiresAt` | `expires_at` | `bigint(..., { mode: 'number' })` — safe for Unix seconds |
| `sessions` | `sessionToken` | `session_token` | `text().notNull().unique()` |
| `sessions` | `userId` | `user_id` | FK → `users.id` ON DELETE CASCADE |
| `sessions` | `expires` | `expires` | `timestamp(..., { withTimezone: true }).notNull()` |
| `verificationTokens` | `identifier` | `identifier` | Part of composite PK |
| `verificationTokens` | `token` | `token` | Part of composite PK |
| `verificationTokens` | `expires` | `expires` | `timestamp(..., { withTimezone: true }).notNull()` |

Composite PKs declared via table-config array: `primaryKey({ columns: [t.identifier, t.token] })` on `verificationTokens` and `primaryKey({ columns: [t.projectId, t.scoreDate] })` on `projectScores`.

---

## Acceptance-criteria results

| AC | Status | Evidence |
|---|---|---|
| AC-1 Health endpoint — DB up | PASS | `curl -s http://localhost:3001/api/health` → `{"ok":true,"db":"connected"}`, HTTP 200 |
| AC-2 Health endpoint — DB down/auth-failed | PASS | With `DATABASE_URL` password corrupted to `wrong`: `{"ok":false,"db":"error","error":"auth failed"}`, HTTP 503 — no URL/stack leak |
| AC-3 `npx tsc --noEmit` exits 0 | PASS | Command run after each file creation; exit code 0, no diagnostics |
| AC-4 PostGIS types explicit | PASS | `centroid` and `location` resolve to `customType<{ data: string; notNull: false }>` returning `string` (raw WKB hex). No `unknown`/`any` in `tsc` output |
| AC-5 Server-component Drizzle import type-checks | PASS | Smoke script did `await db.select().from(schema.projects).limit(1)` — typed as `InferSelectModel<typeof projects>[]`; compiles + runs |
| AC-6 Missing `DATABASE_URL` throws at import | PASS | `lib/db.ts` throws before `postgres()` is called when env var absent/empty |
| AC-7 `drizzle-kit introspect` round-trips (advisory) | NOT RUN | Advisory AC per spec §4; deferred. Config is wired to run when needed |
| AC-8 Generated column not insertable | PASS | Throwaway file with `@ts-expect-error` on `.values({ totalVcusAvailable: '0', ... })` was accepted by `tsc` — meaning the error was detected exactly as expected. File deleted after proof. |

---

## /api/health probe outputs (verbatim)

**Positive — correct password, Postgres up:**
```
$ curl -s -w "\nHTTP:%{http_code}\n" http://localhost:3001/api/health
{"ok":true,"db":"connected"}
HTTP:200
```

**Negative — `.env.local` password changed to `wrong`:**
```
$ curl -s -w "\nHTTP:%{http_code}\n" http://localhost:3001/api/health
{"ok":false,"db":"error","error":"auth failed"}
HTTP:503
```

After the negative test, `.env.local` was restored to the real password and the positive test re-run with the same 200 response.

### Classifier implementation note

The initial classifier inspected `err.message` only, which caused the auth-failed error to be classified as `"unknown"` because Drizzle's postgres-js driver wraps the real postgres.js error inside `DrizzleQueryError` whose top-level `.message` is `"Failed query: SELECT 1"` — the Postgres banner (`password authentication failed for user "karbonlens"`) lives on `.cause.message`. The shipped implementation walks `err` → `err.cause` up to 5 deep and concatenates all `.message` strings before matching. This is still sanitisation-safe: only the three known classifier strings are ever returned to the client.

---

## Drizzle smoke-test output (verbatim)

Script `scripts/smoke-db.ts` (deleted after run):
```typescript
import { db } from '../lib/db';
import { projects } from '../lib/schema';
const rows = await db.select().from(projects).limit(1);
console.log('projects row count:', rows.length);
console.log('rows:', JSON.stringify(rows, null, 2));
await db.$client.end();
```

Result:
```
$ npx tsx scripts/smoke-db.ts
projects row count: 0
rows: []
```

Round-trip confirmed: connection opens, `SELECT … FROM projects LIMIT 1` serialises correctly, empty result set deserialises to `[]`, pool closes cleanly.

---

## `npm run build` (verbatim, tail)

```
▲ Next.js 16.2.4 (Turbopack)
- Environments: .env.local

  Creating an optimized production build ...
✓ Compiled successfully in 8.8s
  Running TypeScript ...
  Finished TypeScript in 5.9s ...
  Collecting page data using 1 worker ...
✓ Generating static pages using 1 worker (8/8) in 304ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /alerts
├ ƒ /api/health
├ ○ /prices
├ ○ /projects
├ ƒ /projects/[slug]
└ ○ /regulatory
```

`/api/health` correctly marked dynamic (`ƒ`) by `export const dynamic = 'force-dynamic'`. All six public screens still prerender as static as T03 configured them.

---

## Deviations from spec

1. **Classifier chain-walk.** Spec §7(viii) suggested classifying `err.message` directly. In practice, Drizzle wraps driver errors (`DrizzleQueryError`) and the Postgres banner is on `err.cause.message`. The shipped classifier walks up to 5 levels of `.cause` and concatenates messages before pattern-matching. Sanitisation guarantees are unchanged — only `'connection refused' | 'auth failed' | 'unknown'` is ever returned. Without this change, AC-2 fails (returns `"unknown"` for an auth error).

2. **`ScoreComponents` type inlined in `lib/schema.ts`.** Spec §7(v) suggested typing `project_scores.components` with an interface imported from `lib/score.ts`. That file does not exist in v0.1. To avoid a cross-file dependency T04 has no reason to introduce, `ScoreComponents` is declared and exported from `lib/schema.ts` itself with a permissive-but-shape-named structure. T09 (score job) can either use this export or re-declare as needed.

3. **GIST indexes declared SQL-only.** Drizzle's `index()` builder cannot express `USING GIST` over a `customType<string>` column without hand-written op-class plumbing that has no precedent in the Drizzle codebase. Inline comments on `projects` and `satelliteAlerts` note that `idx_projects_centroid` and `idx_sat_location` are DB-enforced (migration 001 creates them); Drizzle is aware of the columns themselves.

4. **`docs/architecture.md` §3 lists 11 indexes.** The Drizzle table-config arrays declare 9 non-GIST indexes. The two GIST indexes (item 3 above) are DB-enforced. Total index count on the DB is 11 per the SQL migration — unchanged.

5. **`project_match_queue.candidate_*_id` FKs.** SQL migration has no `ON DELETE` clause, so Postgres defaults to RESTRICT. Drizzle's `.references()` call omits the `onDelete` option to match, avoiding accidental CASCADE drift.

6. **`package-lock.json` churn reverted.** `npm install` normalised the `name` field from `karbonlens-scaffold` to `karbonlens` (the `package.json` value). That is a T03 cleanup, not a T04 concern — the diff was reverted to keep commits focused.

---

## What the code-auditor should scrutinize

1. **Auth-adapter field-name contract.** Cross-reference `lib/schema.ts` against `@auth/drizzle-adapter` v5 source (`node_modules/@auth/drizzle-adapter/lib/pg.d.ts`). Each of the seven JS keys in the mapping table above must be spelled identically — the adapter reads these by property name. A silent typo (e.g. `sessionToken` → `sessiontoken`) would only fail at NextAuth runtime in T05, not at T04 typecheck.
2. **BigInt mode for `accounts.expires_at`.** Spec §7(iv) permits switching to `{ mode: 'bigint' }` if the installed adapter version requires it. T05 must verify before merging; inline comment flags the review point.
3. **PostGIS `customType` shape.** The chosen shape (`{ data: string; notNull: false }`) lets the column be selected without a `NOT NULL` constraint (neither SQL column is NOT NULL). Auditor should confirm inserts of `null` to `satellite_alerts.location` still typecheck when T07 starts writing rows.
4. **Generated-column insert exclusion.** The `@ts-expect-error` proof was manual and ephemeral. Auditor can reproduce by temporarily adding a line `await db.insert(projects).values({ slug: 'x', nameCanonical: 'y', totalVcusAvailable: '0' })` and confirming `tsc --noEmit` fails.
5. **Error classifier coverage.** Three classifier buckets (`'connection refused' | 'auth failed' | 'unknown'`). Any future Postgres error string the classifier does not recognise falls into `'unknown'` with HTTP 503 — no information leak, but also no actionable signal. Acceptable for v0.1.
6. **Drizzle `.execute(sql\`SELECT 1\`)` vs `$client\`SELECT 1\`` syntax.** The former hits Drizzle's type layer and validates the import path; the latter bypasses it. Using `.execute()` is intentional so a broken schema import surfaces in the health check.
7. **`drizzle.config.ts` destructive flag.** Auditor should confirm the top-of-file warning comment is still in place and that no one has set `push` mode.

---

## Out of scope / follow-ups

- **OQ-1** (Netlify production connectivity — Tailscale vs thin proxy vs platform migration) remains open. `lib/db.ts` has a `TODO v0.2` note, not a decision.
- **OQ-2** skipped per spec recommendation — no SQL-type validator helper in v0.1.
- **AC-7** (`drizzle-kit introspect` advisory round-trip) not run; config is wired.
- **`lib/auth.ts`** intentionally absent — T05 owns it.
- **`middleware.ts`** intentionally absent — T05 owns it.

---

## Fix round 1 (response to code audit verdict FAIL)

Code-auditor verdict 2026-04-21: **FAIL** on commit `3a9b048`. Two blocking findings (see `docs/stories/reviews/T04-code-audit.md`):

- **B1** — `@auth/drizzle-adapter` v1.11.2 reads `accounts.{refresh_token, access_token, expires_at, token_type, id_token, session_state}` by **snake_case** JS keys. T04 declared them in camelCase (following the spec). Drizzle's `insert.values()` silently drops unknown keys, so the adapter would have written NULL for all six.
- **B2** — `/api/health` classifier returned `"unknown"` for ECONNREFUSED. postgres.js puts `ECONNREFUSED` on `err.cause.code` and `err.cause.errors[].code`, never in a message string. The classifier only walked `.message` fields.

### Files changed in this fix round

| File | Change |
|---|---|
| `lib/schema.ts` | Renamed 6 `accounts` JS keys to snake_case (`refresh_token`, `access_token`, `expires_at`, `token_type`, `id_token`, `session_state`); updated contract comment citing auditor confirmation and adapter source (`@auth/drizzle-adapter/lib/pg.js`). |
| `app/api/health/route.ts` | `classifyDbError` now collects `.code`, `.errors[].code`, `.errors[].message` alongside `.message` at each `.cause` step; depth cap lifted from 5 → 6 with circular-cause protection preserved; matches on `econnrefused`/`econnreset` tokens before the message-substring fallback. |
| `docs/stories/T04-drizzle-schema-db-client.md` | §5 adapter field-name table: added 6 token-field rows with snake_case JS keys + auditor-confirmed correction note citing adapter source. |
| `docs/stories/T02-schema-migration-001.md` | §6 adapter field-name mapping: corrected the 6 token fields camelCase → snake_case + same correction note. |

`docs/architecture.md` untouched (SQL columns were always snake_case — never wrong). `.env.example` untouched. CHANGELOG.md untouched — Stage 5 owns that after re-audit.

### Re-verification

`npx tsc --noEmit` and `npm run build` both exit 0 post-fix; build output still marks `/api/health` as ƒ (Dynamic); 8/8 static pages generated.

**Adapter-probe** (pure snake_case values mirroring adapter v1.11.2's `linkAccount` insert, live against local Postgres, followed by cleanup via `eq(accounts.id, ...)`): all 6 token columns round-trip non-null — `refresh_token`, `access_token`, `expires_at` (1800000000), `token_type` (Bearer), `id_token`, `session_state`. Scope, userId, providerAccountId also verified. Cleanup deleted both probe rows.

**/api/health scenarios** — independently logged by each dev server (see Next.js request log lines `GET /api/health <status> in Xms`):

- Positive (port 3070, working DATABASE_URL): server log `GET /api/health 200`; body `{"ok":true,"db":"connected"}`.
- Auth-failed (port 3071, `postgresql://karbonlens:wrongpass@localhost:5432/...`): server log `GET /api/health 503`; body `{"ok":false,"db":"error","error":"auth failed"}`.
- Connection-refused (port 3072, `postgresql://karbonlens:x@localhost:9999/...`) — the test failing at audit time: server log `GET /api/health 503`; body `{"ok":false,"db":"error","error":"connection refused"}`.

Both B1 (adapter-probe round-trip) and B2 (connection-refused classification) now pass. Sanitisation envelope intact: no DATABASE_URL, stack trace, or credential material in 503 bodies.

---

## T04 follow-ups (non-blocking audit findings)

The following non-blocking items were flagged by the code auditor (see `docs/stories/reviews/T04-code-audit.md` §Non-blocking findings). None block T04 merge; each is assigned to the most natural downstream story.

| # | Finding | Action | Picked up by |
|---|---|---|---|
| NB-1 | T02 §6 and T04 §5 adapter field tables had camelCase for the 6 token fields — spec bug. | Both tables corrected in fix commit 82bdd96. | Closed (done in fix round 1). |
| NB-2 | Health classifier `ECONNRESET` / timeout branch is now redundant after `.code` walk; safe to leave as defence-in-depth. | No action required. | N/A |
| NB-3 | `drizzle-kit introspect` (AC-7 advisory) not run. | Advisory only; config is wired for future runs. | Backlog / dev workflow. |
| NB-4 | `customType` shape `{ data: string; notNull: false }` enables nullable geography insert for `satellite_alerts.location`. | Verified correct. No action. | T07 (GFW alerts scraper) should confirm at integration time. |
| NB-5 | Dev server port cosmetic (`localhost:3001` vs `:3000` in spec AC-1). | No action. Port is incidental. | N/A |
| NB-6 | Generated-column insert-exclusion proof was manual/ephemeral. | `generatedAlwaysAs()` behaviour is well-established in Drizzle upstream. | T09 (score job) can add a compile-time assertion if desired. |
