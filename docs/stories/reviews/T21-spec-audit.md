---
story: T21
title: Match-queue admin page — spec audit
auditor: adversarial spec-auditor
date: 2026-04-22
verdict: CONDITIONAL PASS
blocking: 5
---

## Verdict

**Conditional pass. 5 blocking issues, 5 advisory flags.**

The spec is architecturally sound on the happy path: transaction ordering (re-parent then delete) is correct, the `NOT EXISTS` guard for satellite alert deduplication is the right call given expression-index `ON CONFLICT` limitations, and the modal + server-side confirmation token check closes the obvious bypass. Five defects need resolution before implementation starts. The top two are a structural merge-correctness gap (`registries` UNIQUE constraint) and the admin-action notification leaking into the user's digest inbox.

---

## Blocking issues

**B1 — `registries` UNIQUE constraint violated on re-parent (critical data-integrity gap).**
`registries(registry_name, external_id)` has a UNIQUE constraint (confirmed in `001_init.sql` line 71). Step 5 of the approve route issues a bare `UPDATE registries SET project_id = $a_id WHERE project_id = $b_id`. If project A already has a `registries` row with the same `(registry_name, external_id)` as one of B's rows — e.g., both A and B are linked to `('Verra', 'VCS1234')` — this UPDATE violates the unique constraint and the entire transaction rolls back with a cryptic PG error 23505. The spec does not handle this case.

**Required fix:** before the generic UPDATE, delete rows from B that would collide with A:
```sql
DELETE FROM registries r_b
WHERE r_b.project_id = $b_id
  AND EXISTS (
    SELECT 1 FROM registries r_a
    WHERE r_a.project_id = $a_id
      AND r_a.registry_name = r_b.registry_name
      AND r_a.external_id   = r_b.external_id
  );
```
Run this delete as step 5a, then run the existing UPDATE as step 5b. The same collision analysis applies to `issuances` (unique index `uq_issuances_dedupe` on `project_id, vintage_year, issuance_date, registry_name` confirmed in `002_add_geostore.sql` line 48). Add an analogous pre-delete for issuances. Retirements have no unique index in migrations 001–004, so the bare UPDATE is safe there.

**B2 — `notifications.type = 'admin-action'` leaks into digest emails.**
The weekly digest query (architecture §9) selects all rows `WHERE digested_at IS NULL AND user_id = <user>`. Audit rows written with `user_id = admin_user_id` and `type = 'admin-action'` will be ingested into Andy's Monday digest unless explicitly excluded. §OQ-4 of the spec acknowledges the bell-inbox is filtered by `user_id`, but it fails to account for the digest path, which uses a different query with no type filter. With 60 existing `notifications` rows (all `type=reversal` for Andy) and two pending merges to approve, the digest email after T21 ships will include admin-action entries alongside project reversal alerts — confusing and unprofessional for a product-facing email.

**Required fix (two options, pick one):** (a) Add `AND type != 'admin-action'` to the T17 digest query and the T16 inbox query, with a code comment referencing T21; or (b) write admin audit rows to a separate `admin_actions` table (single-purpose, no digest path, queryable for audit history independently). Option (b) is cleaner long-term but requires a new migration for v0.1. Option (a) is the minimal patch — add the filter to both queries and document the `'admin-action'` type as excluded-by-default in `docs/architecture.md` §9.

**B3 — `project_match_queue.resolved_by` is `TEXT`, not `UUID REFERENCES users(id)`.**
Migration `001_init.sql` line 177 shows `resolved_by TEXT` with no FK. The spec preamble (§2) states "Architecture §3 specifies `resolved_by UUID REFERENCES users(id)`" and the edge-case §7(viii) flags the `TEXT` vs `UUID` discrepancy as an implementer concern. But steps 8 and 9 of the approve route write `$admin_user_id` to `resolved_by` — a UUID string stored in a TEXT column. This is functionally fine; however, the spec contradicts itself: §2 implies an FK exists (the FK fails if the admin has never logged in), §7(viii) implies it may not. The implementer must make a real decision.

