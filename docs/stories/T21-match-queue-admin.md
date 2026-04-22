---
id: T21
title: Entity resolution admin page — match-queue review
phase: 4
status: draft
blocked_by: [T06]
blocks: []
owner: unassigned
effort_estimate: 3h
---

## 1. User story

As an admin (Andy or a trusted co-reviewer), I want a protected web page that lists all pending
entries in `project_match_queue` and lets me approve a merge, reject a pair, or defer the decision
— with a forced confirmation step before any destructive action — so that duplicate projects
produced by the T06 Verra scraper's entity resolver can be resolved safely and auditably without
touching the database directly.

---

## 2. Context & rationale

T06's Verra scraper flags candidate duplicate pairs by inserting rows into `project_match_queue`
when the fuzzy name-similarity score for two projects falls in [0.70, 0.95). The live DB currently
holds two pending rows:

- "wastewater treatment" vs "paper mill" project pair @ 0.779 similarity (reason: `name_fuzzy`)
- "cookstoves 1" vs "cookstoves 2" @ 0.942 similarity (reason: `name_fuzzy`)

Until these rows are resolved, both sides of each pair exist as independent `projects` rows,
inflating the project count and risking double-counting in issuance tallies and score comparisons.

Architecture §3 specifies the queue table shape:

```
project_match_queue: id, candidate_a_id, candidate_b_id, similarity NUMERIC,
                     match_reason TEXT, status TEXT ('pending'|'approved'|'rejected'),
                     created_at, resolved_at, resolved_by UUID REFERENCES users(id)
```

