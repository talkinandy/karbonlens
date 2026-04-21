---
id: T05
title: NextAuth.js v5 with Google OAuth
phase: 1
status: done-phase-a
blocked_by: [T04]
blocks: [T16, T17, T18, T21]
owner: implementer-agent
effort_estimate: 2h
---

## 1. User story

As a carbon market analyst, I want to sign in with my Google account, so that I can access the full KarbonLens project database and receive personalised alerts without managing a separate password.

---

## 2. Context & rationale

KarbonLens gates the full 40+ project dataset and all alert/notification features behind authentication. Google OAuth is the only provider in v0.1 — it eliminates password management, provides verified email addresses for digest targeting, and requires zero credential storage on our side.

NextAuth v5 (Auth.js) with `@auth/drizzle-adapter` stores sessions in Postgres alongside all other application data. The `users`, `accounts`, `sessions`, and `verification_tokens` tables were created in migration 001 (T02). T04 wired up the Drizzle client (`lib/db.ts`) that the adapter consumes.

**Local dev note:** Google OAuth allows `http://localhost:3000` as an authorized JavaScript origin and `http://localhost:3000/api/auth/callback/google` as a redirect URI — localhost is explicitly permitted by Google, so HTTPS is not required for local development. Netlify deployment (`https://karbonlens.netlify.app`) is configured in the Google Cloud Console at the same time, but production release is deferred to a later sprint; v0.1 acceptance criteria are validated locally.

**Credential handling:** Andy registers the OAuth client in Google Cloud Console and drops `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env.local`. The implementer only verifies `.env.example` (owned by T03) and produces the runbook at `docs/runbooks/google-oauth-setup.md`.

---

## 3. Scope

### In scope

1. **`lib/auth.ts`** — NextAuth v5 configuration.
   - Provider: `Google` (from `next-auth/providers/google`), requesting `profile` and `email` scopes only.
   - Adapter: `DrizzleAdapter(db)` from `@auth/drizzle-adapter`. DB writes during login happen via the `karbonlens` role through `DrizzleAdapter(db)`; no owner-elevation needed — this is handled by T02's ownership block.
   - Session strategy: `database` (token stored in `sessions` table; not JWT). One SELECT per authed request is adequate for v0.1; revisit JWT strategy in v0.2 if traffic warrants.
   - Session callback: copies `user.id` from the adapter onto `session.user.id` so downstream server components and API routes can read the authenticated user's UUID without an extra DB lookup. **Important:** implement this check in the `(app)` group layout server component — not inside the NextAuth `signIn` callback. The NextAuth adapter guarantees the `users` row is fully committed before the session callback fires (adapter `createUser` → `linkAccount` → `createSession` → `session` callback, in that order). Moving the check into the callback would create a race; the layout approach correctly avoids it.
   - Named exports: `{ handlers, auth, signIn, signOut }`.

2. **`app/api/auth/[...nextauth]/route.ts`** — catch-all route handler.
   - Re-exports `handlers.GET` and `handlers.POST` as named exports `GET` and `POST`.
   - No business logic here; all config lives in `lib/auth.ts`.

