---
id: T19
title: Cron installation on VPS
phase: 4
status: draft
blocked_by: [T06, T07, T08, T09, T17]
blocks: []
owner: spec-writer agent
effort_estimate: 1h
---

## 1. User story

As the system operator (Andy), I want all periodic jobs — scrapers, score compute, pg-backup, digest trigger, and restore drill — scheduled under the `karbonlens` OS user via a checked-in crontab, so that the VPS runs autonomously without manual intervention after initial setup.

---

## 2. Context & rationale

Phases 2 and 3 delivered the Python scrapers (T06–T09) and the digest endpoint (T17). Each depends on being triggered on a schedule; none installs that schedule itself. T19 closes this gap.

Architecture §4 (scraper patterns) specifies cron as the scheduling mechanism for v0.1 — not systemd timers, not a job queue. All scripts source `/opt/karbonlens/.env` explicitly because cron runs in a minimal environment that does not inherit the user's `.bashrc` or shell profile.

The crontab is checked into the repo (`scrapers/scripts/karbonlens.crontab`) and installed via `scrapers/scripts/install-crontab.sh`. This means the schedule is version-controlled and reproducible; a fresh VPS can be brought up by running one script.

T17 delivers the digest API endpoint but deliberately defers the cron trigger to this story. T20 (pg-backup) and T22 (restore drill) are being specced in parallel; their scripts (`pg-backup.sh`, `pg-restore-drill.sh`) are referenced here but must exist on disk before `install-crontab.sh` will install those entries cleanly (the installer warns when they are absent).

All times are UTC. WIB (Asia/Jakarta) conversions are provided in comments for Andy's benefit. WIB is UTC+7 year-round with no DST.

---

## 3. Scope

### In scope

1. **`/opt/karbonlens/.env`** — Populated with the full set of env vars required by all cron jobs. File must be owned `karbonlens:karbonlens`, mode `600`. The runbook (`docs/runbooks/vps-setup.md`) already documents this path; T19 specifies the required keys and placeholder values. Required keys:
   ```
   DATABASE_URL=postgresql://karbonlens:<password>@localhost:5432/karbonlens
   GFW_API_KEY=<register at globalforestwatch.org>
   RESEND_API_KEY=<from resend.com>
   DIGEST_CRON_SECRET=<openssl rand -base64 32>
   SCRAPER_USER_AGENT=KarbonLens/0.1 (+https://karbonlens.id)
   SCRAPER_LOG_DIR=/var/log/karbonlens
   APP_BASE_URL=https://karbonlens.netlify.app
   ```
   Placeholder values are acceptable at install time; the digest and GFW wrappers degrade gracefully if their keys are empty (see §3 item 7).

2. **`scrapers/scripts/run_weekly_digest.sh`** — New wrapper script (T17 exposes only the endpoint; no wrapper existed). Behaviour:
   - Sources `/opt/karbonlens/.env` via `set -a; source ...; set +a`.
   - Checks that both `RESEND_API_KEY` and `DIGEST_CRON_SECRET` are non-empty; if either is absent, logs a skip message to stdout and exits 0.
   - When both keys are present, issues:
     ```bash
     HTTP_STATUS=$(curl -s -o /tmp/digest-response.json -w "%{http_code}" \
       -X POST "${APP_BASE_URL}/api/digest/cron" \
       -H "Authorization: Bearer ${DIGEST_CRON_SECRET}" \
       -H "Content-Type: application/json")
     ```
   - If `HTTP_STATUS` is not 2xx (i.e. does not match `2[0-9][0-9]`), logs the status code and response body from `/tmp/digest-response.json`, then exits 1.
   - On success, logs the status and exits 0.
   - Must pass `shellcheck`.

3. **`scrapers/scripts/install-crontab.sh`** — Idempotent installer. Steps:
   - Resolves the crontab file path relative to its own location (`SCRIPT_DIR/karbonlens.crontab`).
   - Validates the file exists and is readable.
   - Warns (but does not fail) for each script path referenced in the crontab that does not exist on disk, e.g. `pg-backup.sh` if T20 has not landed yet.
   - Installs via `sudo crontab -u karbonlens "$CRONTAB_FILE"`.
   - Verifies by running `sudo crontab -l -u karbonlens` and diffing against the source file.
   - Accepts a `--force` flag to suppress any interactive prompt when a previous crontab is detected; without `--force` it prints a warning that the existing crontab will be replaced and asks for confirmation (reads `y/n` from stdin).
   - Idempotent: running twice produces the same installed crontab (no duplicated lines).

