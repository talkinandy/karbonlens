# Phase 4 Retrospective — Ops Hardening (T19–T22)

**Dates:** 2026-04-21. Specs written, audited, revised, implemented, code-audited, and merged in a single working day. Installer patch (`1aba5d8`) applied after live smoke-test. Total: 1 working day for 4 stories + 1 post-merge patch.

---

## Shipped

| Story | Summary | Merge SHA |
|---|---|---|
| T19 — Cron installation | 5 cron entries under karbonlens user; 5 bash wrappers; logrotate config; smoke-tested on box | `65a416d` |
| T20 — Backups + pg_dump cron | `pg-backup.sh` (pg_dump -Fc, 14-day rotation) + `pg-restore-drill.sh`; 8.77 MB first dump; row counts match live | `8a42e48` |
| T21 — Entity-resolution admin | `/admin/matches` page + API routes; migration 005 (`admin_actions`); shared `lib/admin.ts` + `isAdmin()` | `03e4f4b` |
| T22 — Sentry Phase A | Unconditional wrapper; per-runtime configs (server/edge/client); `beforeSend` email scrub; 1/10 Drizzle error sampling | `999f74e` |
| Installer patch | `install-crontab.sh` rsyncs scrapers source + creates venv; closes gap caught at live smoke-test | `1aba5d8` |

T23 — Replace static prototype with live Next.js build: **deferred**. Blocked on OQ-1 (Netlify → self-hosted Postgres connectivity strategy). No work started.

---

## Pipeline stats

- **Agents run:** 4 parallel spec-writers, 4 auditors, 4 revision passes, 4 implementers (all worktree-isolated, no discipline breaks — retro lesson from Phase 3 applied), 4 code-auditors, 4 docs/merge agents, 1 installer patch after live smoke-test.
- **Fix rounds:** 1 — T22 only, for a runbook false promise (the runbook claimed the `SENTRY_DSN` placeholder was pre-filled; it was not). Blocked merge until corrected. All other stories merged on first code-audit pass.
- **Merge conflicts:** 1 minor — T21 `proxy.ts` matcher additions. Both sides of the conflict wrote verbatim-identical lines (`/admin/:path*` and `/api/admin/:path*`). Canonical was taken; no functional divergence, no re-audit required.

---

## What worked

- **Implementer discipline warning paid off.** The Phase 3 retro called for tightening the implementer prompt: "stay in your worktree, run `git status` before any commit, stop and report if anything outside the file-ownership map shows up." All 4 Phase 4 implementers stayed in isolation. Zero worktree escapes. The lesson transferred directly.

- **Shared `lib/admin.ts` resolved cleanly.** T21 and T22 both needed an admin allowlist and `isAdmin()` guard. Because both implementers were given the same spec, they wrote verbatim-identical content. The merge was trivial.

- **Live smoke-testing surfaced a real gap.** Running the score wrapper on the live box revealed that `/opt/karbonlens/scrapers/` was empty — the installer only created the directory, never rsynced the source or created the venv. This was caught within minutes of merge, not days later. Fixed in a 5-minute patch (`1aba5d8`). The code-audit had not caught this because it reviewed file scope and acceptance criteria in-spec, not a full "install from scratch on a clean box" simulation.

- **Migration 005 + `admin_actions` separation.** Keeping admin audit trail in its own table prevents T16/T17 notification queries from ever joining or filtering across admin-generated events. Clean separation now avoids a query complexity debt later.

- **`pg_dump -Fc` + `pg_restore` restore drill.** First dump produced 8.77 MB (9.19 MB reported for the backup wrapper run). Restore drill row counts exactly matched the live DB. The drill ran on first install, not weeks later — confirmed the backup is actually restorable before it was needed.

---

## What surprised us

- **T19 shipped without scrapers source or venv — missed by code-audit.** The initial T19 implementation correctly defined wrapper scripts pointing to `/opt/karbonlens/scrapers/.venv/bin/python` and the Python modules, but the installer never staged the actual source or created the venv. The code-auditor reviewed file diffs and acceptance criteria in isolation and did not simulate a clean-box install. The gap was caught at live smoke-test, not in the audit gate. This is the biggest process gap of Phase 4.

- **`/opt/karbonlens/.env` required manual population.** T19 left `CHANGE_ME` placeholders for `DATABASE_URL` password and other secrets by design — Andy holds the secrets. But non-interactive cron cannot run until the file is populated, and T19's acceptance criteria did not include a "verify env is populated" step. Documented in T19 follow-ups; Andy must populate before cron runs have meaningful output.

- **`uv` not on karbonlens user's PATH.** The karbonlens Unix user's shell is `/usr/sbin/nologin`, so `~/.local/bin` is never sourced. `uv` (installed as root at `/root/.local/bin/uv`) was unreachable. Installer patch used the full path `/root/.local/bin/uv` as a fallback. Documented in the installer comments.

---

## Process adjustments for post-v0.1

1. **Add "install from clean box" test to code-audit checklist for ops stories.** For any story whose artifacts are bash wrappers, installers, or cron entries (T19, T20, any future T20.1+), the code-auditor must verify that the install path — from empty `/opt/karbonlens/` — reaches a working state. Reviewing file diffs alone is insufficient.

2. **Consider auto-populating `.env` from `/root/karbonlens-secrets.txt` during `install-crontab.sh` when running as root.** The current design leaves placeholders intentionally (Andy's secrets). An alternative: the installer script reads a known secrets file if present and substitutes `CHANGE_ME` values inline. Reduces the manual step. Trade-off: the secrets file must exist and must not be world-readable.

3. **Re-verify cron wrappers on first Monday after install.** Cron runs are weekly/daily, so the first real run happens up to 7 days after install. Consider using `at now + 1 minute <wrapper.sh>` as a one-shot post-install smoke-test for time-sensitive wrappers. Document this in the T19 runbook.

---

## Open items blocking v0.1 ship

**OQ-1 only.** Three options remain open:

- **(a) Tailscale on VPS + Netlify proxy** — install Tailscale on the Hetzner box, expose Postgres on the Tailscale interface, run a small Node proxy on the VPS that Netlify can reach via a public endpoint with auth header.
- **(b) Managed Postgres migration** — migrate DB to Neon or Supabase; Netlify connects natively; self-hosted VPS becomes scraper-only. Adds ~$20–30/month.
- **(c) Custom domain on VPS** — point `karbonlens.id` to the VPS and self-host the Next.js app (PM2 / Caddy reverse proxy), skipping Netlify entirely for the app tier. Lowest complexity, removes the connectivity problem, but loses Netlify's free CDN + deploy pipeline.

Everything else is operational follow-up that does not block shipping the app: Resend key (T17 Phase B), Sentry DSN (T22 Phase B), and T22.1 user context (15-LOC follow-up). Andy can ship to real users the moment OQ-1 is decided and T23 executes.

---

*Retrospective written by PHASE-CLOSE agent, 2026-04-22.*