3. **`middleware.ts`** (repo root) — route protection via the `auth` middleware exported from `lib/auth.ts`.
   - **Approach:** clean matcher listing the four protected route groups. Inside the middleware function, check whether `pathname` matches a public-slug pattern under `/projects/[slug]` and allow if so. This keeps all protection logic visible in one place.
   - **Protected paths** — any unauthenticated request matching the matcher redirects to `/?signin=1`:
     - `/projects/:path*`
     - `/prices/:path*`
     - `/regulatory/:path*`
     - `/alerts/:path*`
   - **Public paths** — never intercepted by the auth middleware:
     - `/` (landing)
     - `/projects/[slug]` public slugs — see note below on slug values.
     - `/api/auth/[...nextauth]` — must remain fully public so the OAuth callback can complete before a session exists.
     - `/api/regulatory` — public endpoint per architecture §6.
     - `/api/map/projects` — public (limited) endpoint.
   - **Matcher config:**

     ```typescript
     export const config = {
       matcher: [
         '/projects/:path*',
         '/prices/:path*',
         '/regulatory/:path*',
         '/alerts/:path*',
       ],
     };
     ```

   - **Public slug in-body check:** Inside the middleware function, before redirecting, check whether `pathname` matches a known public project slug. Use the sample slug `katingan-peatland` (the slug T03 declares as a representative flagship project). Cross-reference T03 §3 for the authoritative slug list; if T03 declares additional public slugs, add them to this check. Example:

     ```typescript
     const PUBLIC_PROJECT_SLUGS = new Set(['katingan-peatland']);
     // add further slugs from T03 §3 at implementation time

     export default auth((req) => {
       const { pathname } = req.nextUrl;
       // Allow public project detail pages
       const slugMatch = pathname.match(/^\/projects\/([^/]+)$/);
       if (slugMatch && PUBLIC_PROJECT_SLUGS.has(slugMatch[1])) {
         return NextResponse.next();
       }
       if (!req.auth) {
         return NextResponse.redirect(new URL('/?signin=1', req.url));
       }
     });
     ```

   - **Redirect behaviour:** `NextResponse.redirect(new URL('/?signin=1', request.url))` — the `signin=1` query param triggers the sign-in modal on the landing page.

