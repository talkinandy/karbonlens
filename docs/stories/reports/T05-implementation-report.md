# T05 — NextAuth.js Google OAuth · Implementation Report

**Story:** `docs/stories/T05-nextauth-google-oauth.md` (audited — revision SHA `c26af69`).
**Branch:** `feature/T05-nextauth-google` (off `feature/v0.1-impl`).
**Worktree:** `/root/.openclaw/workspace/karbonlens-worktrees/T05`.

---

## 1. Environment snapshot

| Tool / package | Version |
|---|---|
| Node | v22.22.2 |
| npm | 10.9.7 |
| `next` | 16.2.4 |
| `next-auth` | 5.0.0-beta.31 |
| `@auth/drizzle-adapter` | 1.11.2 |
| `@auth/core` (transitive) | 0.41.2 |
| `drizzle-orm` | 0.45.2 |
| `postgres` | 3.4.9 |

---

## 2. Preconditions verified

- `lib/db.ts`, `lib/schema.ts` — present (T04). Schema exposes `users`, `accounts` (with snake_case `refresh_token` / `access_token` / `expires_at` / `token_type` / `scope` / `id_token` / `session_state` per adapter v1.11.2 contract confirmed in T04 §5), `sessions`, `verificationTokens`.
- `scrapers/migrations/001_init.sql` — present (T02).
- `.env.example` — present at repo root; contains `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` placeholders (T03 owns; unmodified).
- `docs/runbooks/google-oauth-setup.md` — present; one tightening edit applied in Step 2 to explicitly name the three OAuth scopes (`openid`, `userinfo.email`, `userinfo.profile`) rather than claim they are defaults.
- `middleware.ts`, `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts` — not present prior to T05. Now created.
- `next-auth` + `@auth/drizzle-adapter` installed in `package.json`.
- `.env.local` — **not** present in the worktree. A dev-only placeholder was written locally (gitignored, never committed) to let the dev server boot with a non-throwing `DATABASE_URL`. Andy must overwrite with real values before Phase B.

---

## 3. Files created / modified

### Created
- `lib/auth.ts` — NextAuth v5 config (Google provider, explicit Drizzle adapter binding, database session, session callback).
- `app/api/auth/[...nextauth]/route.ts` — catch-all handler (re-exports `handlers.GET` + `handlers.POST`).
- `middleware.ts` — matcher for `/projects|/prices|/regulatory|/alerts`; in-body check for the 3 public project slugs; redirect to `/?signin=1`.
- `types/next-auth.d.ts` — session type augmentation (`session.user.id`).
- `components/auth/SignInButton.tsx` — client button, `signIn('google')`.
- `components/auth/SignOutButton.tsx` — client button, `signOut({ redirectTo: '/' })`.
- `components/auth/UserMenu.tsx` — server component; renders avatar + email + SignOutButton when signed in, SignInButton when not.
- `components/auth/OnboardingModal.tsx` — client modal (persona select + organisation input + skip/snooze).
- `components/auth/OnboardingGate.tsx` — server component gating the modal (session → persona DB check → 7-day snooze cookie).
- `app/api/users/onboarding/route.ts` — POST handler; validates persona whitelist, writes to `users` row.
- `docs/stories/reports/T05-implementation-report.md` — this file.

### Modified
- `app/(app)/layout.tsx` — adds `<SiteNav rightSlot={<UserMenu />} />` and `<OnboardingGate />`; unchanged passthrough otherwise.
- `app/(public)/layout.tsx` — adds `<SiteNav rightSlot={<UserMenu />} />`.
- `app/(public)/page.tsx` — now async server component, shows `<SignInButton />` in the hero when `await auth()` returns no session.
- `components/site-nav.tsx` — adds optional `rightSlot?: React.ReactNode` prop; default behaviour (v0.1 pill) preserved when omitted.
- `docs/runbooks/google-oauth-setup.md` — Step 2 scope list tightened (see §2).

### Verify-only, unmodified
- `.env.example` — T03 owns. Keys verified present; no edits.
- `lib/db.ts`, `lib/schema.ts` — T04 owns. Not modified.
- `docs/architecture.md` — not modified.

---

## 4. Key design choices

### 4.1 DrizzleAdapter call signature — explicit table map (not auto-detect)

`DrizzleAdapter(db, schema?)` signature confirmed from `node_modules/@auth/drizzle-adapter/index.d.ts`. The auto-detect path in `lib/pg.js` defines its own `pgTable('user', ...)` — singular table names that do **not** match the plural tables in migration 001 (`users`/`accounts`/`sessions`/`verification_tokens`). Passing an explicit schema map of our Drizzle tables is mandatory; otherwise the adapter would write to non-existent `user`/`account`/... tables.

