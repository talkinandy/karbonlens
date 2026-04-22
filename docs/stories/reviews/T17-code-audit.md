# T17 Code Audit — Weekly digest email via Resend

**Auditor:** adversarial code-auditor agent
**Date:** 2026-04-22
**Branch:** `agent/T17-digest` (commit `c2822ae`)
**Worktree:** `/root/.openclaw/workspace/karbonlens/.claude/worktrees/agent-aaa0b026`
**Base:** `feature/v0.1-impl` tip `6cffc8e` (post-T12).
**Verdict:** CONDITIONAL PASS — 0 blocking issues, 6 non-blocking flags
**Merge recommendation:** ACCEPT for Phase-A merge behind the agreed D1–D6 deviations; Phase-B readiness gated on F2 (idempotence regression) and F5 (unsubscribe UX) being explicitly acknowledged by Andy before any real email leaves the domain.

---

## Independent verification

| # | Check | Result | Evidence |
|---|---|---|---|
| V1 | `npm install` | PASS | 0 errors, 152 packages, 4 pre-existing moderate audit findings unchanged. |
| V2 | `npx tsc --noEmit` | PASS | exit 0, no diagnostics. |
| V3 | `npm run build` | PASS (with `.env.local` present) | route table lists `ƒ /api/digest`; 11/11 static pages; compile 86s + TS 33s. Without `.env.local` the existing DATABASE_URL-required invariant bites all routes — not a T17 regression (baseline behaviour). |
| V4 | `.env.example` untouched | PASS | `git diff feature/v0.1-impl..HEAD -- .env.example` empty. T03 sole-owner honoured; D2 compliant. |
| V5 | 503 on missing `DIGEST_CRON_SECRET` | PASS | harness T1 → `503 {"error":"Digest not configured — DIGEST_CRON_SECRET missing"}`. |
| V6 | 503 on missing `RESEND_API_KEY` (non-dry) | PASS | harness T2 → `503 {"error":"Digest not configured — RESEND_API_KEY missing"}`. |
| V7 | 401 on missing / wrong / same-length-wrong bearer | PASS | harness T3, T4, T6 → `401 {"error":"Unauthorized"}`. |
| V8 | 200 + dryRun summary on correct bearer | PASS | harness T5 → `{users_processed:1, emails_sent:0, skipped:0, errors:0, dry_run:true, outcomes:[{email:"andy@fmg.co.id", status:"dry-run", notification_count:60, project_count:60}]}`. No Resend call confirmed (no outbound traffic, `sendEmail` not reached). |
| V9 | Env var name canonical (`DIGEST_CRON_SECRET`) | PASS | matches `architecture.md` §7; supersedes spec's stale `DIGEST_SECRET`. D2 correct. |
| V10 | Empty-digest skip | PASS (by construction) | `buildDigestForUser` returns `null` on zero rows; route increments `skipped` counter with no Resend call. Confirmed via read, no DB fixture needed. |
| V11 | Ownership guard — no cross-user leak | PASS | `buildDigestForUser` uses `eq(notifications.userId, user.id)`; `markNotificationsDigested` scopes by `userId` too. |
| V12 | `npx tsx scripts/digest-preview.ts` renders fixture without DB / Resend | PASS | `env -u DATABASE_URL -u RESEND_API_KEY npx tsx scripts/digest-preview.ts` → 8874 bytes HTML starting with `<!DOCTYPE html>`; `--subject` → `Your KarbonLens digest — 6 alerts this week`. Resend never imported in fixture mode (dynamic import in `liveBundle` only). |
| V13 | Structured log line to stderr | PASS | `console.error(JSON.stringify({event:"digest_run", users_processed, emails_sent, skipped, errors, dry_run, ran_at}))` — single line per run. Captured on harness T5. |
| V14 | HTML escaping of user-supplied strings | PASS | XSS harness injected `"><script>alert(1)</script>` into title, `<img src=x onerror=alert('x')>` into description, `<b>`/quotes in project_name, `<script>` in email, `"onclick=alert(1)` in project_slug. Output contains no raw `<script`, `<img onerror`, `<b>`, or attribute-breaking `"`. All render as escaped text (`&lt;script&gt;…`, `&quot;`, `&#39;`). Only own tags emitted: `html/head/meta/title/body/table/tr/td/div/p/span/a`. No `dangerouslySetInnerHTML` (string-based renderer — not React). |
| V15 | 7-day window UTC-aligned for Monday 00:00 UTC cron | PASS | `new Date(now.getTime() - 7*86400*1000)`; `createdAt` is `timestamptz`. Comparison is UTC-on-UTC — cron fire at 00:00 UTC means window = `[prev Mon 00:00 UTC, this Mon 00:00 UTC)`. |

---

## Findings

### F1 — NON-BLOCKING: POST-only; spec's GET-export missing

