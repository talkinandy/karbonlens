---
id: T05
title: NextAuth.js v5 with Google OAuth
phase: 1
status: draft
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

**Credential handling:** Andy registers the OAuth client in Google Cloud Console and drops `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env.local`. The implementer only edits `.env.example` and writes the setup runbook at `docs/runbooks/google-oauth-setup.md`.

---

## 3. Scope

### In scope

1. **`lib/auth.ts`** — NextAuth v5 configuration.
   - Provider: `Google` (from `next-auth/providers/google`), requesting `profile` and `email` scopes only.
   - Adapter: `DrizzleAdapter(db)` from `@auth/drizzle-adapter`.
   - Session strategy: `database` (token stored in `sessions` table; not JWT).
   - Session callback: copies `user.id` from the adapter onto `session.user.id` so downstream server components and API routes can read the authenticated user's UUID without an extra DB lookup.
   - Named exports: `{ handlers, auth, signIn, signOut }`.

2. **`app/api/auth/[...nextauth]/route.ts`** — catch-all route handler.
   - Re-exports `handlers.GET` and `handlers.POST` as named exports `GET` and `POST`.
   - No business logic here; all config lives in `lib/auth.ts`.

3. **`middleware.ts`** (repo root) — route protection via the `auth` middleware exported from `lib/auth.ts`.
   - **Protected paths** — any unauthenticated request to a URL matching the following patterns redirects to `/?signin=1`:
     - `/projects` (exact) — projects explorer (full dataset requires auth)
     - `/projects/:path+` except public detail slugs (see partial gating note below)
     - `/prices`
     - `/prices/:path*`
     - `/regulatory`
     - `/regulatory/:path*`
     - `/alerts`
     - `/alerts/:path*`
   - **Public paths** — never intercepted by the auth middleware:
     - `/` (landing)
     - `/projects/[id]` public slugs for the three flagship projects (Katingan, Sumatra Merang, Rimba Raya) — the detail page itself performs page-level gating to hide issuance detail and alert history for unauthenticated visitors; the middleware does not block the route entirely.
     - `/api/auth/[...nextauth]` — must remain fully public so the OAuth callback can complete before a session exists.
     - `/api/regulatory` — public endpoint per architecture §6.
     - `/api/map/projects` — public (limited) endpoint.
   - **Exact matcher config** in `middleware.ts`:

     ```typescript
     export const config = {
       matcher: [
         '/projects',
         '/projects/((?!katingan-peatland|sumatra-merang-peat|rimba-raya).+)',
         '/prices/:path*',
         '/regulatory/:path*',
         '/alerts/:path*',
       ],
     };
     ```

     The negative lookahead in the projects pattern excludes the three public slugs.
   - **Redirect behaviour:** `NextResponse.redirect(new URL(`/?signin=1`, request.url))` — the `signin=1` query param triggers the sign-in modal on the landing page.

4. **UI components** in `components/auth/`:
   - `SignInButton.tsx` — renders a "Sign in with Google" button that calls `signIn('google')`. Used in the landing hero and the top-nav unauthenticated state.
   - `UserMenu.tsx` — avatar + dropdown shown when authenticated. Dropdown items: user email (non-interactive), "Sign out" (calls `signOut()`). Mounts in the `(app)` group layout.
   - `OnboardingModal.tsx` — one-time modal shown immediately after first login (see item 5).

5. **First-login onboarding modal** — shown once, immediately after the first Google OAuth callback completes:
   - **Trigger:** on the server, after `auth()` resolves and `session.user.id` is available, check whether `users.persona IS NULL` for that user. If so, pass a `showOnboarding: true` prop to the layout; the `OnboardingModal` component renders as an overlay.
   - **Fields:**
     - `persona` — `<select>` with options: `buyer`, `broker`, `corporate`, `researcher`, `developer`, `other`. Required for submission; skippable (see below).
     - `organization` — `<input type="text">` free text. Optional.
   - **Submit action:** POST to a new server action or API route (`/api/user/onboard`) that executes `UPDATE users SET persona = $1, organization = $2 WHERE id = $3`.
   - **Skip / dismissal:** if the user dismisses without submitting, nothing is written to the DB. The modal reappears on each subsequent visit until `persona` is set, with a maximum frequency of once per week (implemented by storing a `onboarding_snoozed_until` timestamp in a cookie with 7-day expiry; the modal is suppressed if the cookie is present and not yet expired, even if `persona` remains null). This prevents the modal from firing on every single page load after a deliberate skip, while still nudging the user to complete onboarding.
   - **`email_digest_opt_in`:** the column defaults to `TRUE` in the schema (migration 001). No action needed at onboarding — the default fires automatically on `INSERT INTO users` by the NextAuth adapter. Do not override this in the onboarding form; users manage their digest preference via the unsubscribe link in T17.

