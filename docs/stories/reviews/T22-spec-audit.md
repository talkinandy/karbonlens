---
id: T22-spec-audit
story: T22
title: Sentry error tracking — adversarial spec audit
auditor: spec-audit agent
date: 2026-04-22
verdict: CONDITIONAL PASS
blocking_count: 2
---

## Verdict

**CONDITIONAL PASS — 2 blockers, 7 non-blocking findings.**

The spec is broadly well-structured with a solid Phase A/B split. Two issues must be resolved before implementation begins: (1) the `withSentryConfig` conditional wrapper is fragile for Netlify CI and needs a documented Netlify build policy, and (2) `/api/debug-sentry` sits outside the proxy.ts matcher scope — the spec acknowledges this but the proposed fix (add to matcher) conflicts with the current matcher design. Recommended: move endpoint to `/api/admin/debug-sentry`. Version compat is clear: `@sentry/nextjs@10.49.0` (latest stable) explicitly declares `^16.0.0-0` in its peerDependencies for Next.js — no blocker there.

---

## 1. Version compatibility — CLEAR

**Finding:** `@sentry/nextjs` latest stable is `10.49.0` (published 6 days ago). Its `peerDependencies` entry for Next.js is `^13.2.0 || ^14.0 || ^15.0.0-rc.0 || ^16.0.0-0`. The repo runs **Next.js 16.2.4**. This matches the `^16.0.0-0` range.

**Verdict:** No version blocker. Spec's "expected `^9.x` or `^10.x`" guess is partially stale — the current stable is `^10.x`. Pin `"@sentry/nextjs": "^10.49.0"` (not `^9.x`). The spec correctly instructs the implementer to verify before pinning; the implementer must use `10.x`, not `9.x`. Update the spec's example range in §3 item 1 from `^9.x.x` to `^10.x.x` to avoid confusion.

**Recommended version:** `@sentry/nextjs@^10.49.0`.

---

## 2. `withSentryConfig` conditional wrapper — BLOCKER

**Finding:** The spec wraps `nextConfig` conditionally on `process.env.SENTRY_DSN` at build time:

```typescript
export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
```

This creates two distinct build artefacts depending on whether `SENTRY_DSN` is set in the Netlify environment. A Netlify production build without `SENTRY_DSN` silently skips SDK instrumentation entirely — no error capturing even if `NEXT_PUBLIC_SENTRY_DSN` is later injected at runtime (browser env vars are baked at build time for `NEXT_PUBLIC_*` variables).

**Specific risk:** If Andy sets `SENTRY_DSN` in Netlify only after Phase B, any build triggered before that set-up produces an uninstrumented bundle. Errors in that window are silently swallowed with no indication in the dashboard.

**Required fix:** The spec must add an explicit Netlify build policy in §7 or the runbook:

> "The Netlify build MUST have `SENTRY_DSN` set before triggering a production build. A build without `SENTRY_DSN` produces a Sentry-disabled bundle. Set `SENTRY_DSN` in Netlify environment variables (Site settings → Environment variables) before the first production deploy of T22."

Alternatively (stronger): make `withSentryConfig` unconditional and guard inside each `sentry.*.config.ts` with the no-op pattern. The `withSentryConfig` wrapper itself is safe to apply even without a DSN — it only injects SDK plumbing that the runtime configs then control. This removes the build-time branching risk entirely. The current spec conflates "DSN required to capture events" with "DSN required to wrap the config" — these are independent concerns.

---

## 3. `/api/debug-sentry` proxy.ts matcher — BLOCKER

**Finding:** Current `proxy.ts` matcher covers only:

```
/projects/:path*
/prices/:path*
/regulatory/:path*
/alerts/:path*
```

`/api/debug-sentry` is not in the matcher. The spec acknowledges this in §5 (outputs table) and §6 (file ownership), saying T22 extends the matcher to include `/api/debug-sentry`.

**Problem:** Adding a one-off `/api/debug-sentry` entry to the matcher is an inconsistent design smell — the matcher currently covers entire route groups, not individual API routes. The `auth()` middleware wrapper in `proxy.ts` is expensive to run on API routes in the edge runtime; the current design intentionally keeps `/api/**` outside the matcher to avoid this cost. Punching a hole for a single debug endpoint sets a precedent and increases edge cold-start surface.

**Recommended fix (spec must adopt one):**