**Type-system wrinkle.** The `DefaultPostgresSchema` type is declared in `lib/pg.d.ts` but **not exported via a package-export path** (the package only exposes `"."`). The schema generic resolution via `Parameters<typeof DrizzleAdapter>[1]` yielded a union across mysql/pg/sqlite flavours that TS could not narrow structurally. Resolution: wrap the adapter call in an inline cast to `(db: unknown, schema: unknown) => Adapter`, importing `Adapter` from `@auth/core/adapters` (re-exported through the adapter's dep tree). Runtime behaviour is identical; only TS types are bypassed.

Column-type note: `accounts.expires_at` is declared as `bigint('expires_at', { mode: 'number' })` in `lib/schema.ts` (T04). The adapter's pg schema type constrains it as `PgInteger`. Both produce JS `number` at runtime; the adapter writes Unix timestamps in seconds (well under 2^53). Safe.

### 4.2 Middleware wrapper syntax — `auth((req) => …)` + matcher config

Confirmed against `node_modules/next-auth/lib/index.d.ts` (`NextAuthMiddleware = (request: NextAuthRequest, event: NextFetchEvent) => ReturnType<NextMiddleware>` and `auth` overload that accepts `NextAuthMiddleware`). The matcher approach + in-body public-slug check matches the spec verbatim.

Next.js 16 emits a deprecation warning at build/dev time:
```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
```
T05 spec explicitly mandates `middleware.ts`; the file still works and routes through the `Proxy (Middleware)` entry in the build output. Flagged as a follow-up for a later sprint.

### 4.3 Nav component strategy — non-invasive prop extension

Option chosen: extend `components/site-nav.tsx` with an optional `rightSlot?: React.ReactNode` prop (default-preserves the T03 `v0.1` pill when omitted). Both `(app)` and `(public)` layouts now pass `rightSlot={<UserMenu />}`. `UserMenu` is a server component that resolves `await auth()` and either renders the avatar + email + sign-out, or a `SignInButton` for anonymous visitors. Less invasive than creating a wrapper `top-nav.tsx`; zero change to T03 call sites that don't pass the prop.

### 4.4 Onboarding modal gating — server gate + client form

`OnboardingGate` (server component) runs in `(app)/layout.tsx` on every authed render. It:
1. Returns null if no session (shouldn't happen inside `(app)` post-middleware).
2. Returns null if the `kl_onboarding_snooze_until` cookie holds a future Unix timestamp.
3. Returns null if `SELECT persona FROM users WHERE id = $1` is non-null.
4. Otherwise renders `<OnboardingModal />`.

This matches spec §3 item 6 and edge case (viii) — the check runs in the layout, never inside a NextAuth callback, so the adapter's write-order guarantee (`createUser` → `linkAccount` → `createSession` → `session` callback) holds.

`/api/users/onboarding` POST validates `persona` against the 6-value whitelist and trims `organization` (empty / whitespace → `NULL`; max 200 chars). Route name chosen to mirror the spec's "`/api/user/onboard`" while using the plural `users` resource convention already used elsewhere.

---

## 5. Phase A AC results (pre-credential)

| AC | Spec label | Verification | Result |
|---|---|---|---|
| AC-7 | Onboarding dismissal → cookie set (~7d) | Code-level: `handleSkip` writes `kl_onboarding_snooze_until=<now+7d>; max-age=604800; SameSite=Lax`. Behavioural verification requires a signed-in session → Phase B. | PASS (code audit) |
| AC-8 | Unauthenticated `/prices` → 307 `/?signin=1` | `curl -I http://localhost:3001/prices` → `HTTP/1.1 307` + `location: /?signin=1`. Also verified for `/alerts`, `/projects`. Public slug `/projects/katingan-peatland` → 200. Landing `/` → 200. | PASS |
| AC-11 | `npx tsc --noEmit` exits 0 | Verified: exit 0, no output. | PASS |
| — | Build clean | `npm run build` → "Compiled successfully" + 9 static pages + `Proxy (Middleware)` entry. | PASS |
| — | Module import safe without real creds | Dev server starts with placeholder env; `curl http://localhost:3001/api/auth/session` returns `200 {"user":...}` → `null` (no 500). | PASS |
| — | Adapter table reference sanity | No "table not found" or Drizzle binding errors observed at boot or during session probe. | PASS |
| — | Onboarding modal hidden when unauthed | Landing `/` HTML contains no onboarding dialog markup (gate returns null when `auth()` → null). | PASS (by construction) |

---

## 6. Phase B AC plan (post-credential — Andy runs)

After Andy completes the Google Cloud Console runbook (`docs/runbooks/google-oauth-setup.md`) and populates `.env.local` with real `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXTAUTH_SECRET`:

1. **AC-1** — open `http://localhost:3000`, click "Sign in with Google", complete consent → redirected back with no `?error=` query.
2. **AC-2** — `psql $DATABASE_URL -c "SELECT email, name, image, email_digest_opt_in, persona FROM users WHERE email='<my-email>';"` → one row, `email_digest_opt_in = t`, `persona IS NULL`.
3. **AC-3** — same + `SELECT provider, provider_account_id, access_token IS NOT NULL, refresh_token IS NOT NULL FROM accounts WHERE user_id = (SELECT id FROM users WHERE email='<my-email>');` → `google`, non-null id. **This exercises the T04 snake_case fix**: `access_token` and `refresh_token` must both be non-null in Google's response (refresh only on first consent or after prior revocation).
4. **AC-4** — `SELECT expires FROM sessions WHERE user_id = ...` → `expires > NOW()`.
5. **AC-5** — after AC-1, the onboarding modal is visible on any `(app)` page (via `OnboardingGate`).
6. **AC-6** — submit persona=researcher + organization=ACME → `SELECT persona, organization FROM users WHERE email='<my-email>'` returns `('researcher','ACME Corp')`; modal closes.
7. **AC-9** — `curl -I http://localhost:3000/prices` while carrying the authjs session cookie → 200.
8. **AC-10** — click "Sign out" → avatar disappears; `SELECT * FROM sessions WHERE user_id=...` returns zero future-expires rows; `/prices` redirects to `/?signin=1`.

Smoke-test checklist in the runbook already covers the AC-1…AC-10 probes.

---

## 7. Deviations from spec

1. **Onboarding API path.** Spec §3 item 6 says `/api/user/onboard`. Implemented as `/api/users/onboarding` to match the plural-resource convention used by T04's `/api/health` and the `users` table. Semantically equivalent; spec item 5 §3 referenced "server action or API route", and the explicit path in the implementer prompt was `/api/users/onboarding`.
2. **`OnboardingGate` split.** Spec §3 item 6 says "on the server … pass a `showOnboarding: true` prop to the layout". I split the decision into its own server component (`OnboardingGate`) that the layout just mounts. Cleaner than threading a boolean prop; identical behaviour.
3. **Runbook Step 2 scope list.** Added three explicit scope entries (`openid`, `userinfo.email`, `userinfo.profile`) because the Google Cloud Console doesn't include them by default — a user following the old text literally would end up with an empty scope set. This is the only runbook edit.

No other deviations. Public slug list matches T03 mock-data (3 slugs).

---

## 8. What the code auditor should scrutinise

1. **`lib/auth.ts` adapter cast.** Confirm the `(DrizzleAdapter as unknown as …)` cast does not hide a real runtime bug — in particular that the explicit `adapterSchema` object reaches `PostgresDrizzleAdapter` in `lib/pg.js` (verify with a `console.log` probe or by reading the `defineTables` code-path). If this cast is objectionable, the alternative is to delete the cast and let TS compile through the generic by instantiating `DrizzleAdapter<typeof db>(db, …)` — but that yielded union-narrowing failures when I tried it.
2. **Middleware edge cases.** Next.js 16 routes `/api/auth/[...nextauth]` outside the matcher, but confirm nothing else (`/api/health`, future `/api/map/projects`, `/api/regulatory`) is accidentally covered. Verify that `/projects` (index, authenticated) still redirects — yes, confirmed via curl, but auditor should re-run after any matcher tweaks.
3. **`middleware.ts` vs `proxy.ts` rename.** Next 16 deprecation warning present but not fatal. Decision deferred to a later sprint; confirm that `proxy.ts` is not a silent hard-requirement in Next 16's behaviour (build output still shows the middleware hook working).
4. **`OnboardingGate` DB query cost.** One primary-key SELECT on `users` per authed request. Acceptable per spec §3, but note: `lib/db.ts` uses postgres-js with `max: 10` pool; burst traffic could exhaust.
5. **`accounts.expires_at` bigint-vs-integer type cast in adapter schema.** T04 already validated the snake_case fix; auditor should Phase-B verify that `refresh_token` / `access_token` are in fact non-null after a real Google sign-in (the T04 fix is live-exercised here for the first time).
6. **`UserMenu` is a server component that does `await auth()` on every public page render.** The `(public)` layout mounts it unconditionally — cheap (session cookie lookup + single adapter session read) but worth confirming acceptable for the landing page's perf budget.
7. **`.env.local` local dev placeholder.** Not committed; only exists in the worktree for verification. Confirm no `.env.local` or placeholder values appear in the diff.

---

## 9. Follow-ups (out of scope for T05)

- Rename `middleware.ts` → `proxy.ts` per Next 16 deprecation (tracked for a later sprint; v0.1 acceptance uses `middleware.ts` per spec).
- Move the landing SignInButton CTA into a proper modal triggered by `?signin=1` query param (AC-8 redirects there but we don't yet open a modal automatically — the button is visible inline in the hero, which satisfies the AC text "sign-in modal on the landing page" loosely).
- Consider moving `OnboardingGate` DB read into a memoised session wrapper if layout-render cost becomes noticeable.

---

## 10. Commit history

Commits on `feature/T05-nextauth-google` (atomic, each with Co-Authored-By footer):

1. `feat(T05): NextAuth v5 with Google provider and Drizzle adapter`
2. `feat(T05): middleware with public-slug exemption and signin redirect`
3. `feat(T05): next-auth session type augmentation`
4. `feat(T05): auth UI — SignInButton, UserMenu, SignOutButton, OnboardingModal`
5. `feat(T05): onboarding persona/organization API + modal gating`
6. `docs(T05): tighten google-oauth-setup runbook scope list`
7. `docs(T05): implementation report`

No CHANGELOG.md / TASKS.md edits (Stage 5 owns those per constraints).
No `.env.example` edits (T03 owns).
No `lib/db.ts` or `lib/schema.ts` edits (T04 owns).
No push, no merge.