6. **`docs/runbooks/google-oauth-setup.md`** — step-by-step guide for Andy to configure the OAuth client (see §5 Outputs).

7. **`.env.example` additions:**

   ```bash
   # NextAuth — Google OAuth
   # Generate NEXTAUTH_SECRET with: openssl rand -base64 32
   NEXTAUTH_SECRET=
   NEXTAUTH_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   ```

### Out of scope (explicit non-goals)

- Email / password authentication, magic links, or any provider other than Google — v0.2 or later.
- Team accounts or multi-user organisations — v0.2.
- Role-based access control — v0.2.
- Admin page gating by email allowlist — that is T21.
- Notification UI — T16.
- Weekly digest emails — T17.
- Automated tests of any kind — none for v0.1.
- Production deployment to Netlify — deferred; acceptance criteria are validated locally.

---

## 4. Acceptance criteria (Gherkin)

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

**AC-7: Dismissed onboarding does not reappear immediately**
```
Given  the onboarding modal is visible
When   I close the modal without submitting
And    I navigate to another protected page in the same browser session
Then   the onboarding modal does NOT reappear
And    a cookie named 'onboarding_snoozed_until' is present with expiry ~7 days from now
```

**AC-8: Unauthenticated access to /prices redirects**
```
Given  I am not signed in
When   I make a GET request to http://localhost:3000/prices
Then   I receive an HTTP 307 redirect to /?signin=1
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

**AC-11: TypeScript compiles clean**
```
Given  all files in §6 (File ownership) have been created or modified
When   I run: npx tsc --noEmit
Then   the command exits with code 0 and prints no errors
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
| `users`, `accounts`, `sessions`, `verification_tokens` tables | migration 001 (T02) |
| `lib/db.ts` Drizzle client | T04 |
| `next-auth@beta` and `@auth/drizzle-adapter` packages | T03 (`npm install`) |

### Outputs

