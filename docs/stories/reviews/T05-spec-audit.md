# Spec Audit — T05: NextAuth.js v5 with Google OAuth

**Auditor:** adversarial spec-auditor agent
**Date:** 2026-04-19
**Story under review:** `docs/stories/T05-nextauth-google-oauth.md`
**Verdict:** CONDITIONAL PASS — 3 blocking issues, 8 non-blocking issues. Do not implement until the three blocking items are resolved.

---

## Summary

| Severity | Count |
|---|---|
| BLOCKING | 3 |
| NON-BLOCKING (high) | 4 |
| NON-BLOCKING (low) | 4 |

---

## Blocking Issues

### B-1 — `emailVerified` column missing from `users` table (cross-story: T02 + T04)

**Impact:** Runtime crash on first sign-in. The `@auth/drizzle-adapter` v5 writes `emailVerified` on every `users` INSERT when the provider returns a verified email. Google OAuth always returns a verified email. Without this column, the adapter will throw a Postgres error and sign-in will fail.

**T02 delta required:**
Add the following column to the `users` table DDL in `scrapers/migrations/001_init.sql`, before `organization`:

```sql
email_verified TIMESTAMPTZ,
```

Since migration 001 has not yet been deployed to production, the story writer's recommendation to amend 001 (rather than create 002) is correct. However, the spec hedges instead of mandating — it says "confirm with Andy". This must be decided before T02 is marked done. **The implementer should not proceed with T05 until `email_verified` is present in the live schema.**

**T04 delta required:**
Add the following field to the `users` table definition in `lib/schema.ts`:

```typescript
emailVerified: timestamp('email_verified', { withTimezone: true }),
```

Note: the Drizzle field name must be `emailVerified` (camelCase) because `@auth/drizzle-adapter` v5 reads the property by that exact JS key. The SQL column name is `email_verified` (snake_case), mapped via the string argument. A field named `email_verified` in TypeScript would cause the adapter to silently skip the column.

**Story acknowledgement:** The spec correctly flags this as "High" risk in OQ-1 but treats it as an open question rather than a resolved pre-condition. The adapter will not work without this column. Downgrade from open question to mandatory pre-condition.

---

### B-2 — `@auth/drizzle-adapter` v5: `accounts.expires_at` type mismatch risk

**Impact:** Potential runtime failure or silent data corruption on OAuth token storage.

The architecture §3 schema defines `expires_at BIGINT`. T04's spec notes that `@auth/drizzle-adapter` may expect `BigInt` mode (not `number` mode) for `expires_at`, and defers the check to implementation time (T04 OQ-3, T04 edge case iv). The T05 spec inherits this ambiguity without resolving it.

The adapter v5 source stores `expires_at` as the integer result of dividing a millisecond timestamp by 1000. The shape passed to the adapter's `createAccount` is typed as `{ expires_at?: number | null }` in Auth.js types — so `mode: 'number'` in Drizzle is almost certainly correct. However, the story does not state this conclusion explicitly, leaving the implementer to re-research it.

**Required action:** T04 must confirm and document in a comment that `bigint('expires_at', { mode: 'number' })` is correct for `@auth/drizzle-adapter` v5. T05 should reference this confirmation rather than leaving it as "check at implementation time."

---

### B-3 — `NEXTAUTH_URL` production override not addressed (Netlify deployment)

**Impact:** OAuth callback will break in production if `NEXTAUTH_URL` is not overridden.

The spec correctly sets `NEXTAUTH_URL=http://localhost:3000` in `.env.example`. The architecture §7 shows `NEXTAUTH_URL=https://karbonlens.netlify.app` as the production value. The runbook (Appendix A) does mention the Netlify env var override — but only in a brief "Netlify production (deferred)" subsection that does not instruct the implementer to set `NEXTAUTH_URL` in the Netlify dashboard *now*, at the time the GCP client is registered.

The problem: the GCP OAuth client requires redirect URIs to be pre-registered. The runbook (Step 3) already includes the Netlify redirect URI — but if Andy follows Step 4 literally and only sets `NEXTAUTH_URL=http://localhost:3000` in `.env.local` without also setting it on Netlify, then Netlify preview deploys will silently use the wrong URL and OAuth callbacks will fail.

**Required action:** The runbook Step 4 must explicitly instruct Andy to set `NEXTAUTH_URL=https://karbonlens.netlify.app` in Netlify → Site → Configuration → Environment variables (production context) at the same time as configuring credentials locally, not later. This cannot be deferred because the redirect URI is registered with GCP at Step 3 and the env var must match.

---

