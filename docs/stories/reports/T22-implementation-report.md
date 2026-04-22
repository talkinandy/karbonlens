# T22 — Sentry error tracking — Implementation report

**Story:** `docs/stories/T22-sentry.md` (status: `audited` -> Phase A `done`; Phase B pending Andy)
**Branch:** `worktree-agent-a616b372` (worktree `/root/.openclaw/workspace/karbonlens/.claude/worktrees/agent-a616b372`, off `feature/v0.1-impl`)
**Date:** 2026-04-22
**Implementer:** Barren Wuffet

---

## 1. Summary

Wires `@sentry/nextjs@^10.49.0` into KarbonLens. The wrapper in
`next.config.ts` is unconditional (per audit decision — avoids the
"deployed without DSN = permanently uninstrumented" trap); runtime
no-op is implemented inside each `sentry.*.config.ts` via a
`SENTRY_DSN` guard. `instrumentation.ts` branches on `NEXT_RUNTIME` so
the Node-only server config never loads in the edge runtime (and vice
versa). A new admin-gated `GET /api/admin/debug-sentry` route throws a
deliberate test error for the Phase B smoke test, and `proxy.ts` picks
up two new matcher entries (`/admin/:path*`, `/api/admin/:path*`) so
unauthenticated requests to admin surfaces redirect to `/?signin=1`.
`lib/admin.ts` is authored here (new file) with the shared
`ADMIN_EMAILS` allowlist and `isAdmin(session)` helper — T21 will
import from it when that story lands.

## 2. Files created / modified

