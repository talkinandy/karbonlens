---
id: T16
title: Notifications bell + alerts inbox
phase: 3
status: draft
blocked_by: [T04, T05, T07]
blocks: [T17]
owner: implementer-agent
effort_estimate: 3h
---

## 1. User story

As a signed-in carbon market analyst, I want a bell icon in the top nav that shows my unread notification count and a full inbox at `/alerts`, so that I can quickly see and act on deforestation alerts and regulatory events relevant to my watched projects.

---

## 2. Context & rationale

T07 (GFW scraper) inserts `notifications` rows for every user when new deforestation alerts are detected. T05 established the session that makes the authenticated user's `id` available to server components and API routes. T03/T05 gave `SiteNav` a `rightSlot` prop for auth widgets.

T16 closes the loop: the bell makes unread notifications visible at a glance; the `/alerts` inbox provides the full list with filtering and bulk actions. The `notifications` table already has 60 rows seeded for Andy's account — no schema changes needed.

**Polling decision (Andy's override):** No real-time push for v0.1. Unread count is refetched on route navigation (Next.js `router.refresh()` after mark-read actions, plus a `router.events`-style `usePathname` effect in the client component). This is simpler than SWR polling and produces zero background DB load. A manual "Refresh" button is included as a user escape hatch.

**API auth:** `/api/notifications/*` routes enforce auth by calling `auth()` from `lib/auth.ts` and returning 401 JSON (not a 307 redirect) when session is absent — consistent with the API-route boundary principle (middleware only gates page routes).

---

## 3. Scope

### In scope

1. **`components/notifications/NotificationBell.tsx`** — client component mounted in the `(app)` layout's `rightSlot`:
   - Renders a bell SVG icon (Heroicons `BellIcon` or inline SVG matching design-brief icon size 20px).
   - Unread-count badge:
     - 0 unread → badge hidden.
     - 1–99 → badge shows the number.
     - ≥ 100 → badge shows `99+`.
     - Badge is a filled red pill (`bg-red-500 text-white text-[10px] font-tabular`) positioned top-right of the bell.
   - On click: opens a dropdown panel (max-height 480px, overflow-y auto):
     - Header: "Notifications" + "Mark all as read" button (calls `POST /api/notifications/mark-read` with `{all: true}`).
     - Body: latest 10 notifications for the user (fetched from `GET /api/notifications?limit=10`), newest first. Each row: unread dot, type badge, title, relative timestamp ("2h ago").
     - Footer: "View all →" link to `/alerts`.
   - On route change (`usePathname`): refetch unread count from `GET /api/notifications?limit=0` (returns only `unread_count` when `limit=0`). This is the sole polling mechanism — no setInterval.
   - Optimistic mark-read: decrement local unread count immediately on "Mark all as read", revert if the API call fails.

2. **`app/api/notifications/route.ts`** — GET handler:
   - Calls `auth()`. Returns `401 { error: 'Unauthenticated' }` if no session.
   - Query params:
     - `limit` (default 10, max 50). When `limit=0`, skip the `latest` array and return only `{unread_count}`.
     - `before` (UUID cursor — `id` of the last item from a previous page, for the `/alerts` page pagination). When omitted, returns the newest items.
   - Query: `SELECT * FROM notifications WHERE user_id = $1 [AND id < $before] ORDER BY created_at DESC LIMIT $limit`.
   - Response shape:
     ```json
     {
       "unread_count": 42,
       "latest": [
         {
           "id": "uuid",
           "type": "reversal",
           "title": "...",
           "description": "...",
           "project_id": "uuid | null",
           "url": "/projects/katingan-peatland",
           "read_at": null,
           "created_at": "2026-04-19T03:22:00Z"
         }
       ]
     }
     ```
   - `unread_count` is a separate `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL` — always returned regardless of `limit`.

3. **`app/api/notifications/mark-read/route.ts`** — POST handler:
   - Calls `auth()`. Returns `401 { error: 'Unauthenticated' }` if no session.
   - Body (JSON): `{ ids: string[] }` OR `{ all: true }`.
   - Validates that at least one of `ids` (non-empty array of valid UUIDs) or `all: true` is present; returns `400` otherwise.
   - Executes:
     - `{all: true}`: `UPDATE notifications SET read_at = NOW() WHERE user_id = $session.user.id AND read_at IS NULL`
     - `{ids}`: `UPDATE notifications SET read_at = NOW() WHERE user_id = $session.user.id AND id = ANY($ids) AND read_at IS NULL`
   - Scope is always `user_id = session.user.id` — cannot mark another user's notifications.
   - Response: `{ updated: <rows-affected>, unread_count: <new-count> }`.

4. **Top nav integration — `components/site-nav.tsx`** (narrow edit):
   - No change to the component itself. The `(app)` group layout (`app/(app)/layout.tsx`) is updated to compose the `rightSlot`:
     ```tsx
     rightSlot={<><NotificationBell /> <UserMenu /></>}
     ```
   - `NotificationBell` is a client component; the layout server component imports it. `UserMenu` already exists from T05. The bell appears to the left of the avatar — preserving the T05 layout with bell inserted.
   - File ownership: `app/(app)/layout.tsx` is modified (T05 owns it but adds only the bell alongside UserMenu; coordinate with T05 implementer if merging post-T05).

5. **`app/(app)/alerts/page.tsx`** — full inbox, replacing the T03 mock:
   - Server component (RSC). Reads `session` via `auth()`; renders 0 loading state via `app/(app)/alerts/loading.tsx`.
   - Fetches initial 50 notifications directly from DB using Drizzle (no API round-trip for the server component — preferred pattern per architecture §1).
   - Layout: filter bar (top) + card/table list + pagination footer.
   - **Columns / fields per notification row:**
     - Read indicator: filled dot (blue, `●`) if unread; hollow dot (`○`) if read.
     - Type badge: pill with text — `reversal` (red), `price` (green), `regulatory` (amber), `news` (slate), `retirement` (purple), `issuance` (teal). Unknown types fall back to grey.
     - Title (bold, truncated at 80 chars).
     - Description (muted, truncated at 120 chars, single line).
     - Project link: if `project_id IS NOT NULL`, look up `projects.slug` and render as `<Link href="/projects/{slug}">{project.name_canonical}</Link>`; otherwise show an em-dash.
     - URL click-through: title is a link to `notification.url` if present; opens in same tab (most URLs are internal `/projects/…` routes).
     - `created_at`: relative format ("2h ago", "3d ago") using a tiny client helper; fall back to ISO date beyond 30 days.
   - **Filters (URL search params — shareable):**
     - `?type=reversal,regulatory` — multi-value; comma-separated. Filters to matching types. A multi-select pill row with `All` as default.
     - `?read=unread` — toggle between All / Unread only.
     - `?project=<slug>` — pre-filter by project slug (deep-link from `/projects/[slug]` "View alerts" button). Resolved to `project_id` server-side.
   - **Bulk action:** checkbox per row + "Select all on page" checkbox in header. "Mark selected as read" button (disabled when 0 checked) calls `POST /api/notifications/mark-read` with `{ids: [...]}`, then `router.refresh()`.
   - **Pagination:** 50 per page, cursor-based (pass `?before=<last-id>` to the next-page query). "Load more" button pattern (not numbered pages) — simpler and avoids count query.
   - **Empty state:** if 0 notifications after filters: illustration placeholder + copy "No notifications yet. Alerts from monitored projects will appear here."

6. **Deep-link support:**
   - `GET /alerts?project=katingan-peatland` pre-filters the inbox to notifications where `project_id` matches the Katingan project. The slug is resolved to UUID server-side via a Drizzle query on `projects.slug`.
   - The project detail page (`app/(app)/projects/[slug]/page.tsx`) should include a "View alerts →" button linking to `/alerts?project={slug}`. T16 owns the link spec; the detail page implementation is T12's file — coordinate with T12 if in-flight.

### Out of scope (explicit non-goals)

- Browser push notifications — v0.2.
- Telegram bot alerts — v0.2.
- Per-type notification preferences (opt-out by type) — v0.2.
- Digest grouping ("5 alerts for Katingan this week") — v0.2.
- Per-project watchlists (currently all users receive all project alerts) — v0.2.
- Real-time WebSocket or SSE push — v0.2.
- SWR polling on a timer — explicitly rejected (route-change revalidation chosen instead).
- Unread dot in the tab title / `<title>` — v0.2.

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Unauthenticated `/alerts` redirects**
```
Given I am not signed in
When  I make a GET request to /alerts
Then  I receive an HTTP 307 redirect to /?signin=1
```
_Verification:_ `curl -I http://localhost:3000/alerts` → observe `Location: /?signin=1` header. Middleware (`middleware.ts`) already covers `/alerts/:path*`.

---

**AC-2: Authenticated `/alerts` renders notifications**
```
Given I am signed in as Andy (andy@fmg.co.id)
And   there are 60 notifications in the DB for that user_id
When  I navigate to /alerts
Then  the page returns HTTP 200
And   at least 1 notification row is visible
And   the total rendered across page 1 is 50 (first page cap)
```
_Verification:_ `curl -b <session-cookie> http://localhost:3000/alerts` → 200; DOM contains `≥1` notification row.

---

**AC-3: Bell visible with correct unread count**
```
Given I am signed in as Andy
And   all 60 notifications have read_at IS NULL
When  any (app)-group page renders
Then  the bell icon is visible in the top nav
And   the badge shows "60"
```
_Verification:_ Open browser → inspect `.kl-notification-badge` inner text equals "60".

---

**AC-4: Mark individual notifications as read**
```
Given I am signed in as Andy
And   there are 60 unread notifications
When  I select 3 notifications on /alerts and click "Mark selected as read"
Then  the unread badge decrements to 57
And   the 3 selected rows show the hollow-dot read indicator
And   SELECT COUNT(*) FROM notifications WHERE read_at IS NULL AND user_id = '<andy-id>'
      returns 57
```
_Verification:_ UI check + SQL query.

---

**AC-5: "Mark all as read" zeros unread count**
```
Given I am signed in as Andy with 60 unread notifications
When  I click "Mark all as read" in the bell dropdown (or on /alerts)
Then  the badge disappears (0 hidden)
And   SELECT COUNT(*) FROM notifications WHERE read_at IS NULL AND user_id = '<andy-id>'
      returns 0
```
_Verification:_ UI check + SQL query.

---

**AC-6: Type filter works**
```
Given I am signed in as Andy
And   the DB contains notifications of type 'reversal' and other types
When  I navigate to /alerts?type=reversal
Then  only notifications with type='reversal' are rendered
And   the "reversal" filter pill is shown as active
```
_Verification:_ Navigate to URL; confirm no non-reversal type badges appear in the list.

---

**AC-7: Project deep-link filter works**
```
Given the DB has notifications linked to the Katingan project (slug='katingan-peatland')
When  I navigate to /alerts?project=katingan-peatland
Then  only notifications whose project_id matches Katingan are shown
And   the filter bar shows "Katingan Peatland" as an active project filter chip
```
_Verification:_ Navigate to URL; confirm all visible rows have the Katingan project link.

---

**AC-8: Unauthenticated API call returns 401**
```
Given I am not signed in (no session cookie)
When  I make a GET request to /api/notifications
Then  I receive HTTP 401 with body {"error":"Unauthenticated"}
And   I do NOT receive a 307 redirect
```
_Verification:_ `curl -i http://localhost:3000/api/notifications` → `HTTP/1.1 401` + JSON body.

---

**AC-9: TypeScript + build pass**
```
Given all files in §6 (File ownership) have been created or modified
When  I run: npx tsc --noEmit
And   I run: npm run build
Then  both commands exit with code 0
And   no TypeScript errors are printed
```
_Verification:_ `npx tsc --noEmit && npm run build` in the repo root.

---

## 5. Inputs & outputs

### Inputs

| Input | Source |
|---|---|
| `DATABASE_URL` | `.env.local` (T04) |
| `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_*` | `.env.local` (T05) |
| `lib/auth.ts` — `auth()` export | T05 |
| `lib/db.ts` — Drizzle client | T04 |
| `lib/schema.ts` — `notifications`, `projects`, `users` tables | T04 |
| `notifications` rows (60 for Andy) | T07 Phase B GFW scraper |
| `components/auth/UserMenu.tsx` | T05 |
| `app/(app)/layout.tsx` with `rightSlot` | T05 |
| `components/site-nav.tsx` with `rightSlot` prop | T03/T05 |
| `middleware.ts` — already gates `/alerts` | T05 |

### Outputs

| Output | Description |
|---|---|
| `components/notifications/NotificationBell.tsx` | Client component: bell icon + badge + dropdown |
| `components/notifications/index.ts` | Re-export barrel |
| `app/api/notifications/route.ts` | GET — returns `{unread_count, latest}` |
| `app/api/notifications/mark-read/route.ts` | POST — marks notifications read |
| `app/(app)/alerts/page.tsx` | Full inbox RSC (replaces T03 mock) |
| `app/(app)/alerts/loading.tsx` | Skeleton loading state for Suspense |
| `app/(app)/layout.tsx` | Narrow edit: add `<NotificationBell />` to `rightSlot` |

No new env vars. No new DB migrations (schema already has `notifications` table with `read_at` and all needed columns).

---

## 6. Dependencies & interactions

### Blocked by

- **T04** — Drizzle client + schema (especially `notifications` and `projects` tables).
- **T05** — `auth()`, `UserMenu.tsx`, `app/(app)/layout.tsx` with `rightSlot`. `session.user.id` must be available.
- **T07** — 60 notification rows must be present for Andy's `user_id` for AC-2/AC-3 to pass.

### Blocks

- **T17** (Weekly digest email) — digest reads `notifications.digested_at`; T16 establishes the mark-read flow that T17 extends with `digested_at`.

### File ownership (do not modify in parallel tasks)

| Path | Action |
|---|---|
| `components/notifications/NotificationBell.tsx` | Create |
| `components/notifications/index.ts` | Create |
| `app/api/notifications/route.ts` | Create |
| `app/api/notifications/mark-read/route.ts` | Create |
| `app/(app)/alerts/page.tsx` | Modify (replace T03 mock) |
| `app/(app)/alerts/loading.tsx` | Create |
| `app/(app)/layout.tsx` | Narrow edit — add bell to `rightSlot`; coordinate with T05 owner if merging concurrently |

**Do NOT modify:**
- `middleware.ts` — already gates `/alerts`. No change needed.
- `components/site-nav.tsx` — no direct change; `rightSlot` composition happens in the layout.
- `lib/schema.ts` — no schema changes.
- `lib/auth.ts` — consume only; do not modify.

---

## 7. Edge cases & failure modes

**(i) Notification with `project_id IS NULL`**
The `project_id` column is nullable (FK with `ON DELETE SET NULL`). When rendering a row in `/alerts`, if `project_id IS NULL`, show an em-dash in the project column and no link. Do not attempt a project lookup.

**(ii) Zero notifications (empty state)**
If the user has no notifications at all (or all filtered out), render the empty state: centred placeholder icon + "No notifications yet. Alerts from monitored projects will appear here." Do not show an empty table with headers.

**(iii) Unread count exceeds 99**
Badge renders `99+` as a string. CSS must accommodate 3 characters without clipping. Minimum badge width: `1.5rem`. This applies to both the dropdown badge and any count shown in the `/alerts` page header.

**(iv) Concurrent mark-read race**
Two tabs both call `POST /api/notifications/mark-read` with `{all: true}` simultaneously. `UPDATE … WHERE read_at IS NULL` is idempotent — the second write touches 0 rows. Last-write-wins on timestamps is acceptable for v0.1. No locking or conflict handling required.

**(v) Optimistic mark-read revert on API error**
`NotificationBell` decrements local unread count optimistically before the API call resolves. If the API call returns a non-2xx response, restore the previous count from a local `prev` snapshot held in component state. Show a toast error ("Failed to mark as read — please try again"). Do not use SWR mutation for this; plain `useState` + try/catch is sufficient.

**(vi) Bell mounts before initial count fetch**
On first render, before the initial `GET /api/notifications?limit=0` resolves, show no badge (treat as 0, not a loading spinner). This avoids layout shift.

**(vii) Stale count after navigation back from `/alerts`**
After the user marks items read on `/alerts` and navigates back to another page, the bell count may be stale. The `usePathname` effect triggers a re-fetch on any path change, so navigating away from `/alerts` to `/projects` will re-fetch the count with the updated data.

---

## 8. Definition of done

- [ ] All 9 acceptance criteria pass against `npm run dev` with Andy's real session.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0 with no warnings.
- [ ] All files listed in §6 (File ownership) are present and committed to `feature/t16-notifications-bell-inbox`.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] `TASKS.md` T16 status flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

