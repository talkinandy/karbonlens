---
story: T19
title: Cron installation — spec audit
type: spec-audit
auditor: spec-writer agent
date: 2026-04-22
verdict: CONDITIONAL PASS — 2 blocking, 5 non-blocking, 1 vague AC
---

## Verdict

**CONDITIONAL PASS.** Two blocking defects must be resolved before implementation begins. Five non-blocking issues should be addressed in the same PR. One AC is vague but not fatal.

---

## Blocking findings

### B-1 — Endpoint path drift: T19 calls `/api/digest/cron`; T17 ships `/api/digest`

**Severity: BLOCKING**

T19 §3 item 2 (run_weekly_digest.sh) constructs:

```bash
"${APP_BASE_URL}/api/digest/cron"
```

T17's shipped route file is `app/api/digest/route.ts`. Its file header reads:

```
POST /api/digest — T17 weekly-digest cron endpoint.
```

There is no `/cron` segment. The filesystem confirms: `app/api/digest/route.ts` exists; no `app/api/digest/cron/` subdirectory exists.

T19 §9 Open questions notes the discrepancy ("Confirm with T17 implementer") but does not resolve it, leaving an actively wrong curl URL in the spec. Every Monday cron invocation will receive a 404 from Netlify. T19 §5 Inputs also incorrectly lists the dependency as `T17's /api/digest/cron endpoint`.

**Required fix:** Replace every occurrence of `/api/digest/cron` in T19 with `/api/digest`. Update §3 item 2, §5 Inputs, and the Open questions note.

---

### B-2 — Symlink target unreachable by karbonlens user: /root/ traversal

**Severity: BLOCKING**

T19 §3 item 6 creates:

```bash
ln -sfn /root/.openclaw/workspace/karbonlens/scrapers/scripts /opt/karbonlens/scripts
```

The `karbonlens` OS user must traverse `/root/` to follow this symlink. Ubuntu default permissions on `/root` are `700` (root-only). Confirmed on this VPS: `/root` is `755` (execute allowed), but `/root/.openclaw` and its subdirectories are not checked by the spec and may vary. Any parent directory in the chain with `700` perms silently blocks traversal for `karbonlens` — `readlink -f` and `ls /opt/karbonlens/scripts/` will both return "Permission denied". Every cron job will immediately fail with that error.

The spec documents the symlink as "the v0.1 strategy" (§3 item 6) without addressing traversal permissions. AC-7 tests that the symlink resolves correctly but does not assert the `karbonlens` user can traverse it — the AC passes as root and fails in production.

**Three possible fixes (spec must pick one):**

1. **chmod traverse** — `chmod o+x /root /root/.openclaw /root/.openclaw/workspace /root/.openclaw/workspace/karbonlens` prior to creating the symlink, documented in the runbook. Fragile: root homedir chmod is a security regression.
2. **rsync/copy** — `install-crontab.sh` (or a companion `deploy-scripts.sh`) rsyncs `scrapers/scripts/` into `/opt/karbonlens/scripts/` with `karbonlens:karbonlens` ownership. Breaks the "git pull auto-updates scripts" claim but eliminates the security concern.
3. **Move repo** — clone/move the repo to `/home/karbonlens/karbonlens/` and update the symlink target. Low-friction for a dev machine; heavier if the repo is also used for Next.js development at the current path.

Recommended: **option 2 (rsync)**. Add a `deploy-scripts.sh` helper that rsync's `scrapers/scripts/*.sh` into `/opt/karbonlens/scripts/` (chmod 750, owned karbonlens:karbonlens) and must be re-run after `git pull`. Update §3, §6, and the new `docs/runbooks/cron-install.md` to reflect this. Update AC-7 to run `sudo -u karbonlens ls /opt/karbonlens/scripts/` to verify user access, not just `readlink -f` as root.

---

## Non-blocking findings

### N-1 — GFW_API_KEY guard does NOT exist in run_weekly_gfw.sh

**Severity: NON-BLOCKING (spec lie, easily patched)**

T19 §3 item 7 (and §7 edge cases) states:

> `run_weekly_gfw.sh` (T07): already checks `GFW_API_KEY` before invoking the Python module. If the var is unset or empty, it logs "SKIP: GFW_API_KEY not set" and exits 0.

This is false. The current shipped `run_weekly_gfw.sh` (T07 output at `scrapers/scripts/run_weekly_gfw.sh`) contains no check for `GFW_API_KEY`. It sources `.env` and immediately invokes `"$VENV_PYTHON" -m gfw.fetch`. If `GFW_API_KEY` is absent, the Python module errors (likely a non-zero exit), and the cron log records a failure — not a graceful skip.

T19 must either: (a) add the GFW_API_KEY guard to `run_weekly_gfw.sh` as part of T19's deliverables (note: T07's file ownership may prevent this — check with T07 owner), or (b) remove the false claim from §3 item 7 and §7 and document that GFW failures before key provisioning will appear as errors in the log, which is acceptable. Option (b) is simplest given file ownership boundaries.

---

### N-2 — .env creation procedure missing

**Severity: NON-BLOCKING (gap in runbook completeness)**

AC-6 verifies that `/opt/karbonlens/.env` exists with mode `600 karbonlens:karbonlens` and all seven keys. Nothing in T19 specifies who creates this file or how. T19 §3 item 1 lists the required keys and says "T01 runbook already documents this path", but T01's VPS-setup runbook covers the directory structure, not the file contents. The new `docs/runbooks/cron-install.md` (a T19 deliverable) must include an explicit creation step:

```bash
sudo -u karbonlens touch /opt/karbonlens/.env
sudo chmod 600 /opt/karbonlens/.env
sudo chown karbonlens:karbonlens /opt/karbonlens/.env
# Then populate each key (one-time, interactive):
sudo -u karbonlens nano /opt/karbonlens/.env
```

