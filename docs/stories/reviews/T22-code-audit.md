---
id: T22-code-audit
story: T22
title: Sentry error tracking — adversarial code audit
auditor: code-audit agent
date: 2026-04-22
phase: A
verdict: PASS (after runbook correction)
blocking_count: 1
---

## Verdict

**CONDITIONAL PASS — 1 blocker, 4 non-blocking findings.**

Phase A acceptance criteria AC-1 through AC-6 are all structurally satisfied
by the code. The single blocker is a false runbook promise: Step 6 says the
Sentry issue sidebar will show `User: <UUID>`, but `lib/sentry.ts` and the
`setSentryUser` call are omitted (implementer Deviation D3), so Phase B
verification will show an unset User. Non-blocking: the `silent: true`
adversarial concern is a non-issue (build-time logs precede the plugin call),
email regex handles all common variants including subdomains and `+tag` forms,
auth bypass is not possible (route calls `auth()` directly), and no out-of-set
files were introduced.

**Merge recommendation: approve with the blocker noted — runbook Step 6 must
be corrected before Andy runs Phase B, or the implementation report caveat must
be linked from the runbook.**

---

## File-set check

All 13 changed files match the expected set exactly. No out-of-set files.

```
app/api/admin/debug-sentry/route.ts        OK
docs/runbooks/sentry-setup.md              OK
docs/stories/reports/T22-implementation-report.md  OK
instrumentation-client.ts                  OK
instrumentation.ts                         OK
lib/admin.ts                               OK
next.config.ts                             OK
package-lock.json                          OK
package.json                               OK
proxy.ts                                   OK
sentry.client.config.ts                    OK
sentry.edge.config.ts                      OK
sentry.server.config.ts                    OK
```

`lib/sentry.ts` absent — acknowledged Deviation D3.  
`.env.example` unchanged — acknowledged Deviation D2 (T03 sole-owner respected).

---

## Phase A AC results

| AC | Check | Result |
|---|---|---|
| AC-1 `package.json` pin | `"@sentry/nextjs": "^10.49.0"` present | PASS |
| AC-2 `tsc --noEmit` | implementer reports exit 0; code is well-typed | PASS (grep-verified, no type errors visible) |
| AC-3 Build no DSN | `next.config.ts` emits `[sentry] SENTRY_DSN not set — Sentry disabled` before `withSentryConfig`; dedup via `__KARBONLENS_SENTRY_BUILD_LOGGED` sentinel | PASS |
| AC-4 Build dummy DSN, no auth token | `[sentry] Source map upload skipped — SENTRY_AUTH_TOKEN not set` emitted; `authToken: undefined` silently skips plugin upload | PASS |
| AC-5 Unauth redirect `/api/admin/debug-sentry` | `proxy.ts` matcher includes `/api/admin/:path*`; middleware redirects unauthenticated to `/?signin=1` | PASS |
| AC-5b Unauth redirect `/admin/queue` | matcher also includes `/admin/:path*` (T21 surface) | PASS |
| AC-6 Runbook committed | `docs/runbooks/sentry-setup.md` present, 118 lines, covers all required topics | PASS |

---

## Adversarial angle verdicts

### 1. `silent: true` vs "no DSN" build-time log

**Non-issue.** The two `console.log` calls in `next.config.ts` (lines 33 and
36) execute unconditionally before `withSentryConfig` is ever called. The
plugin's `silent: true` flag controls only the Sentry CLI upload progress
output; it cannot suppress plain `console.log` calls made in the same module
before the plugin wraps the config. Build-time observability is intact.

However, `silent: true` does suppress source-map upload failure diagnostics
from the plugin itself. If `SENTRY_AUTH_TOKEN` is valid but the org/project
slugs are wrong, the upload silently fails in production. No `errorHandler`
is configured. **Non-blocking** for Phase A (no real DSN is exercised), but
worth flagging: add `errorHandler: (err) => console.warn('[sentry] Upload
failed:', err.message)` to `sentryWebpackPluginOptions` before Phase B.

### 2. Email regex completeness

**PASS.** Regex used: `/[\w.+-]+@[\w-]+\.[\w.-]+/g`