Spec §3 item 4 calls for `export { handler as GET, handler as POST }` so curl can hit the endpoint without `-X POST`. Implementer exports only `POST`. Not listed as a deviation in the implementation report. Cron curl in §3 item 7 explicitly uses `-X POST`, so functionally fine; flag so T19 does not use a bare `GET` curl.

### F2 — NON-BLOCKING (but Phase-B-critical): idempotence regression from D3

Spec AC-3 promises "re-running sends 0 emails" via `digested_at` write-back. D3 removes the write-back; `markNotificationsDigested` is exported but never called (confirmed by grep: no callers outside its own module). Consequence:

- A notification created on day N will appear in the digest on the next cron run (day N+X), and again on the *following* cron run (day N+X+7) as long as it remains inside the rolling 7-day window. With `0 0 * * 1` fires exactly 7 days apart, a notification created ~1 minute before a Monday fire may appear in two consecutive weekly digests.
- Manual re-trigger the same day *will* send the email a second time (spec AC-3 fails outright).

For a single-user v0.1 this is tolerable if Andy is told. But this is a functional regression vs the spec, and it needs either (a) a one-line call to `markNotificationsDigested(user.id, bundle.items.map(i => i.id))` after a successful send (plumbing is ready), or (b) an explicit sign-off that the rolling-window-only strategy is acceptable for Phase B. Recommend (a) before Phase B flips on — risk is that the spec's AC-3 is still quoted elsewhere and a future operator trusts it.

### F3 — NON-BLOCKING: no rate-limit guard for Resend free-tier ceiling

Spec §3 item 4 + §7(i) calls for a "log warning when users_processed > 90" hard-cap awareness. Not implemented. In v0.1 with one user this never trips. If signups accelerate before v0.2, the cron will silently start 429-ing at user 101 and those failures surface only in the per-user `errors` counter — no stop-ship or warning. Low risk; flag for v0.2.

### F4 — NON-BLOCKING: `tokenEquals` still leaks length via the early branch

```ts
if (a.length !== b.length) {
  crypto.timingSafeEqual(a, a);  // self-compare only
  return false;
}
return crypto.timingSafeEqual(a, b);
```

The self-compare runs `timingSafeEqual` over `a.length` bytes; the happy-path runs it over `b.length` bytes. The two paths have different CPU cost as a function of `provided` length, so an attacker can still distinguish "provided had the right length" from "wrong length" by timing. Classical mitigation: HMAC the input to a fixed-length digest, then `timingSafeEqual` the two digests. Low-severity for a single 32-byte shared secret, but cheap to fix:

```ts
const key = Buffer.alloc(32);
const ha = crypto.createHmac('sha256', key).update(provided).digest();
const hb = crypto.createHmac('sha256', key).update(expected).digest();
return crypto.timingSafeEqual(ha, hb);
```

Flag; not blocking.

### F5 — NON-BLOCKING (Phase-B-visible): unsubscribe UX broken

Template footer copy: "Manage preferences in your `account`" → `{appUrl}/alerts`. But:

1. `/alerts` is the notifications inbox, not an account/preferences page.
2. No UI anywhere reads or flips `users.email_digest_opt_in` (grep on `emailDigestOptIn` returns only the schema and the digest query). So a real Phase-B recipient clicking that link will land on the inbox with no way to unsubscribe short of DB surgery.

D4 permits "no unsubscribe endpoint in v0.1," but the template should not falsely claim the link manages preferences. Two acceptable mitigations before Phase B:
- Change copy to "Email digest preferences will be manageable in a future release. To opt out now, reply to this email."
- Or land the minimal toggle UI on the inbox page.

Spec §3-5 also calls for `app/api/unsubscribe/[token]/route.ts` with one-click CAN-SPAM-style unsubscribe; explicitly deferred to v0.2 per D4. OK, but tag for v0.2.

### F6 — NON-BLOCKING: no runbook `docs/runbooks/resend-api-key.md`

Spec §5 lists the runbook as a T17 output; D5 flags it missing. Without it, Andy has no documented procedure for provisioning the Resend account, choosing a from-address, domain verification steps, or the rotation contract for `DIGEST_CRON_SECRET`. Phase B onboarding loses a writeable artefact. Recommend landing a short runbook as a follow-up before Phase B (≤ 30 lines — register → API key → Netlify env → VPS env → cron-command template).

---

## Adversarial summary (against the caller brief's prompts)

- **Rate-limit respect:** no hard-cap; silent per-user 429 surface only. Flag F3.
- **HTML injection:** `escapeHtml` applied uniformly to every user-supplied interpolation including hrefs; no `dangerouslySetInnerHTML`; no `<script>` or attribute-break vectors leak through. **Clean.** (V14.)
- **Timezone:** UTC-on-UTC. Cron at 00:00 UTC aligns with `now - 7d` window. **Clean.** (V15.)
- **Structured log:** single JSON line to stderr, schema matches spec §4 + brief. **Clean.** (V13.)
- **Unsubscribe:** not landed per D4; current copy misleads about where to manage preferences — F5.
- **Template XSS via slug/URL:** slugs interpolated into `href=""` are escapeHtml'd — `"` → `&quot;` closes the attribute-injection vector. URL path encoding is not applied (no `encodeURIComponent`) but the current slug set is `[a-z0-9-]+` by construction (T10 canonicalisation). Defence-in-depth note only.
- **Duplicate-digest across weeks via missing `digested_at` write-back:** confirmed; see F2.

