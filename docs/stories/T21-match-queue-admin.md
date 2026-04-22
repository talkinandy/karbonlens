---
id: T21
title: Entity resolution admin page — match-queue review
phase: 4
status: audited
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
                     match_reason TEXT, status TEXT ('pending'|'approved'|'rejected'|'deferred'),
                     created_at, resolved_at, resolved_by TEXT
```

`resolved_by` is **`TEXT`** per `scrapers/migrations/001_init.sql` line 177 — no FK, no UUID type
constraint. Architecture §3's description showing `resolved_by UUID REFERENCES users(id)` is stale
and will be corrected in a follow-up docs task. The approve route writes `session.user.id` (a UUID
string) to this column as plain text. No FK failure is possible regardless of login history.

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

#### 3.0 Migration 005 — `admin_actions` table

T21 adds `scrapers/migrations/005_admin_actions.sql`:

```sql
CREATE TABLE admin_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,  -- 'approve-merge', 'reject-match', 'defer-match'
  entity_type TEXT NOT NULL,  -- 'project_match_queue'
  entity_id   UUID,
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_admin_actions_created ON admin_actions(created_at DESC);
ALTER TABLE admin_actions OWNER TO karbonlens;
INSERT INTO schema_migrations (version) VALUES ('005') ON CONFLICT DO NOTHING;
```

All audit rows from the approve, reject, and defer routes are written to `admin_actions`, NOT to
`notifications`. This keeps audit records out of the T16 alerts inbox and T17 digest email paths
entirely. Clean separation — no type-filter patches needed on T16/T17.

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
2. Typed confirmation: read `confirmed` field from the JSON request body **before** opening the
   transaction. If it is not exactly the string `"APPROVE"` → return 400: "Confirmation token
   mismatch." (Server validates independently of the client-side disable; see §7 CSRF note.)
3. Inside the transaction — **lock the queue row first**:
   ```sql
   SELECT id FROM project_match_queue WHERE id = $1 AND status = 'pending' FOR UPDATE;
   ```
   If 0 rows returned, another admin already resolved it → return 409 "Already resolved." This
   `SELECT FOR UPDATE` prevents the race condition (B4): concurrent approvals are serialised at
   the row lock; the second transaction blocks until the first commits, then finds 0 rows and
   returns 409 immediately.
4. Load project A and project B. If either is missing (already deleted) → return 409: "One or both
   candidate projects have already been deleted. Cannot complete merge."
5. Re-parent all FK rows from B's `id` to A's `id`. Each child table follows the **pre-delete then
   UPDATE** pattern to avoid unique-constraint violations (B1):

   **(a) registries** — `(registry_name, external_id)` UNIQUE constraint (migration 001 line 71):
   ```sql
   -- 5a: drop B's rows that collide with A's existing rows
   DELETE FROM registries
   WHERE project_id = $b_id
     AND (registry_name, external_id) IN (
       SELECT registry_name, external_id FROM registries WHERE project_id = $a_id
     );
   -- 5b: reassign the rest
   UPDATE registries SET project_id = $a_id WHERE project_id = $b_id;
   ```

   **(c) issuances** — `uq_issuances_dedupe` on `(project_id, vintage_year, issuance_date, registry_name)`:
   ```sql
   DELETE FROM issuances
   WHERE project_id = $b_id
     AND (vintage_year, issuance_date, registry_name) IN (
       SELECT vintage_year, issuance_date, registry_name FROM issuances WHERE project_id = $a_id
     );
   UPDATE issuances SET project_id = $a_id WHERE project_id = $b_id;
   ```

   **(d) retirements** — no unique index; bare UPDATE is safe:
   ```sql
   UPDATE retirements SET project_id = $a_id WHERE project_id = $b_id;
   ```

   **(e) satellite_alerts** — expression unique index `uq_sat_project_date_loc` (migration 002);
   `ON CONFLICT ON CONSTRAINT` syntax does not work with expression indexes. Use `NOT EXISTS` guard:
   ```sql
   UPDATE satellite_alerts SET project_id = $a_id
   WHERE project_id = $b_id
     AND NOT EXISTS (
       SELECT 1 FROM satellite_alerts sa2
       WHERE sa2.project_id = $a_id
         AND sa2.alert_date = satellite_alerts.alert_date
         AND ST_Equals(sa2.location::geometry, satellite_alerts.location::geometry)
     );
   ```

   **(f) notifications** — re-point project reference (`ON DELETE SET NULL` column, nullable):
   ```sql
   UPDATE notifications SET project_id = $a_id WHERE project_id = $b_id;
   ```

   SAVEPOINTs between sub-steps are optional but recommended for debugging.

6. Add B's `name_aliases`, `slug`, and `name_canonical` to A's `name_aliases` array (deduplicated).
   Uses B's full `name_aliases` (fetched in step 4) so no aliases accumulated on B are dropped:
   ```sql
   UPDATE projects
   SET name_aliases = ARRAY(
     SELECT DISTINCT unnest(
       COALESCE($a_name_aliases, '{}')
       || COALESCE($b_name_aliases, '{}')
       || ARRAY[$b_slug, $b_name_canonical]
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
   skipped in step 5e) will have `project_id` set to NULL by the cascade, which is acceptable.

8. Mark the queue row resolved:
   ```sql
   UPDATE project_match_queue
   SET status = 'approved', resolved_by = $admin_user_id, resolved_at = NOW()
   WHERE id = $queue_id;
   ```
   `resolved_by` is `TEXT` (see §2); write `session.user.id` as a plain UUID string.

9. Write audit log row to `admin_actions` (NOT `notifications` — see §3.0):
   ```sql
   INSERT INTO admin_actions (actor_id, action, entity_type, entity_id, payload)
   VALUES (
     $admin_user_id,
     'approve-merge',
     'project_match_queue',
     $queue_id,
     jsonb_build_object(
       'merged_b_id', $b_id,
       'merged_b_name', $b_name,
       'into_a_id', $a_id,
       'into_a_name', $a_name,
       'similarity', $similarity
     )
   );
   ```

10. Return `Response.json({ ok: true, mergedInto: a_id })` with status 200.

**`app/api/admin/match-queue/[id]/reject/route.ts`**

Steps:
1. Auth check (same as above).
2. Load queue row; if not pending → 409.
3. Update status (`resolved_by` is `TEXT` — write UUID string):
   ```sql
   UPDATE project_match_queue
   SET status = 'rejected', resolved_by = $admin_user_id, resolved_at = NOW()
   WHERE id = $queue_id;
   ```
4. Write audit log row to `admin_actions`:
   ```sql
   INSERT INTO admin_actions (actor_id, action, entity_type, entity_id, payload)
   VALUES ($admin_user_id, 'reject-match', 'project_match_queue', $queue_id,
           jsonb_build_object('a_name', $a_name, 'b_name', $b_name));
   ```
5. Return `{ ok: true }` 200.

No project rows are modified. No transaction needed (single UPDATE + INSERT).

**`app/api/admin/match-queue/[id]/defer/route.ts`**

Steps:
1. Auth check.
2. Load queue row; if not found → 404. If status is already `'deferred'` → 409 "already deferred".
3. Update status (`resolved_by` and `resolved_at` left NULL — defer is not a final resolution):
   ```sql
   UPDATE project_match_queue
   SET status = 'deferred'
   WHERE id = $queue_id;
   ```
4. Write audit log row to `admin_actions`:
   ```sql
   INSERT INTO admin_actions (actor_id, action, entity_type, entity_id, payload)
   VALUES ($admin_user_id, 'defer-match', 'project_match_queue', $queue_id,
           jsonb_build_object('a_name', $a_name, 'b_name', $b_name));
   ```
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
   `{ confirmed: "APPROVE" }`. On success, reload the page (or remove the card from the DOM).
   On error, show the error message from the API response inside the modal.

Styling: inline styles acceptable; no new CSS class required. The modal overlay uses
`position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 50`.

#### 3.8 Anti-re-queue mechanism after approve (AC-6)

**Primary guard — `registries` unique constraint.** After the merge, B's `(registry_name,
external_id)` row has been reassigned to project A (step 5a/5b). On the next scraper run,
`fetch.py`'s `upsert_project` issues an `ON CONFLICT (registry_name, external_id) DO UPDATE` for
B's Verra record. This hits A's existing row and updates it in-place — no new project row is
created and no new match-queue row is produced. This is the definitive anti-re-queue guard.

**`name_aliases` is NOT a current guard.** `scrapers/verra/fetch.py` line 571 shows that
`fuzzy_match` queries only `name_canonical`:

```sql
SELECT id::text, name_canonical, similarity(name_canonical, %s) AS sim
FROM projects
WHERE similarity(name_canonical, %s) > %s
ORDER BY sim DESC LIMIT 1
```

It does not inspect `name_aliases`. The claim in the previous spec draft that `WHERE name_aliases
@> ARRAY[$name]` would prevent re-queuing was incorrect. T21 does NOT modify the scraper to add
this lookup. If v0.2 scraper enhancements are desired, open T21.1. See OQ-5.

**AC-6 verification** (concrete post-merge test): after approving the merge, re-run the scraper
with `--dry-run` or `--force` against the Verra data set. Confirm:
```sql
SELECT count(*) FROM project_match_queue WHERE status = 'pending';
```
count is unchanged (no new row for the previously-merged pair). The `registries.external_id`
unique-constraint guard is the mechanism being verified.

### Out of scope (explicit non-goals)

- **Un-merge / split** — v0.2 if ever required.
- **Bulk approve / reject** — hand-review per pair is intentional; accuracy matters more than speed.
- **Auto-merge at any similarity threshold** — architecture §6.3 mandates human-in-the-loop for all merges in v0.1.
- **Email notification to admin when new queue rows arrive** — v0.2 (watchlists + custom notifications).
- **Pagination of the queue list** — the queue is small (expected < 20 rows at a time); a single-page list is fine for v0.1.
- **Editing project fields inline** — out of scope; admins edit via direct SQL for v0.1.
- **Merge B into A where B is chosen as the canonical record** — the queue schema defines A as the target; the UI must reflect this. If the admin wants B to be canonical, they should first manually swap the slugs in the DB before approving.
- **`project_redirects` table for old B slugs** — 404 for v0.1; v0.2 adds redirects (see §9).
- **`projects.merged_from` audit column** — v0.1 relies on `name_aliases` + `admin_actions` audit row; no dedicated column.

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
 With body { "confirmed": "APPROVE" }
Then status 200
 And project B no longer exists in the projects table
 And project A's name_aliases contains B's old slug
 And project A's name_aliases contains B's old name_canonical
 And all registries rows previously pointing to B now point to A
 And all issuances rows previously pointing to B now point to A
 And queue row Q has status='approved', resolved_by=admin_user_id, resolved_at IS NOT NULL
 And an admin_actions row exists with action='approve-merge' for the admin user referencing the merge
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
-- status='approved', resolved_by=<uuid-string>, resolved_at IS NOT NULL

SELECT action, entity_id FROM admin_actions WHERE entity_id = $queue_id::uuid;
-- action='approve-merge'
```

