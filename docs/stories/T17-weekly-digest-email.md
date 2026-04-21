---
id: T17
title: Weekly digest email via Resend
phase: 3
status: draft
blocked_by: [T16]
blocks: []
owner: spec-writer agent
effort_estimate: 3h
---

## 1. User story

As a KarbonLens user with email digest enabled, I want to receive a weekly email every Monday summarising my unread notifications from the past week, so that I stay informed about deforestation alerts and regulatory changes without having to log in daily.

---

## 2. Context & rationale

T16 created the `notifications` table and the in-app bell/inbox. T17 consumes the same rows and delivers them by email, closing the loop for users who do not visit the app daily.

Resend is the email delivery provider. Free tier: 3,000 emails/month, 100/day — more than sufficient for v0.1. The `notifications` table already has a `digested_at` column (set in T16's migration) which makes the digest naturally idempotent: any notification already included in a digest is excluded from the next run.

`RESEND_API_KEY` is already documented in `.env.example` (T03 era). T17 introduces one new env var, `DIGEST_SECRET`, which was not known at T03 time. This spec declares it in §5 and calls for a one-line amendment to `.env.example` — a documented cross-story exception (see §6).

The cron trigger is deliberately kept out of T17. T19 owns all cron installation on the VPS. T17 only exposes the endpoint and documents the two recommended trigger strategies.

---

## 3. Scope

### In scope

1. **Package installation**
   ```bash
   npm i resend @react-email/components @react-email/render
   ```
   Add these three packages to `package.json`. Confirm `npx tsc --noEmit` still passes.

2. **`lib/email/digest-template.tsx` — React Email template**

   A React Email component that receives:
   ```typescript
   interface DigestTemplateProps {
     userName: string;
     weekStart: string;          // e.g. "14 April 2026"
     weekEnd: string;            // e.g. "20 April 2026"
     totalAlerts: number;
     totalProjects: number;
     totalRegulatory: number;
     notifications: DigestNotification[];  // up to 10 items
     totalCount: number;         // actual count before truncation
     appUrl: string;             // https://karbonlens.netlify.app
     unsubscribeUrl: string;     // https://karbonlens.netlify.app/api/unsubscribe/<token>
   }

   interface DigestNotification {
     id: string;
     type: string;
     title: string;
     description: string | null;
     url: string | null;
     createdAt: string;          // ISO date string
   }
   ```

   Sections (in order):
   - **Greeting:** "Hi [name], here's your KarbonLens weekly digest for [week range]."
   - **Summary stats:** "This week: [N] new alerts across [N] projects, [N] regulatory updates." (counts derived from the notifications list passed in; caller computes from the full set before truncation.)
   - **Top 10 notifications:** each rendered as a row — type badge, title, description (truncated at 120 chars), date. If `totalCount > 10`, show a line: "[N] more — view all in app →" linking to `appUrl/alerts`.
   - **"View all in app" button** → `appUrl/alerts`
   - **Unsubscribe link:** plain text at the bottom — "Not useful? Unsubscribe in one click." linking to `unsubscribeUrl`. Must appear in every email.

   Design constraints: simple, no custom fonts, compatible with Gmail/Outlook dark mode. Use `@react-email/components` primitives (`Html`, `Head`, `Body`, `Container`, `Section`, `Text`, `Button`, `Link`, `Hr`). Follow the KarbonLens muted colour palette (dark green `#1a3c2e`, off-white `#f5f4f0`, accent `#2d6a4f`).

   Plain-text fallback is produced by `@react-email/render` with `plainText: true` flag — no separate template needed; the implementer must pass the plain-text string to Resend's `text` field.

3. **`lib/email/send-digest.ts` — per-user digest sender**

   Exported function:
   ```typescript
   export async function sendDigest(userId: string): Promise<{
     userId: string;
     sent: boolean;
     count: number;
     error?: string;
   }>
   ```

   Logic:
   1. Query `notifications` where `user_id = $userId AND digested_at IS NULL AND created_at >= NOW() - INTERVAL '7 days'`, ordered by `created_at DESC`.
   2. If `count === 0`, return `{ userId, sent: false, count: 0 }` immediately (no email sent, no Resend call).
   3. Fetch user row for `email` and `name` (required for personalisation).
   4. Generate unsubscribe token via `lib/email/unsubscribe-token.ts` (see item 6).
   5. Render HTML via `render(<DigestTemplate ... />, { pretty: false })`.
   6. Render plain text via `render(<DigestTemplate ... />, { plainText: true })`.
   7. Call Resend:
      ```typescript
      await resend.emails.send({
        from: 'KarbonLens <onboarding@resend.dev>',   // swap to custom domain when ready
        to: [user.email],
        subject: `Your KarbonLens digest — week of ${weekStart}`,
        html,
        text,
      });
      ```
   8. On Resend success: `UPDATE notifications SET digested_at = NOW() WHERE id = ANY($notificationIds)`.
   9. Return `{ userId, sent: true, count }`.
   10. On any error: log the error, return `{ userId, sent: false, count: 0, error: e.message }` — do **not** throw; the caller must continue with other users.

   The `Resend` client is instantiated once at module level using `process.env.RESEND_API_KEY`.

4. **`app/api/digest/route.ts` — cron endpoint**

   Supports `POST` (and `GET` for simpler curl triggers — implement both via `export { handler as GET, handler as POST }`).

   **Auth:** reads `Authorization: Bearer <token>` header. Compare `token === process.env.DIGEST_SECRET` using a constant-time comparison (`crypto.timingSafeEqual`). Return `401` with `{ error: "Unauthorized" }` if missing or wrong.

   **Logic:**
   1. Query all users where `email_digest_opt_in = TRUE`.
   2. For each user, call `sendDigest(user.id)` and collect the result.
   3. Skip (and count as `skipped`) users where `sendDigest` returns `sent: false` due to zero notifications. Distinguish `skipped` (0 notifications) from `errors` (exception or Resend error).
   4. Return `200` with:
      ```json
      {
        "users_processed": 10,
        "emails_sent": 7,
        "skipped": 2,
        "errors": 1
      }
      ```

   **Idempotence:** guaranteed by `digested_at`. Re-running the endpoint in the same week sends 0 emails because all notifications already have `digested_at` populated.

   **Rate limiting:** Resend free tier allows 100 emails/day. For v0.1 user counts this is fine. If `users_processed > 90`, log a warning but do not abort — Andy will upgrade the plan before user count warrants it.

5. **`app/api/unsubscribe/[token]/route.ts` — one-click unsubscribe**

   `GET /api/unsubscribe/<token>`

   1. Verify the JWT token via `lib/email/unsubscribe-token.ts`. If invalid or expired (TTL: 30 days), return `400` with a simple HTML error page.
   2. Extract `userId` from token payload.
   3. `UPDATE users SET email_digest_opt_in = FALSE WHERE id = $userId`.
   4. Return `200` with a minimal HTML confirmation page: "You have been unsubscribed from KarbonLens weekly digest emails. You can re-enable this in your account settings."
   5. The route renders HTML directly (not JSON) — set `Content-Type: text/html`.

6. **`lib/email/unsubscribe-token.ts` — token sign/verify**

   Uses the `jose` package (already a peer dependency of `next-auth`) — no new package needed.

   ```typescript
   export async function signUnsubscribeToken(userId: string): Promise<string>
   export async function verifyUnsubscribeToken(token: string): Promise<{ userId: string } | null>
   ```

   - Algorithm: `HS256`
   - Secret: `process.env.NEXTAUTH_SECRET` (reuse — avoids a new secret while keeping the token secure)
   - Payload: `{ sub: userId, purpose: 'unsubscribe' }`
   - Expiry: 30 days (`'30d'`)
   - `verifyUnsubscribeToken` returns `null` (not throws) on any verification error

7. **Cron trigger options** — documented here, installed by T19.

   Two options; recommend option (a):

   **(a) VPS cron (recommended):** T19 adds this entry to `/etc/cron.d/karbonlens`:
   ```
   0  2  *  *  1  karbonlens  curl -s -X POST \
     -H "Authorization: Bearer $DIGEST_SECRET" \
     https://karbonlens.netlify.app/api/digest \
     >> /var/log/karbonlens/digest.log 2>&1
   ```
   Fires every Monday 02:00 UTC (= 09:00 Asia/Jakarta WIB). `$DIGEST_SECRET` is sourced from `/opt/karbonlens/.env`.

   **(b) GitHub Actions scheduled workflow:** create `.github/workflows/weekly-digest.yml` with:
   ```yaml
   on:
     schedule:
       - cron: '0 2 * * 1'
   ```
   Calls the same endpoint with `DIGEST_SECRET` stored as a GitHub Actions secret. Use this if VPS cron is unavailable.

   Recommendation: use (a) because T19 already installs and manages cron entries on the VPS; consolidating there reduces the number of moving parts. Option (b) is the fallback.

8. **Runbook:** `docs/runbooks/resend-api-key.md`

   See §5 Outputs. The runbook covers: register at resend.com, verify sending domain, create API key, add to env. Detailed in a separate file (owned by T17).

### Out of scope (explicit non-goals)

- Substack / newsletter integration — v0.2 backlog.
- Per-user timezone control — v0.2. Cron fires at a fixed UTC time; digest content window is always "last 7 days" regardless of user timezone.
- Transactional emails (password reset, welcome) — NextAuth handles its own emails independently.
- Email analytics dashboard — Resend's dashboard is sufficient for v0.1.
- Custom fonts or full HTML theming — simple, plain-compatible template only.
- Market summary paragraph in email body — v0.1 template focuses on notifications only. Andy may add a manually authored paragraph in v0.2.
- Score-drop alerts in digest — v0.2 once score-drop notifications exist.
- Retry logic for Resend rate-limit errors beyond simple error logging — v0.2.

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Missing auth header → 401**
```
Given DIGEST_SECRET is set in the environment
When POST /api/digest is called with no Authorization header
Then the response status is 401
And the body is { "error": "Unauthorized" }
```

**AC-2: Authorised trigger sends emails**
```
Given RESEND_API_KEY is set and valid
And DIGEST_SECRET is set
And at least one user with email_digest_opt_in=TRUE has undigested notifications from the last 7 days
When POST /api/digest -H "Authorization: Bearer <DIGEST_SECRET>"
Then the response status is 200
And the body contains { "emails_sent": N } where N >= 1
And andy@fmg.co.id receives an email in their inbox (manual verification in Gmail)
```

**AC-3: Idempotence — re-running sends 0 emails**
```
Given the digest endpoint was successfully called in step AC-2
And digested_at is now populated on all included notifications
When POST /api/digest -H "Authorization: Bearer <DIGEST_SECRET>" is called again immediately
Then the response is 200
And the body contains { "emails_sent": 0 }
And no new email arrives in the inbox
```

**AC-4: Unsubscribe link deactivates digest**
```
Given a digest email has been received containing an unsubscribe link
When the user opens the unsubscribe link in a browser (GET /api/unsubscribe/<token>)
Then the response status is 200
And the page body contains a confirmation message
And SELECT email_digest_opt_in FROM users WHERE email='<user>' returns FALSE
```

**AC-5: Opted-out users are skipped**
```
Given user A has email_digest_opt_in=FALSE
And user A has undigested notifications from the last 7 days
When POST /api/digest is called with the correct bearer token
Then user A does not receive an email
And the response body contains "skipped" count that includes user A
```

**AC-6: Users with 0 undigested notifications are skipped**
```
Given user B has email_digest_opt_in=TRUE
And user B has no undigested notifications created in the last 7 days
  (either no notifications or all have digested_at set)
When POST /api/digest is called with the correct bearer token
Then user B does not receive an email
And the response "skipped" count includes user B
```

**AC-7: TypeScript and build pass**
```
Given all T17 files have been created
When npx tsc --noEmit runs
Then exit code is 0
When npm run build runs
Then exit code is 0
```

**AC-8: Template renders valid HTML**
```
Given the DigestTemplate component is instantiated with valid props
When render(<DigestTemplate ... />) is called
Then the function does not throw
And the returned string is non-empty and starts with <!DOCTYPE html>
```

**AC-9: Plain-text version is emitted**
```
Given the DigestTemplate is rendered with { plainText: true }
When the render output is passed to Resend's emails.send() as the `text` field
Then the Resend API call includes a non-empty plain-text body
And the plain-text body contains the user's name and at least one notification title
```

---

## 5. Inputs & outputs

### Inputs

| Input | Source |
|---|---|
| `RESEND_API_KEY` | Already in `.env.example` (T03-era placeholder); Andy pastes the real value per the runbook in §5 Outputs |
| `DIGEST_SECRET` | **New env var introduced by T17.** Generate: `openssl rand -base64 32`. Add to Netlify env vars and VPS `.env`. See cross-story exception note below. |
| `NEXTAUTH_SECRET` | Set in T05. Reused here for unsubscribe token signing — no new secret. |
| `notifications` table | Written by T07 (GFW alerts) and T16 (in-app notifications infrastructure). `digested_at` column was added in T16's migration. |
| `users` table | `email`, `name`, `email_digest_opt_in` columns, all present since T02. |

### Outputs

| Output | Path |
|---|---|
| React Email template | `lib/email/digest-template.tsx` |
| Per-user sender | `lib/email/send-digest.ts` |
| Token sign/verify | `lib/email/unsubscribe-token.ts` |
| Digest cron endpoint | `app/api/digest/route.ts` |
| Unsubscribe endpoint | `app/api/unsubscribe/[token]/route.ts` |
| Resend runbook | `docs/runbooks/resend-api-key.md` |
| `package.json` additions | `resend`, `@react-email/components`, `@react-email/render` |

**Cross-story exception — `.env.example` amendment:**
T03 owns `.env.example` as the sole file editor. T17 introduces `DIGEST_SECRET`, a new env var that was not known at T03 time. As a rare exception, T17's implementer may append the following line to `.env.example`:
```
# ── Digest cron ─────────────────────────────────────────────────────────────
# Shared secret for POST /api/digest. Generate: openssl rand -base64 32
DIGEST_SECRET=CHANGE_ME
```
This exception is allowed because: (a) the var did not exist at T03 time, (b) it is a pure append with no conflict risk, (c) the absence of this line would leave the env var undocumented for all future developers. The implementer must flag this in the PR description.

---

## 6. Dependencies & interactions

### Blocked by
- **T16** — `notifications.digested_at` column must exist before T17 can write to it. T16 creates the `notifications` table infrastructure and the in-app inbox; T17 is a consumer, not a re-creator.

### Blocks
- **T19** — Cron installation on the VPS includes the `curl` entry for `POST /api/digest`. T17 must be deployed before T19 can install this entry.

### File ownership (paths this story is exclusively allowed to create or modify)

T17 owns the following paths. Parallel implementers must not touch them:

```
lib/email/digest-template.tsx
lib/email/send-digest.ts
lib/email/unsubscribe-token.ts
app/api/digest/route.ts
app/api/unsubscribe/[token]/route.ts
docs/runbooks/resend-api-key.md
```

T17 may also **append** (not rewrite) one block to:
```
.env.example    ← cross-story exception; documented in §5
```

T17 does **not** touch:
- `lib/schema.ts` — schema already has `notifications.digested_at` and `users.email_digest_opt_in` (T16).
- `scrapers/migrations/` — no schema changes needed.
- Any existing API routes.

---

## 7. Edge cases & failure modes

**(i) Resend rate limit (429)**
Resend free tier: 100 emails/day. If a batch exceeds this (unlikely in v0.1 with < 50 users), Resend returns a 429 error. `sendDigest` catches the error, logs it, and returns `{ sent: false, error: 'rate_limit' }`. The digest endpoint counts these as `errors`, not `skipped`. The caller's log will make this visible. Andy monitors via Resend's dashboard. Resolution: upgrade plan or spread sends over multiple days (v0.2).

**(ii) User email bounces or Resend rejects the address**
If Resend returns a non-429 error (invalid email, blocked address, etc.), `sendDigest` catches the error, logs `{ userId, email, error }`, and returns `{ sent: false, error }`. Other users are not affected. The implementer must ensure the catch is at the per-user level, not wrapping the entire loop.

**(iii) Zero opted-in users**
If `SELECT * FROM users WHERE email_digest_opt_in = TRUE` returns 0 rows, the loop body never executes. The endpoint returns `200` with `{ users_processed: 0, emails_sent: 0, skipped: 0, errors: 0 }`.

**(iv) Timezone handling**
The cron fires at 02:00 UTC (= 09:00 Asia/Jakarta WIB). The "last 7 days" window in the SQL query uses `NOW() - INTERVAL '7 days'` which is UTC-based. This is intentional and consistent regardless of user or server timezone. No timezone conversion is applied to notification timestamps.

**(v) Email truncation — more than 10 notifications**
The template always receives at most 10 notifications. `send-digest.ts` slices the query result to 10 before rendering, and passes `totalCount` (the full untruncated count) separately so the template can render "+N more → view in app".

**(vi) `DIGEST_SECRET` not set in environment**
If `process.env.DIGEST_SECRET` is undefined, `crypto.timingSafeEqual` will throw. Guard with:
```typescript
if (!process.env.DIGEST_SECRET) {
  return Response.json({ error: 'Digest not configured' }, { status: 503 });
}
```
This prevents a confusing 500 and makes the misconfiguration explicit.

**(vii) Unsubscribe token expired (> 30 days)**
`verifyUnsubscribeToken` returns `null`. The route returns `400` with a friendly HTML message: "This unsubscribe link has expired. Please log in to manage your email preferences."

---

## 8. Definition of done

- [ ] All 9 acceptance criteria pass.
- [ ] Story's files landed in `feature/v0.1-impl` under a PR.
- [ ] Manual test: digest email received in `andy@fmg.co.id` Gmail with correct content.
- [ ] Manual test: unsubscribe link clicked, `email_digest_opt_in` flipped to FALSE in DB.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] `TASKS.md` T17 status updated from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.
- [ ] `docs/runbooks/resend-api-key.md` committed.
- [ ] `.env.example` amendment applied and flagged in PR description.

