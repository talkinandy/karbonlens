---
id: T22
title: Sentry error tracking
phase: 4
status: draft
blocked_by: [T03]
blocks: []
owner: spec-writer agent
effort_estimate: 1h
---

## 1. User story

As Andy (the sole operator of KarbonLens v0.1), I want unhandled errors in the Next.js application to surface automatically in Sentry, so that silent failures in production are visible and debuggable without waiting for user reports.

---

## 2. Context & rationale

KarbonLens v0.1 runs in production on Netlify with ~5 active users and one scraper cron cycle per week. Error rates will be low, but silent failures — a broken API route, a Drizzle query that throws, an unhandled promise rejection — are currently invisible. Sentry's free tier provides 5,000 errors/month for one project, one org, and an unlimited team, which is more than adequate for expected v0.1 load (estimated < 100 events/month).

The Phase A / Phase B split (established in T05, T07, T17) ensures all integration code and build configuration can be reviewed and CI-tested immediately, without waiting for Andy to provision a Sentry account. Phase B covers only the live-DSN smoke test that requires Andy's interaction with the Sentry dashboard.

T03 owns `.env.example` as the sole file editor. `SENTRY_DSN` is already declared there as an empty placeholder. This story introduces two further Sentry env vars (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`). As a documented cross-story exception (same pattern as T17's `DIGEST_CRON_SECRET`), T22's implementer may **append** these vars to `.env.example` — pure append, no conflict risk. The exception must be flagged in the PR description.

Python scrapers currently use `structlog` for logging. Sentry-SDK integration for scrapers is explicitly deferred to v0.2 (a separate Sentry project / DSN can be reused or a new one provisioned at that time). T22 scope is Next.js only.

---

## 3. Scope

### In scope

1. **`npm install @sentry/nextjs` (pin minor version in `package.json`).**

   Use the current stable major at implementation time (expected `^9` or `^10` — verify with `npm info @sentry/nextjs version` before pinning). Pin to a minor-compatible range, e.g. `"@sentry/nextjs": "^9.x.x"`. Confirm `@sentry/nextjs` lists support for Next.js 16 in its peer-dependency range before pinning; if not, open an issue in §9 Open questions.

2. **Sentry scaffold files via wizard, then adapted for Next.js 16.**

   Run `npx @sentry/wizard@latest -i nextjs --skip-connect` to generate the boilerplate, then adapt as follows. Do not commit wizard-generated files verbatim; review each and apply the adjustments below.

   - **`instrumentation.ts`** (repo root) — Next.js 16 instrumentation hook. Registers Sentry for server and edge runtimes via `register()`.
   - **`instrumentation-client.ts`** (repo root) — Next.js 16 client-side instrumentation hook. Imported automatically by the framework on the browser bundle. Calls `Sentry.init(...)` for the browser.
   - **`sentry.server.config.ts`** (repo root) — server-side Sentry configuration.
     - Reads `process.env.SENTRY_DSN`.
     - If `SENTRY_DSN` is absent or empty, **do not call `Sentry.init()`**. Log exactly one line to stdout: `[sentry] SENTRY_DSN not set — Sentry disabled`. Do not log this line on every request; guard with a module-level flag.
     - If `SENTRY_DSN` is present, call `Sentry.init({ dsn, tracesSampleRate: 0 })`. Performance tracing is a paid feature; explicitly disable with `tracesSampleRate: 0`.
     - Include a `beforeSend` hook (see §3 item 8 — Filtering).
   - **`sentry.edge.config.ts`** (repo root) — Sentry configuration for the edge runtime used by `proxy.ts` (Next.js middleware). Same no-op guard pattern as `sentry.server.config.ts`.
   - **`sentry.client.config.ts`** (repo root) — browser Sentry configuration. Called from `instrumentation-client.ts`. Same no-op guard pattern: if `NEXT_PUBLIC_SENTRY_DSN` is absent or empty, do not call `Sentry.init()`. Note: browser env vars must be prefixed `NEXT_PUBLIC_`; the implementer must expose the DSN via `NEXT_PUBLIC_SENTRY_DSN` in addition to `SENTRY_DSN`, or use the Sentry wizard's recommended pattern for Next.js (the wizard typically handles this; confirm during implementation).
   - **`next.config.ts`** — wrap the existing `nextConfig` export with `withSentryConfig`. The wrapper must be **conditional**: only apply if `SENTRY_DSN` is set at build time, so Phase A builds work without any Sentry account. Pattern:

     ```typescript
     import type { NextConfig } from 'next';
     import { withSentryConfig } from '@sentry/nextjs';

     const nextConfig: NextConfig = {
       /* existing config options */
     };

     const sentryWebpackPluginOptions = {
       silent: true,          // suppress Sentry CLI output in CI logs
       hideSourceMaps: true,  // do not ship source maps to browser
     };

     export default process.env.SENTRY_DSN
       ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
       : nextConfig;
     ```

3. **Source map upload — conditional on `SENTRY_AUTH_TOKEN` + production build.**

   Source maps are uploaded to Sentry only when both conditions hold:
   - `NODE_ENV === 'production'` (or `process.env.VERCEL_ENV === 'production'` / Netlify equivalent)
   - `SENTRY_AUTH_TOKEN` is set and non-empty

   When either condition is absent, source map upload is skipped. The build must emit a clear single log line: `[sentry] Source map upload skipped — SENTRY_AUTH_TOKEN not set`. Configure this in `sentryWebpackPluginOptions` by gating the `authToken` field:

   ```typescript
   const sentryWebpackPluginOptions = {
     authToken: process.env.SENTRY_AUTH_TOKEN || undefined,
     org: process.env.SENTRY_ORG || undefined,
     project: process.env.SENTRY_PROJECT || undefined,
     silent: true,
     hideSourceMaps: true,
   };
   ```

   When `authToken` is `undefined`, the Sentry webpack plugin skips the upload automatically without erroring.

4. **`.env.example` — verify and extend (cross-story exception).**

   Verify that `SENTRY_DSN=` is present (already added by T03). The implementer may **append** the following block to `.env.example` — pure append, no existing lines modified:

   ```
   # ── Sentry (additional; SENTRY_DSN already above) ───────────────────────────
   # Auth token for source map upload. Create at: Settings → Account → API → Auth Tokens
   # Required scope: project:releases. Leave blank in local dev.
   # SENTRY_AUTH_TOKEN=
   # Sentry org and project slugs (from your Sentry URL: sentry.io/<org>/<project>)
   # SENTRY_ORG=
   # SENTRY_PROJECT=
   ```

   These lines are commented out (prefixed `#`) because they are optional in dev. Flag this append in the PR description.

5. **`app/api/debug-sentry/route.ts` — admin-only test endpoint.**

   `GET /api/debug-sentry`

   - Admin guard: same allowlist pattern as T21 (`NEXT_PUBLIC_ADMIN_EMAIL` env var). If the authenticated user's email does not match `process.env.NEXT_PUBLIC_ADMIN_EMAIL`, return `403 Forbidden` with `{ error: 'Admin only' }`. If unauthenticated, the request never reaches this handler — `proxy.ts` covers `/api/debug-sentry` in its matcher and redirects to `/?signin=1` (see §6 File ownership for the required `proxy.ts` change).
   - When the admin guard passes, throw a deliberate test error:
     ```typescript
     throw new Error('Sentry test — safe to trigger');
     ```
   - The Next.js error boundary captures this and (if Sentry is initialised) forwards it to the Sentry SDK. The route always returns 500 when triggered by an authenticated admin — this is expected and documented.
   - Include a comment in the file: `// This route exists solely to verify Sentry is receiving events. Safe to trigger repeatedly.`

6. **User context — attach `user.id` to Sentry scope after sign-in.**

   Create a server helper `lib/sentry.ts`:

   ```typescript
   import * as Sentry from '@sentry/nextjs';

   /**
    * Attach the authenticated user's DB UUID to the active Sentry scope.
    * Call this once per request in server components or API routes where
    * session.user.id is available.
    * Privacy: only the opaque UUID is attached — NOT email, name, or any PII.
    */
   export function setSentryUser(userId: string): void {
     Sentry.setUser({ id: userId });
   }

   /**
    * Clear the Sentry user context. Call at sign-out or for unauthenticated paths.
    */
   export function clearSentryUser(): void {
     Sentry.setUser(null);
   }
   ```

   Integration point: call `setSentryUser(session.user.id)` inside the `(app)` group layout server component (`app/(app)/layout.tsx`) after the session is confirmed. Do not attach email, name, or any other PII field.

7. **Scraper integration — deferred.**

   Python scrapers currently use `structlog` for structured logging. Adding `sentry-sdk` via pip to the Python scraper stack is out of scope for v0.1. See §3 Out of scope. Document the deferral here and in the runbook.

8. **Filtering — ignore expected errors; sample noisy DB errors.**

   In both `sentry.server.config.ts` and `sentry.edge.config.ts`, add a `beforeSend` hook:

   ```typescript
   beforeSend(event, hint) {
     const err = hint?.originalException;
     if (!err || typeof err !== 'object') return event;
     const name = (err as Error).name ?? '';
     const msg = (err as Error).message ?? '';

     // Drop expected HTTP errors that are not application bugs.
     if (name === 'NotFoundError' || msg.includes('NEXT_NOT_FOUND')) return null;
     if (name === 'UnauthorizedError' || msg.includes('NEXT_REDIRECT')) return null;

     // Sample Prisma/Drizzle query errors: capture only 1 in 10 to avoid
     // runaway volume if a DB issue triggers a flood of identical errors.
     if (msg.toLowerCase().includes('drizzle') || msg.toLowerCase().includes('postgres')) {
       if (Math.random() > 0.1) return null;
     }

     // Default PII scrubbing: use Sentry's built-in defaults.
     // Additional form-data scrubbing via the SDK's default denyUrls/denyPatterns.
     return event;
   },
   ```

   Add a `beforeSend` note in `sentry.client.config.ts` as well: drop `NEXT_NOT_FOUND` and `NEXT_REDIRECT` thrown by Next.js during navigation; these are not errors.

9. **Runbook: `docs/runbooks/sentry-setup.md`.**

   Create this file. It contains Andy's step-by-step checklist to complete Phase B:

   1. Sign up at [sentry.io](https://sentry.io) — free plan (no credit card required).
   2. Create a new project: platform = **Next.js**, project name = **karbonlens**.
   3. Copy the DSN from **Settings → Client Keys (DSN)**.
   4. Create an auth token at **Settings → Account → API → Auth Tokens**. Required scope: `project:releases`. Copy the token immediately (shown only once).
   5. Add to `.env.local` (local dev):
      ```
      SENTRY_DSN=https://<key>@<id>.ingest.sentry.io/<project>
      NEXT_PUBLIC_SENTRY_DSN=https://<key>@<id>.ingest.sentry.io/<project>
      SENTRY_AUTH_TOKEN=<token>
      SENTRY_ORG=<your-org-slug>
      SENTRY_PROJECT=karbonlens
      ```
   6. Add the same vars to Netlify environment variables (Site settings → Environment variables). For `NEXT_PUBLIC_SENTRY_DSN`, ensure it is exposed at build time (Netlify exposes `NEXT_PUBLIC_*` vars automatically).
   7. Trigger `/api/debug-sentry` while logged in as admin:
      ```bash
      curl -v https://karbonlens.netlify.app/api/debug-sentry \
           -H "Cookie: <your session cookie>"
      ```
      Expected response: `500 Internal Server Error`.
   8. Open the Sentry dashboard → **Issues**. Within 30 seconds, a new issue titled "Sentry test — safe to trigger" should appear with a source-mapped stack trace pointing to `app/api/debug-sentry/route.ts`.
   9. Verify the issue shows **User: [UUID]** (not email) in the right sidebar.
   10. Note on Python scrapers: Sentry integration for Python scrapers is deferred to v0.2. At that point, install `sentry-sdk` via pip and initialise with the same or a separate DSN for the scraper project.

### Out of scope (explicit non-goals)

- Sentry for Python scrapers (`sentry-sdk` via pip) — v0.2.
- Performance monitoring / distributed tracing — paid Sentry feature; `tracesSampleRate: 0` explicitly disables it.
- Session replay — Sentry offers 500 free replays/month; deferred to v0.2.
- Feedback widget — not needed in v0.1.
- Release health tracking — requires a deployment hook (Netlify ↔ Sentry integration); deferred to v0.2 when the Netlify deploy pipeline is more mature.
- Alerting rules in Sentry (e.g., email Andy when error rate spikes) — configure manually in the Sentry dashboard post-Phase B; not part of the code changes.

---

## 4. Acceptance criteria (Gherkin)

### Phase A — verifiable without a Sentry account

**AC-1: Package installs cleanly**
```
Given the repo is at the current HEAD of feature/v0.1-impl
When npm install @sentry/nextjs (pinned minor) is run
Then npm exits 0
And package.json contains "@sentry/nextjs" with a pinned minor range
And package-lock.json is updated
```

**AC-2: TypeScript compiles cleanly**
```
Given all T22 files have been created
When npx tsc --noEmit runs
Then the exit code is 0 with no type errors
```

**AC-3: Build succeeds without SENTRY_DSN**
```
Given SENTRY_DSN is not set in the environment (empty or absent)
When npm run build runs
Then the exit code is 0
And the build output does not contain any Sentry error
And exactly one line matching "[sentry] SENTRY_DSN not set — Sentry disabled"
  appears in the build log (not repeated per-request)
```

**AC-4: Build with dummy DSN, no auth token — skips source-map upload**
```
Given SENTRY_DSN=https://dummy@sentry.io/1 is set
And SENTRY_AUTH_TOKEN is not set
When npm run build runs
Then the exit code is 0
And the build log contains a line matching "[sentry] Source map upload skipped"
And the build does not fail or warn about a missing auth token
```

**AC-5: Debug endpoint is gated — unauthenticated redirect**
```
Given SENTRY_DSN is absent
And the user is not signed in
When GET /api/debug-sentry is requested
Then the response is 307 (or 302) redirect to /?signin=1
  (handled by proxy.ts matcher, not the route handler itself)
```

**AC-6: Runbook file renders correctly**
```
Given docs/runbooks/sentry-setup.md has been committed
When the file is opened in a Markdown viewer
Then all numbered steps render correctly
And all code blocks are syntactically valid
And the file contains links to sentry.io signup and the Netlify env vars settings page
```

### Phase B — requires Andy's SENTRY_DSN (deferred)

**AC-7: Real DSN — debug endpoint captures event in dashboard**
```
Given SENTRY_DSN is set to Andy's real Sentry project DSN
And the user is authenticated as admin (andy@fmg.co.id)
When GET /api/debug-sentry is called (via browser or curl with session cookie)
Then the response status is 500
And within 30 seconds, a new issue "Sentry test — safe to trigger"
  appears in the Sentry dashboard for the karbonlens project
And the issue's stack trace is source-mapped back to
  app/api/debug-sentry/route.ts (not minified)
And the issue sidebar shows User: <UUID> (not email)
```

**AC-8: Client-side error capture (optional — skip if no client surface)**
```
Given SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN are set to Andy's real DSN
And a deliberate client-side error is triggered (e.g., via a dev-only
  button that calls window.__triggerSentryTest?.() or similar)
When the error fires in the browser
Then it appears in the Sentry dashboard within 30 seconds
  with the correct project and environment tags
NOTE: If no suitable client surface exists in v0.1, skip this AC and
  document why in the PR description. AC-7 (server-side) is the
  minimum viable verification.
```

**AC-9: Expected 401/404 errors do NOT appear in Sentry**
```
Given SENTRY_DSN is set
And an unauthenticated request hits a protected route (triggering a
  NEXT_REDIRECT or equivalent)
And a request is made to a non-existent page (triggering NEXT_NOT_FOUND)
When the Sentry dashboard is inspected
Then neither event appears as an issue
And the issue count does not increment for these request patterns
```

---

## 5. Inputs & outputs

### Inputs

| Input | Source |
|---|---|
| `SENTRY_DSN` | Already in `.env.example` (T03 placeholder, empty). Andy populates per runbook. |
| `NEXT_PUBLIC_SENTRY_DSN` | Same DSN value, exposed to browser bundle. Added to `.env.example` by T22 (append). |
| `SENTRY_AUTH_TOKEN` | Andy creates at sentry.io. Optional in dev. Added as commented placeholder to `.env.example` by T22 (append). |
| `SENTRY_ORG` | Andy's Sentry org slug. Added as commented placeholder to `.env.example` by T22 (append). |
| `SENTRY_PROJECT` | Andy's Sentry project slug (recommended: `karbonlens`). Added as commented placeholder by T22 (append). |
| `NEXT_PUBLIC_ADMIN_EMAIL` | Already set (T21). Used by `app/api/debug-sentry/route.ts` for admin guard. |
| `session.user.id` | Provided by `lib/auth.ts` session callback (T05). Used by `lib/sentry.ts` to attach user context. |

### Outputs

| Output | Path | Notes |
|---|---|---|
| Instrumentation (server/edge) | `instrumentation.ts` | Next.js 16 `register()` hook |
| Instrumentation (client) | `instrumentation-client.ts` | Next.js 16 browser hook |
| Server Sentry config | `sentry.server.config.ts` | Reads `SENTRY_DSN`; no-op if absent |
| Edge Sentry config | `sentry.edge.config.ts` | Same pattern; for middleware |
| Client Sentry config | `sentry.client.config.ts` | Reads `NEXT_PUBLIC_SENTRY_DSN` |
| Sentry user helper | `lib/sentry.ts` | `setSentryUser` / `clearSentryUser` |
| Test endpoint | `app/api/debug-sentry/route.ts` | Admin-only; always returns 500 when reached |
| Runbook | `docs/runbooks/sentry-setup.md` | Andy's Phase B checklist |
| Modified | `next.config.ts` | Wrapped with `withSentryConfig` (conditional) |
| Modified | `proxy.ts` | Matcher extended to include `/api/debug-sentry` |
| Modified (append only) | `.env.example` | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` as commented placeholders |

---

## 6. Dependencies & interactions

### Blocked by

- **T03** — `next.config.ts`, `.env.example`, and the Next.js project scaffold must exist before T22 can modify them. T03 is done.

### Blocks

- Nothing in v0.1. T22 is a terminal leaf task in Phase 4.

### File ownership (paths this story is exclusively allowed to create or modify)

T22 owns the following paths. Parallel implementers must not touch them:

```
instrumentation.ts
instrumentation-client.ts
sentry.server.config.ts
sentry.edge.config.ts
sentry.client.config.ts
lib/sentry.ts
app/api/debug-sentry/route.ts
docs/runbooks/sentry-setup.md
```

T22 may also **modify**:
```
next.config.ts          ← add withSentryConfig wrapper (conditional)
proxy.ts                ← extend matcher to cover /api/debug-sentry
```

T22 may **append** (not rewrite) to:
```
.env.example            ← cross-story exception; documented in §5
```

T22 touches `app/(app)/layout.tsx` only to add a single `setSentryUser(session.user.id)` call in the existing server component body. If T21 has already modified that file, T22's change must be applied as a merge-safe addition, not a rewrite.

T22 does **not** touch:
- `lib/auth.ts` — session callback and user ID propagation are unchanged.
- `lib/schema.ts` — no schema changes.
- Any scraper files.

---

## 7. Edge cases & failure modes

**(i) Next.js 16 + Sentry wizard compatibility**

The `@sentry/wizard` CLI generates files for the Next.js version it detects in `package.json`. If the wizard fails (incompatible scaffolding, missing peer deps), do not block the story. Fallback: install `@sentry/nextjs` manually and write `instrumentation.ts`, `instrumentation-client.ts`, and the three config files from scratch following the [Sentry Next.js manual setup docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/). Document which path was taken in the PR description.

**(ii) Edge runtime and Sentry compatibility**

`proxy.ts` runs in the Next.js edge runtime. Verify that the pinned `@sentry/nextjs` version exports an edge-compatible build (it typically ships `@sentry/nextjs/edge`). If the edge config import breaks the middleware build, gate the import: import `@sentry/nextjs` only in `sentry.edge.config.ts` and ensure `instrumentation.ts` loads it conditionally via `runtime === 'edge'` check.

**(iii) Dev server log spam when SENTRY_DSN is absent**

The `[sentry] SENTRY_DSN not set — Sentry disabled` log line must fire exactly once at module initialisation, not on every request. Implement using a module-level boolean flag:

```typescript
let _warned = false;
if (!process.env.SENTRY_DSN && !_warned) {
  _warned = true;
  console.warn('[sentry] SENTRY_DSN not set — Sentry disabled');
}
```

**(iv) PII leak via form data in API errors**

Use Sentry's default event scrubbing (it strips `password`, `secret`, `token`, `api_key` from request bodies by default). Add a `denyUrls` list for any routes that handle form submissions. In `beforeSend`, do not attach `event.request.data` unless it has been explicitly scrubbed. The `setSentryUser` helper must never receive email — only the UUID.

**(v) Source map upload failure during CI build**

If `SENTRY_AUTH_TOKEN` is set but the upload fails (network error, wrong org/project), the Sentry webpack plugin logs a warning. This must not fail the build (the plugin's `silent: true` flag ensures build continues). Confirm the plugin does not exit non-zero on upload failure with the chosen version. If it does, add `{ errorHandler: (err) => console.warn('[sentry] Upload failed:', err) }` to `sentryWebpackPluginOptions`.

**(vi) `NEXT_PUBLIC_SENTRY_DSN` vs `SENTRY_DSN`**

The client bundle can only read env vars prefixed `NEXT_PUBLIC_`. The same DSN value must be added under both keys. The runbook explicitly lists both. The implementer must verify that the Sentry wizard's generated `sentry.client.config.ts` references `NEXT_PUBLIC_SENTRY_DSN` and not `SENTRY_DSN`.

**(vii) Graceful no-op when Sentry is disabled**

`lib/sentry.ts`'s `setSentryUser` and `clearSentryUser` call `Sentry.setUser(...)`. If Sentry was not initialised (no DSN), `Sentry.setUser` is a no-op by the SDK's design. No guard is needed; just call it unconditionally after importing.

---

## 8. Definition of done

- [ ] All Phase A acceptance criteria (AC-1 through AC-6) pass.
- [ ] Phase B ACs (AC-7 through AC-9) are explicitly deferred — documented in PR description with instructions for Andy to verify.
- [ ] Story's files landed in `feature/v0.1-impl` under a PR.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0 without `SENTRY_DSN`.
- [ ] `npm run build` exits 0 with `SENTRY_DSN=https://dummy@sentry.io/1` and no auth token.
- [ ] `docs/runbooks/sentry-setup.md` committed.
- [ ] `.env.example` append applied and flagged in PR description.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] `TASKS.md` T22 status updated from `todo` → `done` (after Phase B verified by Andy).
- [ ] Story frontmatter `status` set to `done` (after Phase B verified).

---

## 9. Open questions

1. **Which `@sentry/nextjs` minor version?** Free to pin whichever is current stable at implementation time. As of the spec date the expectation is `^9.x` or `^10.x` — verify with `npm info @sentry/nextjs version`. If the chosen version does not list Next.js 16 in its peer-dependency range, block the story and flag here.

2. **Sentry plan — free tier adequate?** Free tier: 5,000 errors/month, 1 project, 1 org, unlimited team. v0.1 expected < 100 events/month. No upgrade needed for v0.1. Confirmed OK.

3. **Session replay?** Sentry's free tier includes 500 replays/month. Nice-to-have but deferred to v0.2 to keep T22 scope tight. Skip entirely in v0.1.

4. **Sentry for Python scrapers — shared DSN or separate?** Defer to v0.2. When added, a shared DSN is fine; use the `environment` tag (`scraper` vs `nextjs`) to distinguish event sources in the same Sentry project.

5. **Netlify build env and `NEXT_PUBLIC_SENTRY_DSN`?** Netlify automatically exposes `NEXT_PUBLIC_*` vars at build time for Next.js. Confirm this works correctly during Phase B — it should, but verify after first Netlify deploy with the real DSN.

6. **`withSentryConfig` tree-shaking impact on bundle size?** The Sentry client SDK adds ~50–80 kB gzipped to the browser bundle. Acceptable for v0.1 with no performance budget set. Revisit in v0.2 if Lighthouse scores degrade.

---

## 10. References

- `docs/TASKS.md` T22 — task definition
- `docs/TASKS.md` T03 — Next.js bootstrap (owns `.env.example`, `next.config.ts`)
- `docs/TASKS.md` T21 — entity resolution admin page (admin allowlist pattern, `NEXT_PUBLIC_ADMIN_EMAIL`)
- `docs/stories/T17-weekly-digest-email.md` §5 — cross-story `.env.example` exception pattern
- `docs/stories/T05-nextauth-google-oauth.md` — Phase A/B split pattern reference
- `lib/auth.ts` — session callback that provides `session.user.id` (the UUID attached to Sentry scope)
- `proxy.ts` — matcher to be extended to cover `/api/debug-sentry`
- `.env.example` — `SENTRY_DSN=` placeholder (T03 sole-owner; T22 appends additional vars)
- [Sentry Next.js SDK docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Next.js manual setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/) — fallback if wizard fails
- [Sentry free tier limits](https://sentry.io/pricing/) — 5,000 errors/month confirmed adequate for v0.1