| Output | Description |
|---|---|
| `lib/auth.ts` | NextAuth v5 configuration, exports `{ handlers, auth, signIn, signOut }` |
| `app/api/auth/[...nextauth]/route.ts` | Catch-all route re-exporting `handlers.GET` and `handlers.POST` |
| `middleware.ts` | Auth middleware with matcher config protecting `(app)` routes |
| `components/auth/SignInButton.tsx` | "Sign in with Google" button component |
| `components/auth/UserMenu.tsx` | Authenticated avatar + sign-out dropdown |
| `components/auth/OnboardingModal.tsx` | First-login persona/organisation capture modal |
| `app/(app)/layout.tsx` (modified) | Mount `UserMenu` and conditionally render `OnboardingModal` |
| `/api/user/onboard` route or server action | Writes persona + organization to `users` table |
| `.env.example` | Append `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| `docs/runbooks/google-oauth-setup.md` | Step-by-step Google Cloud Console runbook for Andy |

---

## 6. Dependencies & interactions

### Blocked by

- **T04** — Drizzle client (`lib/db.ts`) and schema (`lib/schema.ts`) must exist before the DrizzleAdapter can be wired up.

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
- `components/auth/SignInButton.tsx`
- `components/auth/UserMenu.tsx`
- `components/auth/OnboardingModal.tsx`
- `app/(app)/layout.tsx` — T05 modifies the `(app)` group layout to mount UserMenu and OnboardingModal; coordinate with T11/T12 if those tasks also need to touch this file.
- `.env.example` — append only; do not reorder existing lines.
- `docs/runbooks/google-oauth-setup.md`

---

## 7. Edge cases & failure modes

**(i) User denies Google consent**
The OAuth callback returns with `error=access_denied`. NextAuth redirects to `/?error=OAuthCallback`. The landing page must detect the `error` query param and show a dismissible error banner: "Google sign-in was cancelled. Try again."

**(ii) User's Google account email changes**
NextAuth's `accounts` table links by `provider_account_id` (Google's stable sub / account ID), not by email. A Google email change does not break the session or create a duplicate user row. The `users.email` column will be stale in this case — acceptable for v0.1; v0.2 can add a sync hook.

**(iii) Session expires mid-use**
The session `expires` timestamp in Postgres passes. On the next request to a protected route, the `auth` middleware finds no valid session and redirects to `/?signin=1`. The user signs in again and gets a fresh session row.

**(iv) Onboarding modal dismissed without submit**
No DB write occurs. A `onboarding_snoozed_until` cookie is set with a 7-day expiry. On the next visit, if the cookie is present and not expired, the modal is suppressed even though `persona` is still null. After 7 days the cookie expires, the modal reappears. Rationale: 7 days is long enough not to be annoying, short enough to eventually collect the data. This is preferable to a permanent one-time skip because the data has product value.

**(v) `NEXTAUTH_SECRET` is missing**
NextAuth v5 refuses to start and throws at boot time: `[next-auth] MissingSecret: Please define a `secret`...`. This is the desired behaviour — it is a hard misconfiguration, not a graceful-degradation case. `.env.example` documents the generation command.

**(vi) Concurrent logins across tabs / devices**
With `strategy: 'database'`, each login creates a new `sessions` row with its own `session_token`. Multiple simultaneous sessions for the same user are valid and handled naturally. Sign-out in one tab invalidates only that session row; other tabs remain authenticated until their own sessions expire or are explicitly signed out.

**(vii) DrizzleAdapter migration mismatch**
If the adapter version expects columns that do not exist in migration 001, the app will throw at runtime when attempting to insert an account or session row. The implementer must verify column names during setup (see §9 Open questions). If a gap is found, a new migration `002_auth_fix.sql` must be written before merging.

---

## 8. Definition of done

- [ ] All 11 acceptance criteria pass against a locally running `npm run dev` with a real Google OAuth client.
- [ ] `npx tsc --noEmit` exits 0 with no errors.
- [ ] All files listed in §6 (File ownership) are present and committed to `feature/t05-nextauth-google-oauth`.
- [ ] `.env.example` updated with the four NextAuth variables.
- [ ] `docs/runbooks/google-oauth-setup.md` exists and is accurate (Andy can follow it end-to-end without Claude's help).
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] `TASKS.md` T05 status flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

**OQ-1 (schema compatibility — confirm before implementing)**

The `@auth/drizzle-adapter` v5 expects specific column names in the Drizzle *TypeScript schema* (field names map to JS property names, which in turn must match what the adapter reads). The SQL schema in migration 001 uses snake_case column names (`user_id`, `provider_account_id`). Drizzle maps these to camelCase via the `.name()` column descriptor in `lib/schema.ts`.

Known potential mismatches to verify:

| Adapter expects (JS property) | SQL column in migration 001 | Drizzle field name | Risk |
|---|---|---|---|
| `userId` | `user_id` | must be defined as `userId: uuid('user_id')` | Low — standard Drizzle pattern |
| `providerAccountId` | `provider_account_id` | must be `providerAccountId: text('provider_account_id')` | **Medium** — easy to miss; adapter reads `.providerAccountId`, not `.provider_account_id` |
| `sessionToken` | `session_token` | must be `sessionToken: text('session_token')` | Low |
| `emailVerified` | not present in `users` table | adapter may attempt to read/write this | **High** — the `users` table in migration 001 does not have an `emailVerified` column, but `@auth/drizzle-adapter` v5 expects it on the `users` table for email-verified providers. Google OAuth always sets this, so the adapter will try to write `email_verified`. **Action: add `email_verified TIMESTAMPTZ` to the users table in a new migration 001 amendment or migration 002 before this story is implemented. Confirm with Andy whether to amend 001 (simpler, already undeployed) or create 002.** |

**Confirm:** Run a local integration test immediately after wiring up the adapter. Attempt a sign-in and check for runtime errors. If the adapter throws a column-not-found error, trace the exact column name, add it to `lib/schema.ts`, and (if not yet deployed) amend migration 001 or add migration 002.

**OQ-2 (adapter migration for v5)**

Confirm that `@auth/drizzle-adapter` at the version installed in T03 (`npm i next-auth@beta @auth/drizzle-adapter`) does not require any additional migration beyond what migration 001 provides. The adapter changelog between Auth.js v4 and v5 dropped the `created_at` column requirement on `sessions` and changed the `verification_tokens` primary key — verify the current adapter version's exact expectations against the schema in migration 001 before committing.

**OQ-3 (public slug list for middleware)**

The middleware negative lookahead pattern currently hardcodes three slugs: `katingan-peatland`, `sumatra-merang-peat`, `rimba-raya`. Confirm exact slug values with Andy (they are set when T06 seeds the `projects` table). If slugs differ, update the middleware matcher accordingly.

---

## 10. References

- [NextAuth v5 (Auth.js) docs](https://authjs.dev/getting-started/installation)
- [Auth.js Drizzle adapter](https://authjs.dev/getting-started/adapters/drizzle)
- `docs/architecture.md` §3 — DB schema for `users`, `accounts`, `sessions`, `verification_tokens`
- `docs/architecture.md` §6 — API routes and public vs authenticated data boundary
- `docs/architecture.md` §7 — environment variables
- `docs/TASKS.md` §T05 — original task definition
- `docs/runbooks/google-oauth-setup.md` — Andy's Google Cloud Console steps (created by this story)

---

## Appendix A — Runbook outline (google-oauth-setup.md)

The implementer must create `docs/runbooks/google-oauth-setup.md` with the following content. It is a human-facing guide for Andy, not for Claude.

```markdown
# Runbook: Google OAuth setup for KarbonLens