4. **`scrapers/scripts/karbonlens.crontab`** — The checked-in crontab installed by the script above:

   ```
   SHELL=/bin/bash
   PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
   MAILTO=""

   # Nightly pg-backup (02:00 UTC = 09:00 WIB)
   0 2 * * * /opt/karbonlens/scripts/pg-backup.sh >> /var/log/karbonlens/backup.log 2>&1

   # Weekly digest curl trigger (Mon 00:00 UTC = Mon 07:00 WIB)
   0 0 * * 1 /opt/karbonlens/scripts/run_weekly_digest.sh >> /var/log/karbonlens/digest.log 2>&1

   # Weekly Verra scraper (Mon 03:00 UTC = Mon 10:00 WIB)
   0 3 * * 1 /opt/karbonlens/scripts/run_weekly_verra.sh >> /var/log/karbonlens/verra.log 2>&1

   # Weekly GFW scraper (Mon 03:30 UTC = Mon 10:30 WIB)
   30 3 * * 1 /opt/karbonlens/scripts/run_weekly_gfw.sh >> /var/log/karbonlens/gfw.log 2>&1

   # Daily score compute (04:00 UTC = 11:00 WIB)
   0 4 * * * /opt/karbonlens/scripts/run_daily_score.sh >> /var/log/karbonlens/score.log 2>&1

   # Monthly IDXCarbon (1st of month 05:00 UTC = 12:00 WIB)
   0 5 1 * * /opt/karbonlens/scripts/run_monthly_idxcarbon.sh >> /var/log/karbonlens/idxcarbon.log 2>&1

   # Weekly restore drill (Sun 06:00 UTC = Sun 13:00 WIB)
   0 6 * * 0 /opt/karbonlens/scripts/pg-restore-drill.sh >> /var/log/karbonlens/restore-drill.log 2>&1
   ```

   Notes on the schedule:
   - `MAILTO=""` silences cron's default email-on-output behaviour; all output is redirected to log files.
   - Scripts are invoked via `/opt/karbonlens/scripts/` (the symlink introduced in item 6), not the raw repo path, so the crontab remains valid if the repo is moved.
   - All seven entries are distinct time slots; no two overlap. The restore drill (Sun 06:00) does not conflict with any Monday job.
   - Score compute (daily 04:00) runs after the Monday scrapers finish (Verra 03:00, GFW 03:30) on their shared day, and harmlessly reprocesses with last-known data on other days.

5. **`scrapers/scripts/logrotate.d-karbonlens`** — Logrotate configuration file (committed to repo, deployed to `/etc/logrotate.d/karbonlens` by the runbook):

   ```
   /var/log/karbonlens/*.log {
       weekly
       rotate 4
       compress
       delaycompress
       missingok
       notifempty
       create 0640 karbonlens karbonlens
   }
   ```

   Deployment command (run as root, idempotent):
   ```bash
   cp scrapers/scripts/logrotate.d-karbonlens /etc/logrotate.d/karbonlens
   chmod 644 /etc/logrotate.d/karbonlens
   logrotate -d /etc/logrotate.d/karbonlens   # dry-run to verify
   ```

6. **Scripts deployment via symlink** — `/opt/karbonlens/scripts/` is a symlink to the repo's `scrapers/scripts/` directory. This is the v0.1 strategy; a `git pull` in the repo automatically updates the scripts on the VPS. Deployment command (idempotent):

   ```bash
   REPO=/root/.openclaw/workspace/karbonlens
   ln -sfn "${REPO}/scrapers/scripts" /opt/karbonlens/scripts
   stat /opt/karbonlens/scripts   # must resolve to the repo path
   ```

   If `/opt/karbonlens/scripts` already exists as a plain directory (not a symlink), the runbook documents the cleanup step: `rm -rf /opt/karbonlens/scripts` before creating the symlink.