**Required fix:** the spec must resolve the ambiguity with a single authoritative statement. Recommended: "The column is `TEXT` (no FK) per migration 001 line 177. Write `session.user.id` as a plain string. No FK failure is possible. The §2 architecture.md description is stale — update it in a follow-up docs task." Also: `architecture.md` §3 schema block should be corrected to show `resolved_by TEXT`.

**B4 — Race condition guard is present in spec but uses the wrong locking layer.**
§7(vii) describes the concurrent-approve scenario and says "the second transaction will find `status = 'approved'` in step 2 and return 409." This relies on step 2 loading the queue row at the start of the transaction, not on a `SELECT ... FOR UPDATE` lock. Inside a Drizzle transaction at the default `READ COMMITTED` isolation level, step 2's row-load does not prevent a concurrent transaction from simultaneously passing step 2 (both see `status = 'pending'` before either commits). The DELETE of project B in step 7 will then be attempted twice; the second attempt silently deletes 0 rows (already gone), but steps 5–6 re-run on already-reparented or already-deleted children, which may violate constraints or cause double-audit entries.

**Required fix:** lock the queue row at load time in the transaction: `SELECT ... FOR UPDATE` on the `project_match_queue` row as the first SQL inside the transaction. Only then proceed to step 2's status check. The spec's step-numbering should make this explicit: "Step 1b: `SELECT ... FOR UPDATE NOWAIT` on the queue row; if locked by another request, return 409 immediately."

**B5 — AC-6 anti-re-queue mechanism fails: scraper `fuzzy_match` does not query `name_aliases`.**
The spec (§3.8) states that after the merge, "the resolver's query pattern (`WHERE name_aliases @> ARRAY[$name]`) will match A directly." This pattern does not exist in the live scraper. `scrapers/verra/fetch.py` line 571 shows the actual query:
```sql
SELECT id, name_canonical, similarity(name_canonical, %s) AS sim
FROM projects
WHERE similarity(name_canonical, %s) > %s
ORDER BY sim DESC LIMIT 1
```
The scraper queries only `name_canonical`, not `name_aliases`. If B's `name_canonical` is materially different from A's (as with the two real pending rows — a "wastewater treatment" vs "paper mill" pair at 0.779), the `fuzzy_match` on the next run will not find A via B's old name and will re-insert B as a new project, creating a new queue row. AC-6 will not pass.

**Required fix (two options):** (a) Update `scrapers/verra/fetch.py`'s `fuzzy_match` to also check `name_aliases @> ARRAY[name]` as a secondary lookup before the `pg_trgm` similarity scan; or (b) document in the spec that AC-6 relies solely on the `registries(external_id)` upsert guard (the ON CONFLICT path on `registry_name, external_id`) being the primary protection, and demote the `name_aliases` claim to a secondary "if the scraper is updated in v0.2." Option (b) is honest about current scraper behavior but means AC-6 is not fully satisfied by T21 alone.

---

## Advisory flags

**A1 — `name_aliases` merge does not include B's existing `name_aliases`.**
Step 6 of the approve route appends only B's `slug` and `name_canonical` to A's `name_aliases`. If project B itself accumulated aliases over time (e.g., a previous partial merge added names to B), those aliases are silently dropped when B is deleted. Fix: the SQL should concatenate `COALESCE(b.name_aliases, '{}')` as well:
```sql
SET name_aliases = ARRAY(
  SELECT DISTINCT unnest(
    COALESCE(a.name_aliases, '{}')
    || COALESCE(b.name_aliases, '{}')
    || ARRAY[$b_slug, $b_name_canonical]
  )
)
```
This requires fetching B's `name_aliases` in step 3 (already loaded as "project B").

**A2 — "Approve" button uses `.kl-btn--danger` styling for a constructive action.**
The spec assigns `.kl-btn--danger` (red) to the Approve button. Red conventionally signals a destructive, irreversible action — which a merge is. But red-for-approve breaks the modal's visual grammar: the modal has a red "ADMIN" banner, the overlay backdrop darkens the page, and then the primary action button is also red. The admin's eye has no clear hierarchy. Recommend `.kl-btn--primary` (or a dedicated `.kl-btn--confirm`) for Approve and reserve `.kl-btn--danger` for Reject (the action that blocks future merges indefinitely). Minor UX, but worth flagging before the component is built.