**OQ-1: Polling vs route-revalidation (resolved)**
Andy's override: route-change revalidation only (no SWR timer). Implementation: `usePathname()` in `NotificationBell` triggers `startTransition(() => router.refresh())` on path change. A "Refresh" manual button is included as an escape hatch. This produces zero background DB load vs. 60s polling which would hit the DB on every tab across all users.

**OQ-2: API auth pattern**
Use `const session = await auth()` from `lib/auth.ts` at the top of each API route handler. Return `NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })` if `session` is null. This is the established pattern from T05 — no new mechanism required.

**OQ-3: Notification type enum**
The schema uses `type TEXT NOT NULL` (no DB-enforced enum). T07 inserts `'reversal'`. Other type values (`price`, `regulatory`, `news`, `retirement`, `issuance`) are anticipated for v0.2 scrapers. For v0.1, the type badge renderer should handle all 6 known values plus a fallback for unknown strings — no code change needed when new types are introduced.

**OQ-4: `app/(app)/layout.tsx` coordination with T05**
T05 owns `app/(app)/layout.tsx`. If T16 is implemented after T05 merges, T16 adds `<NotificationBell />` as a narrow edit inside the existing `rightSlot` composition. If implemented in parallel, coordinate to avoid merge conflict on that file.

---

## 10. References

- `docs/architecture.md` §3 — `notifications` table schema (columns: `id`, `user_id`, `type`, `title`, `description`, `project_id`, `url`, `read_at`, `digested_at`, `created_at`)
- `docs/architecture.md` §1 — no Redis, no real-time push for v0.1
- `docs/TASKS.md` T16 — original task definition
- `docs/stories/T05-nextauth-google-oauth.md` — `auth()` usage pattern, `UserMenu`, `rightSlot`, `app/(app)/layout.tsx` ownership
- `docs/stories/T07-gfw-alerts-scraper.md` — notifications INSERT pattern; 60 rows seeded for Andy
- `lib/schema.ts` — `notifications`, `projects` Drizzle table definitions
- `components/site-nav.tsx` — `rightSlot` prop type (`React.ReactNode`)
- `middleware.ts` — `/alerts/:path*` already in matcher config; no change needed