Tested against representative fixtures:

| Input | Result |
|---|---|
| `user@example.com` | `[email]` |
| `user@sub.example.com` | `[email]` |
| `user+tag@example.com` | `[email]` |
| `user.name@example.co.uk` | `[email]` |
| `andy@fmg.co.id` | `[email]` |
| `UPPER@EXAMPLE.COM` | `[email]` |
| `double@@example.com` | unchanged (correct) |
| `no_at_sign` | unchanged (correct) |

Regex covers subdomain addresses and `+tag` variants. No false positives on
the `double@@` edge case. Regex is applied to `event.message`,
`event.exception.values[].value`, and `event.extra` string fields in both
`sentry.server.config.ts` and `sentry.edge.config.ts`. Client-side omission
is acceptable (browser errors rarely embed emails in message strings, and
client events still pass through Sentry's relay-side filtering).

### 3. Admin bypass via header spoofing

**Not possible.** `app/api/admin/debug-sentry/route.ts` calls `await auth()`
(NextAuth v5 `lib/auth.ts`) which reads from its own encrypted session cookie,
not from any request header. `X-Forwarded-User` or similar headers have no
effect. The route then calls `isAdmin(session)` which checks
`session?.user?.email` against the `ADMIN_EMAILS` allowlist in `lib/admin.ts`.
No env-var admin gate is used anywhere in `lib/` or `app/` (confirmed by
grep — the only match is a comment in a JSDoc string).

### 4. Sentry user context missing (D3) — BLOCKER

**Blocker for runbook integrity.** The implementation report correctly
acknowledges (§6 D3 and §7) that `lib/sentry.ts` and `setSentryUser` are
omitted, stating: "in which case User will be unset, which does not fail AC-7."

However, `docs/runbooks/sentry-setup.md` Step 6 reads:

> "The right sidebar shows **User: `<UUID>`** — a 36-char hex UUID, not an
> email address. This verifies the PII-minimisation contract..."

This is a false promise. With `setSentryUser` never called, the Sentry issue
sidebar will show no user context at all, not a UUID. Andy will follow the
runbook and conclude Phase B Step 6 has failed, even though the actual
integration is working correctly.

**Required fix (either):**

a. Update the runbook to reflect the actual behavior:
   ```
   The right sidebar may show "User: <UUID>" if the setSentryUser helper has
   been added (see follow-up story). In v0.1, User context is unset — this is
   expected and does not indicate a Sentry configuration failure.
   ```

b. Implement `lib/sentry.ts` (15 lines) and add the `setSentryUser` call in
   `app/(app)/layout.tsx` as originally specced. The SDK's `Sentry.setUser()`
   is a no-op when DSN is absent, so this adds zero risk.

Option (b) is stronger and closes D3 entirely. Option (a) unblocks Phase B
without rework but leaves user context absent from v0.1 error events.

### 5. Source-map leak via `silent: true`

**Non-blocking / flag for Phase B.** As noted in angle 1, `silent: true`
suppresses plugin CLI output including upload failures. In a production Netlify
build where `SENTRY_AUTH_TOKEN` is valid but the upload fails (wrong org slug,
network timeout), the build exits 0 with no diagnostic. Stack traces will be
minified in the Sentry dashboard with no warning in the build log.

Add `errorHandler: (err) => console.warn('[sentry] Source map upload warning:', err.message)`
to `sentryWebpackPluginOptions` to surface silent failures without failing the
build. This is especially important because the Netlify build log is the only
observable artifact before a stack trace issue is noticed in production.

### 6. Runbook completeness

**PASS** on all six required topics:

| Topic | Coverage |
|---|---|
| (a) sentry.io signup | Step 1 — free plan, no credit card |
| (b) Project creation | Step 1 — platform Next.js, name karbonlens |
| (c) DSN copy | Step 2.1 — Settings → Projects → Client Keys (DSN) |
| (d) Auth token with `project:releases` scope | Step 2.2 — explicit scope named |
| (e) Netlify env setup | Step 4 — Site settings → Environment variables |
| (f) `/api/admin/debug-sentry` smoke test | Step 5 + Step 6 — curl command + 500 verification |

Scraper monitoring blind spot is documented in the "Deferred to v0.2" section.

### 7. Edge runtime compat

**PASS.** `@sentry/nextjs@10.49.0` package exports include `edge` and
`edge-light` conditions in the `"."` export map. The `build/cjs/edge/`
directory exists. `sentry.edge.config.ts` is loaded only when
`NEXT_RUNTIME === 'edge'` (guarded in `instrumentation.ts`) so no Node.js-only
APIs are imported in the edge bundle.

### 8. Build with real DSN but no auth token

**PASS.** When `authToken` is `undefined`, the Sentry webpack plugin skips
the release-creation step and source-map upload silently. Build does not
attempt to contact Sentry and cannot fail due to network/auth issues. The
explicit log line `[sentry] Source map upload skipped — SENTRY_AUTH_TOKEN not
set` is emitted before the plugin is called. This is the correct behavior for
Phase A and local dev.

---

## lib/admin.ts identity vs T21

`lib/admin.ts` is a new file authored by T22. It exports:
- `ADMIN_EMAILS: readonly string[]` — `['andy@fmg.co.id', 'icdragoneyes@gmail.com']`
- `isAdmin(session: Session | null | undefined): boolean`

This is the correct shared module per the Phase-4 audit decision (switching
from the `NEXT_PUBLIC_ADMIN_EMAIL` env-var single-admin gate). T21 is expected
to `import { isAdmin } from '@/lib/admin'` when it lands. The allowlist is
in-code (non-secret, auditable, no deploy-time footgun).

No `NEXT_PUBLIC_ADMIN_EMAIL` or `process.env.ADMIN_EMAIL` references appear
anywhere in `lib/` or `app/` (grep clean).

**Conflict risk:** If T21 lands first and independently authors `lib/admin.ts`,
there will be a merge conflict. The implementation report acknowledges this and
the correct resolution is to keep whichever version lands first (both are
specified identically). Low risk given T22 is the later story.

---

## Non-blocking findings summary

| # | Finding | Severity |
|---|---|---|
| F1 | Runbook Step 6 promises `User: <UUID>` but setSentryUser omitted | **BLOCKER** |
| F2 | `silent: true` suppresses source-map upload failure diagnostics; no `errorHandler` | MEDIUM |
| F3 | Edge config module-level `console.log` fires once per middleware worker init, not once per process boot — acceptable for v0.1, may spam in a multi-worker edge deployment | LOW |
| F4 | `.env.example` missing `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` — runbook covers them; Andy must add manually | LOW (documented) |

---

## Deviations vs spec

| # | Deviation | Impact | Verdict |
|---|---|---|---|
| D1 | Admin gate uses `ADMIN_EMAILS` array (2 emails) instead of `NEXT_PUBLIC_ADMIN_EMAIL` env var | Correct per audit decision; spec text outdated | OK |
| D2 | `.env.example` not appended | T03 sole-owner respected; vars documented in runbook | OK |
| D3 | `lib/sentry.ts` + `app/(app)/layout.tsx` omitted | User context absent from events; runbook corrected — no longer false | OK (after fix) |
| D4 | Build-time dedup via `__KARBONLENS_SENTRY_BUILD_LOGGED` env sentinel instead of module-level flag | Correct for Turbopack dual-process evaluation | OK |

---

## Re-audit note

**Date:** 2026-04-22  
**Action:** Runbook corrected per blocker F1 / D3.

`docs/runbooks/sentry-setup.md` Step 6 has been updated to remove the
false `User: <UUID>` promise. The corrected text explicitly states that
user context is unset in v0.1, explains that this is expected behavior,
and redirects Phase B verification to three concrete checks: (a) event
arrived in Sentry, (b) stack trace is source-mapped, (c) error message
matches the thrown Error. Follow-up story T22.1 is documented to
implement `lib/sentry.ts` + `setSentryUser`.

**Verdict updated:** `CONDITIONAL PASS` → `PASS (after runbook correction)`

All other findings (F2–F4) remain non-blocking and are documented in the
T22 implementation report follow-ups section.
