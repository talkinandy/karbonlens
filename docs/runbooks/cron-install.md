# Cron install runbook — KarbonLens (T19)

Operator: Andy. Target: Hetzner CX32 VPS. OS user: `karbonlens`.

This runbook installs the 5-entry cron schedule that drives all periodic jobs for KarbonLens v0.1: Verra, GFW, IDXCarbon, score compute, and the weekly digest email. All schedule times are UTC — WIB equivalents (UTC+7) are in the crontab comments.

`pg-backup` (T20) and `pg-restore-drill` (T22) are tracked in their own stories and are not installed by T19. The two T33 cron entries (nightly IndexNow, weekly Market Wrap) are also separate and are installed manually per [`content-cadence.md`](content-cadence.md). Full installed state on a Phase-5 box: **9 cron entries** (5 from T19 + 2 from T20 + 2 from T33).

## 1. Prerequisites

- Root (or sudo) access on the VPS.
- Repo cloned somewhere readable by root (path does not matter; `install-crontab.sh` rsyncs scripts out of the repo into `/opt/karbonlens/scripts/`).
- T01 completed: `karbonlens` OS user exists, `/opt/karbonlens/` and `/var/log/karbonlens/` directories exist, both owned `karbonlens:karbonlens`.
- `rsync`, `timedatectl`, and standard `crontab` tools installed (all base Ubuntu).

Verify:

```bash
id karbonlens                                    # user exists
ls -ld /opt/karbonlens /var/log/karbonlens       # both owned karbonlens:karbonlens
timedatectl show -p Timezone --value             # must print: UTC (or Etc/UTC)
```

If the timezone is not UTC:

```bash
sudo timedatectl set-timezone UTC
```

## 2. First-run install (bootstraps .env from template)

From the repo root, as root:

```bash
sudo scrapers/scripts/install-crontab.sh
```

The first run detects that `/opt/karbonlens/.env` is absent, copies `scrapers/scripts/env.template` there, generates a fresh random `DIGEST_CRON_SECRET`, sets `chmod 640` and `chown karbonlens:karbonlens`, prints instructions, and exits 0 without installing the crontab.

Populate the remaining secrets:

```bash
sudo -u karbonlens nano /opt/karbonlens/.env
# Set real values for:
#   DATABASE_URL, PGPASSWORD, GFW_API_KEY, RESEND_API_KEY, APP_BASE_URL
#
# DIGEST_CRON_SECRET was already generated freshly on bootstrap — copy it
# to the Next.js deploy env so the server accepts the cron's bearer token.
#
# SCRAPER_LOG_DIR and SCRAPER_USER_AGENT can stay at defaults.
```

Keys that are not yet provisioned can remain at `CHANGE_ME`; the wrappers for GFW and the digest will log a SKIP line and exit 0 gracefully. Re-run the installer to complete the setup.

## 3. Second run (installs the crontab)

```bash
sudo scrapers/scripts/install-crontab.sh
```

This run performs, in order:

1. Timezone check (aborts if not UTC).
2. `.env` present — skip bootstrap.
3. `rsync -a --chown=karbonlens:karbonlens scrapers/scripts/ /opt/karbonlens/scripts/` (excludes the installer, env.template, crontab file itself, and logrotate.conf).
4. Copies `logrotate.conf` to `/etc/logrotate.d/karbonlens` (0644, root:root).
5. Warns for every cron entry referencing a script that is not on disk. With the T19 crontab all 5 referenced scripts ship in this story, so there should be no warnings.
6. `crontab -u karbonlens scrapers/scripts/karbonlens.crontab`. If an existing crontab is detected, prompts for confirmation (use `--force` to skip).
7. Diffs the installed crontab against the source to verify.

Expected output tail:

```
[install-crontab] installing crontab for user karbonlens
[install-crontab] verified: crontab -l -u karbonlens matches .../karbonlens.crontab
[install-crontab] done. Review logs: /var/log/karbonlens/
```

## 4. Verify

### 4a. Five cron entries installed

```bash
sudo crontab -l -u karbonlens | grep -cE '^[0-9*]'
# Expected: 5
```

Full listing:

```bash
sudo crontab -l -u karbonlens
# Expected: MAILTO="" + 5 schedule lines for digest / verra / gfw / idxcarbon / score.
```

### 4b. Scripts deployed and accessible by karbonlens

```bash
sudo -u karbonlens ls -la /opt/karbonlens/scripts/
# Expected: run_weekly_verra.sh run_weekly_gfw.sh run_weekly_digest.sh
#           run_daily_score.sh run_monthly_idxcarbon.sh (+x, karbonlens:karbonlens)
stat -c "%U:%G %a" /opt/karbonlens/scripts
# Expected: karbonlens:karbonlens 755
```