- **Option A (recommended):** Move the endpoint to `/api/admin/debug-sentry`. Add `/api/admin/:path*` to the matcher once — this naturally covers any future admin API routes (consistent with how T21's admin pattern works). Update AC-5, AC-7, §5, §6, and the runbook curl example accordingly.
- **Option B:** Keep `/api/debug-sentry` and add it as an explicit single-path matcher entry. This works but is architecturally inconsistent. If chosen, the spec must explain why a group entry was not used.

The spec currently recommends neither option clearly — it says "extend the matcher" without specifying the matcher pattern. This is underspecified and will cause implementer confusion.

---

## 4. PII scrubbing — email in error messages — NON-BLOCKING / REQUIRED CLARIFICATION

**Finding:** §7 item (iv) correctly notes that `setSentryUser` must never receive email. However, the `beforeSend` hook in §3 item 8 relies on Sentry's default scrubbing for form data but does not address error *messages* that may embed PII. Example: a Drizzle query error might produce `"User andy@fmg.co.id not found in table users"` — this passes through `beforeSend` unchanged and lands in the Sentry dashboard.

**The spec says:** "Default PII scrubbing: use Sentry's built-in defaults." Sentry's built-in scrubbing strips field *names* (`password`, `secret`, `token`) from structured payloads — it does NOT regex-scrub free-form error message strings for email addresses.

**Required addition to `beforeSend`:**

```typescript
// Strip email addresses from error messages to prevent PII leakage.
if (event.exception?.values) {
  for (const ex of event.exception.values) {
    if (ex.value) {
      ex.value = ex.value.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[email]');
    }
  }
}
```

Add this to the `beforeSend` spec in both `sentry.server.config.ts` and `sentry.edge.config.ts`. This is a v0.1 GDPR hygiene concern, not a nice-to-have.

---

## 5. AC-4 "dummy DSN + no auth token — skip source map upload" — SPEC LOGIC GAP

**Finding:** AC-4 requires the build log to contain `"[sentry] Source map upload skipped — SENTRY_AUTH_TOKEN not set"`. However, the `sentryWebpackPluginOptions` snippet in §3 item 3 passes `authToken: process.env.SENTRY_AUTH_TOKEN || undefined`. When `authToken` is `undefined`, the Sentry webpack plugin skips the upload silently — it does NOT emit a log line.

The spec's claim that `silent: true` is sufficient to suppress errors but still emit the skip-log is incorrect. With `silent: true`, the plugin emits nothing at all. The implementer would need to add manual logging before passing options to `withSentryConfig` to satisfy AC-4.

**Required fix:** Either (a) weaken AC-4 to not require a specific log line (just "build exits 0 and no auth token warning"), or (b) add explicit pre-call logging to `next.config.ts`:

```typescript
if (!process.env.SENTRY_AUTH_TOKEN) {
  console.log('[sentry] Source map upload skipped — SENTRY_AUTH_TOKEN not set');
}
```

The spec must specify which approach is required; currently AC-4 is not satisfiable by the implementation it describes.

---

## 6. DB sampling is per-message substring, not per-tag — ACCEPTABLE WITH NOTE

**Finding:** The `beforeSend` sampling of Drizzle/Postgres errors uses `Math.random() > 0.1` on messages containing `'drizzle'` or `'postgres'`. This is string-match sampling, not Sentry tag-based sampling. It is stateless: a flood of 1,000 identical errors in 1 second will still pass ~100 events.

This is acceptable for v0.1 given expected load (< 100 events/month), but the spec should note the limitation: "This is approximate sampling. A burst within a single Lambda invocation cannot be further rate-limited without a module-level counter. Acceptable for v0.1."

No spec change required; this finding is informational.

---

## 7. Client-side error capture (AC-8) — UNDERSPECIFIED

**Finding:** AC-8 says "skip if no client surface" and offers `window.__triggerSentryTest?.()` as a mechanism. This is vague. If skipped, Phase B cannot verify `sentry.client.config.ts` is wired correctly — the client config file would be untested code in production.

**Recommended:** The spec should require a minimal dev-only page at `app/debug-sentry-client/page.tsx` (rendered only when `process.env.NODE_ENV === 'development'` or via a route guard) with a single button that calls `throw new Error('Sentry client test')`. This is ~10 lines of code and closes the gap entirely. Without it, client-side capture is assumed-working but never verified in any AC.

Mark AC-8 as "recommended, not optional" and remove the "skip if no client surface" escape hatch.

---

## 8. Python scraper monitoring gap — FLAGGED / ACCEPTABLE

**Finding:** T22 defers Python scraper Sentry integration to v0.2. T19 sets `MAILTO=""` for cron, meaning scraper crashes are also muted at the cron level. This creates a complete monitoring blind spot for scraper failures in v0.1 production.

**Assessment:** Acknowledged by the spec. Acceptable for v0.1 given the low scraper run frequency (1x/week) and the fact that scraper output is observable via database state (missing data for a week is detectable). However, the runbook should explicitly call this out: "Python scraper errors are NOT sent to Sentry in v0.1. If a scraper run fails silently, check cron logs manually via `sudo journalctl -u karbonlens-scraper`."

---

## 9. `instrumentation.ts` dual-runtime init — VERIFY REQUIRED

**Finding:** Next.js 16 uses `instrumentation.ts` (register hook) for server + edge and `instrumentation-client.ts` for browser. The spec correctly identifies both files. However, it describes `instrumentation.ts` as "registers Sentry for server and edge runtimes via `register()`" without specifying that the `register()` function must branch on `process.env.NEXT_RUNTIME`:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
```

Without this branch, both config files are imported in both runtimes, which will fail at edge (Node.js-only APIs in `sentry.server.config.ts`). The spec's §7 item (ii) hints at this but does not make the `NEXT_RUNTIME` branch mandatory in the file spec.

**Required fix:** Add the `NEXT_RUNTIME` branching pattern as a required implementation detail in §3 item 2 under `instrumentation.ts`.

---

## 10. Source map upload to free-tier Sentry — quota note

**Finding:** Free Sentry plan includes 1 GB of artifact storage. A Next.js 16 production build generates source maps for all routes, typically 5–30 MB compressed. Upload quota is unlikely to be exhausted in v0.1. No action required; flagged for awareness.

---

## Summary table

| # | Finding | Severity | Blocker? |
|---|---------|----------|----------|
| 1 | Version compat — `@sentry/nextjs@10.49.0` supports Next.js 16 | INFO | No — clear |
| 2 | `withSentryConfig` conditional creates uninstrumented Netlify builds | HIGH | **YES** |
| 3 | `/api/debug-sentry` outside proxy.ts matcher — underspecified fix | HIGH | **YES** |
| 4 | PII: email addresses in error messages not scrubbed by `beforeSend` | MEDIUM | No — required addition |
| 5 | AC-4 log line not satisfiable by described implementation | MEDIUM | No — spec must clarify |
| 6 | DB error sampling is string-match, not tag-based | LOW | No — informational |
| 7 | AC-8 "skip if no client surface" leaves client Sentry untested | MEDIUM | No — strengthen AC |
| 8 | Python scraper monitoring gap in v0.1 | LOW | No — document in runbook |
| 9 | `instrumentation.ts` missing mandatory `NEXT_RUNTIME` branch | MEDIUM | No — required addition |
| 10 | Source map upload storage quota on free tier | INFO | No |

---

## Phase A readiness

**Not yet ready.** Resolve blockers 2 and 3 before handing to implementer. The remaining non-blocking findings (4, 5, 9) should be incorporated into the spec before implementation to avoid rework — they are implementation-detail gaps, not post-implementation corrections.

---

## Required spec changes (prioritised)

1. **BLOCKER — §3 item 2 / §6 / §5:** Adopt Option A: move debug endpoint to `/api/admin/debug-sentry`, add `/api/admin/:path*` to proxy.ts matcher. Update all AC references and the runbook curl command.
2. **BLOCKER — §3 item 2 / §7 / runbook:** Add Netlify build policy: "Set `SENTRY_DSN` in Netlify env before the first production build." Consider making `withSentryConfig` unconditional and relying solely on runtime no-op guards.
3. **REQUIRED — §3 item 8:** Add email-regex strip to `beforeSend` in both server and edge configs.
4. **REQUIRED — §3 item 2 (`instrumentation.ts`):** Make `NEXT_RUNTIME` branching explicit and mandatory.
5. **CLARIFY — AC-4:** Either add manual log line to `next.config.ts` pre-call, or relax AC-4 to "build exits 0" without requiring a specific log string.
6. **STRENGTHEN — AC-8:** Remove "skip if no client surface" escape; require dev-only client test page.
7. **MINOR — §3 item 1:** Update example pin from `^9.x.x` to `^10.x.x`.