The `resolved_by` FK targets `users(id)`, not `users(email)`, so the admin's DB `users` row
must exist (it does — Andy's Google login created it in T05).

Architecture §6.3 mandates human-in-the-loop for all merges in v0.1. Auto-merge above any
threshold is explicitly out of scope.

The admin area is implemented as a Next.js route group `(admin)` outside the existing `(app)`
and `(public)` groups. Access is gated by an `ADMIN_EMAIL_ALLOWLIST` env var (server-side only,
never `NEXT_PUBLIC_`). Non-admins receive 404 — not 403 — to avoid disclosing the existence of
the admin area (security through non-disclosure is the deliberate choice for v0.1; the admin
area has no meaningful public surface and revealing it would invite probing).

---

## 3. Scope

### In scope

#### 3.1 Admin email allowlist gate

Add `ADMIN_EMAIL_ALLOWLIST` to `.env.example` (server-side env var; no `NEXT_PUBLIC_` prefix).

Default value (document in `.env.example`):
```
ADMIN_EMAIL_ALLOWLIST=andy@fmg.co.id,icdragoneyes@gmail.com
```

Create `lib/admin.ts`:

```typescript
/**
 * Returns true if the given email is in the ADMIN_EMAIL_ALLOWLIST env var.
 * Env var is comma-separated, trimmed, case-insensitive.
 * Throws if called from a client component (import must be server-only).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}
```

`lib/admin.ts` is a server-only module. Add `import 'server-only';` at the top.

#### 3.2 Middleware — proxy.ts extension

Append `/admin/:path*` to the `config.matcher` array in `proxy.ts`. The existing `auth()` call
in the middleware will handle the unauthenticated-user redirect (307 to `/?signin=1`).

The allowlist check (step 3.3) happens **inside** the page/layout server component, **not** in
the middleware. This keeps the middleware simple and avoids async DB/env reads in the hot path.

Diff for `proxy.ts` `config.matcher`:

```typescript
export const config = {
  matcher: [
    '/projects/:path*',
    '/prices/:path*',
    '/regulatory/:path*',
    '/alerts/:path*',
    '/admin/:path*',         // ← add this line
  ],
};
```

No other changes to `proxy.ts`.

#### 3.3 Route group and shared layout

Create `app/(admin)/layout.tsx`:

```typescript
import 'server-only';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { notFound } from 'next/navigation';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound(); // 404 — not 403
  }

  return (
    <div>
      <div
        style={{
          background: '#b91c1c',
          color: '#fff',
          fontWeight: 700,
          padding: '6px 16px',
          fontSize: '0.8rem',
          letterSpacing: '0.08em',
          textAlign: 'center',
        }}
        aria-label="Admin area warning"
      >
        ADMIN — internal tooling only
      </div>
      {children}
    </div>
  );
}
```

The red banner is deliberately loud; this is intentional so the admin never confuses the admin
area with the public product.

#### 3.4 Match-queue list page — `app/(admin)/admin/match-queue/page.tsx`

Server component. Calls `getPendingQueueRows()` from `lib/queries/match-queue.ts` and renders
the result.

Layout per pending row:

- **Row card** (`.kl-card`): two-column side-by-side showing candidate A (left) vs candidate B
  (right). Fields displayed for each candidate:
  - Project name (`name_canonical`)
  - Developer
  - Methodology
  - Hectares
  - Province
  - Registry names (aggregated from `registries` join)
  - Total VCUs issued
  - Status badge (reuse `displayStatus` / `badgePillClass` from `lib/display/status.ts`)
- **Match metadata strip** between the two columns: similarity score (percentage to 1 decimal
  place, e.g. "77.9 %"), match reason (e.g. "name_fuzzy"), queue row `created_at`.
- **Action buttons**: Approve (`.kl-btn--danger` — red, destructive), Reject
  (`.kl-btn--secondary`), Defer (`.kl-btn--neutral`). All three are rendered as `<button>` elements
  inside a `<form action="">` that POSTs to the relevant API route (see §3.5).

When the queue is empty (all rows resolved), render:

```
No pending matches. All pairs have been reviewed.
```

in a `.kl-card` with `.kl-section-label` styling, matching the empty-state pattern from T11 §3.6.

#### 3.5 API routes

Three API routes, one per action. All live under `app/api/admin/match-queue/[id]/`:

**`app/api/admin/match-queue/[id]/approve/route.ts`**

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response>
```

Steps (all inside a single Drizzle `db.transaction()`):

1. Auth check: call `auth()`; if not admin email → return `Response.json({ error: 'forbidden' }, { status: 404 })`.
2. Load the queue row. If not found or `status !== 'pending'` → return 409 with descriptive error.
3. Load project A and project B. If either is missing (already deleted) → return 409: "One or both
   candidate projects have already been deleted. Cannot complete merge."
4. Typed confirmation: read `confirmation` field from the JSON request body. If it is not exactly
   the string `"APPROVE"` → return 400: "Confirmation token mismatch."
5. Re-parent all FK rows from B's `id` to A's `id`:
   ```sql
   -- registries
   UPDATE registries SET project_id = $a_id WHERE project_id = $b_id;
   -- issuances
   UPDATE issuances SET project_id = $a_id WHERE project_id = $b_id;
   -- retirements
   UPDATE retirements SET project_id = $a_id WHERE project_id = $b_id;
   -- satellite_alerts (ON CONFLICT DO NOTHING on the expression-unique index
   --   uq_sat_project_date_loc — migration 002 created this)
   UPDATE satellite_alerts SET project_id = $a_id
     WHERE project_id = $b_id
     AND NOT EXISTS (
       SELECT 1 FROM satellite_alerts sa2
       WHERE sa2.project_id = $a_id
         AND sa2.alert_date = satellite_alerts.alert_date
         AND ST_Equals(sa2.location::geometry, satellite_alerts.location::geometry)
     );
   -- notifications: re-point project reference (does not affect FK integrity;
   --   the column is ON DELETE SET NULL so it's nullable)
   UPDATE notifications SET project_id = $a_id WHERE project_id = $b_id;
   ```
   Note: `satellite_alerts` uses a compound expression unique index (`uq_sat_project_date_loc`
   from migration 002) — not a named constraint. Use the `NOT EXISTS` guard above rather than
   `ON CONFLICT ON CONSTRAINT` syntax, which does not work with expression indexes (see
   architecture §13 Phase 2 note).
6. Add B's `slug` and `name_canonical` to A's `name_aliases` array (deduplicated):
   ```sql
   UPDATE projects
   SET name_aliases = ARRAY(
     SELECT DISTINCT unnest(
       COALESCE(name_aliases, '{}') || ARRAY[$b_slug, $b_name_canonical]
     )
   )
   WHERE id = $a_id;
   ```
7. Delete project B:
   ```sql
   DELETE FROM projects WHERE id = $b_id;
   ```
   Child rows in tables with `ON DELETE CASCADE` (`registries`, `issuances`, `retirements`,
   `project_scores`) are already re-parented to A in step 5; any stragglers are deleted by the
   cascade. `satellite_alerts` uses `ON DELETE SET NULL` — any unconverted rows (duplicates
   skipped in step 5) will have `project_id` set to NULL by the cascade, which is acceptable.
8. Mark the queue row resolved:
   ```sql
   UPDATE project_match_queue
   SET status = 'approved', resolved_by = $admin_user_id, resolved_at = NOW()
   WHERE id = $queue_id;
   ```
9. Write audit log row:
   ```sql
   INSERT INTO notifications (user_id, type, title, description, project_id, url)
   VALUES (
     $admin_user_id,
     'admin-action',
     'Merge approved: ' || $b_name || ' → ' || $a_name,
     'Queue row ' || $queue_id || '. Similarity: ' || $similarity,
     $a_id,
     '/admin/match-queue'
   );
   ```
   Reuses the `notifications` table with `type = 'admin-action'`. This avoids a schema migration
   for v0.1. The `type` check constraint in the schema spec does not enumerate values (it is `TEXT`,
   no CHECK in migration 001), so `'admin-action'` is a valid value.
10. Return `Response.json({ ok: true, mergedInto: a_id })` with status 200.

**`app/api/admin/match-queue/[id]/reject/route.ts`**

Steps:
1. Auth check (same as above).
2. Load queue row; if not pending → 409.
3. Update status:
   ```sql
   UPDATE project_match_queue
   SET status = 'rejected', resolved_by = $admin_user_id, resolved_at = NOW()
   WHERE id = $queue_id;
   ```
4. Write audit log row (type = `'admin-action'`, title = `'Match rejected: ' + names`).
5. Return `{ ok: true }` 200.

No project rows are modified. No transaction needed (single UPDATE + INSERT).

**`app/api/admin/match-queue/[id]/defer/route.ts`**

Steps:
1. Auth check.
2. Load queue row; if not found → 404. If status is already `'deferred'` → 409 "already deferred".
3. Update status:
   ```sql
   UPDATE project_match_queue
   SET status = 'deferred'
   WHERE id = $queue_id;
   ```
   `resolved_by` and `resolved_at` are left NULL — defer is not a final resolution.
4. Write audit log (title = `'Match deferred: ' + names`).
5. Return `{ ok: true }` 200.

**New enum value — `'deferred'`:** The `project_match_queue.status` column is `TEXT` with no
CHECK constraint in migration 001, so adding `'deferred'` requires no migration. Document this
value here as the canonical third status. Implementer must update `lib/queries/match-queue.ts`
type definitions to include `'deferred'` in the status union.

#### 3.6 Query helper — `lib/queries/match-queue.ts`

```typescript
export type QueueStatus = 'pending' | 'approved' | 'rejected' | 'deferred';

export type QueueRowWithProjects = {
  queueId: string;
  similarity: string;      // numeric comes back as string from Drizzle
  matchReason: string | null;
  createdAt: Date;
  status: QueueStatus;
  projectA: QueueProjectSummary;
  projectB: QueueProjectSummary;
};

export type QueueProjectSummary = {
  id: string;
  slug: string;
  nameCanonical: string;
  developer: string | null;
  methodology: string | null;
  hectares: string | null;
  province: string | null;
  status: string | null;
  totalVcusIssued: string | null;
  registryNames: string[];
};

export async function getPendingQueueRows(): Promise<QueueRowWithProjects[]>
// SELECT pmq.*, projectA fields, projectB fields, registry aggregates
// WHERE pmq.status = 'pending'
// ORDER BY pmq.created_at DESC

export async function getQueueRow(id: string): Promise<QueueRowWithProjects | null>
// Same join, no status filter — used by the API routes.
```

Use Drizzle's query builder for the JOINs; drop to the `sql` tag only for `array_agg(registry_name)`.

#### 3.7 Confirmation modal — `components/admin/ApproveModal.tsx`

This is the only client component in the admin area (`'use client'`).

Behaviour:
1. Admin clicks "Approve" button on a queue row card.
2. Modal opens (positioned fixed, overlay backdrop). It displays:
   - A summary of the merge operation: "You are about to merge **[B name]** into **[A name]**."
   - A plain-English list of the SQL operations that will run:
     - Re-parent all `registries` rows from B to A
     - Re-parent all `issuances` rows from B to A
     - Re-parent all `retirements` rows from B to A
     - Re-parent satellite alerts from B to A (duplicates silently skipped)
     - Add B's slug and name to A's `name_aliases`
     - Delete project B permanently
     - Mark queue row as approved
   - A text input: "Type **APPROVE** to confirm"
   - Buttons: "Cancel" (closes modal, no action) and "Merge projects" (disabled until input
     matches `"APPROVE"` exactly, case-sensitive).
3. On submit: POST to `/api/admin/match-queue/{id}/approve` with body
   `{ confirmation: "APPROVE" }`. On success, reload the page (or remove the card from the DOM).
   On error, show the error message from the API response inside the modal.

Styling: inline styles acceptable; no new CSS class required. The modal overlay uses
`position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 50`.

#### 3.8 Anti-re-queue mechanism after approve (AC-6)

When the merge completes, project B is deleted. On the next Verra scraper run, the scraper's
entity resolver queries `projects` for fuzzy name matches before inserting. Project B no longer
exists, so the resolver will compare the incoming Verra record against project A only.

Project A now has B's old `slug` and `name_canonical` in its `name_aliases` array. The resolver's
query pattern (`WHERE name_aliases @> ARRAY[$name]`) will match A directly, so the scraper
updates A rather than creating a new project or re-queuing the pair. This is the mechanism that
satisfies AC-6 — no additional changes to the scraper are required.

If B's Verra external_id has also been re-parented to A via the `registries` update (step 5), the
scraper's `ON CONFLICT (registry_name, external_id)` upsert will also update A directly,
providing a second guard against re-creation.

### Out of scope (explicit non-goals)

- **Un-merge / split** — v0.2 if ever required.
- **Bulk approve / reject** — hand-review per pair is intentional; accuracy matters more than speed.
- **Auto-merge at any similarity threshold** — architecture §6.3 mandates human-in-the-loop for all merges in v0.1.
- **Email notification to admin when new queue rows arrive** — v0.2 (watchlists + custom notifications).
- **Pagination of the queue list** — the queue is small (expected < 20 rows at a time); a single-page list is fine for v0.1.
- **Editing project fields inline** — out of scope; admins edit via direct SQL for v0.1.
- **Merge B into A where B is chosen as the canonical record** — the queue schema defines A as the target; the UI must reflect this. If the admin wants B to be canonical, they should first manually swap the slugs in the DB before approving.
- **`project_redirects` table for old B slugs** — 404 for v0.1; v0.2 adds redirects (see §9).
- **`projects.merged_from` audit column** — v0.1 relies on `name_aliases` + audit log in `notifications`; no dedicated column.

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Unauthenticated redirect**
```
Given the user is not signed in
When curl -I http://localhost:3001/admin/match-queue
Then the HTTP status is 307
 And the Location header is /?signin=1
```
(Handled by the `proxy.ts` `auth()` middleware gate, which fires before the layout.)

**AC-2: Non-admin 404**
```
Given a user is signed in with an email NOT in ADMIN_EMAIL_ALLOWLIST
When GET /admin/match-queue
Then the HTTP status is 404
 And the response does NOT contain "ADMIN" in its body
 And the response does NOT contain "match-queue" in its body
```
(404 — not 403 — to avoid revealing the admin area exists.)

**AC-3: Admin sees pending rows**
```
Given the user is signed in with an email in ADMIN_EMAIL_ALLOWLIST
 And project_match_queue has 2 rows with status = 'pending'
When GET /admin/match-queue
Then the HTTP status is 200
 And the response contains the red "ADMIN" banner
 And the response contains 2 queue row cards (one per pending pair)
 And each card shows both project names side by side
 And the similarity score and match_reason are visible in each card
```

**AC-4: Approve — full merge**
```
Given the user is signed in as admin
 And queue row Q exists with status='pending', candidate_a_id=A, candidate_b_id=B
When POST /api/admin/match-queue/{Q.id}/approve
 With body { "confirmation": "APPROVE" }
Then status 200
 And project B no longer exists in the projects table
 And project A's name_aliases contains B's old slug
 And project A's name_aliases contains B's old name_canonical
 And all registries rows previously pointing to B now point to A
 And all issuances rows previously pointing to B now point to A
 And queue row Q has status='approved', resolved_by=admin_user_id, resolved_at IS NOT NULL
 And a notifications row exists with type='admin-action' for the admin user referencing the merge
```

Verify with SQL:
```sql
SELECT name_aliases FROM projects WHERE id = $a_id;
-- must contain B's old slug and name_canonical

SELECT count(*) FROM registries WHERE project_id = $b_id;
-- must be 0

SELECT count(*) FROM projects WHERE id = $b_id;
-- must be 0

SELECT status, resolved_by, resolved_at FROM project_match_queue WHERE id = $queue_id;
-- status='approved', resolved_by=<uuid>, resolved_at IS NOT NULL
```

**AC-5: Reject — no project changes**
```
Given the user is signed in as admin
 And queue row Q exists with status='pending'
When POST /api/admin/match-queue/{Q.id}/reject
Then status 200
 And project A and project B both still exist in the projects table
 And queue row Q has status='rejected', resolved_by=admin_user_id, resolved_at IS NOT NULL
 And a notifications row exists with type='admin-action' for the reject action
```

**AC-6: Approved pair is not re-queued on next scraper run**
```
Given queue row Q has been approved (project B merged into A)
 And project A's name_aliases now contains B's old name_canonical
When the Verra scraper next runs and encounters B's Verra record
Then the scraper matches A via name_aliases lookup or registries external_id
 And no new row is inserted into project_match_queue for this pair
 And no new project row is created for B's Verra record
```

Verification: after a scraper dry-run or real run, `SELECT count(*) FROM project_match_queue WHERE status='pending'` does not increase for this pair.

**AC-7: Audit log written for every action**
```
Given any approve, reject, or defer action is performed by an admin
When the API route returns 200
Then a row exists in notifications with:
  - user_id = admin's users.id
  - type = 'admin-action'
  - title starting with 'Merge approved:' | 'Match rejected:' | 'Match deferred:'
  - created_at IS NOT NULL
```

**AC-8: TypeScript and build clean**
```
When npx tsc --noEmit
Then exit code 0

When npm run build
Then exit code 0 with no type errors or build errors
```

**AC-9: Wrong confirmation token is rejected**
```
Given the user is signed in as admin
When POST /api/admin/match-queue/{id}/approve
 With body { "confirmation": "approve" }   (lowercase — wrong)
Then status 400
 And body contains "Confirmation token mismatch"
 And no DB changes are made
```

**AC-10: Defer**
```
Given the user is signed in as admin
 And queue row Q exists with status='pending'
When POST /api/admin/match-queue/{Q.id}/defer
Then status 200
 And queue row Q has status='deferred'
 And resolved_by IS NULL (defer is not a final resolution)
 And resolved_at IS NULL
 And a notifications audit row exists with title starting with 'Match deferred:'
```

**AC-11: Race condition — both projects deleted**
```
Given both candidate_a and candidate_b have been deleted outside the transaction
When POST /api/admin/match-queue/{id}/approve
Then status 409
 And body contains "One or both candidate projects have already been deleted"
 And no other DB changes are made
```

---

## 5. Inputs & outputs

**Inputs:**
- `ADMIN_EMAIL_ALLOWLIST` — comma-separated server-side env var. Must be present in `.env.example` and added to Netlify env vars before deployment.
- Pending rows in `project_match_queue` (currently 2).
- Admin user's session (email verified via Google OAuth in T05).

**Outputs:**
- Project merges: project B deleted; project A's `name_aliases` extended; all FK rows re-parented.
- Queue row status changes: `status` updated to `'approved'`, `'rejected'`, or `'deferred'`.
- Audit log rows: `notifications` rows with `type = 'admin-action'` for each action taken.
- New env var added to `.env.example`: `ADMIN_EMAIL_ALLOWLIST`.
- No new migrations required (all changes use existing columns and the unconstrained `TEXT` status column).

---

## 6. Dependencies & interactions

**Blocked by:**
- T06 — populates `project_match_queue`. T21 has no pending rows to display without T06.

**Blocks:**
- Nothing in v0.1. T21 is a leaf task in Phase 4.

**Files owned by T21** (no other story may modify these in parallel):

| Path | Action |
|------|--------|
| `app/(admin)/layout.tsx` | Create |
| `app/(admin)/admin/match-queue/page.tsx` | Create |
| `app/api/admin/match-queue/[id]/approve/route.ts` | Create |
| `app/api/admin/match-queue/[id]/reject/route.ts` | Create |
| `app/api/admin/match-queue/[id]/defer/route.ts` | Create |
| `lib/admin.ts` | Create |
| `lib/queries/match-queue.ts` | Create |
| `components/admin/ApproveModal.tsx` | Create |
| `proxy.ts` | Narrow edit — append `/admin/:path*` to `config.matcher` only |
| `.env.example` | Append `ADMIN_EMAIL_ALLOWLIST` line |

**Files consumed (read-only):**
- `lib/auth.ts` — `auth()` function for session retrieval.
- `lib/display/status.ts` — `displayStatus` / `badgePillClass` for project status badges in the row cards.
- `lib/db.ts` — Drizzle client.
- `lib/schema.ts` — Drizzle table definitions for `projects`, `registries`, `issuances`, `retirements`, `satellite_alerts`, `notifications`, `project_match_queue`.

---

## 7. Edge cases & failure modes

**(i) Duplicate satellite alerts after re-parent**
Project A may already have alerts at the same `(project_id, alert_date, location)` as project B's
alerts. The `NOT EXISTS` guard in the approve route's step 5 (§3.5) silently skips these rows
rather than erroring. Skipped alerts remain with `project_id = B.id`; when B is deleted,
`ON DELETE SET NULL` sets their `project_id` to NULL. This is acceptable for v0.1 — alert totals
for A will be slightly under-counted for pre-merge history, but both alert sets cover the same
physical geography so the integrity score impact is negligible.

**(ii) Admin navigates away mid-confirmation**
The confirmation modal is pure client-side state. If the admin closes the browser tab mid-modal,
no API call is made. The DB remains unchanged. On reload, the queue row is still pending.

**(iii) Admin submits approve and server transaction fails**
The Drizzle transaction rolls back atomically. No partial state is written. The API returns a 5xx.
The UI displays the error message from the response body inside the modal.

**(iv) `resolved_by` FK requirement**
`project_match_queue.resolved_by` references `users(id)`. The admin's `users` row is created on
first Google login (T05 DrizzleAdapter). This row is guaranteed to exist by the time the admin
can reach the approve action. However, if the allowlist is changed to include an email that has
never logged in, the `resolved_by` INSERT will fail on the FK constraint. Documented here;
resolution: that email must sign in at least once before approvals are attributed to them.

**(v) `name_aliases` deduplication**
The `ARRAY(SELECT DISTINCT unnest(...))` pattern in step 6 (§3.5) deduplicates across the
existing `name_aliases` array and the newly appended values. If B's slug already exists in A's
`name_aliases` (possible if an earlier manual edit added it), no duplicate is created.

**(vi) Project B has `project_scores` rows**
`project_scores` has `ON DELETE CASCADE` on `project_id`. When B is deleted in step 7, all of
B's score history rows are deleted. This is acceptable — score history is recomputed daily and
any historical divergence is captured in the audit log notification row.

**(vii) Concurrent approve on the same queue row**
Two admin tabs race to approve the same row. The second transaction will find `status = 'approved'`
(not `'pending'`) in step 2 and return 409 "Queue row is not pending." No duplicate operations occur.

**(viii) `project_match_queue.resolved_by` column type mismatch**
Architecture §3 (spec preamble) shows `resolved_by UUID REFERENCES users(id)`. The SQL in
architecture §3 (the schema block) shows `resolved_by TEXT`. The Drizzle schema (`lib/schema.ts`)
is the runtime source of truth. The implementer must verify which type is actually present and
reconcile if there is a mismatch. The approve route passes `session.user.id` (a UUID string) as
`resolved_by`; both `TEXT` and `UUID` columns will accept this value.

---

## 8. Definition of done

- [ ] All 11 acceptance criteria verified (manually with curl + SQL inspection).
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0.
- [ ] Non-admin Google account (any email not in allowlist) returns 404 on `/admin/match-queue`.
- [ ] Signed-out request to `/admin/match-queue` returns 307 to `/?signin=1`.
- [ ] Approve action on the "cookstoves 1 / cookstoves 2" pair runs to completion in the live DB:
  - cookstoves 2 project row deleted
  - cookstoves 1 `name_aliases` contains cookstoves 2's slug
  - queue row status = 'approved'
  - audit notification row present
- [ ] `ADMIN_EMAIL_ALLOWLIST` documented in `.env.example`.
- [ ] Story files landed in `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`: `T21 — Entity resolution admin: match-queue review page`.
- [ ] `TASKS.md` status for T21 flipped `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

**OQ-1 — Old B slug 404 vs redirect**
After approving a merge, visiting `/projects/<B-slug>` returns 404 because B is deleted and no
redirect exists. For v0.1 this is acceptable (no external links to B's slug exist yet; the product
is pre-public). v0.2 recommendation: add a `project_redirects (from_slug TEXT PRIMARY KEY, to_slug TEXT)` table and a catch-all in `proxy.ts` or a Next.js `not-found.tsx` handler that checks it.
Decision for v0.1: **404** for old B slug. Document in this story and surface to Andy before v0.2 planning.

**OQ-2 — `deferred` status — architecture.md update**
The `deferred` value is a new addition to the `project_match_queue.status` domain (migration 001
only documented `'pending'`, `'approved'`, `'rejected'`). The `TEXT` column has no CHECK
constraint so no migration is needed, but `docs/architecture.md` §3 should be updated to document
`'deferred'` in the status comment. This is a non-breaking documentation-only change; assign to
the docs/merge agent as a follow-up after T21 lands.

**OQ-3 — Should merge create `projects.merged_from` audit column?**
Tracking B's old UUID in A's row would make merge provenance queryable without parsing the
`notifications` table. Decision for v0.1: **skip** — the `name_aliases` array plus the
`notifications` audit row is sufficient. v0.2 can add `merged_from UUID[]` if forensic queries
become necessary.

**OQ-4 — `notifications.type` enumeration**
The schema comment in architecture §3 lists notification types as
`'reversal', 'price', 'regulatory', 'news', 'retirement', 'issuance'`. This story adds
`'admin-action'` as a new value. There is no CHECK constraint, so no migration is required.
However, the T16 alerts inbox filters on these type values (pills: All / Reversal / Regulatory).
`'admin-action'` notifications must NOT appear in a non-admin user's alerts inbox. The T16
query filters by `user_id = current_user`; since audit rows are written with `user_id =
admin_user_id`, they will only appear in the admin's own bell/inbox. This is acceptable for v0.1.
If the admin's inbox becomes noisy, add a `WHERE type != 'admin-action'` filter to the T16 query
in a follow-up.

---

## 10. References

- `docs/architecture.md` §3 (schema — `project_match_queue`, `projects`, `registries`,
  `notifications`), §3 Phase 2 note on expression-unique index `ON CONFLICT` gotcha.
- `docs/architecture.md` §6.3 (human-in-the-loop mandate for entity resolution).
- `docs/TASKS.md` T21 row.
- `proxy.ts` — existing middleware pattern; T21 appends one matcher entry.
- `lib/auth.ts` — `auth()` session retrieval pattern.
- `lib/display/status.ts` — `displayStatus` / `badgePillClass` reused in queue row cards.
- `docs/stories/T11-projects-explorer.md` §3.6 (empty state pattern) and §3.4 (component conventions).
- `docs/stories/T12-project-detail.md` §3 (Drizzle query helper pattern).
- `scrapers/migrations/001_init.sql` — canonical schema for `project_match_queue` and referenced tables.
- `scrapers/migrations/002_add_geostore.sql` — `uq_sat_project_date_loc` expression index (relevant to step 5 of the approve route).
