# T16 Spec Audit — Notifications bell + alerts inbox

**Auditor:** adversarial spec-auditor  
**Date:** 2026-04-19  
**Story:** `docs/stories/T16-notifications-bell-inbox.md`  
**Verdict:** CONDITIONAL PASS — 0 blocking issues, 4 non-blocking flags

---

## Summary

The spec is well-structured and unusually thorough. Auth pattern matches NextAuth v5 (`auth()` → 401 JSON, no redirect). File-ownership table is precise. Edge cases are covered. No blocking defects found.

---

## Finding 1 — site-nav.tsx conflict: RESOLVED (non-blocking, verify)

**Lens:** Cross-story `site-nav.tsx` conflict.

The spec correctly avoids modifying `components/site-nav.tsx` directly. Instead, the narrow edit targets `app/(app)/layout.tsx`, composing `rightSlot={<><NotificationBell /> <UserMenu /></>}`. This is the right approach.

Verified: `components/site-nav.tsx` already accepts `rightSlot?: React.ReactNode` and `app/(app)/layout.tsx` is listed in the File Ownership table with "Narrow edit — add bell to rightSlot; coordinate with T05 owner if merging concurrently." Both `site-nav.tsx` and `lib/auth.ts` appear in the Do Not Modify list.

**Flag:** The coordination note says "coordinate with T05 implementer if merging post-T05" but T05's own file ownership table claims `app/(app)/layout.tsx` as exclusive to T05. If T05 is still in-flight when T16 begins, a merge conflict on `app/(app)/layout.tsx` is still possible. The spec only notes the risk; it does not prescribe a resolution order or a rebase strategy. Recommend adding: "T16 must branch from a commit that includes T05's final `layout.tsx`."

**Severity:** Non-blocking. Risk mitigated by the coordination note; just under-specified.

---

## Finding 2 — `uq_notifications_dedupe` index: SPEC RELIES ON IT, DOES NOT SAY SO

**Lens:** Notifications dedupe per user-project-type-date.

Architecture §13 (Phase 2 shipped state) documents `uq_notifications_dedupe` as an expression-based unique index added in migration 002 (T07). The spec states "no schema changes needed" and does not re-implement dedupe logic in T16.

**Flag:** The spec correctly relies on T07's index for dedupe. However, the spec never explicitly references `uq_notifications_dedupe` or acknowledges that its presence is a precondition for correct idempotency when T07 re-runs. If T07 were to be reverted or the index dropped, T16's "no schema changes needed" claim would leave duplicate notifications silently accumulating.

**Recommendation:** Add to §6 Blocked by: "T07 Phase B — `uq_notifications_dedupe` index must be present in migration 002; T16 does not re-implement dedupe."

**Severity:** Non-blocking. Implicit reliance works; explicit documentation would harden the contract.

---

## Finding 3 — Type badge colors not in AC

**Lens:** Type enum; display badge per type. Spec mentions types but doesn't spec colors in AC.

The spec does specify badge colors in §3 item 5: `reversal` (red), `price` (green), `regulatory` (amber), `news` (slate), `retirement` (purple), `issuance` (teal), unknown → grey. OQ-3 also acknowledges the 6 known types.

**Flag:** None of the 9 acceptance criteria verify badge colors. AC-6 tests that type filtering works but only checks that non-matching type badges are absent — not that the correct color appears. A future implementer could render all badges in the same grey and pass every AC.

**Recommendation:** Add a visual verification note to AC-6 or create AC-10: "Given type=reversal notifications are rendered, Then the type badge background is the red variant (class `kl-badge--reversal` or equivalent)." This need not block implementation but should be tracked.

**Severity:** Non-blocking. Spec has the color table; the gap is in the AC coverage.

---

## Finding 4 — `/api/notifications?limit=0` semantic ambiguity

**Lens:** `/api/notifications/mark-read` payload and API clarity.

The GET endpoint uses `limit=0` as a sentinel meaning "return only `{unread_count}`, skip the `latest` array." This is a non-standard overloading of the `limit` parameter — limit=0 conventionally means "zero rows" in most pagination APIs, but here it means "metadata-only mode."