---

## 9. Open questions

1. **Sending domain:** v0.1 uses Resend's default `onboarding@resend.dev` as the `from` address. This bypasses domain verification entirely and works immediately. When Andy acquires a custom domain (e.g., `karbonlens.id`), set up a verified sending domain in Resend and update the `from` field in `send-digest.ts` to `noreply@karbonlens.id`. Action: defer to post-v0.1.

2. **Cron installation:** T17 documents the `curl` command but T19 installs it. T17 must be deployed to Netlify before T19 can successfully test the cron entry. Ensure T17 merges before T19 begins.

3. **Score-drop notifications in digest:** the current notification types include `reversal`, `regulatory`, `price`, `news`, `retirement`, `issuance`. Score-drop is not yet a notification type. When T09 is extended to emit score-drop notifications (v0.2), they will automatically appear in the digest with no T17 changes needed.

4. **`jose` availability:** `jose` is a dependency of `next-auth` and should already be in `node_modules`. If `npm install` does not hoist it, add it explicitly: `npm i jose`. Implementer to verify before finalising.

5. **GitHub Actions fallback (option b):** if Andy wants the Actions workflow as belt-and-suspenders alongside the VPS cron, this is a 20-minute addition. Not planned for v0.1 unless VPS cron proves unreliable.

---

## 10. References

- `docs/architecture.md` §3 — `notifications` table schema (`digested_at`, `user_id`, `type`, `title`)
- `docs/architecture.md` §3 — `users` table schema (`email_digest_opt_in`)
- `docs/architecture.md` §6 — API route table (`/api/digest/cron`)
- `docs/architecture.md` §7 — env vars (`RESEND_API_KEY`, `DIGEST_CRON_SECRET`)
- `docs/architecture.md` §4 — cron schedule (Monday 05:00 entry for digest)
- `docs/TASKS.md` T17 — task definition
- `docs/TASKS.md` T19 — cron installation (T17's downstream)
- `docs/stories/T16-notifications-bell-inbox.md` — upstream story that creates `notifications.digested_at`
- [Resend docs](https://resend.com/docs/send-with-nextjs) — Next.js integration
- [React Email docs](https://react.email/docs/introduction) — template primitives
- [jose docs](https://github.com/panva/jose) — JWT sign/verify used for unsubscribe tokens