7. **Graceful degradation for missing secrets:**
   - `run_weekly_gfw.sh` (T07): already checks `GFW_API_KEY` before invoking the Python module. If the var is unset or empty, it logs `"SKIP: GFW_API_KEY not set"` and exits 0. No cron-mail spam.
   - `run_weekly_digest.sh` (new, this story): checks `RESEND_API_KEY` and `DIGEST_CRON_SECRET`. If either is absent or empty, logs `"SKIP: RESEND_API_KEY or DIGEST_CRON_SECRET not set"` and exits 0.
   - This prevents cron from generating failure noise during the period between crontab install and Andy provisioning all third-party API keys.

### Out of scope (explicit non-goals)

- Monitoring or alerting on cron job failures. Scraper log files are the only signal in v0.1. Healthchecks.io integration is a v0.2 item (architecture §10).
- systemd timers. Architecture §4 mandates cron for v0.1. Migration to timers may happen in v0.2.
- Distributed scheduling across multiple boxes. Single-VPS deploy only.
- Dynamic or configurable schedule. Times are hardcoded in `karbonlens.crontab`.
- `flock`-based overlap prevention. Scrapers are idempotent; concurrent runs are unlikely given staggered timing. Revisit in v0.2 if evidence of overlap emerges.
- Cron triggered from CI/CD instead of VPS.
- Python scraper supervision or restart on crash (cron retries naturally on the next cycle).
- Sentry integration for scraper failures (tracked separately in T22 scope).

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Seven entries installed**
```
Given install-crontab.sh has been run on the VPS
When  sudo crontab -l -u karbonlens
Then  exactly 7 non-comment, non-blank lines are printed (one per schedule entry)
```

**AC-2: Idempotent install**
```
Given install-crontab.sh has already been run once
When  install-crontab.sh is run again (with --force)
Then  sudo crontab -l -u karbonlens still shows exactly 7 entries (no duplicates)
```

**AC-3: Wrappers run cleanly from cron environment**
```
Given /opt/karbonlens/.env exists (even with placeholder values)
  And PATH is set to /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
When  each wrapper script is invoked with that minimal PATH
Then  each exits 0 (or logs a helpful "SKIP:" message and exits 0 when a key is absent)
  And no output goes to stdout/stderr outside the log file redirection
```

**AC-4: Log files writable after logrotate runs**
```
Given /etc/logrotate.d/karbonlens is installed
  And /var/log/karbonlens/ exists owned by karbonlens
When  logrotate /etc/logrotate.d/karbonlens is run
Then  sudo -u karbonlens touch /var/log/karbonlens/verra.log succeeds
  And the log file has mode 640 and is owned karbonlens:karbonlens
```

**AC-5: Logrotate dry-run passes**
```
Given /etc/logrotate.d/karbonlens is installed
When  logrotate -d /etc/logrotate.d/karbonlens
Then  exit code is 0
  And output shows all *.log files would be rotated weekly with 4 rotations kept
```

**AC-6: .env file has correct permissions and keys**
```
Given the VPS has been provisioned per T01
When  stat -c "%a %U:%G" /opt/karbonlens/.env
Then  output is "600 karbonlens:karbonlens"
When  grep -c "=" /opt/karbonlens/.env
Then  output is ≥ 7 (one line per required key)
  And all seven required keys are present (even if values are placeholders)
```

**AC-7: Symlink resolves correctly**
```
Given ln -sfn has been run to create /opt/karbonlens/scripts
When  stat /opt/karbonlens/scripts
Then  it is reported as a symbolic link
  And readlink -f /opt/karbonlens/scripts resolves to the repo scrapers/scripts/ directory
  And ls /opt/karbonlens/scripts/ lists run_weekly_verra.sh and at least 5 other wrapper scripts
```

**AC-8: No schedule conflicts**
```
Given the 7-entry crontab is installed
When  the Monday schedule is inspected (00:00 digest, 03:00 Verra, 03:30 GFW, 04:00 score)
  And the Sunday schedule is inspected (06:00 restore drill)
Then  no two entries share the same minute/hour/dow combination
  And the restore drill (Sun 06:00) does not conflict with any Monday entry
```

**AC-9: shellcheck passes**
```
Given shellcheck is installed on the VPS (or CI)
When  shellcheck scrapers/scripts/*.sh
Then  exit code is 0 with no errors or warnings
```

---

## 5. Inputs & outputs