**Flag:** The response shape section shows `unread_count` always returned regardless of `limit`, but `latest` is conditionally omitted when `limit=0`. This is not reflected in the TypeScript response type shown in the spec. If an implementer types the response as always having `latest: Notification[]`, the `limit=0` consumer (`NotificationBell`'s unread-count fetch) will pass TypeScript checking but blow up at runtime on `data.latest.map(...)`.

**Recommendation:** The spec should show a union response type:
```typescript
// limit > 0
{ unread_count: number; latest: Notification[] }
// limit = 0
{ unread_count: number }
```
Or use a dedicated `?countOnly=true` query param to avoid the sentinel overload.

**Severity:** Non-blocking. Risk is real but contained to the `NotificationBell` component; `limit=0` is only used there and the spec describes the behavior correctly in prose.

---

## Finding 5 — `/alerts?project=<slug>` slug→id join: PRESENT

**Lens:** Deep-link `/alerts?project=<slug>` needs server-side slug→project_id resolution.

Verified: §3 item 5 (filter bar) states "Resolved to `project_id` server-side" for the `?project=<slug>` param. §3 item 6 (Deep-link support) gives the exact mechanism: "slug is resolved to UUID server-side via a Drizzle query on `projects.slug`." This is present and adequate.

**No finding.**

---

## Finding 6 — Polling trade-off: DOCUMENTED, flag for T17 interaction

**Lens:** Route-change revalidation; bell doesn't update while user sits on one page.

The spec documents this honestly in §2 and §7(vii): the bell re-fetches on path change, a manual Refresh button compensates, and SWR polling is explicitly rejected. This is a deliberate, owner-approved trade-off.

**Flag (informational):** T17 reads `digested_at`; T16's mark-read flow sets `read_at` but never sets `digested_at`. T17's spec assumes `digested_at` was "set in T16's migration." The architecture §3 confirms `digested_at TIMESTAMPTZ` exists in the schema (migration 001), but T16's `mark-read` route only updates `read_at`, not `digested_at`. T17 writes `digested_at` itself when it sends the digest. This is correct — T16 does not need to touch `digested_at`. However T17's spec §6 says "T16 creates the `notifications` table infrastructure" implying T16 also handles `digested_at` lifecycle. It does not — T17 owns `digested_at` writes exclusively.

This is a documentation ambiguity in T17, not a defect in T16. No action required in T16.

**Severity:** Non-blocking informational.

---

## Finding 7 — API route name mismatch with architecture §6

**Lens:** Architecture cross-check.

Architecture §6 registers the notifications routes as `GET /api/alerts` and `POST /api/alerts/mark-read`. T16's spec creates `GET /api/notifications` and `POST /api/notifications/mark-read`. These are different URL paths.

**Flag:** The `SiteNav` already has an "Alerts" link pointing to `/alerts` (the page). But the API route is `/api/notifications/*` in T16 vs `/api/alerts` in the architecture table. The `app/(app)/alerts/page.tsx` page is consistent (correct). The mismatch is in the architecture doc's §6 route table vs the T16 route paths. Implementers cross-referencing the architecture doc will find conflicting route names.

**Recommendation:** T16's implementer should note this discrepancy in the PR and request that architecture §6 be updated to reflect `/api/notifications` and `/api/notifications/mark-read`. The T16 spec's route names are internally consistent and match the file ownership table; architecture §6 is stale.

**Severity:** Non-blocking. The T16 spec is self-consistent; the architecture doc is the source of confusion.

---

## Adversarial Checklist

| Check | Result |
|---|---|
| site-nav.tsx conflict — narrow edit in layout | PASS — correct approach; note on merge order slightly under-specified |
| API auth — `auth()` → 401 JSON, not 307 | PASS — AC-8 verifies; pattern matches T05 |
| Race: concurrent mark-read | PASS — documented in §7(iv); last-write-wins acceptable |
| 60 notifications, 50/page pagination | PASS — 2 pages, cursor-based, noted |
| Deep-link slug→id join | PASS — server-side resolution in §3 items 5+6 |
| Type enum colors | FLAG — colors specified in §3 but not in any AC |
| Empty state | PASS — §7(ii) covers it; implementation language present |
| Polling trade-off documented | PASS — §2 and OQ-1 resolve this |
| Dedupe relies on `uq_notifications_dedupe` | FLAG — implicit reliance; not cited as precondition |
| mark-read dual-mode payload | PASS — `{ids:[]}` OR `{all:true}` clearly specified in §3 item 3 |
| `limit=0` sentinel ambiguity | FLAG — response union type not shown; TypeScript risk |
| Architecture §6 route name mismatch | FLAG — `/api/alerts` vs `/api/notifications` inconsistency |

---

## Verdict

**CONDITIONAL PASS.** 0 blocking issues. 4 non-blocking flags:
1. Merge-order for `app/(app)/layout.tsx` between T05 and T16 is under-specified.
2. `uq_notifications_dedupe` index dependency is an implicit precondition, not documented.
3. Badge color correctness is unverified by any AC.
4. `limit=0` sentinel response shape creates a TypeScript union that is not explicitly typed, risking a runtime null-dereference in `NotificationBell`.

Top finding: the `limit=0` sentinel overload (Finding 4). It is the most likely to cause a real runtime bug: if the implementer types `GET /api/notifications` response as always returning `latest: Notification[]`, the bell's count-only fetch path will silently fail when `latest` is absent and the component tries to iterate it. A union type or a dedicated `?countOnly=true` param would eliminate this risk.