## Non-Blocking Issues (High)

### NB-H1 — Adapter schema audit is incomplete: two additional potential mismatches

The spec's OQ-1 table covers `userId`, `providerAccountId`, `sessionToken`, and `emailVerified`. Two further potential issues are not mentioned:

1. **`accounts.id` column:** The architecture §3 uses `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`. The `@auth/drizzle-adapter` v5 does not require an `id` column on `accounts` — it uses the composite (`provider`, `providerAccountId`) as the unique key. Having `id` is fine, but the T04 Drizzle schema must define it correctly, and any field named just `id` must be present as a typed column (not omitted) or the adapter insert will fail with a not-null constraint if the adapter generates no `id`.

2. **`verification_tokens` composite primary key:** The spec acknowledges the composite PK `(identifier, token)` is present and matches adapter expectations. Confirmed correct. No action needed, but worth noting the explicit match.

**Required action:** T04 must verify that `accounts.id` is correctly defined as a `uuid().primaryKey().defaultRandom()` column and that the adapter does not attempt to set `id` itself (it should not, for database-backed sessions). Add a comment in `lib/schema.ts` confirming this.

### NB-H2 — Middleware matcher: public slugs are hardcoded, blocking T06

The negative lookahead pattern `/projects/((?!katingan-peatland|sumatra-merang-peat|rimba-raya).+)` hardcodes project slugs in `middleware.ts`. These slugs are set when T06 seeds the `projects` table (OQ-3 acknowledges this). The risk is a merge-order issue: if T06 seeds with slightly different slugs (e.g. `rimba-raya-conservation` instead of `rimba-raya`), the middleware silently gates the "public" pages behind auth with no error — the implementer will see a broken redirect and need to trace it to the middleware.

**Recommended fallback (if OQ-3 is not answered before T05 implementation):** The spec should provide a specific fallback: implement the middleware without the public-slug exception (gate all `/projects/:path+` behind auth) and add a comment `// TODO OQ-3: add public slug exceptions once T06 slugs confirmed`. This is safer than guessing slugs. The story should make this fallback explicit rather than leaving the implementer to improvise.

### NB-H3 — Onboarding modal: skip behaviour writes nothing to DB — re-appearance not fully suppressed

The spec states: "if the user dismisses without submitting, nothing is written to the DB." The modal is suppressed by a cookie (`onboarding_snoozed_until`). After the cookie expires (7 days), the modal reappears. This loop continues indefinitely for users who never complete onboarding.

Two gaps:

1. **No escape hatch.** A user who dismisses 3+ times should eventually get a permanent skip option. With only a 7-day cookie, the modal theoretically reappears forever. The spec acknowledges "7 days is long enough not to be annoying" but a user who is actively disinterested in onboarding will be annoyed repeatedly over the product lifetime. Consider: after N snoozes (trackable in a second cookie `onboarding_snooze_count`), show a "Don't ask again" option that writes `persona = 'other'` to permanently suppress.

2. **Cookie cleared = modal reappears immediately.** If the user clears cookies (incognito, browser settings), the snooze is lost and the modal reappears on the very next visit even within the 7-day window. The spec does not mention this. For v0.1 it is probably acceptable, but the implementer should be warned.

**Required action:** Add a note to the spec that cookie-clearing causes immediate modal reappearance (acceptable for v0.1, track as a known limitation). The "permanent skip" gap is a product decision for Andy.

### NB-H4 — First-login race condition (adapter flush vs. session callback)

The spec mentions in §3 item 1 that the session callback "copies `user.id` from the adapter onto `session.user.id`." In NextAuth v5 with the database strategy, the execution order is:

1. Adapter `createUser` → writes `users` row
2. Adapter `linkAccount` → writes `accounts` row
3. Adapter `createSession` → writes `sessions` row
4. `session` callback → called with `{ session, user }` where `user` is the DB row

The session callback fires after the adapter has flushed all rows, so there is no race for the session callback reading `user.id`. **This specific concern is safe.**

However, the spec describes the onboarding modal trigger differently: "on the server, after `auth()` resolves and `session.user.id` is available, check whether `users.persona IS NULL`." This check happens in the `(app)` layout server component on every request. There is no race here either — the user row exists before the redirect back to the app completes.

The real subtle race: if the implementer writes the onboarding check inside the NextAuth `signIn` callback (rather than in the layout server component), the `users` row may not yet have been committed when the callback fires (adapter runs inside the same request lifecycle). The spec's current design (check in layout server component, not in callback) correctly avoids this. **Make this explicit in the spec** so the implementer does not "optimise" by moving the check into the callback.