### 4c. .env permissions

```bash
stat -c "%a %U:%G" /opt/karbonlens/.env
# Expected: 640 karbonlens:karbonlens
```

### 4d. Logrotate dry-run

```bash
sudo logrotate -d /etc/logrotate.d/karbonlens
# Exit 0; output describes weekly rotation, 4 copies, compressed,
# create mode 640 karbonlens karbonlens, su karbonlens karbonlens.
```

### 4e. Cron parse errors

```bash
sudo grep -i "karbonlens" /var/log/syslog | grep -iE "error|bad|invalid"
# Expected: empty output (no parse errors from cron).
```

### 4f. Manual wrapper invocation (optional smoke test)

```bash
# As karbonlens, with the minimal cron PATH:
sudo -u karbonlens env -i \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    /opt/karbonlens/scripts/run_weekly_digest.sh
# With RESEND_API_KEY unset / CHANGE_ME: logs digest_skip to /var/log/karbonlens/digest.log; exit 0.
```

## 5. Cron schedule summary

| When (UTC) | WIB | Job |
|---|---|---|
| Mon 00:00 | Mon 07:00 | Weekly digest curl (T17 endpoint) |
| Mon 03:00 | Mon 10:00 | Verra scraper |
| Mon 03:30 | Mon 10:30 | GFW alerts scraper |
| Monthly 1st 04:00 | 11:00 | IDXCarbon PDF |
| Daily 04:00 | 11:00 | Score compute |

All times UTC; VPS system clock must remain UTC (see §1). WIB is UTC+7 year-round (no DST).

On the 1st of every month, IDXCarbon (04:00 UTC) and the daily score job (04:00 UTC) both fire at the same minute. The score job reads persisted DB state and completes in seconds; IDXCarbon writes via `ON CONFLICT DO UPDATE`, so re-ordering is safe. On Mondays, score fires 30 min after GFW (03:30) — ample margin for normal runs.

## 6. Operating notes

- **MAILTO="" silences cron mail.** All cron failures land in `/var/log/karbonlens/<job>.log` only. Check weekly or when something looks off. Healthchecks.io heartbeat alerting is a v0.2 item.
- **Updating a wrapper script:** After `git pull` that changes any `scrapers/scripts/*.sh`, re-run `sudo scrapers/scripts/install-crontab.sh` to push the updated file into `/opt/karbonlens/scripts/` via rsync. The crontab itself is re-installed (idempotent) but stays unchanged unless `karbonlens.crontab` itself was edited.
- **Graceful-degradation wrappers:** `run_weekly_digest.sh` skips when `RESEND_API_KEY` or `DIGEST_CRON_SECRET` is empty / `CHANGE_ME`. `run_weekly_gfw.sh` skips when `GFW_API_KEY` is empty / `CHANGE_ME`. Both exit 0 and log a single JSON/plain skip line. Populating the keys in `/opt/karbonlens/.env` is the only action needed to turn them back on; no re-install.
- **pg-backup / pg-restore-drill:** Tracked by T20 and T22. Not installed here. When those stories land they will add their own cron lines (or extend `karbonlens.crontab` in a future PR).
- **Logrotate:** Runs weekly via the system logrotate.timer. `su karbonlens karbonlens` ensures the rotated-in file is owned correctly for the next `karbonlens` cron run.

## 7. Uninstall

```bash
sudo crontab -r -u karbonlens
sudo rm -f /etc/logrotate.d/karbonlens
# /opt/karbonlens/scripts/ and /opt/karbonlens/.env are left in place.
```

## 8. Troubleshooting

**`install-crontab.sh` aborts "system timezone is not UTC":** run `sudo timedatectl set-timezone UTC` and retry.

**Wrapper logs show "ENV_FILE not found":** `/opt/karbonlens/.env` got deleted. Re-run `install-crontab.sh` to bootstrap from the template.

**Digest cron fires but receives HTTP 401:** `DIGEST_CRON_SECRET` in `/opt/karbonlens/.env` (scraper side) does not match the value in `/opt/karbonlens/app/.env.local` (app side). Set both to the same value and restart the app service.

**Digest cron fires but receives HTTP 503:** The app is missing `RESEND_API_KEY` or `DIGEST_CRON_SECRET`. Set both in `/opt/karbonlens/app/.env.local` and restart the app service.

## 9. References

- Architecture: §4 (cron schedule), §7 (env vars), §10 (ops notes)
- T17 digest route: `app/api/digest/route.ts`
- Sibling wrappers: `scrapers/scripts/run_weekly_verra.sh`, `run_weekly_gfw.sh`, `run_monthly_idxcarbon.sh`, `run_daily_score.sh`
