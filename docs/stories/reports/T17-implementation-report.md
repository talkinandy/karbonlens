# T17 — Weekly digest email via Resend — Implementation Report

- **Branch:** `agent/T17-digest` (worktree-local, forked from `feature/v0.1-impl`)
- **Worktree:** `/root/.openclaw/workspace/karbonlens/.claude/worktrees/agent-aaa0b026`
- **Base commit:** `6cffc8e merge(T12): project detail (audited PASS; status.ts union with T11)` — tip of `feature/v0.1-impl`, which already includes T16 notifications infra.
- **Status:** Phase-A ACs green; Phase-B (real Resend send) blocked on Andy's API key.

## 1. Files changed

### Created

- `lib/email/resend.ts` — thin Resend SDK wrapper. Exposes `isEmailConfigured()`, `getResendClient()` (lazy), and `sendEmail({ to, subject, html, text })` that never throws; returns `{ ok: true, id } | { ok: false, error }`. From-address defaults to `KarbonLens <onboarding@resend.dev>` (Resend's sandbox sender — no verified domain required for v0.1).
- `lib/email/digest-template.tsx` — pure-HTML template (see Deviation D1 below). Exports `renderDigestEmail({ bundle, appUrl })` → `{ subject, html, text }`. Inline-CSS table layout; KarbonLens palette (`#1a3c2e` dark green, `#f5f4f0` off-white, `#2d6a4f` accent). Six type-badge colours matched to the T16 `.kl-badge--*` palette. Truncates descriptions at 120 chars, caps items at 10 with "+N more" footer.
- `lib/queries/digest.ts` — Drizzle helpers: `listOptedInUsers`, `getUserById`, `buildDigestForUser`, `markNotificationsDigested` (unused by v0.1 route, kept for forward-compat — see Deviation D3). Groups notifications by project, emits `byType` rollup and `windowStart/windowEnd` (UTC YYYY-MM-DD).
- `app/api/digest/route.ts` — POST handler, Node.js runtime. Auth via `Authorization: Bearer <DIGEST_CRON_SECRET>` with `crypto.timingSafeEqual`. Supports `?dryRun=true`. Returns 503 on missing env, 401 on bad token, 200 with per-user outcome list on success. Emits one structured-JSON line to stderr per run (`event: digest_run`).
- `scripts/digest-preview.ts` — `tsx`-runnable preview (fixture OR `--user <uuid>` live mode). Flags: `--text`, `--subject`. Does not import Resend in fixture mode.

### Modified

- `package.json` (+ `package-lock.json`) — added `resend@^6.12.2`.

### Not touched (per constraints)
`lib/schema.ts`, `lib/db.ts`, `lib/auth.ts`, `proxy.ts`, `.env.example`, `docs/architecture.md`, `CHANGELOG.md`, `docs/TASKS.md`, any migration / seed / scraper.

## 2. Phase A — Acceptance criteria (testable now without a real `RESEND_API_KEY`)

Verified on 2026-04-22 via a local harness that invokes the route's `POST` export directly against the live Postgres DB (`andy@fmg.co.id`, 60 unread `reversal` notifications in the 7-day window).

| # | Case | Result | Evidence |
|---|---|---|---|
| A1 | Missing `DIGEST_CRON_SECRET` → 503 | PASS | `503 {"error":"Digest not configured — DIGEST_CRON_SECRET missing"}` |
| A2 | Missing `RESEND_API_KEY` (live run) → 503 | PASS | `503 {"error":"Digest not configured — RESEND_API_KEY missing"}` |
| A3 | Secret set, no `Authorization` header → 401 | PASS | `401 {"error":"Unauthorized"}` |
| A4 | Secret set, wrong bearer token → 401 | PASS | `401 {"error":"Unauthorized"}` |
| A5 | Correct bearer + `?dryRun=true` → 200 summary, no Resend call | PASS | `200 {"users_processed":1,"emails_sent":0,"skipped":0,"errors":0,"dry_run":true,"outcomes":[{"user_id":"25927c12-…","email":"andy@fmg.co.id","status":"dry-run","notification_count":60,"project_count":60}]}` |
| A6 | `scripts/digest-preview.ts` renders HTML with project names, alert counts, "View all in app" link | PASS | `npx tsx scripts/digest-preview.ts \| grep -c Katingan` → 5 (title + href + label occurrences); `--subject` → `Your KarbonLens digest — 6 alerts this week`; `--text` contains "Hi Andy," + "6 new alerts" + "Impacted projects". |
| A7 | `npx tsc --noEmit` → 0 | PASS | Clean. |
| A8 | `npm run build` → 0, `/api/digest` appears in route table | PASS | `ƒ /api/digest` listed; compile 21.0s; 11/11 static pages. |
| A9 | Stderr observability line | PASS | `{"event":"digest_run","users_processed":1,"emails_sent":0,"skipped":0,"errors":0,"dry_run":true,"ran_at":"2026-04-22T00:03:40.019Z"}` |

### Sample HTML (abridged, from `scripts/digest-preview.ts`)

```html
<!DOCTYPE html>
<html lang="en">...
  <div style="font-size:18px;font-weight:700;color:#1a3c2e;">KarbonLens weekly digest</div>
  <div style="font-size:12px;color:#5c6a65;">15 Apr 2026 – 22 Apr 2026</div>
  <p>Hi Andy,</p>
  <p>This week: 6 new alerts, across 3 projects, 1 regulatory update.</p>
  …
  <span style="background:#c03c3c;color:#fff;...">DEFORESTATION</span>
  <a href="https://karbonlens.netlify.app/projects/katingan-peatland">Deforestation alert — Katingan peatland</a>
  <div>0.4 ha loss detected 6 km inside project buffer; confidence high (GLAD).</div>
  <div>Katingan Peatland Restoration</div>
  …
  <a href="https://karbonlens.netlify.app/alerts" style="background:#2d6a4f;color:#fff;...">View all in app →</a>
```

Full output: 8,874 bytes; Gmail- and Outlook-safe (tables + inline CSS only, no custom fonts, no `<style>` blocks).

## 3. Phase B — Readiness (deferred, needs Andy's Resend key)

1. Andy provisions a Resend account, creates an API key per `docs/runbooks/` conventions (no runbook landed here — see D5).
2. Set `RESEND_API_KEY=<real-key>` and `DIGEST_CRON_SECRET=$(openssl rand -base64 32)` on the VPS / Netlify function env.
3. Live-trigger: `curl -X POST -H "Authorization: Bearer $DIGEST_CRON_SECRET" https://karbonlens.netlify.app/api/digest`. Expected response: `200 { emails_sent: 1, skipped: 0, errors: 0 }`.
4. Verify delivery at `andy@fmg.co.id`. Check Gmail desktop render (table layout, type badges, "View all" button). Forward a copy to a mobile client to sanity-check width (`max-width: 600px` + viewport meta should render cleanly).
5. T19 installs the Monday-00:00-UTC cron entry using the same `curl` command.

## 4. Deviations from spec / caller brief

- **D1 — Plain HTML template, not React Email.** The spec (`T17-weekly-digest-email.md` §3 item 2) calls for `@react-email/components` + `@react-email/render`. The caller brief gave explicit latitude ("react-email OR plain HTML string with inline CSS for v0.1") and I chose plain HTML because: (a) fewer runtime deps and zero React-19 compat risk, (b) trivially diff-auditable, (c) the preview script stays a pure string-render with no JSX renderer. File is still `.tsx` per the brief's deliverables list, but exports pure functions (no JSX). Drop-in React Email replacement remains trivial.
- **D2 — `DIGEST_CRON_SECRET` (not `DIGEST_SECRET`).** Per the brief's "architecture wins" rule. No `.env.example` edit (T03 sole-owner). The operator must set this env var on the VPS / Netlify — flagged in the Phase-B steps above.
- **D3 — No DB write of `digested_at`.** Brief says "No database schema changes. Cron log goes to stderr as structured JSON." The `digestedAt` column already exists (T16 migration) and the query helper `markNotificationsDigested` is defined but **not called** by the v0.1 route. Idempotence is currently enforced by the 7-day rolling window alone — re-triggering the endpoint the same week will resend the email (not identical to the spec's `digested_at`-based idempotence). v0.2 can flip this on by adding one call in the route; the plumbing is ready.
- **D4 — No unsubscribe endpoint.** Brief: "Sign-in link token optional (v0.2 → for one-click unsubscribe); v0.1: link to `/alerts`." Template's footer links to `{appUrl}/alerts` with copy "Manage preferences in your account" — users can toggle `email_digest_opt_in` there (assuming future UI) or via direct DB flip for now. No `app/api/unsubscribe` route landed.
- **D5 — No `docs/runbooks/resend-api-key.md`.** Brief §Deliverables lists five files; the runbook is in the spec but not in the brief. Not written. Auditor should confirm whether this is acceptable for the v0.1 Phase-A gate.
- **D6 — Cron schedule: 00:00 UTC (brief) vs 02:00 UTC (spec).** The route itself is schedule-agnostic (no cron config landed — T19 owns installation). The brief's `0 0 * * 1` wins per the brief's authority.

## 5. What auditor should scrutinize

1. **Token compare** — `tokenEquals` pads length-mismatched inputs with a self-compare to preserve timing. Verify this is sufficient; consider switching to `crypto.createHmac` over a canonical string if stricter.
2. **Resend error-shape handling** — `lib/email/resend.ts` reads `response.error.message ?? response.error.name`. Resend v6 returns `{ data: null, error: { name, message, statusCode? } }` on failure (verified in type defs at `node_modules/resend/dist/index.d.mts:1604`). Confirm against real 4xx / 429 responses during Phase B.
3. **Per-user error isolation** — the route's try/catch is scoped inside the user loop so one thrown Resend error cannot poison subsequent sends. Manually re-verify by forcing a bad recipient during Phase B.
4. **Digest window correctness** — query uses `gte(notifications.createdAt, new Date(now - 7d))` + `isNull(digestedAt)`. Auditor: confirm UTC-vs-local-timestamp handling matches intent (all timestamps in schema are `timestamptz`, so UTC is authoritative).
5. **HTML injection in user data** — all `project_name`, `title`, `description`, `email` are escaped via `escapeHtml` before interpolation. Spot-check a few interpolations.
6. **Preview script leakage** — `scripts/digest-preview.ts` in fixture mode must not reach the DB. Verified by `delete process.env.DATABASE_URL && npx tsx scripts/digest-preview.ts --subject` → `Your KarbonLens digest — 6 alerts this week` (passes). Live mode requires `--user <uuid>` and a valid DB URL.
7. **`project_count=60` in dry-run outcome** — all 60 notifications are against distinct projects (confirmed by T16 report's live-counts table). Auditor should not read this as a duplication bug.

## 6. Commit

Single atomic commit on `agent/T17-digest`. Not pushed, not merged.

## T17 follow-ups

Applied by FIX + DOCS/MERGE agent, 2026-04-22.

### Resolved (this merge)

- **F2 — Idempotence via `digested_at` write-back.** `DigestBundle.allIds` added (all notification IDs in the 7-day pending window). `route.ts` calls `markNotificationsDigested(user.id, bundle.allIds)` after `result.ok`. Dry-run path skipped so re-runs stay read-only. Migration 004 (`scrapers/migrations/004_add_digested_at.sql`) adds the partial index `idx_notifications_pending_digest ON notifications (user_id, created_at) WHERE digested_at IS NULL`. Applied; column already existed from Drizzle push. D3 deviation closed.
- **F5 — Footer copy.** HTML and plain-text footers now say "View all alerts in the KarbonLens app" (link to `/alerts`) plus a static note: "Email preferences: toggle `email_digest_opt_in` on your profile (coming in v0.2)." No longer falsely claims a preferences UI exists.

### Accepted carry-overs (Phase B)

- **F1 — POST-only, no GET export.** Accepted; cron explicitly uses `-X POST`. No route-level docs change needed.
- **F3 — No rate-cap warning at Resend free-tier ceiling (100/day).** Phase B monitor: if `users_processed` approaches 90, add a `console.error` warning in the route. Deferred to v0.2.
- **F4 — `tokenEquals` length-leak timing channel.** Low severity for a 32-byte shared secret. Revisit with `crypto.createHmac('sha256', key).update(s).digest()` + `timingSafeEqual` on the two fixed-length digests in Phase B.
- **F6 — No `docs/runbooks/resend-api-key.md`.** Write before Phase B key drops (≤ 30 lines: register → API key → Netlify env → VPS env → cron-command template → rotation contract for `DIGEST_CRON_SECRET`).

### Phase B checklist

- (a) Andy obtains a Resend account and API key (free tier sufficient for v0.1 volume).
- (b) Sets `RESEND_API_KEY` on Netlify (build env) and `DIGEST_CRON_SECRET` on both Netlify + VPS.
- (c) T19 installs the Monday 00:00 UTC cron: `curl -X POST -H "Authorization: Bearer $DIGEST_CRON_SECRET" https://karbonlens.netlify.app/api/digest`.
- (d) Manual one-user live send + Gmail spot-check (desktop + mobile) to verify HTML rendering, plain-text fallback, and from-address domain.
- (e) Write `docs/runbooks/resend-api-key.md` (F6).
- (f) Constant-time token compare hardening (F4).
