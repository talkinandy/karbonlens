# T17 Spec Audit — Weekly digest email via Resend

**Auditor:** adversarial spec-auditor agent
**Date:** 2026-04-19
**Story:** `docs/stories/T17-weekly-digest-email.md`
**Verdict:** CONDITIONAL PASS — 0 blocking issues, 3 non-blocking flags

---

## Findings

### F1 — BLOCKING (0): none

---

### F2 — NON-BLOCKING: `digested_at` written AFTER Resend success (correct ordering confirmed)

Step 7 of `send-digest.ts` logic calls Resend, and step 8 does the `UPDATE ... SET digested_at = NOW()` only on Resend success. This is the correct ordering. However, the spec's idempotence claim in §4 AC-3 and §3 item 4 says "guaranteed by `digested_at`" — which is only true for the success path. The failure path leaves `digested_at` NULL (correct), allowing a retry. No ordering inversion exists in the spec. Flag is clear. **Good.**

One residual risk: if the process crashes or the Netlify function times out between Resend success and the DB UPDATE, the email is sent but `digested_at` is never written, so the user receives a duplicate on the next run. The spec does not acknowledge this narrow window. Recommend noting it in §7 as edge case (viii): "Resend success + DB UPDATE crash" → acceptable for v0.1 with single user.

---

### F3 — NON-BLOCKING: Env var name mismatch between spec and architecture

`architecture.md` §7 names the digest secret `DIGEST_CRON_SECRET`. T17 spec uses `DIGEST_SECRET` throughout (§3, §5, §6, §7-vi, cron command). The `.env.example` file currently has neither — T17 will add `DIGEST_SECRET`. These are not the same name. Implementer must reconcile: either update `architecture.md` §7 to use `DIGEST_SECRET`, or rename T17's references to `DIGEST_CRON_SECRET`. Left unresolved, a developer following `architecture.md` will set the wrong var and get 503 responses.

---

### F4 — NON-BLOCKING: Architecture §4 cron schedule conflicts with T17 cron command

`architecture.md` §4 cron table shows the digest firing at `0 5 * * 1` (05:00 UTC). T17 §3 item 7 documents `0 2 * * 1` (02:00 UTC) with the annotation "= 09:00 Asia/Jakarta WIB". 09:00 WIB is UTC+7, so 02:00 UTC is correct for WIB morning. The architecture doc's `0 5 * * 1` would be 12:00 WIB (noon) — probably a stale value from an earlier draft. T19 owns the actual cron installation; it must use T17's `0 2 * * 1` and not the architecture doc's value. Flag for T19 awareness.

---

### F5 — NON-BLOCKING: `.env.example` cross-story exception acceptable but partially redundant

`RESEND_API_KEY` is already present in `.env.example` (confirmed). T17 correctly appends only `DIGEST_SECRET`. The exception pattern matches the T09/`lib/schema.ts` precedent. No conflict risk. Implementer must flag in PR description per spec requirement. Acceptable.

---

### F6 — INFORMATIONAL: Unsubscribe token reuses NEXTAUTH_SECRET — no revocation mechanism

The spec reuses `NEXTAUTH_SECRET` for unsubscribe JWT signing (HS256, 30-day TTL). This is pragmatic for v0.1. However: if `NEXTAUTH_SECRET` is rotated (e.g., after a breach), all outstanding unsubscribe links in digest emails already delivered become invalid. Users who received a digest email but have not clicked unsubscribe within the rotation window lose the ability to unsubscribe via link. They would need to log in to change settings. Acceptable for v0.1 with one user. Document in runbook: "rotating NEXTAUTH_SECRET invalidates outstanding unsubscribe tokens."

---

### F7 — INFORMATIONAL: `jose` peer-dependency assumption not verified in spec

§9 OQ-4 acknowledges `jose` may need explicit installation if not hoisted. The spec says "implementer to verify before finalising." This is appropriate and not blocking, but it should be a DoD checklist item, not just an open question — to prevent the implementer from shipping a build that fails at runtime in Netlify's function environment where hoisting behaviour may differ from local `node_modules`.

---

## Summary

| # | Severity | Finding |
|---|---|---|
| F2 | Non-blocking | Crash window between Resend success and DB UPDATE not documented in §7 edge cases |
| F3 | Non-blocking | `DIGEST_SECRET` (spec) vs `DIGEST_CRON_SECRET` (architecture.md §7) name mismatch |
| F4 | Non-blocking | Cron schedule `0 5` in architecture.md §4 conflicts with `0 2` in T17 §3 |
| F5 | Non-blocking | `.env.example` exception pattern acceptable, confirmed non-conflicting |
| F6 | Informational | NEXTAUTH_SECRET rotation invalidates outstanding unsubscribe tokens |
| F7 | Informational | `jose` hoisting check should be a DoD item, not only an open question |

**Blocking issues:** 0
**Top finding:** F3 — env var name mismatch (`DIGEST_SECRET` vs `DIGEST_CRON_SECRET`) is the highest-probability implementation bug. If a developer follows `architecture.md` §7 to set up the VPS `.env`, they will set `DIGEST_CRON_SECRET` while the endpoint checks `process.env.DIGEST_SECRET`, producing a permanent 503 with no obvious error. Resolve by updating `architecture.md` §7 to match T17's chosen name before T19 begins.