**Inputs:**
- Existing wrapper scripts: `run_weekly_verra.sh` (T06), `run_weekly_gfw.sh` (T07), `run_monthly_idxcarbon.sh` (T08), `run_daily_score.sh` (T09).
- T17's `/api/digest/cron` endpoint (POST, bearer-auth).
- T20's `pg-backup.sh` and T22's `pg-restore-drill.sh` (may not be landed at T19 install time; installer warns but proceeds).
- VPS directory structure established by T01: `/opt/karbonlens/`, `/var/log/karbonlens/`, `karbonlens` OS user.

**Outputs:**
- `scrapers/scripts/run_weekly_digest.sh` — new script in repo.
- `scrapers/scripts/install-crontab.sh` — new script in repo.
- `scrapers/scripts/karbonlens.crontab` — new file in repo.
- `scrapers/scripts/logrotate.d-karbonlens` — new file in repo (deployed to `/etc/logrotate.d/karbonlens`).
- VPS-side state changes: crontab installed for `karbonlens` user, `/etc/logrotate.d/karbonlens` deployed, `/opt/karbonlens/scripts` symlink created, `/opt/karbonlens/.env` populated (if not already present from T01).
- New runbook: `docs/runbooks/cron-install.md` — step-by-step operator instructions for installing and verifying the cron setup.

**Env vars consumed (all sourced from `/opt/karbonlens/.env`):**

| Variable | Consumer | Required |
|---|---|---|
| `DATABASE_URL` | All scrapers, score compute | Yes |
| `GFW_API_KEY` | `run_weekly_gfw.sh` | No (skip if absent) |
| `RESEND_API_KEY` | `run_weekly_digest.sh` | No (skip if absent) |
| `DIGEST_CRON_SECRET` | `run_weekly_digest.sh` | No (skip if absent) |
| `APP_BASE_URL` | `run_weekly_digest.sh` | Yes (needed when digest runs) |
| `SCRAPER_USER_AGENT` | Python scrapers (via `common/config.py`) | No |
| `SCRAPER_LOG_DIR` | Python scrapers | No |

---

## 6. Dependencies & interactions

**Blocked by:**
- T06: `run_weekly_verra.sh` must exist.
- T07: `run_weekly_gfw.sh` must exist (with its GFW_API_KEY guard).
- T08: `run_monthly_idxcarbon.sh` must exist.
- T09: `run_daily_score.sh` must exist.
- T17: `/api/digest/cron` endpoint must exist for `run_weekly_digest.sh` to call.

**Soft dependencies (parallel specs):**
- T20 (`pg-backup.sh`): Referenced in crontab. If not yet landed, installer warns but does not abort.
- T22 (`pg-restore-drill.sh`): Referenced in crontab. Same treatment.

**Files owned by T19** (implementer must not edit these in other stories):
- `scrapers/scripts/run_weekly_digest.sh`
- `scrapers/scripts/install-crontab.sh`
- `scrapers/scripts/karbonlens.crontab`
- `scrapers/scripts/logrotate.d-karbonlens`
- `docs/runbooks/cron-install.md`

**VPS-side state modified** (not repo files):
- `karbonlens` user crontab
- `/etc/logrotate.d/karbonlens`
- `/opt/karbonlens/.env` (created or augmented)
- `/opt/karbonlens/scripts` symlink

---

## 7. Edge cases & failure modes

- **Previous crontab exists:** `install-crontab.sh` detects an existing crontab via `sudo crontab -l -u karbonlens 2>/dev/null`. Without `--force`, it prints a warning and prompts `y/n`. With `--force`, it overwrites silently. The installer never merges — it always replaces with the contents of `karbonlens.crontab`.

- **`/opt/karbonlens/scripts` exists as a plain directory:** The symlink creation (`ln -sfn`) would silently create the symlink *inside* the existing directory instead of replacing it. The runbook documents the explicit cleanup: `rm -rf /opt/karbonlens/scripts` before running `ln -sfn`. The installer does not handle this automatically.

- **Cron environment vs shell environment:** Cron provides a minimal `PATH` and no shell profile. All six wrapper scripts must call `set -a; source /opt/karbonlens/.env; set +a` before invoking any Python module or curl. They must not rely on variables set in `/home/karbonlens/.bashrc` or `/etc/environment`. AC-3 verifies this explicitly by running each script with only the cron `PATH`.

