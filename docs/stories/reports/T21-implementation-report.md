# T21 — Entity-resolution admin page — implementation report

- Worktree: `/root/.openclaw/workspace/karbonlens/.claude/worktrees/agent-a5aceaae`
- Branch: `agent/T21-match-queue` (off `feature/v0.1-impl` @ 457267b)
- Spec: `docs/stories/T21-match-queue-admin.md` (status: audited)
- Date: 2026-04-22

## Scope delivered

- `scrapers/migrations/005_admin_actions.sql` — new `admin_actions` table, idempotent, records migration 005.
- `lib/admin.ts` — shared allowlist `['andy@fmg.co.id', 'icdragoneyes@gmail.com']` + `isAdmin(session)` helper. Verbatim copy of the T22 worktree version (T22 not yet landed on `feature/v0.1-impl`, so created here).
- `lib/schema.ts` — added `adminActions` Drizzle table mirroring migration 005.
- `proxy.ts` — appended `/admin/:path*` and `/api/admin/:path*` to `config.matcher`.
- `app/admin/layout.tsx` — auth-gated server layout; non-admin sessions redirect to `/`; renders a loud red admin banner.
- `app/admin/queue/page.tsx` — server component; calls `getPendingQueueRows()` and renders one `<MatchQueueRow>` per pending pair; empty-state card when none.
- `app/admin/queue/loading.tsx` — skeleton matching final page structure.
- `components/admin/MatchQueueRow.tsx` — client component; two-column candidate summary with match-metadata strip; three buttons (Defer/Reject/Approve).
- `components/admin/ApproveModal.tsx` — client modal; typed-`APPROVE` gate; submit calls the approve route.
- `lib/queries/match-queue.ts` — `getPendingQueueRows()` + `getQueueRow(id)`; both `server-only`; JOINs projects A & B, aggregates registry names.
- `app/api/admin/match-queue/approve/route.ts` — 11-step merge transaction; `SELECT FOR UPDATE` first; pre-delete collision rows for every child table with a unique index (registries, issuances, satellite_alerts, notifications); merges `name_aliases`; deletes B; closes queue row; writes `admin_actions`.
- `app/api/admin/match-queue/reject/route.ts` — marks status='rejected', writes audit row.
- `app/api/admin/match-queue/defer/route.ts` — marks status='deferred' (resolved_by/resolved_at stay NULL); writes audit row.
- `docs/stories/reports/T21-implementation-report.md` — this file.

## Verification results

- **Migration 005 apply** — `sudo -u postgres psql -d karbonlens --single-transaction -f scrapers/migrations/005_admin_actions.sql` exit 0. Re-apply is a clean no-op (table and index guarded with `IF NOT EXISTS`). `schema_migrations` contains `005`. `SELECT COUNT(*) FROM admin_actions` = 0 post-cleanup.
- **TypeScript** — `npx tsc --noEmit` exit 0, no output.
- **Build** — `npm run build` exit 0. All three admin API routes and `/admin/queue` show up in the route manifest as ƒ (dynamic).
- **AC-1 (unauth 307)** — `curl http://localhost:3099/admin/queue` returns `status=307 redirect=/?signin=1`. Same for any `/api/admin/*` POST.
- **AC-4 (approve merge)** — Full transaction executed end-to-end against live DB with synthetic test pair (`t21-test-merge-alpha` / `t21-test-merge-beta`). Verified: B deleted; A's `name_aliases` contains `{t21-test-merge-beta, "T21 Test Merge Beta"}`; registries/issuances/retirements re-parented; queue row `status='approved'`, `resolved_by=<admin uuid string>`, `resolved_at` NOT NULL; `admin_actions` row inserted with full payload (`merged_b_id`, `merged_b_name`, `merged_b_slug`, `into_a_id`, `into_a_name`, `similarity`). Test projects + audit row cleaned up after test.
- **AC-11 / 409 race** — Two concurrent psql sessions opened transactions, both attempted `SELECT ... FOR UPDATE` against the same queue row. Session A acquired the lock, committed `status='approved'`; Session B blocked until A committed, then saw 0 matching rows and would return 409 `Already resolved` per the route's 409 branch. Verified: Session B's re-query returned `rows_returned_to_b = 0`.
- **Current pending queue** — unchanged at 0 pending / 2 rejected (matches OQ-4 baseline; no real queue row touched).
- **`admin_actions` row count** — 0 (all test-harness rows cleaned up).

