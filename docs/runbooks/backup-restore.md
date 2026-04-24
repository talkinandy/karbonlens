# Backup & restore runbook — KarbonLens

Covers daily `pg_dump` backups, 14-day local retention, weekly restore drill, and

---

## 1. One-time setup

### 1.1 Verify `/opt/karbonlens/.env` exports `PGPASSWORD`

Both scripts `source /opt/karbonlens/.env`. Confirm `PGPASSWORD` is set to the
same value used in `DATABASE_URL`:

```bash
sudo grep -c '^PGPASSWORD=' /opt/karbonlens/.env   # must print 1
```

If missing, edit `/opt/karbonlens/.env` (owned by `karbonlens:karbonlens`,
mode `0640`) and add `PGPASSWORD=<password>`.

### 1.2 Verify the backup directory is a volume-backed symlink

T01 creates `/var/lib/karbonlens/backups/`; T20 converts it to a symlink to
the Hetzner volume:

```bash
ls -la /var/lib/karbonlens/backups
# Expect: lrwxrwxrwx ... backups -> /mnt/HC_Volume_105261137/karbonlens-backups
```

If the path is a plain directory (not a symlink), run the one-time migration:

```bash
sudo mkdir -p /mnt/HC_Volume_105261137/karbonlens-backups
sudo chown karbonlens:karbonlens /mnt/HC_Volume_105261137/karbonlens-backups
sudo chmod 750 /mnt/HC_Volume_105261137/karbonlens-backups
sudo mv /var/lib/karbonlens/backups/* /mnt/HC_Volume_105261137/karbonlens-backups/ 2>/dev/null || true
sudo rm -rf /var/lib/karbonlens/backups
sudo ln -s /mnt/HC_Volume_105261137/karbonlens-backups /var/lib/karbonlens/backups
```

### 1.3 Sudo access for the restore drill

The drill uses `sudo -u postgres` for `createdb` and `DROP DATABASE`. Verify:

```bash
sudo -u postgres psql -c "SELECT 1;"   # must succeed without a password prompt
```

### 1.4 Install cron entries

T19 owns `karbonlens.crontab` in the scrapers tree and installs it via
`install-crontab.sh`. T20 does NOT modify T19's crontab; it ships a separate
snippet at `/opt/karbonlens/scripts/pg-cron.conf` that is appended to the
same karbonlens user crontab:

```bash
# Back up current crontab for safety
sudo crontab -u karbonlens -l > /tmp/karbonlens-crontab.before

# Append pg-cron entries (idempotent: use grep to avoid double-appending)
if ! sudo crontab -u karbonlens -l 2>/dev/null | grep -q pg-backup.sh; then
  ( sudo crontab -u karbonlens -l 2>/dev/null;
    cat /opt/karbonlens/scripts/pg-cron.conf ) \
    | sudo crontab -u karbonlens -
fi

# Verify both entries are now present
sudo crontab -u karbonlens -l | grep -E 'pg-backup|pg-restore-drill'
```

To remove: re-run `crontab -u karbonlens -` with the pg lines filtered out.

---

## 2. Manual backup run

```bash
sudo -u karbonlens /opt/karbonlens/scripts/pg-backup.sh
```

Verify:

```bash
ls -lh /var/lib/karbonlens/backups/
tail -5 /var/log/karbonlens/backup.log
# Expect a JSON line: {"ts":"…","event":"backup_done","file":"…karbonlens-YYYY-MM-DD.dump","size":…}
file /var/lib/karbonlens/backups/karbonlens-*.dump | head -1
# Expect: "PostgreSQL custom database dump"  (NOT "gzip compressed data")
```

Expected size: 5–30 MB compressed (pg_dump -Fc zlib level 6 over a 50–200 MB DB).

---

## 3. Run the restore drill

```bash
sudo /opt/karbonlens/scripts/pg-restore-drill.sh
```

What passing output looks like:

```
Using backup: /var/lib/karbonlens/backups/karbonlens-2026-04-22.dump
…(pg_restore output)…
PASS projects: restored=64, live=64
PASS satellite_alerts: restored=247000, live=247004, delta=4 (0% <= 1%)
PASS issuances: restored=307, live=307
PASS idx_monthly_snapshots: restored=10, live=10
PASS regulatory_events: restored=8, live=8
PASS project_scores: restored=64, live=64
PASS users: restored=1, live=1
PASS projects.MAX(id): 64
Results: 8 PASS, 0 FAIL
```

The throwaway database `kl_restore_drill_<PID>` is dropped on exit (EXIT
trap in the script). If you see stale `kl_restore_drill_*` databases after
a crashed run, remove them manually:

```bash
sudo -u postgres psql -c "\l" | grep kl_restore_drill
sudo -u postgres psql -c "DROP DATABASE kl_restore_drill_12345;"
```

### If the drill FAILs

- `FAIL projects: restored=0, live=64` — restore did not populate tables.
  Check `pg_restore` stderr from the run (look for missing extensions like
  `postgis`, `pgcrypto`, `pg_trgm`). The drill uses `--no-owner --no-privileges`
  so ownership mismatches are expected and non-fatal.