| File | Action |
|---|---|
| `instrumentation.ts` | Created (Next.js 16 `register()` + `onRequestError` export) |
| `instrumentation-client.ts` | Created (browser init + `onRouterTransitionStart` export) |
| `sentry.server.config.ts` | Created (Node runtime; DSN guard; email scrubber) |
| `sentry.edge.config.ts` | Created (edge runtime; identical guard + scrubber) |
| `sentry.client.config.ts` | Created (browser; reads `NEXT_PUBLIC_SENTRY_DSN`) |
| `lib/admin.ts` | Created (shared `ADMIN_EMAILS` + `isAdmin(session)` helper) |
| `app/api/admin/debug-sentry/route.ts` | Created (admin-gated test error throw) |
| `next.config.ts` | Modified (unconditional `withSentryConfig` wrap + build-time logs) |
| `proxy.ts` | Modified (matcher adds `/admin/:path*` and `/api/admin/:path*`) |
| `docs/runbooks/sentry-setup.md` | Created (Andy's Phase B checklist) |
| `package.json`, `package-lock.json` | Modified (`@sentry/nextjs@^10.49.0` pin) |

Not touched (deviations from spec §6 noted in §6 below):
- `.env.example` — **T03 sole-owner**; per the implementer's instructions this story does not append the `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` placeholders. Verified the T03-owned `SENTRY_DSN=` placeholder is already present (line 35). Andy populates the additional vars from the runbook at Phase B.
- `lib/sentry.ts` — spec §3 item 6 proposed a `setSentryUser` helper called from `app/(app)/layout.tsx`. Implementer instructions did not list `lib/sentry.ts` or the layout edit under §6 ownership, so both are omitted. `Sentry.setUser({ id })` is a no-op when Sentry is uninitialised, so this can be added as a follow-up without re-architecting T22.
- `app/(app)/layout.tsx` — untouched for the same reason.

## 3. Phase A verification

| AC | Result | Evidence |
|---|---|---|
| AC-1 `npm install` clean | PASS | `npm install @sentry/nextjs@^10.49.0` installed 614 packages, exit 0. `package.json` now pins `"@sentry/nextjs": "^10.49.0"`. |
| AC-2 `npx tsc --noEmit` exit 0 | PASS | Exit code 0, no diagnostics. |
| AC-3 Build without DSN | PASS | `npm run build` with `SENTRY_DSN=` (empty) exits 0. Stdout contains exactly one `[sentry] SENTRY_DSN not set — Sentry disabled` line and one `[sentry] Source map upload skipped — SENTRY_AUTH_TOKEN not set` line (dedup via `__KARBONLENS_SENTRY_BUILD_LOGGED` env sentinel — Next.js Turbopack evaluates `next.config.ts` twice, in main + worker; a module-level flag wouldn't survive the process boundary). Route table includes `ƒ /api/admin/debug-sentry`. |
| AC-4 Build with dummy DSN, no auth token | PASS | `SENTRY_DSN=https://dummy@sentry.io/1 NEXT_PUBLIC_SENTRY_DSN=… npm run build` exits 0. Build log contains the source-map-skipped line; no `[sentry] SENTRY_DSN not set` line (DSN is set). No `.map.upload` artefacts in `.next/`. |
| AC-5 Debug endpoint unauth redirect | PASS | `curl http://localhost:3001/api/admin/debug-sentry` (no session) returns `307` with `location: /?signin=1`. Verified alongside `/alerts` (existing protected route, also 307) and `/admin/queue` (future T21 surface, 307). |
| AC-6 Runbook renders | PASS | `docs/runbooks/sentry-setup.md` created with 7 numbered steps, troubleshooting section, and v0.2 deferral notes. All code blocks are syntactically valid. |

Phase B (AC-7 through AC-9) is deferred to Andy per the runbook.

## 4. Proxy matcher

Final `proxy.ts` `config.matcher` entries:

```typescript
matcher: [
  '/projects/:path*',   // existing (T05)
  '/prices/:path*',     // existing (T05)
  '/regulatory/:path*', // existing (T05)
  '/alerts/:path*',     // existing (T05)
  '/admin/:path*',      // T21 reservation, added by T22
  '/api/admin/:path*',  // T22
]
```

Both admin entries redirect unauthenticated requests to `/?signin=1`.
Authenticated non-admin users fall through to the route handler, where
`isAdmin(session)` returns 403.

## 5. `lib/admin.ts` coordination

At the start of this worktree, `lib/admin.ts` did not exist on
`feature/v0.1-impl`. T22 authors the file with:

```typescript
export const ADMIN_EMAILS: readonly string[] = [
  'andy@fmg.co.id',
  'icdragoneyes@gmail.com',
];

export function isAdmin(session: Session | null | undefined): boolean {
  const email = session?.user?.email;
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
```

If T22 lands before T21, T21 will `import { isAdmin } from '@/lib/admin'`.
If T21 lands first and creates the same file, T22's copy conflicts — the
merger should keep T21's version verbatim (both stories use identical
allowlist contents per the revised audit decision).

## 6. Deviations from spec

1. **Admin gate pattern.** Spec §3 item 5 prescribed
   `NEXT_PUBLIC_ADMIN_EMAIL` env-var single-admin gate; implementer
   instructions override with `ADMIN_EMAILS` array in `lib/admin.ts`
   (two emails, shared with T21). This is the revised Phase-4 audit
   decision; spec text was not updated.
2. **`.env.example` left untouched.** Spec §3 item 4 defined an
   append-only cross-story exception; implementer instructions
   explicitly forbid modifying `.env.example` (T03 sole-owner).
   Followed the instruction. `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` /
   `SENTRY_PROJECT` / `NEXT_PUBLIC_SENTRY_DSN` placeholders are not
   in `.env.example`; the runbook lists them explicitly.
3. **`lib/sentry.ts` and `(app)/layout.tsx` omitted.** Spec §3 item 6
   proposed a `setSentryUser(session.user.id)` helper called from the
   authed layout. Implementer instructions did not list either file
   under §6 ownership, so they are omitted. User context will be
   absent from events captured during v0.1 until a follow-up story
   adds the helper. The Sentry issue view will still show the stack
   trace and source-mapped frames, which is the minimum viable bar
   for AC-7.
4. **Build-time dedup sentinel.** `next.config.ts` guards its two
   `console.log` lines on a `__KARBONLENS_SENTRY_BUILD_LOGGED` env
   sentinel because Turbopack loads `next.config.ts` twice (main
   process + worker). A module-level flag would not survive the
   process boundary. Spec §3 edge case (iii) specified a module-level
   flag for per-request dedup on the runtime log; that pattern is
   implemented inside each `sentry.*.config.ts` (single module
   evaluation per server boot, so `console.log` at top level fires
   exactly once per process).

## 7. Phase B — handoff to Andy

Once Andy completes `docs/runbooks/sentry-setup.md` steps 1-4
(populate `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, `SENTRY_PROJECT` in Netlify), steps 5-6 verify
AC-7 end-to-end: the debug endpoint returns 500, a source-mapped
Sentry issue appears within 30 seconds, and the issue sidebar shows
`User: <UUID>` (unless the `lib/sentry.ts` follow-up is deferred past
Phase B — in which case User will be unset, which does not fail AC-7).

## 8. Commit

Single atomic commit in `worktree-agent-a616b372` off
`feature/v0.1-impl`; ready for PR to `feature/v0.1-impl`.