4. **`types/next-auth.d.ts`** — TypeScript module augmentation. Required so that `session.user.id` resolves correctly in downstream server components and API routes (NextAuth's default `Session` type does not include `id` on `session.user`).

   ```typescript
   declare module 'next-auth' {
     interface Session {
       user: { id: string; email: string; name?: string; image?: string };
     }
   }
   ```

5. **UI components** in `components/auth/`:
   - `SignInButton.tsx` — renders a "Sign in with Google" button that calls `signIn('google')`. Used in the landing hero and the top-nav unauthenticated state.
   - `UserMenu.tsx` — avatar + dropdown shown when authenticated. Dropdown items: user email (non-interactive), "Sign out" (calls `signOut({ redirectTo: '/' })` to redirect to the landing page after sign-out). Mounts in the `(app)` group layout.
   - `OnboardingModal.tsx` — one-time modal shown immediately after first login (see item 6).

6. **First-login onboarding modal** — shown once, immediately after the first Google OAuth callback completes:
   - **Trigger:** on the server, after `auth()` resolves and `session.user.id` is available, check whether `users.persona IS NULL` for that user. If so, pass a `showOnboarding: true` prop to the layout; the `OnboardingModal` component renders as an overlay.
   - **Fields:**
     - `persona` — `<select>` with options: `buyer`, `broker`, `corporate`, `researcher`, `developer`, `other`. Required for submission; skippable (see below).
     - `organization` — `<input type="text">` free text. Optional.
   - **Submit action:** POST to a new server action or API route (`/api/user/onboard`) that executes `UPDATE users SET persona = $1, organization = $2 WHERE id = $3`.
   - **Skip / dismissal behaviour:**

     | State | Persona set? | Snooze cookie? | Shown on load? |
     |---|---|---|---|
     | First login | No | No | Yes |
     | Skipped once | No | Yes, 7d | No until cookie expires |
     | Completed | Yes | N/A | No |
     | Session resumed after cookie expiry | No | Expired | Yes |

     If the user dismisses without submitting, nothing is written to the DB. Set cookie `kl_onboarding_snooze_until=<unix-timestamp>` with a 7-day expiry. On subsequent visits, if the cookie is present and not expired, suppress the modal even though `persona` is still null. After 7 days the cookie expires; the modal reappears.

     **Known limitation (v0.1):** if the user clears cookies, the snooze is lost and the modal reappears immediately within the 7-day window. This is acceptable for v0.1.

   - **`email_digest_opt_in`:** the column defaults to `TRUE` in the schema (migration 001). No action needed at onboarding — the default fires automatically on `INSERT INTO users` by the NextAuth adapter. Do not override this in the onboarding form; users manage their digest preference via the unsubscribe link in T17.

7. **`docs/runbooks/google-oauth-setup.md`** — step-by-step guide for Andy to configure the OAuth client (see §5 Outputs). Content defined by extraction from this story's Appendix A.

8. **`.env.example` — verify only.** T03 owns `.env.example`. T05 must verify that the following keys are present; do not append or reorder lines if they are already there:
   ```bash
   # NextAuth — Google OAuth
   # Generate NEXTAUTH_SECRET with: openssl rand -base64 32
   NEXTAUTH_SECRET=
   NEXTAUTH_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   ```
   If any of these keys are absent, raise with Andy — do not silently add them without coordination with T03.

### Out of scope (explicit non-goals)

- Email / password authentication, magic links, or any provider other than Google — v0.2 or later.
- Team accounts or multi-user organisations — v0.2.
- Role-based access control — v0.2.
- Admin page gating by email allowlist — that is T21.
- Notification UI — T16.
- Weekly digest emails — T17.
- Automated tests of any kind — none for v0.1.
- Production deployment to Netlify — deferred; acceptance criteria are validated locally.
- Table ownership elevation — not T05's concern. The `karbonlens` role has DML rights on all auth tables via T02's ownership block.
- `users.email_verified` generated column concerns — fully resolved upstream (T02 + T04). The column exists; the adapter will succeed.
- Localhost HTTPS — not required; Google explicitly permits `http://localhost:3000`.
- Design brief for sign-in UI beyond the component specs above — not T05's concern.

---

## 4. Acceptance criteria (Gherkin)

**Two-phase verification:** AC-7 through AC-11 (middleware redirects, SQL post-login, typecheck) are independent of real Google credentials and can be verified before Andy drops the GCP client ID/secret into `.env.local`. AC-1 through AC-6 require a functioning OAuth round-trip and are validated after credentials are available.

**Phase 1 — pre-credential (no GCP client required)**

**AC-7: Dismissed onboarding does not reappear immediately**
```
Given the onboarding modal is visible
When I close the modal without submitting
And  I navigate to another protected page in the same browser session
Then the onboarding modal does NOT reappear
And  a cookie named 'kl_onboarding_snooze_until' is present with expiry ~7 days from now
```

**AC-8: Unauthenticated access to /prices redirects**
```
Given I am not signed in
When  I make a GET request to http://localhost:3000/prices
Then  I receive an HTTP 307 redirect to /?signin=1
```

**AC-11: TypeScript compiles clean**
```
Given all files in §6 (File ownership) have been created or modified
When  I run: npx tsc --noEmit
Then  the command exits with code 0 and prints no errors
```

**Phase 2 — post-credential (GCP client ID/secret in .env.local)**

**AC-1: Google OAuth round-trip completes**
```
Given  I am on the landing page (http://localhost:3000) and not signed in
When   I click "Sign in with Google"
And    I complete the Google consent screen in the browser
Then   I am redirected back to the app and my name/avatar appears in the top nav
And    the URL does not contain an error parameter
```

**AC-2: User row created on first login**
```
Given  I have just completed AC-1 for the first time
When   I run: SELECT * FROM users WHERE email='<my-google-email>';
Then   exactly one row is returned
And    the row has name, image, email_digest_opt_in = TRUE
And    persona IS NULL (onboarding not yet submitted)
```

**AC-3: Account row linked to user**
```
Given  AC-2 has passed
When   I run: SELECT * FROM accounts WHERE user_id = (SELECT id FROM users WHERE email='<my-email>');
Then   exactly one row is returned
And    provider = 'google'
And    provider_account_id is non-null
```

**AC-4: Session row exists and is valid**
```
Given  AC-1 has passed
When   I run: SELECT * FROM sessions WHERE user_id = (SELECT id FROM users WHERE email='<my-email>');
Then   at least one row is returned
And    expires > NOW()
```

**AC-5: Onboarding modal appears after first login**
```
Given  I have just completed AC-1 for the first time (persona IS NULL)
When   the app renders any page in the (app) route group
Then   the onboarding modal is visible
And    it contains a persona <select> and an organization <input>
```

**AC-6: Onboarding submission persists to DB**
```
Given  the onboarding modal is visible (AC-5)
When   I select persona = 'researcher' and enter organization = 'ACME Corp'
And    I click Submit
Then   the modal closes
And    SELECT persona, organization FROM users WHERE email='<my-email>'
       returns ('researcher', 'ACME Corp')
```

**AC-9: Authenticated access to /prices succeeds**
```
Given  I am signed in (AC-1 has passed)
When   I navigate to http://localhost:3000/prices
Then   I receive HTTP 200 and the prices page renders
```

**AC-10: Sign-out clears the session**
```
Given  I am signed in
When   I click "Sign out" in the user menu
Then   my avatar disappears from the top nav
And    SELECT * FROM sessions WHERE user_id = (SELECT id FROM users WHERE email='<my-email>')
       returns zero rows with expires > NOW()
And    navigating to http://localhost:3000/prices redirects to /?signin=1
```

---

## 5. Inputs & outputs

### Inputs

| Input | Source |
|---|---|
| `DATABASE_URL` | `.env.local` (set by T04) |
| `GOOGLE_CLIENT_ID` | `.env.local` — Andy registers the OAuth client following the runbook |
| `GOOGLE_CLIENT_SECRET` | `.env.local` — same |
| `NEXTAUTH_SECRET` | `.env.local` — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `.env.local` — `http://localhost:3000` for local dev |
| `users`, `accounts`, `sessions`, `verification_tokens` tables | migration 001 (T02); `users.email_verified TIMESTAMPTZ` column confirmed present |
| `lib/db.ts` Drizzle client | T04; `accounts.expiresAt` confirmed as `bigint({ mode: 'number' })` per T04 §5 column-type mapping |
| `next-auth@beta` and `@auth/drizzle-adapter` packages | T03 (`npm install`) |

### Outputs

| Output | Description |
|---|---|
| `lib/auth.ts` | NextAuth v5 configuration, exports `{ handlers, auth, signIn, signOut }` |
| `app/api/auth/[...nextauth]/route.ts` | Catch-all route re-exporting `handlers.GET` and `handlers.POST` |
| `middleware.ts` | Auth middleware with matcher config protecting `(app)` routes; public slug in-body check |
| `types/next-auth.d.ts` | TypeScript module augmentation for `session.user.id` |
| `components/auth/SignInButton.tsx` | "Sign in with Google" button component |
| `components/auth/UserMenu.tsx` | Authenticated avatar + sign-out dropdown; calls `signOut({ redirectTo: '/' })` |
| `components/auth/OnboardingModal.tsx` | First-login persona/organisation capture modal with 7-day cookie snooze |
| `app/(app)/layout.tsx` (modified) | Mount `UserMenu` and conditionally render `OnboardingModal` |
| `/api/user/onboard` route or server action | Writes persona + organization to `users` table |
| `docs/runbooks/google-oauth-setup.md` | Step-by-step Google Cloud Console runbook for Andy (content extracted from Appendix A; verify keys listed in §3 item 8 are present in `.env.example` — T03 owns that file) |

---

## 6. Dependencies & interactions

### Blocked by

- **T04** — Drizzle client (`lib/db.ts`) and schema (`lib/schema.ts`) must exist before the DrizzleAdapter can be wired up. T04 confirms `accounts.expiresAt: bigint('expires_at', { mode: 'number' })` is correct for `@auth/drizzle-adapter` v5 (documented in T04 §5 column-type mapping and edge case iv).
- **T02** — `users.email_verified TIMESTAMPTZ` column is present in migration 001 and in T04's Drizzle schema as `emailVerified`. The adapter will write this column on every Google sign-in. No blocker remains.

### Blocks

- **T16** (Notifications bell) — requires `session.user.id` to query `notifications` per user.
- **T17** (Weekly digest) — requires `users.email_digest_opt_in` and the full user record created here.
- **T18** (Landing page live stats) — the "Sign in" CTA on the landing page references `SignInButton.tsx`.
- **T21** (Admin page) — admin email gating builds on top of the session established here.

### File ownership (do not modify in parallel tasks)

The following paths are owned exclusively by T05. No other task may create or modify them while T05 is in progress:

- `lib/auth.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `middleware.ts`
- `types/next-auth.d.ts`
- `components/auth/SignInButton.tsx`
- `components/auth/UserMenu.tsx`
- `components/auth/OnboardingModal.tsx`
- `app/(app)/layout.tsx` — T05 modifies the `(app)` group layout to mount UserMenu and OnboardingModal; coordinate with T11/T12 if those tasks also need to touch this file.
- `docs/runbooks/google-oauth-setup.md`

**`.env.example` is owned by T03.** T05 verifies only; do not modify.

---

## 7. Edge cases & failure modes

**(i) User denies Google consent**
The OAuth callback returns with `error=access_denied`. NextAuth redirects to `/?error=OAuthCallback`. The landing page must detect the `error` query param and show a dismissible error banner: "Google sign-in was cancelled. Try again."

**(ii) User's Google account email changes**
NextAuth's `accounts` table links by `provider_account_id` (Google's stable sub / account ID), not by email. A Google email change does not break the session or create a duplicate user row. The `users.email` column will be stale in this case — acceptable for v0.1; v0.2 can add a sync hook.

**(iii) Session expires mid-use**
The session `expires` timestamp in Postgres passes. On the next request to a protected route, the `auth` middleware finds no valid session and redirects to `/?signin=1`. The user signs in again and gets a fresh session row.

**(iv) Onboarding modal dismissed without submit**
No DB write occurs. Cookie `kl_onboarding_snooze_until=<unix-timestamp>` is set with a 7-day expiry. On the next visit, if the cookie is present and not expired, the modal is suppressed even though `persona` is still null. After 7 days the cookie expires; the modal reappears. Rationale: 7 days is long enough not to be annoying, short enough to eventually collect the data. If the user clears cookies, the snooze resets and the modal reappears immediately — acceptable for v0.1.

**(v) `NEXTAUTH_SECRET` is missing**
NextAuth v5 refuses to start and throws at boot time: `[next-auth] MissingSecret: Please define a 'secret'...`. This is the desired behaviour — it is a hard misconfiguration, not a graceful-degradation case. `.env.example` documents the generation command.

**(vi) Concurrent logins across tabs / devices**
With `strategy: 'database'`, each login creates a new `sessions` row with its own `session_token`. Multiple simultaneous sessions for the same user are valid and handled naturally. Sign-out in one tab invalidates only that session row; other tabs remain authenticated until their own sessions expire or are explicitly signed out.

**(vii) NextAuth adapter and `email_verified`**
The NextAuth adapter writes `email_verified` on every Google sign-in (Google always returns a verified email). The column exists in migration 001 as `email_verified TIMESTAMPTZ` (T02) and is exposed in T04's Drizzle schema as `emailVerified: timestamp('email_verified', { withTimezone: true })`. The adapter will succeed. No further action needed.

**(viii) First-login race condition**
The NextAuth adapter guarantees write order: `createUser` → `linkAccount` → `createSession` → `session` callback. The `users` row is fully committed before the session callback fires. The onboarding modal check (`persona IS NULL`) runs in the `(app)` layout server component on each request — not inside any NextAuth callback. Do not "optimise" by moving the check into a NextAuth callback; the layout approach correctly avoids the race.

---

## 8. Definition of done

- [ ] All 11 acceptance criteria pass against a locally running `npm run dev` with a real Google OAuth client (Phase 1 ACs verified before credentials; Phase 2 ACs verified after credentials are available).
- [ ] `npx tsc --noEmit` exits 0 with no errors.
- [ ] All files listed in §6 (File ownership) are present and committed to `feature/t05-nextauth-google-oauth`.
- [ ] `.env.example` verified to contain the four NextAuth variables (T03 owns the file; T05 verifies only).
- [ ] `docs/runbooks/google-oauth-setup.md` exists and is accurate (Andy can follow it end-to-end without Claude's help).
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] `TASKS.md` T05 status flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

**OQ-1 (adapter schema audit — cross-reference resolved)**

~~`email_verified` column missing~~ — resolved upstream. `email_verified TIMESTAMPTZ` is present in migration 001 (T02 §3) and in T04's Drizzle schema as `emailVerified`. The adapter will write this column on every Google sign-in without error.

~~`accounts.expires_at` BigInt mode ambiguity~~ — resolved by T04. T04 §5 column-type mapping confirms `bigint('expires_at', { mode: 'number' })` and documents the rationale. T05 inherits this without further action.

The remaining field-naming mappings (`userId`, `providerAccountId`, `sessionToken`) are standard Drizzle camelCase patterns; verified in T02 §6 auth table field-naming contract.

**OQ-2 (adapter migration for v5)**

Confirm that `@auth/drizzle-adapter` at the version installed in T03 does not require any additional migration beyond what migration 001 provides. The adapter changelog between Auth.js v4 and v5 dropped the `created_at` column requirement on `sessions` and changed the `verification_tokens` primary key — verify the current adapter version's exact expectations against the schema in migration 001 before committing.

**OQ-3 (public slug list for middleware — partially resolved)**

The middleware in-body check uses `katingan-peatland` as the baseline public slug (as declared by T03). Cross-reference T03 §3 for the authoritative full slug list; add any additional public slugs to `PUBLIC_PROJECT_SLUGS` at implementation time. The matcher approach (list slugs in the in-body set rather than in the regex) makes this update safe and visible.

---

## 10. References

- [NextAuth v5 (Auth.js) docs](https://authjs.dev/getting-started/installation)
- [Auth.js Drizzle adapter](https://authjs.dev/getting-started/adapters/drizzle)
- `docs/architecture.md` §3 — DB schema for `users`, `accounts`, `sessions`, `verification_tokens`; `users.email_verified TIMESTAMPTZ` confirmed present
- `docs/architecture.md` §6 — API routes and public vs authenticated data boundary
- `docs/architecture.md` §7 — environment variables
- `docs/TASKS.md` §T05 — original task definition
- `docs/stories/T02-schema-migration-001.md` — `email_verified` column spec and auth table field-naming contract
- `docs/stories/T04-drizzle-schema-db-client.md` — `bigint({ mode: 'number' })` for `expires_at`; Drizzle client
- `docs/runbooks/google-oauth-setup.md` — Andy's Google Cloud Console steps (extracted from Appendix A during spec revision)

---

## Appendix A — Runbook

Runbook extracted to `docs/runbooks/google-oauth-setup.md` during spec revision.

---

## Post-merge Phase B verification

**Status:** Phase A complete (code correctness, build, typecheck, middleware redirects, API boundary). Phase B deferred — requires Andy's real Google Cloud Platform OAuth credentials in `.env.local`.

**How to proceed:** Follow `docs/runbooks/google-oauth-setup.md` to provision a GCP OAuth client, then populate `.env.local` with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` (`openssl rand -base64 32`), `NEXTAUTH_URL=http://localhost:3000`, and a real `DATABASE_URL`. Restart `npm run dev`, then run the 8 ACs below.

### ACs requiring live GCP credentials

| AC | Gherkin summary | Verification command / action |
|---|---|---|
| AC-1 | Google OAuth round-trip completes without `?error=` | Open `http://localhost:3000`, click "Sign in with Google", complete consent screen, confirm name/avatar in top nav. |
| AC-2 | User row created on first login | `psql $DATABASE_URL -c "SELECT email, name, email_digest_opt_in, persona FROM users WHERE email='<my-email>';"` → 1 row, `email_digest_opt_in = t`, `persona IS NULL`. |
| AC-3 | Account row linked (exercises T04 snake_case fix) | `SELECT provider, provider_account_id, access_token IS NOT NULL FROM accounts WHERE user_id = (SELECT id FROM users WHERE email='<my-email>');` → `google`, non-null id, `access_token IS NOT NULL = t`. |
| AC-4 | Session row exists and `expires > NOW()` | `SELECT expires FROM sessions WHERE user_id = (SELECT id FROM users WHERE email='<my-email>');` → future timestamp. |
| AC-5 | Onboarding modal appears after first login (`persona IS NULL`) | Navigate to any `(app)` page — modal overlay must be visible with persona select + organisation input. |
| AC-6 | Onboarding submission persists to DB | Select persona = 'researcher', enter organization = 'ACME Corp', click Submit. `SELECT persona, organization FROM users WHERE email='<my-email>';` → `('researcher','ACME Corp')`. |
| AC-9 | Authenticated access to `/prices` returns 200 | While carrying the authjs session cookie, `curl -I http://localhost:3000/prices` → 200. |
| AC-10 | Sign-out clears session and re-gates `/prices` | Click "Sign out" → avatar gone; `SELECT * FROM sessions WHERE user_id=... AND expires > NOW()` returns 0 rows; `/prices` redirects to `/?signin=1`. |