---

## Non-Blocking Issues (Low)

### NB-L1 — TypeScript module augmentation for `session.user.id` not mentioned

The session callback copies `user.id` onto `session.user.id`, but NextAuth's default `Session` type does not include `id` on `session.user`. Without a `next-auth.d.ts` module augmentation, TypeScript will error when downstream code reads `session.user.id`.

**Required action:** T05 must create `types/next-auth.d.ts` (or `next-auth.d.ts` at the repo root, depending on tsconfig `typeRoots`) with:

```typescript
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}
```

The spec's AC-11 (`npx tsc --noEmit` exits 0) will catch this at verification time, but the implementer should be told upfront rather than discovering it via a TS error. Add this file to the §5 Outputs table and §6 File ownership.

### NB-L2 — Sign-out redirect not fully specified

The spec states `signOut()` clears the server session. AC-10 verifies the session row is deleted. But the UI redirect target after sign-out is not specified. `signOut({ callbackUrl: '/' })` redirects to the landing page; a bare `signOut()` in NextAuth v5 with database strategy may redirect to a NextAuth-generated page or the referrer.

**Required action:** `UserMenu.tsx` must call `signOut({ callbackUrl: '/' })` explicitly. Add this to the component spec in §3 item 4 or the edge cases section.

### NB-L3 — Runbook separation: Appendix A vs. the actual file

The spec says "the implementer must create `docs/runbooks/google-oauth-setup.md` with the following content" and Appendix A contains the full runbook. This is clear for the implementer. However, the §5 Outputs table lists `docs/runbooks/google-oauth-setup.md` as an output — but does not mention that Appendix A is the source for that file's content. A careless implementer scanning §5 might create a stub file and move on.

**Required action:** Add a note in §5 Outputs: "(content defined in Appendix A — copy verbatim, expand the deferred Netlify note per B-3 above)."

### NB-L4 — Testing without real Google credentials

The spec states "Andy registers the OAuth client ... and drops credentials into `.env.local`." It does not say what the implementer should do before credentials are available. AC-1 through AC-10 all require a functioning OAuth round-trip.

**Required action:** Add a sentence to §8 Definition of Done: "All 11 ACs are validated after Andy drops credentials into `.env.local` per the runbook. Before credentials are available, validate TypeScript compilation (AC-11) and middleware redirect (AC-8) only — AC-8 does not require Google credentials." This sets correct expectations about what can be verified pre-credential and post-credential.

---

## Cross-Story Delta Summary

### T02 (`scrapers/migrations/001_init.sql`)

Add to `CREATE TABLE users`:
```sql
email_verified TIMESTAMPTZ,
```
Position: after `image TEXT,` and before `organization TEXT,`. This is a non-nullable-compatible nullable column (Google sets it; the adapter writes it; our app never needs to query it directly).

### T04 (`lib/schema.ts`)

Add to `users` table definition:
```typescript
emailVerified: timestamp('email_verified', { withTimezone: true }),
```
Position: after `image` field, before `organization`. Field name must be `emailVerified` (camelCase) — the adapter reads this key by exact name.

Confirm and document: `expiresAt: bigint('expires_at', { mode: 'number' })` in the `accounts` table is correct for `@auth/drizzle-adapter` v5.

Add to `accounts` table: a comment confirming `id UUID` is implementer-defined and the adapter does not attempt to set it.

---

## Positive Findings

The spec is unusually thorough for a v0.1 story. The following are correct and well-specified:

- Session strategy `database` is the right choice; JWT is inappropriate when Postgres is the session store.
- `NEXTAUTH_SECRET` documentation (`openssl rand -base64 32`) is clear.
- `verification_tokens` schema matches adapter exactly.
- `sessions` table (`session_token`, `user_id`, `expires`) matches adapter field names when Drizzle camelCase mapping is applied.
- Edge cases (i) through (vii) cover the realistic failure modes.
- Runbook Appendix A includes exact redirect URI strings (blocking and non-blocking URIs for both environments) — this satisfies the audit lens requirement for GCP configuration completeness.
- The `email_digest_opt_in` default-true approach (adapter writes the row; the column defaults; no onboarding action needed) is correct.
- AC-10 correctly tests session deletion, not just client-side state.
- The `(app)` route group middleware note (route groups don't appear in URLs) is correctly handled — the matcher uses URL paths, not route group names.
- `NEXTAUTH_SECRET` missing is a hard-fail at boot (edge case v) — correct behaviour, correctly documented.
- File ownership boundaries are explicit and correctly exclude T04 and T03 files from T05 scope.