---

## Phase A AC results

| AC | Verdict |
|---|---|
| AC-1 no Authorization → 401 | PASS (V7) |
| AC-2 authorised send | DEFERRED (needs `RESEND_API_KEY`) — dryRun proxy PASS (V8) |
| AC-3 idempotence re-run → 0 emails | **FAIL** structurally due to D3; Phase A cannot verify. See F2. |
| AC-4 unsubscribe link flips opt-in | DEFERRED; D4 removed the endpoint — spec non-goal in v0.1. |
| AC-5 opted-out users skipped | PASS (query filters on `email_digest_opt_in = TRUE`; V11). |
| AC-6 zero-notification users skipped | PASS (V10). |
| AC-7 tsc + build pass | PASS (V2, V3). |
| AC-8 template renders valid HTML | PASS (V12). |
| AC-9 plain-text version emitted | PASS (V12; `--text` mode verified, Resend wrapper passes `text` field). |

AC-3 is the only unresolved Phase-A gap. All other Phase-A-verifiable ACs green.

---

## Phase B readiness

- **Ready:** env-gating (503), auth (401/200), dryRun, observability, HTML safety, ownership scoping.
- **Gate before opening the Resend tap:**
  1. Resolve F2 — either wire `markNotificationsDigested` into the success path or explicitly accept weekly-window duplicates in the runbook.
  2. Resolve F5 — update footer copy so Andy doesn't ship a broken "manage preferences" link.
  3. Land F6 — minimal `docs/runbooks/resend-api-key.md` (30 lines).
  4. Manual one-user live send + Gmail spot-check (desktop + mobile).

---

**Blocking:** 0
**Non-blocking flags:** 6 (F1 POST-only, F2 idempotence regression, F3 no rate-cap, F4 tokenEquals length leak, F5 unsubscribe UX, F6 missing runbook)
**Top finding:** F2 — the v0.1 deviation removes the spec's idempotence guarantee, and the same notification will appear in two adjacent weekly digests in the common "created near the end of the week" case. Fix is one line in `app/api/digest/route.ts` after a successful `sendEmail` — recommended before Phase B rather than accepted as a v0.2 carry-over.

---

## Re-audit note — 2026-04-22 (FIX + DOCS/MERGE agent)

**Re-audit verdict: PASS**

F2 and F5 resolved. Remaining flags (F1, F3, F4, F6) accepted as Phase B carry-overs.

### F2 fix verified

- `DigestBundle` now exposes `allIds: string[]` (all notification IDs in the 7-day pending window, not just the capped top-10 displayed in the template).
- `buildDigestForUser` populates `allIds` from the full query result.
- `route.ts` imports and calls `markNotificationsDigested(user.id, bundle.allIds)` immediately after `result.ok`, before pushing to `outcomes`. Dry-run path is unaffected (it `continue`s before the `sendEmail` block, so no mark occurs — re-runs stay read-only).
- `markNotificationsDigested` UPDATEs `notifications.digested_at = NOW()` WHERE `userId` matches AND `id = ANY(ids)` AND `digested_at IS NULL`. Safe no-op for already-digested rows.
- Migration 004 (`scrapers/migrations/004_add_digested_at.sql`) adds the partial index `idx_notifications_pending_digest ON notifications (user_id, created_at) WHERE digested_at IS NULL`. Applied; `psql` confirmed `CREATE INDEX` + `INSERT 0 1` for version `004`.
- `tsc --noEmit` clean; `npm run build` clean after adding `allIds` to `scripts/digest-preview.ts` fixture bundle.

### F5 fix verified

Footer copy changed from `"Manage preferences in your account"` (linking to `/alerts`) to:
- HTML: `"View all alerts in the KarbonLens app"` (link) + `"Email preferences: toggle email_digest_opt_in on your profile (coming in v0.2)."` (static note).
- Plain-text: matching lines appended.

No false promise of a preferences UI. The gap (no toggle UI) is now explicit to the recipient.

### Remaining flags

- **F1** (POST-only) — accepted; cron uses `-X POST`.
- **F3** (no rate-cap warning) — Phase B monitor.
- **F4** (`tokenEquals` length leak) — revisit with HMAC constant-time compare in Phase B.
- **F6** (no runbook) — write `docs/runbooks/resend-api-key.md` before Phase B key drops.

**Commit:** `bf1c353` (`fix(T17): idempotence via digested_at + correct footer copy`)