**AC-5: Reject — no project changes**
```
Given the user is signed in as admin
 And queue row Q exists with status='pending'
When POST /api/admin/match-queue/{Q.id}/reject
Then status 200
 And project A and project B both still exist in the projects table
 And queue row Q has status='rejected', resolved_by=admin_user_id, resolved_at IS NOT NULL
 And an admin_actions row exists with action='reject-match' referencing Q
```

**AC-6: Approved pair is not re-queued on next scraper run**
```
Given queue row Q has been approved (project B merged into A)
 And B's (registry_name, external_id) row in registries now points to project A
When the Verra scraper next runs and encounters B's Verra record
Then the scraper's ON CONFLICT (registry_name, external_id) DO UPDATE hits A's existing row
 And no new project row is created for B's Verra record
 And no new row is inserted into project_match_queue for this pair
```

Live test: after approving the merge, re-run the scraper with `--dry-run` or `--force`. Verify:
```sql
SELECT count(*) FROM project_match_queue WHERE status = 'pending';
```
Count is unchanged. The guard is the `registries` unique-constraint upsert path, not `name_aliases`
(the scraper's `fuzzy_match` does not query `name_aliases` — see §3.8).

**AC-7: Audit log written for every action**
```
Given any approve, reject, or defer action is performed by an admin
When the API route returns 200
Then a row exists in admin_actions with:
  - actor_id = admin's users.id
  - action IN ('approve-merge', 'reject-match', 'defer-match')
  - entity_type = 'project_match_queue'
  - entity_id = the queue row UUID
  - created_at IS NOT NULL
 And NO row is inserted into notifications for this action
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
 With body { "confirmed": "approve" }   (lowercase — wrong)
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
 And an admin_actions row exists with action='defer-match' referencing Q
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
- Audit log rows: `admin_actions` rows for each approve, reject, or defer action taken.
- New env var added to `.env.example`: `ADMIN_EMAIL_ALLOWLIST`.
- Migration 005 (`scrapers/migrations/005_admin_actions.sql`) — adds `admin_actions` table.

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
| `scrapers/migrations/005_admin_actions.sql` | Create |

**Files consumed (read-only):**
- `lib/auth.ts` — `auth()` function for session retrieval.
- `lib/display/status.ts` — `displayStatus` / `badgePillClass` for project status badges in the row cards.
- `lib/db.ts` — Drizzle client.
- `lib/schema.ts` — Drizzle table definitions for `projects`, `registries`, `issuances`, `retirements`, `satellite_alerts`, `notifications`, `project_match_queue`, `admin_actions`.

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

**(iv) `resolved_by` column type**
`project_match_queue.resolved_by` is `TEXT` with no FK (migration 001 line 177). The approve
route writes `session.user.id` as a plain UUID string. No FK failure is possible. The admin's
`users` row is created on first Google login (T05 DrizzleAdapter), but since there is no FK, the
write succeeds regardless. Architecture §3's stale `UUID REFERENCES users(id)` description will
be corrected in a follow-up docs task.

**(v) `name_aliases` deduplication**
The `ARRAY(SELECT DISTINCT unnest(...))` pattern in step 6 (§3.5) deduplicates across the
existing `name_aliases` array and the newly appended values. If B's slug already exists in A's
`name_aliases` (possible if an earlier manual edit added it), no duplicate is created.

**(vi) Project B has `project_scores` rows**
`project_scores` has `ON DELETE CASCADE` on `project_id`. When B is deleted in step 7, all of
B's score history rows are deleted. This is acceptable — score history is recomputed daily and
any historical divergence is captured in the `admin_actions` audit row (step 9).

**(vii) Concurrent approve on the same queue row**
Two admin tabs race to approve the same row. The `SELECT FOR UPDATE` in step 3 serialises both
transactions at the DB row lock. The first transaction commits and sets `status = 'approved'`. The
second transaction then acquires the lock, runs the status check, finds 0 rows matching
`status = 'pending'`, and returns 409 "Already resolved." No duplicate operations occur.

**(viii) CSRF protection**
POST routes under `app/api/admin/` are protected by the `auth()` wrapper from NextAuth v5. The
NextAuth v5 `auth()` session middleware includes CSRF protection for POST requests via its
built-in double-submit cookie mechanism. No additional CSRF token is required beyond the session
cookie. Non-authenticated POST requests are rejected by the middleware before the route handler
runs.

**(ix) `admin_actions.actor_id` FK requirement**
`admin_actions.actor_id` is `UUID NOT NULL REFERENCES users(id)`. The admin's `users` row is
created on first Google login (T05 DrizzleAdapter) and is guaranteed to exist by the time the
admin can reach any action route. If the allowlist is extended to include an email that has never
logged in, the INSERT will fail on the FK. Resolution: that email must sign in at least once
before approvals are attributed to them.

---

## 8. Definition of done

- [ ] All 11 acceptance criteria verified (manually with curl + SQL inspection).
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0.
- [ ] Non-admin Google account (any email not in allowlist) returns 404 on `/admin/match-queue`.
- [ ] Signed-out request to `/admin/match-queue` returns 307 to `/?signin=1`.
- [ ] Migration 005 (`scrapers/migrations/005_admin_actions.sql`) applied to the live DB.
- [ ] Approve action on the "cookstoves 1 / cookstoves 2" pair runs to completion in the live DB
  (insert fresh test rows first — see OQ-5; live queue rows are currently `rejected`):
  - cookstoves 2 project row deleted
  - cookstoves 1 `name_aliases` contains cookstoves 2's slug and name_canonical
  - queue row status = 'approved'
  - `admin_actions` row with action='approve-merge' present
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
Tracking B's old UUID in A's row would make merge provenance queryable without joining
`admin_actions`. Decision for v0.1: **skip** — the `name_aliases` array plus the `admin_actions`
row (with full JSONB payload including `merged_b_id`) is sufficient. v0.2 can add
`merged_from UUID[]` if forensic queries become necessary.

**OQ-4 — Live queue rows are already `rejected`**
Both rows in `project_match_queue` are currently `status='rejected'` (resolved 2026-04-21 by the
T06 code audit). The spec §2 context claiming "two pending rows" is stale. Before verifying DoD
item 6, insert fresh test rows:
```sql
INSERT INTO project_match_queue (candidate_a_id, candidate_b_id, similarity, match_reason)
VALUES ($cookstoves1_id, $cookstoves2_id, 0.942, 'name_fuzzy');
```
This is an implementer task, not a spec defect.

**OQ-5 — Scraper `fuzzy_match` does not check `name_aliases` (deferred to T21.1)**
`scrapers/verra/fetch.py`'s `fuzzy_match` queries only `name_canonical`. Adding a secondary
lookup against `name_aliases` (e.g. `WHERE name_aliases @> ARRAY[$name]`) would further close
the re-queue gap for pairs with dissimilar canonical names. Decision for v0.1: **not in T21
scope** — the `registries` unique-constraint guard (§3.8) is sufficient for the live case
(B's external_id is always re-parented to A). If v0.2 scraper enhancements are desired, open
T21.1 to own that change.

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
- `scrapers/migrations/001_init.sql` — canonical schema for `project_match_queue` (line 177: `resolved_by TEXT`, no FK) and referenced tables.
- `scrapers/migrations/002_add_geostore.sql` — `uq_sat_project_date_loc` expression index (relevant to step 5e of the approve route).
- `scrapers/migrations/005_admin_actions.sql` — new table for admin audit log (T21 scope).
- `scrapers/verra/fetch.py` line 571 — `fuzzy_match` queries `name_canonical` only; does not check `name_aliases` (see §3.8, OQ-5).
