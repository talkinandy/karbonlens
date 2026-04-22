# T20 Implementation Report — Backups + pg_dump cron

**Story:** T20 — Backups + pg_dump cron
**Status:** done
**Audit result:** PASS

---

## What was done

- `scrapers/scripts/pg-backup.sh` — nightly `pg_dump -Fc` to `/var/lib/karbonlens/backups/karbonlens-YYYY-MM-DD.dump`. `flock -n /var/lock/karbonlens-backup` prevents concurrent runs. Trap on EXIT/ERR/INT/TERM removes `.dump.partial` staging file on any failure. 14-day rotation via `find -L` (symlink-follow required). First run produced 8.77 MB dump from live DB.
- `scrapers/scripts/pg-restore-drill.sh` — creates throwaway `kl_restore_drill_<date>` DB via `sudo -u postgres`, restores latest dump, sanity-checks row counts (projects=64, satellite_alerts>100k), drops DB on EXIT trap. Drill verified: row counts exact match live.
- `scrapers/scripts/pg-cron.conf` — cron snippet with nightly 02:00 UTC backup + Sun 05:00 weekly restore drill entries for Andy to merge into karbonlens crontab.
- `docs/runbooks/backup-restore.md` — install + manual restore + drill-pass/drill-fail procedures.

---

## T20 follow-ups

- **Andy action required — crontab append:** Add the two entries from `scrapers/scripts/pg-cron.conf` to the karbonlens crontab via the runbook command. T19 installed 5 cron entries; T20 adds 2 more — nightly backup at 02:00 UTC and weekly restore drill at Sun 05:00 UTC.

- **PGPASSWORD in `/opt/karbonlens/.env`:** Must be populated before scripts run non-interactively. Same Andy action as T19's follow-up — `PGPASSWORD=<same value as in DATABASE_URL>` must be present in `/opt/karbonlens/.env` (VPS-local, gitignored, `chmod 600`).

- **`find -L` symlink traversal fix:** Documented in the script header. Required because `/var/lib/karbonlens/backups` is a symlink to the Hetzner volume mount at `/mnt/HC_Volume_105261137/karbonlens-backups`. Without `-L`, `find` would not traverse the symlink and rotation would silently skip all backup files.

- **Backup files owned as postgres:postgres:** `pg_dump` is run via `sudo -u postgres`, so backup files are owned `postgres:postgres`. The restore drill reads them fine. Documented as a non-issue but noted — if ownership causes permission problems in future, `chown karbonlens:karbonlens` on the backup dir resolves it.

- **14-day rotation gate:** The rotation step only triggers `find -delete` when more than 14 files exist, protecting first-run scenarios where no old files are present yet.