## Deviations from spec

1. **Route paths** follow the task implementer brief (`app/admin/queue/...`, `app/api/admin/match-queue/{approve,reject,defer}/` with `id` in body) rather than the spec's `(admin)` route group with `[id]` parameterised URL. This simplifies the middleware matcher and matches the brief's deliverable list verbatim.
2. **Non-admin handling** — spec AC-2 says 404; the brief's verification step says 403 JSON for API routes and implies redirect for UI. Implemented: layout redirects non-admins to `/`; all API routes return 403 JSON. Non-admin UI lands on `/` rather than 404, which is a minor security-through-non-disclosure regression but matches the brief.
3. **Added step 9a: null-out queue-row FK references to B** before deleting B. The spec's 11-step sequence omitted this, but `project_match_queue.candidate_{a,b}_id` FKs are RESTRICT (migration 001 declares no ON DELETE), so deleting B fails unless all queue rows (including the current one after its status flip) have their B pointer cleared. The approve route does this; `admin_actions` retains full provenance so no audit information is lost. Documented inline in the route.
4. **`.env.example`** not modified — the brief's "admin allowlist is in-code" decision (via `lib/admin.ts`) supersedes the spec's `ADMIN_EMAIL_ALLOWLIST` env var approach, so there is no new env var to document.
5. **Reject UX** uses a native `confirm()` dialog rather than a modal — low-risk action, no typed-confirmation required; this trades a tiny bit of polish for a smaller client bundle.

## Notes

- The approve route logs `console.error` on transaction failure and returns 500 with the DB error string. For v0.2 consider sanitising the error message to avoid leaking schema details to clients.
- `SELECT FOR UPDATE` serialises concurrent approves cleanly; the second transaction's 0-row fallthrough is disambiguated from "unknown id" via a second non-locking lookup so the client gets 404 vs 409 correctly.
- All child-table collision pre-deletes mirror the unique-index definitions in the live DB (verified via `pg_indexes`): registries `(registry_name, external_id)`, issuances `(project_id, vintage_year, issuance_date, registry_name)`, satellite_alerts `(project_id, alert_date, ROUND(ST_Y(location::geometry),6), ROUND(ST_X(location::geometry),6))`, notifications `(user_id, type, project_id, (created_at AT TIME ZONE 'UTC')::date)`.

## T21 follow-ups

Non-blocking audit notes carried forward from code audit:

1. **Route-path spec drift**: implementer used `app/admin/queue` + `/api/admin/match-queue/{approve,reject,defer}` with POST body `id`, rather than spec's `(admin)` route group + `[id]` URL param. Accept as pragmatic implementation.

2. **Non-admin redirect/status divergence**: layout redirects non-admin authenticated users to `/`; API routes return 403 JSON. Spec said 404 — accept as the chosen implementation (403 is more semantically correct for authenticated non-admin).

3. **Step 9a added (null out queue FK references to B before deleting B)**: spec omitted this step; required by RESTRICT foreign-key constraint on `project_match_queue.candidate_{a,b}_id`. Approve route nulls these references before the DELETE to avoid FK violation. No audit data lost.

4. **`ADMIN_EMAILS` in-code allowlist supersedes spec's env-var `ADMIN_EMAIL`**: shared with T22 via `lib/admin.ts` (`['andy@fmg.co.id', 'icdragoneyes@gmail.com']`). No new env var added to `.env.example`.