## Prerequisites
- Google account with access to Google Cloud Console
- The KarbonLens repo cloned locally

## Step 1 — Create a Google Cloud project
1. Go to https://console.cloud.google.com/
2. Click the project dropdown (top left) → "New Project"
3. Name: `KarbonLens`, Location: No organisation
4. Click Create. Wait for the project to provision (~30 seconds).
5. Ensure the new project is selected in the dropdown.

## Step 2 — Configure the OAuth consent screen
1. Navigate to "APIs & Services" → "OAuth consent screen"
2. User Type: External → Create
3. App name: `KarbonLens`
4. User support email: your Google email
5. Developer contact information: your Google email
6. Click Save and Continue through Scopes (add nothing extra — defaults are fine)
7. On Test Users: add your own Google email so you can test before verification
8. Click Back to Dashboard

## Step 3 — Create the OAuth 2.0 Web client
1. Navigate to "APIs & Services" → "Credentials"
2. Click "+ Create Credentials" → "OAuth 2.0 Client ID"
3. Application type: Web application
4. Name: `KarbonLens Web`

### Authorised JavaScript origins
Add both:
- http://localhost:3000
- https://karbonlens.netlify.app

### Authorised redirect URIs
Add both:
- http://localhost:3000/api/auth/callback/google
- https://karbonlens.netlify.app/api/auth/callback/google

5. Click Create

## Step 4 — Copy credentials into .env.local
The dialog shows Your Client ID and Your Client Secret.

In the repo root, open `.env.local` (create it from `.env.example` if it doesn't exist):

```bash
cp .env.example .env.local
```

Fill in:
```
GOOGLE_CLIENT_ID=<paste Client ID here>
GOOGLE_CLIENT_SECRET=<paste Client Secret here>
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
```

Never commit `.env.local`. It is listed in `.gitignore`.

## Step 5 — Verify locally
```bash
npm run dev
```
Navigate to http://localhost:3000 and click "Sign in with Google".
Complete the consent flow. You should be redirected back to the app.

## Netlify production (deferred)
When deploying to production, add the four variables above to Netlify:
Site → Configuration → Environment variables
Set NEXTAUTH_URL=https://karbonlens.netlify.app for the production context.
```