- `FAIL satellite_alerts … > 1%` — backup may be much older than one day,
  or a large scrape landed between backup and drill. Investigate the backup
  file's mtime (`ls -lt /var/lib/karbonlens/backups/`).
- `FAIL projects.MAX(id)` — FK truncation or sequence mismatch. Open an
  incident and stop further backups from overwriting this one until diagnosed
  (`mv karbonlens-YYYY-MM-DD.dump karbonlens-YYYY-MM-DD.dump.quarantine`).

---

## 4. Restore a specific backup manually

```bash
# Pick a backup
ls -lht /var/lib/karbonlens/backups/

# Create a target DB as postgres superuser (karbonlens role has no CREATEDB)
TARGET=karbonlens_restored_20260422
sudo -u postgres psql -c "CREATE DATABASE ${TARGET} OWNER karbonlens;"

# pg_restore reads pg_dump custom format directly — no gunzip needed
PGPASSWORD=$(sudo grep ^PGPASSWORD= /opt/karbonlens/.env | cut -d= -f2-) \
  pg_restore -h localhost -U karbonlens -d "${TARGET}" \
    --no-owner --no-privileges \
    /var/lib/karbonlens/backups/karbonlens-YYYY-MM-DD.dump

# Verify
sudo -u postgres psql -d "${TARGET}" -c "SELECT COUNT(*) FROM projects;"

# Drop when done
sudo -u postgres psql -c "DROP DATABASE ${TARGET};"
```

---

## 5. Disaster recovery (worst case: full DB loss)

1. Stop all scrapers / cron:
   ```bash
   sudo systemctl stop cron
   ```
2. Restore the latest backup into the live database (DESTRUCTIVE):
   ```bash
   sudo -u postgres psql -c "DROP DATABASE karbonlens;"
   sudo -u postgres psql -c "CREATE DATABASE karbonlens OWNER karbonlens;"
   LATEST=$(ls -t /var/lib/karbonlens/backups/karbonlens-*.dump | head -1)
   PGPASSWORD=$(sudo grep ^PGPASSWORD= /opt/karbonlens/.env | cut -d= -f2-) \
     pg_restore -h localhost -U karbonlens -d karbonlens \
       --no-owner --no-privileges "${LATEST}"
   ```
3. Re-enable extensions if lost:
   ```bash
   sudo -u postgres psql -d karbonlens -c "CREATE EXTENSION IF NOT EXISTS postgis;"
   sudo -u postgres psql -d karbonlens -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
   sudo -u postgres psql -d karbonlens -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
   ```
4. Replay scrapers for the days between backup mtime and now:
   - `sudo -u karbonlens /opt/karbonlens/scripts/run_weekly_verra.sh`
   - `sudo -u karbonlens /opt/karbonlens/scripts/run_weekly_gfw.sh`
   - `sudo -u karbonlens /opt/karbonlens/scripts/run_daily_score.sh`
5. Resume cron:
   ```bash
   sudo systemctl start cron
   ```
6. Run the restore drill against the rehydrated DB to confirm row counts.

---

## 6. Troubleshooting

### `ERROR: /opt/karbonlens/.env not found`
T19 has not yet deployed. Run `scrapers/scripts/install-crontab.sh` first.

### `flock: already running`
Another `pg-backup.sh` is already executing (long-running pg_dump, or a
previous run hung). Check with `pgrep -af pg-backup.sh` and `ps -ef | grep
pg_dump`. Safe to leave — the lock releases when the process exits.

### Volume near full
```bash
df -h /mnt/HC_Volume_105261137
ls -lht /var/lib/karbonlens/backups/
# Temporary aggressive cleanup (keep last 7 days instead of 14):
sudo -u karbonlens find /var/lib/karbonlens/backups \
  -maxdepth 1 -name 'karbonlens-*.dump' -mtime +7 -print -delete
```

### Backup permissions broken
```bash
sudo chown karbonlens:karbonlens /mnt/HC_Volume_105261137/karbonlens-backups
sudo chmod 750 /mnt/HC_Volume_105261137/karbonlens-backups
```

### Postgres offline at cron time
```bash
sudo systemctl status postgresql
sudo journalctl -u postgresql -n 50 --no-pager
sudo systemctl start postgresql
```
The backup script exits non-zero on pg_dump failure; the trap cleans the
partial file. Tomorrow's run catches up automatically.

### Stale `.dump.partial` file
Indicates a previous run crashed after the trap cleared (SIGKILL, power loss).
Safe to remove manually:
```bash
sudo -u karbonlens rm -f /var/lib/karbonlens/backups/*.dump.partial
```

---

## 7. Monitoring (v0.1)

T19 sets `MAILTO=""` — cron does NOT email on failure. v0.1 relies on manual
log inspection. Check daily:

```bash
tail -3 /var/log/karbonlens/backup.log
ls -lht /var/lib/karbonlens/backups/ | head -3
```

A healthy system shows a `backup_done` JSON line within the last 24 h and the
newest `.dump` file dated today (UTC).

Healthchecks.io heartbeat alerting is deferred to v0.2 (T20 §9 OQ-5).