- **DST / timezone correctness:** All times in `karbonlens.crontab` are UTC. The VPS system clock must be UTC (`timedatectl | grep "Time zone"` should show `UTC`). WIB is UTC+7 with no DST transition — the WIB equivalents in the crontab comments are stable year-round.

- **T20 / T22 scripts not yet on disk:** `install-crontab.sh` iterates over script paths found in the crontab (lines matching `0 [0-9]* * * *`) and checks each path's existence with `[[ -f "$path" ]]`. Missing paths produce a warning to stderr but do not cause the installer to exit non-zero. The crontab is installed regardless; cron will log errors for the missing scripts until T20/T22 land.

- **Log volume:** Each scraper run produces approximately 100 JSON log lines (~10 KB). Seven jobs per week × 4 weeks before rotation = ~280 KB per log file before compression. Weekly rotation with `compress` keeps disk usage negligible on the CX32.

- **Cron email spam before keys are provisioned:** `MAILTO=""` in the crontab suppresses cron's default mail-on-output behaviour. Wrappers for GFW and digest additionally exit 0 when their keys are absent, so even if `MAILTO` were enabled, there would be no output to mail.

- **`run_weekly_digest.sh` HTTP failure:** A non-2xx response from Netlify (e.g. 500 from a Resend outage) causes the script to exit 1. Cron logs this to `/var/log/karbonlens/digest.log`. The retry happens naturally the following Monday. This is acceptable for v0.1; Healthchecks.io alerting is deferred to v0.2.

---

## 8. Definition of done

- [ ] All acceptance criteria pass (verified on the Hetzner CX32 VPS).
- [ ] `shellcheck scrapers/scripts/*.sh` exits 0.
- [ ] All four new repo files landed in `feature/v0.1-impl`.
- [ ] `docs/runbooks/cron-install.md` exists with copy-pasteable install steps.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] TASKS.md status flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

- **systemd timers vs cron:** Architecture §4 and §11 specify cron for v0.1. This story sticks with cron. A v0.2 migration to systemd timers would give better failure tracking (`systemctl status`) and per-unit log streams (`journalctl -u karbonlens-verra`). No decision needed for v0.1.

- **Cron time zone on VPS:** The crontab uses UTC times and the VPS must be set to UTC. If Andy ever changes `timedatectl set-timezone Asia/Jakarta`, all cron times would silently shift. The runbook should warn Andy not to change the system timezone. No code change needed; document only.

- **flock for overlap prevention:** Scrapers are idempotent (`ON CONFLICT DO UPDATE`). Staggered timing (30-minute gaps between Monday scraper runs) makes overlap unlikely. No flock wrappers for v0.1. If a scraper ever takes >30 minutes, revisit.

- **`pg-backup.sh` and `pg-restore-drill.sh` paths:** These scripts are referenced in the crontab at `/opt/karbonlens/scripts/pg-backup.sh` and `/opt/karbonlens/scripts/pg-restore-drill.sh`. T20 and T22 must land these files in `scrapers/scripts/` (so the symlink resolves them). Andy to confirm this is the agreed path before T20/T22 are specced.

- **Digest endpoint URL:** `run_weekly_digest.sh` constructs the URL from `APP_BASE_URL` + `/api/digest/cron`. T17's endpoint is at `POST /api/digest/cron` (per architecture §6 table). Confirm with T17 implementer that this path matches what was shipped.

---

## 10. References

- Architecture §4 — Cron schedule and scraper patterns.
- Architecture §7 — Environment variables, `/opt/karbonlens/.env` file specification.
- Architecture §10 — Operational notes: backups, monitoring.
- `docs/runbooks/vps-setup.md` — T01 runbook; §8 creates `/opt/karbonlens/`, `/var/log/karbonlens/`.
- T17 story — digest endpoint; `DIGEST_CRON_SECRET` and `APP_BASE_URL` env vars.
- T20 story — `pg-backup.sh` (parallel spec).
- T22 story — `pg-restore-drill.sh` (parallel spec).
- Existing wrappers: `scrapers/scripts/run_weekly_verra.sh`, `run_weekly_gfw.sh`, `run_monthly_idxcarbon.sh`, `run_daily_score.sh`.