Without this, AC-6 is unverifiable on a fresh VPS.

---

### N-3 — Logrotate: missing `su` directive, root writes unowned log

**Severity: NON-BLOCKING (operational correctness)**

The logrotate config (§3 item 5) uses `create 0640 karbonlens karbonlens` but omits a `su karbonlens karbonlens` directive. Logrotate runs as root. After rotation, logrotate invokes `create` to make the new empty log file — however, without `su`, the new file is created by root. Some versions of logrotate will honor the `create` ownership; others do not. The cron job (`karbonlens` user) then attempts to append to a root-owned file and gets `Permission denied` on the next run cycle.

Add the `su` directive to ensure logrotate performs the rename and create as the `karbonlens` user:

```
/var/log/karbonlens/*.log {
    su karbonlens karbonlens
    weekly
    rotate 4
    ...
}
```

Update §3 item 5 and AC-4.

---

### N-4 — MAILTO="" suppresses all cron failure mail; monitoring gap undocumented

**Severity: NON-BLOCKING (visibility concern)**

`MAILTO=""` in the crontab is correct for preventing noise, but it also silences genuine failures. T19 §3 (out of scope) defers Healthchecks.io to v0.2, and T22 (Sentry) covers only Next.js, not Python scraper exits. This means a persistent backup failure, a Verra scraper crash, or a digest HTTP 500 produces output only in the per-job log file at `/var/log/karbonlens/*.log`. No alert fires.

T19 §7 edge cases briefly notes this for the digest wrapper but does not call out the systemic gap. The spec should add a one-sentence note in §3 (out of scope) or §7:

> "With `MAILTO=""`, all cron failures are silent to email. The only v0.1 monitoring signal is the log files. Andy should check `/var/log/karbonlens/*.log` weekly or after any known issue. Healthchecks.io alerting is deferred to v0.2."

---

### N-5 — set -euo pipefail missing from bash strict mode mandate

**Severity: NON-BLOCKING (consistency)**

T19 AC-9 mandates that `shellcheck` passes on all `.sh` files. The spec does not mandate `set -euo pipefail` in `run_weekly_digest.sh` (the only script T19 creates). The existing wrappers use `set -u -o pipefail` (not `set -e`, intentionally: they need to capture Python exit codes). T20's `pg-backup.sh` uses `set -euo pipefail`. T19's new digest wrapper should use `set -euo pipefail` — it has no Python subprocess to capture; it only runs `curl`. Shellcheck will not flag its absence, but it is an error-safety gap. Add to §3 item 2:

> "`run_weekly_digest.sh` must begin with `set -euo pipefail`."

---

### N-6 — Restore drill cron entry (Sun 06:00) may silently fail before T20 lands

**Severity: NON-BLOCKING (documented but not enforced)**

T19 §7 notes that T20/T22 scripts not yet on disk cause cron to fail silently (since `MAILTO=""`). This is correctly identified. However, the spec does not provide a mitigation path or require the installer to emit a startup-time warning that is durable (e.g., written to a log file). The current behavior is:

- `install-crontab.sh` warns to stderr during install (one-time).
- After install, if the operator does not scroll back, the warning is lost.
- The crontab is installed regardless, and the missing-script cron entries will error to the log files (good: log-visible), but there is no consolidated "pending scripts" manifest.

Recommendation: `install-crontab.sh` should write its "WARN: script not found" lines to `/var/log/karbonlens/install-crontab.log` in addition to stderr so the warning is durable and not just terminal-scroll-dependent. Add to §3 item 3.

---

## Vague AC

### V-1 — AC-8 "no schedule conflicts" is not mechanically verifiable

AC-8 requires a human to inspect the crontab and confirm no two entries share the same minute/hour/dow. This cannot be scripted without a crontab parser. The AC should be reframed as: "the file diff between `karbonlens.crontab` and expected-content is empty" (i.e., verified by a committed golden copy). Alternatively, add a simple awk/grep one-liner to the acceptance procedure:

```bash
awk '/^[0-9]/' karbonlens.crontab | awk '{print $1,$2,$5}' | sort | uniq -d
# Expected: empty output (no duplicate time+dow combinations)
```

---

## Summary table

| ID | Severity | One-line description |
|----|----------|----------------------|
| B-1 | BLOCKING | Endpoint `/api/digest/cron` does not exist; T17 ships `/api/digest` |
| B-2 | BLOCKING | Symlink to `/root/...` unreachable by karbonlens user unless traversal is granted |
| N-1 | Non-blocking | Spec falsely claims GFW guard exists; it is absent from shipped run_weekly_gfw.sh |
| N-2 | Non-blocking | No `.env` creation procedure; AC-6 unverifiable on fresh VPS |
| N-3 | Non-blocking | Missing logrotate `su` directive; root may own rotated log, blocking karbonlens writes |
| N-4 | Non-blocking | `MAILTO=""` monitoring gap underdocumented; no alert path for any cron failure in v0.1 |
| N-5 | Non-blocking | `run_weekly_digest.sh` not mandated to use `set -euo pipefail` |
| N-6 | Non-blocking | Installer warnings for missing scripts are terminal-only, not durable |
| V-1 | Vague AC | AC-8 "no conflicts" not mechanically verifiable; add awk one-liner |

**Blocking count: 2. Non-blocking: 6. Vague AC: 1.**

The spec is otherwise well-structured: schedule rationale is sound, dependency order (T06/T07/T08/T09/T17 blocked-by) is correctly stated, graceful-degradation intent is correct (just wrong about GFW's current state), and the logrotate/crontab artifacts are complete drafts needing only the fixes above.