**A3 — Defer leaves `status = 'deferred'` rows invisible to the queue list.**
`getPendingQueueRows()` filters `WHERE status = 'pending'`. Deferred rows disappear from the UI permanently. The admin has no way to return a deferred row to "pending" for a second look. For a v0.1 admin area with two rows in the queue this is low risk, but the spec should at minimum add a visible note — "Deferred rows are not displayed; use direct SQL to re-open" — and flag this as a v0.2 item. As written, an admin who accidentally defers a row has no recourse without a direct DB edit.

**A4 — Live DB shows both queue rows are already `rejected`, not `pending`.**
`SELECT * FROM project_match_queue` returns both rows with `status='rejected'` (resolved by `T06-code-audit (pre-merge)`, 2026-04-21). The spec's §2 context states "the live DB currently holds two pending rows." This is stale. The definition-of-done item "Approve action on the 'cookstoves 1 / cookstoves 2' pair runs to completion in the live DB" cannot be satisfied without first re-inserting test rows or seeding new ones. The spec should acknowledge this and add a step: "Before verifying DoD item 6, insert fresh test rows via `INSERT INTO project_match_queue` so the approve flow can be exercised end-to-end." Otherwise the implementer will build and test against an empty pending queue.

**A5 — `proxy.ts` file is named `middleware.ts` in the live repo.**
The spec (§3.2) and §6 dependency table reference `proxy.ts`. The actual live file is `/root/.openclaw/workspace/karbonlens/proxy.ts` — no, confirmed: the file is at `proxy.ts` (the architecture §13 Phase 3 note says "proxy.ts replaces middleware.ts per Next.js 16 deprecation"). The actual on-disk file read is indeed named `proxy.ts`. No issue — the spec is correct. Noted here for completeness; no fix required.

---

## Non-issues confirmed

- `project_match_queue.status` column is `TEXT` with no CHECK constraint (migration 001 line 176). Adding `'deferred'` requires no migration. Spec §3.5 defer route is correct.
- `satellite_alerts` uses `ON DELETE SET NULL` (not CASCADE); B's unconverted duplicate alerts safely NULL out on B's deletion. Spec §7(i) is accurate.
- `project_scores` uses `ON DELETE CASCADE`; B's scores are deleted when B is deleted. Spec §7(vi) is accurate.
- Admin 404 pattern is correct: unauthenticated users hit the middleware's 307 first (proxy.ts `auth()` wrapper); authenticated non-admins reach the layout and get `notFound()` from `app/(admin)/layout.tsx`. The spec correctly separates these two layers.
- `session.user.id` is populated by the `session` callback in `lib/auth.ts` (line 69: `session.user.id = user.id`). The approve route can read it safely without an extra DB lookup.
- Typed confirmation server-side check (step 4 of approve) is present in the spec. Client-side disable is supplementary. Defense is adequate.
- `uq_sat_project_date_loc` is confirmed as an expression-based unique index (migration 002); `ON CONFLICT ON CONSTRAINT` would fail. The spec's `NOT EXISTS` guard is the correct workaround.
- `notifications.uq_notifications_dedupe` index: the approve route inserts audit rows with `type='admin-action'`. This type value is not used by any existing notification — no dedupe collision risk on day one.

---

## Open questions for Andy

**OQ-A — Which option for B1 (registries pre-delete)?** The spec's step-5 `UPDATE` needs the collision delete prepended. Confirm the implementer should add steps 5a/5b as described above, and that any B registries rows that collide with A should simply be deleted (they describe the same physical Verra project after all).

**OQ-B — Which option for B2 (digest leak)?** Option (a) add `type != 'admin-action'` filter to T16 + T17 queries (minimal, no migration) vs option (b) separate `admin_actions` table (clean, one migration). Recommend option (a) for v0.1 speed.

**OQ-C — Which option for B5 (AC-6 scraper gap)?** Update `fuzzy_match` to check `name_aliases` (option a, makes AC-6 fully pass) vs document that `registries` external_id guard is the primary protection and `name_aliases` is v0.2 (option b, honest about current state). Decision affects whether T21 or a T06.2 story owns the scraper change.
