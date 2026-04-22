---
id: T20
title: Backups + pg_dump cron
phase: 4
status: draft
blocked_by: [T01]
blocks: []
owner: ""
effort_estimate: 1h
---

## 1. User story

As Andy (sole operator of the KarbonLens VPS), I want nightly database backups running automatically with 14-day local retention, so that a disk failure or accidental data loss can be recovered from the most recent backup without manual intervention.

---

## 2. Context & rationale

The live database holds 64 projects, 246,576 satellite alerts, 307 issuances, 10 IDXCarbon snapshots, 8 regulatory events, 64 project scores, and associated user sessions — in aggregate 50–200 MB uncompressed. There is no replication, no read replica, and no point-in-time recovery. The only safety net is `pg_dump`.

T01 created `/var/lib/karbonlens/backups/` on the root filesystem. The Hetzner volume `/mnt/HC_Volume_105261137` (25 GB, 16 GB free) is the better home for backup files: the root filesystem is shared with the OS and is smaller, while the volume is dedicated data storage. T20 moves backup storage to the volume and makes the original path a symlink so that any code or runbook referencing `/var/lib/karbonlens/backups/` continues to work unchanged.

T19 owns all crontab entries; T20 produces the scripts and documents the exact cron line that T19 will install.

Encryption at rest is deferred to v0.2. Hetzner volumes are encrypted at the storage layer (Ceph-level AES) on standard hardware, and this is a single-tenant box with no untrusted co-tenants at the application level. This is acceptable for v0.1 and is flagged as an open question below.

---

## 3. Scope

### In scope

#### 3.1 Backup directory — move to volume with symlink

**Decision: symlink approach.** Move the actual backup directory to the volume and replace the original path with a symlink. All scripts and runbooks reference `/var/lib/karbonlens/backups/` as before; no path changes needed in application code.

Steps (documented here; implemented manually on VPS or via runbook):

```bash
# Create the target directory on the volume
mkdir -p /mnt/HC_Volume_105261137/karbonlens-backups
chown karbonlens:karbonlens /mnt/HC_Volume_105261137/karbonlens-backups
chmod 750 /mnt/HC_Volume_105261137/karbonlens-backups

# Move any existing backup files (if present)
mv /var/lib/karbonlens/backups/* /mnt/HC_Volume_105261137/karbonlens-backups/ 2>/dev/null || true

# Replace the original directory with a symlink
rmdir /var/lib/karbonlens/backups
ln -s /mnt/HC_Volume_105261137/karbonlens-backups /var/lib/karbonlens/backups

# Verify the symlink resolves correctly
ls -la /var/lib/karbonlens/backups
# Expected: lrwxrwxrwx ... /var/lib/karbonlens/backups -> /mnt/HC_Volume_105261137/karbonlens-backups
```

The volume must be mounted before Postgres starts (it is mounted at boot via `/etc/fstab`; this is already the case from T01). The backup script does not need to know about the volume path.

#### 3.2 Backup script — `scrapers/scripts/pg-backup.sh`

Create this file in the repo. It is deployed to `/opt/karbonlens/scripts/pg-backup.sh` on the VPS (T19 handles the `chmod +x` and any cron wiring).

```bash
#!/usr/bin/env bash
# pg-backup.sh — nightly pg_dump for the karbonlens database.
# Run as: sudo -u karbonlens /opt/karbonlens/scripts/pg-backup.sh
# Cron line (installed by T19):
#   0 2 * * * karbonlens /opt/karbonlens/scripts/pg-backup.sh >> /var/log/karbonlens/backup.log 2>&1

set -euo pipefail

# Source env vars (PGPASSWORD lives here; file is chmod 600, karbonlens-owned)
# shellcheck source=/dev/null
source /opt/karbonlens/.env

BACKUP_DIR=/var/lib/karbonlens/backups
LOG_FILE=/var/log/karbonlens/backup.log
DATE=$(date -u +%Y-%m-%d)
BACKUP_FILE="${BACKUP_DIR}/karbonlens-${DATE}.sql.gz"
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

log() {
  echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"$1\",\"file\":\"${BACKUP_FILE}\"}"
}

log "backup_start"

# pg_dump in custom format, piped through gzip.
# -Fc = custom (binary) format; supports parallel restore and selective table restore.
# PGPASSWORD is exported by /opt/karbonlens/.env.
if pg_dump -Fc -h localhost -U karbonlens karbonlens | gzip > "${BACKUP_FILE}"; then
  SIZE=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || echo 0)
  log "backup_ok" | sed "s/}$/,\"size_bytes\":${SIZE}}/"
else
  EXIT_CODE=$?
  log "backup_failed"
  # Remove partial file if pg_dump failed mid-write
  rm -f "${BACKUP_FILE}"
  exit ${EXIT_CODE}
fi

# Rotation: delete backup files older than 14 days.
find "${BACKUP_DIR}" -name 'karbonlens-*.sql.gz' -mtime +14 -delete
log "rotation_done"
```

Key design decisions:
- `set -euo pipefail` — any subcommand failure aborts the script and exits non-zero, which cron captures.
- UTC date suffix (`date -u`) — prevents off-by-one on date rollover around midnight in Asia/Jakarta (UTC+7). Files sort lexicographically by date.
- Same-day re-run overwrites the file (same filename) — no duplicate accumulation.
- Partial file cleanup on `pg_dump` failure — prevents a zero-byte or truncated `.sql.gz` from being mistaken for a valid backup.
- Custom format (`-Fc`) + gzip — produces a compressed file that `pg_restore` can consume. The file command will show `gzip compressed data` on the outer wrapper; the inner stream is pg_dump custom format.

**Note on PGPASSWORD:** `/opt/karbonlens/.env` must export `PGPASSWORD`. This file is VPS-local, gitignored, `chmod 600`, owned by `karbonlens:karbonlens`. It is never committed to the repository. `.env.example` documents the variable name only.

#### 3.3 Restore drill script — `scrapers/scripts/pg-restore-drill.sh`

```bash
#!/usr/bin/env bash
# pg-restore-drill.sh — verify the latest backup is restorable and row counts match.
# Run as: sudo -u karbonlens /opt/karbonlens/scripts/pg-restore-drill.sh
# Exit 0 iff counts match within tolerance.

set -euo pipefail

# shellcheck source=/dev/null
source /opt/karbonlens/.env

BACKUP_DIR=/var/lib/karbonlens/backups
TEST_DB=karbonlens_restoretest

# Find the most recent backup file
LATEST=$(ls -t "${BACKUP_DIR}"/karbonlens-*.sql.gz 2>/dev/null | head -1)
if [ -z "${LATEST}" ]; then
  echo "ERROR: no backup files found in ${BACKUP_DIR}" >&2
  exit 1
fi
echo "Using backup: ${LATEST}"

# Drop + recreate the test database
psql -h localhost -U karbonlens -d postgres \
  -c "DROP DATABASE IF EXISTS ${TEST_DB};"
psql -h localhost -U karbonlens -d postgres \
  -c "CREATE DATABASE ${TEST_DB} OWNER karbonlens;"

# Restore (pg_restore reads pg_dump custom format; gunzip feeds it)
gunzip -c "${LATEST}" | pg_restore -h localhost -U karbonlens -d "${TEST_DB}" --no-owner --no-privileges

# Count rows in restored DB
get_count() {
  psql -h localhost -U karbonlens -d "${TEST_DB}" -tAc "SELECT COUNT(*) FROM $1;"
}

# Count rows in live DB
get_live_count() {
  psql -h localhost -U karbonlens -d karbonlens -tAc "SELECT COUNT(*) FROM $1;"
}

PASS=0
FAIL=0

check_table() {
  TABLE=$1
  TOLERANCE=${2:-0}   # default: exact match required
  RESTORED=$(get_count "${TABLE}")
  LIVE=$(get_live_count "${TABLE}")
  DELTA=$(( LIVE - RESTORED ))
  if [ ${DELTA} -lt 0 ]; then DELTA=$(( -DELTA )); fi

  if [ "${TOLERANCE}" -eq 0 ] && [ "${RESTORED}" -ne "${LIVE}" ]; then
    echo "FAIL ${TABLE}: restored=${RESTORED}, live=${LIVE}, delta=${DELTA}"
    FAIL=$(( FAIL + 1 ))
  elif [ "${TOLERANCE}" -gt 0 ]; then
    # Percentage tolerance check (integer arithmetic: DELTA*100/LIVE <= TOLERANCE)
    PCT=$(( DELTA * 100 / (LIVE + 1) ))   # +1 avoids divide-by-zero
    if [ "${PCT}" -le "${TOLERANCE}" ]; then
      echo "PASS ${TABLE}: restored=${RESTORED}, live=${LIVE}, delta=${DELTA} (${PCT}% <= ${TOLERANCE}%)"
      PASS=$(( PASS + 1 ))
    else
      echo "FAIL ${TABLE}: restored=${RESTORED}, live=${LIVE}, delta=${DELTA} (${PCT}% > ${TOLERANCE}%)"
      FAIL=$(( FAIL + 1 ))
    fi
  else
    echo "PASS ${TABLE}: restored=${RESTORED}, live=${LIVE}"
    PASS=$(( PASS + 1 ))
  fi
}

# Satellite alerts tolerate 1% drift (backup may predate an in-progress scrape run)
check_table projects          0
check_table satellite_alerts  1
check_table issuances         0
check_table idx_monthly_snapshots 0
check_table regulatory_events 0
check_table project_scores    0
check_table users             0

# Always drop the test DB on exit (even on failure)
psql -h localhost -U karbonlens -d postgres \
  -c "DROP DATABASE IF EXISTS ${TEST_DB};" 2>/dev/null || true

echo "Results: ${PASS} PASS, ${FAIL} FAIL"
if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi
exit 0
```

#### 3.4 Runbook — `docs/runbooks/backup-and-restore.md`

A new runbook file. Content is specified in §5 (Inputs & outputs) below.

#### 3.5 Cron line (informational — installed by T19)

T19 owns `/etc/cron.d/karbonlens`. T20 documents the exact line T19 should add:

```
0 2 * * * karbonlens /opt/karbonlens/scripts/pg-backup.sh >> /var/log/karbonlens/backup.log 2>&1
```

This fires at 02:00 UTC (09:00 Asia/Jakarta) daily, running as the `karbonlens` Unix user.

### Out of scope (explicit non-goals)

- `pg_dumpall` — we have a single database; per-database `pg_dump` is sufficient.
- Point-in-time recovery / WAL archiving — v0.2. Requires significant PostgreSQL configuration changes.
- Off-site replication (rsync to Hetzner Storage Box or S3/B2) — v0.2. v0.1 = on-box only.
- Encrypted backups — v0.2. See §9, OQ-1.
- Incremental or differential backups — out of scope for v0.1.
- Automatic restore from backup on failure — manual recovery only per runbook.
- Healthchecks.io or external alerting for backup failures — v0.2.

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Manual run exits 0 and creates a dated file**
```
Given /opt/karbonlens/.env exports PGPASSWORD
 And karbonlens Postgres role can connect on localhost
 And /var/lib/karbonlens/backups/ is writable by karbonlens
When sudo -u karbonlens /opt/karbonlens/scripts/pg-backup.sh
Then the exit code is 0
 And a file matching /var/lib/karbonlens/backups/karbonlens-YYYY-MM-DD.sql.gz exists
 And the file size is > 10MB (reflecting 50-200 MB uncompressed DB)
 And the backup.log contains a JSON line with "backup_ok"
```

**AC-2: Same-day re-run overwrites — no duplicate**
```
Given a backup file karbonlens-<today>.sql.gz already exists in BACKUP_DIR
When sudo -u karbonlens /opt/karbonlens/scripts/pg-backup.sh
Then the exit code is 0
 And ls BACKUP_DIR | grep <today> | wc -l equals 1 (one file, not two)
 And the file mtime is updated
```

**AC-3: Rotation removes files older than 14 days**
```
Given 20 dummy files named karbonlens-YYYY-MM-DD.sql.gz are created in BACKUP_DIR
 And all 20 files have mtime set to 15-35 days ago (touch -d "N days ago")
 And the current backup file for today also exists
When sudo -u karbonlens /opt/karbonlens/scripts/pg-backup.sh
Then all 20 old dummy files are deleted
 And the today file is retained
 And any files with mtime <= 14 days would be retained (test with one at exactly 14 days)
```

**AC-4: Restore drill exits 0; row counts match within tolerance**
```
Given a valid backup file exists in BACKUP_DIR
 And the karbonlens Postgres role has CREATEDB privilege
When sudo -u karbonlens /opt/karbonlens/scripts/pg-restore-drill.sh
Then the exit code is 0
 And the output contains "PASS projects"
 And the output contains "PASS satellite_alerts" (within 1% tolerance)
 And the output contains "Results: N PASS, 0 FAIL"
 And the karbonlens_restoretest database is dropped before the script exits
```

**AC-5: /var/lib/karbonlens/backups is a symlink to the volume**
```
Given the volume /mnt/HC_Volume_105261137 is mounted
When stat /var/lib/karbonlens/backups
Then the path is a symbolic link (file type 'l')
 And the link target is /mnt/HC_Volume_105261137/karbonlens-backups
 And ls /var/lib/karbonlens/backups/ lists the actual backup files on the volume
```

**AC-6: Backup file is gzip-compressed**
```
Given a backup file karbonlens-YYYY-MM-DD.sql.gz was created by pg-backup.sh
When file /var/lib/karbonlens/backups/karbonlens-YYYY-MM-DD.sql.gz
Then the output contains "gzip compressed data"
When gunzip -c karbonlens-YYYY-MM-DD.sql.gz | file -
Then the output contains "PostgreSQL custom database dump"
```

**AC-7: Runbook commands execute as documented**
```
Given the runbook docs/runbooks/backup-and-restore.md is present
When each shell command block in the runbook is executed on the VPS as karbonlens or root
Then each command exits without an unhandled error
 And the outcome described in the runbook matches the observed system state
```

**AC-8: Bash scripts pass shellcheck**
```
Given scrapers/scripts/pg-backup.sh and scrapers/scripts/pg-restore-drill.sh are present
When shellcheck scrapers/scripts/pg-backup.sh scrapers/scripts/pg-restore-drill.sh
Then the exit code is 0 with no errors or warnings (or SC2148 suppressed via directive if needed)
```

---

## 5. Inputs & outputs

**Inputs:**
- `PGPASSWORD` — sourced from `/opt/karbonlens/.env` (VPS-local, never committed; already holds `DATABASE_URL` and other scraper env vars from T01/T06).
- Postgres role `karbonlens` with `CONNECT` on database `karbonlens` and `CREATEDB` (needed by the restore drill to create `karbonlens_restoretest`).
- `/var/lib/karbonlens/backups/` → symlink to `/mnt/HC_Volume_105261137/karbonlens-backups/` (set up during T20 deployment).
- Volume `/mnt/HC_Volume_105261137` — must be mounted at boot (already in `/etc/fstab` from T01).

**Outputs:**

| File / Path | Action | Notes |
|---|---|---|
| `scrapers/scripts/pg-backup.sh` | Create | Deployed to `/opt/karbonlens/scripts/pg-backup.sh` on VPS |
| `scrapers/scripts/pg-restore-drill.sh` | Create | Deployed to `/opt/karbonlens/scripts/pg-restore-drill.sh` on VPS |
| `docs/runbooks/backup-and-restore.md` | Create | Operator runbook |
| `/var/lib/karbonlens/backups` | Convert to symlink | Manual VPS step; backed by volume |
| `/mnt/HC_Volume_105261137/karbonlens-backups/` | Create dir | Volume-resident storage |
| `/var/log/karbonlens/backup.log` | Append | Structured JSON log lines per run |
| `/var/lib/karbonlens/backups/karbonlens-YYYY-MM-DD.sql.gz` | Create/overwrite daily | Backup file |

**Content of `docs/runbooks/backup-and-restore.md`** (T20 creates this file):

```markdown
# Backup and restore runbook — KarbonLens

## Manual backup run

```bash
sudo -u karbonlens /opt/karbonlens/scripts/pg-backup.sh
```

Verify:
```bash
ls -lh /var/lib/karbonlens/backups/
tail -5 /var/log/karbonlens/backup.log
```

## Check available disk on volume

```bash
df -h /mnt/HC_Volume_105261137
# Expected: ~16 GB free (25 GB volume). 14 × 200 MB = ~2.8 GB max retention footprint.
```

## Restore a specific backup to a target database

```bash
# List available backups
ls -lht /var/lib/karbonlens/backups/

# Restore to a named target DB (creates it first)
TARGET=karbonlens_restored_20260422
sudo -u postgres psql -c "CREATE DATABASE ${TARGET} OWNER karbonlens;"
gunzip -c /var/lib/karbonlens/backups/karbonlens-YYYY-MM-DD.sql.gz \
  | sudo -u karbonlens pg_restore -h localhost -U karbonlens -d ${TARGET} \
      --no-owner --no-privileges

# Verify
psql -h localhost -U karbonlens -d ${TARGET} -c "SELECT COUNT(*) FROM projects;"
```

## Run the restore drill

```bash
sudo -u karbonlens /opt/karbonlens/scripts/pg-restore-drill.sh
```

Exit 0 means row counts match within tolerance. Check output for PASS/FAIL per table.

## If Postgres is offline

```bash
systemctl status postgresql
journalctl -u postgresql -n 50 --no-pager
systemctl start postgresql
```

## If the backup directory is full or volume is nearly full

```bash
df -h /mnt/HC_Volume_105261137
ls -lht /var/lib/karbonlens/backups/
# Manually remove old files if needed, or increase rotation below 14 days temporarily
find /var/lib/karbonlens/backups -name 'karbonlens-*.sql.gz' -mtime +7 -delete
```

## If backup permissions break

```bash
chown karbonlens:karbonlens /mnt/HC_Volume_105261137/karbonlens-backups
chmod 750 /mnt/HC_Volume_105261137/karbonlens-backups
```

## Disaster recovery (worst case: full DB loss)

1. Stop all scrapers / cron if running.
2. Restore the latest backup to the live database:
   ```bash
   # WARNING: drops and recreates the live database
   sudo -u postgres psql -c "DROP DATABASE karbonlens;"
   sudo -u postgres psql -c "CREATE DATABASE karbonlens OWNER karbonlens;"
   LATEST=$(ls -t /var/lib/karbonlens/backups/karbonlens-*.sql.gz | head -1)
   gunzip -c "${LATEST}" \
     | sudo -u karbonlens pg_restore -h localhost -U karbonlens -d karbonlens \
         --no-owner --no-privileges
   ```
3. Re-enable extensions (PostGIS, pgcrypto, pg_trgm) if they were lost:
   ```bash
   sudo -u postgres psql -d karbonlens -c "CREATE EXTENSION IF NOT EXISTS postgis;"
   sudo -u postgres psql -d karbonlens -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
   sudo -u postgres psql -d karbonlens -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
   ```
4. Replay scrapers for the days since the backup:
   - `sudo -u karbonlens /opt/karbonlens/scripts/run_weekly_verra.sh`
   - `sudo -u karbonlens /opt/karbonlens/scripts/run_weekly_gfw.sh` (with `--since YYYY-MM-DD`)
   - `sudo -u karbonlens /opt/karbonlens/scripts/run_daily_score.sh`
5. Verify row counts match expected values (see §3.3 restore drill).
6. Notify Andy and update the incident log.
```

---

## 6. Dependencies & interactions

**Blocked by:**
- T01 — created the `karbonlens` OS user, `/var/lib/karbonlens/backups/`, and `/opt/karbonlens/`.

**Blocks:**
- Nothing in v0.1.

**Informs:**
- T19 — must add the backup cron line documented in §3.5 to `/etc/cron.d/karbonlens`.

**Files owned by T20** (no other story may modify these in parallel):

| Path | Action |
|---|---|
| `scrapers/scripts/pg-backup.sh` | Create |
| `scrapers/scripts/pg-restore-drill.sh` | Create |
| `docs/runbooks/backup-and-restore.md` | Create |

T20 must not modify:
- `docs/runbooks/vps-setup.md` (T01)
- `/etc/cron.d/karbonlens` (T19 owns all crontab entries)
- Any scraper Python file

---

## 7. Edge cases & failure modes

**(i) DB offline when cron fires** — `pg_dump` exits non-zero. `set -euo pipefail` propagates the failure. The script exits non-zero, cron emails root (if `MAILTO` is set in the crontab) and the failure appears in `backup.log`. The partial `.sql.gz` is deleted. Runbook: check `systemctl status postgresql`.

**(ii) Volume full mid-write** — `pg_dump | gzip >` fails when the filesystem is full. The `if pg_dump ... ; then` branch detects failure via the non-zero exit of the piped command, removes the partial file, and exits non-zero. Runbook: `df -h /mnt/HC_Volume_105261137` and manual cleanup.

**(iii) Backup directory permissions revoked** — `gzip >` fails with permission denied. Script exits non-zero. Runbook documents `chown karbonlens:karbonlens /mnt/HC_Volume_105261137/karbonlens-backups`.

**(iv) UTC vs local clock on date suffix** — `date -u +%Y-%m-%d` always emits the UTC date. A cron firing at 02:00 UTC emits `2026-04-22`, not `2026-04-21` (which it would be in Asia/Jakarta at that moment). This is correct — the date reflects when the backup was taken in UTC, which sorts consistently. Documented in §3.2.

**(v) Same-day re-run** — the filename is constant per UTC date, so the second run overwrites the first. No duplicates accumulate. The mtime-based rotation then only sees one file per date.

**(vi) Restore drill interacts with live DB** — the drill creates `karbonlens_restoretest`, a separate database. It reads from the live DB only via `SELECT COUNT(*)` queries. No writes to the live DB. The test DB is always dropped on script exit (including on failure, via the unconditional `DROP DATABASE` call).

**(vii) `karbonlens` role lacks CREATEDB** — the restore drill fails on `CREATE DATABASE`. The runbook instructs: `sudo -u postgres psql -c "ALTER ROLE karbonlens CREATEDB;"`. This privilege is not needed by any other component (the Verra/GFW scrapers do not create databases).

**(viii) Volume not mounted at boot** — if `/mnt/HC_Volume_105261137` is not mounted, the symlink `/var/lib/karbonlens/backups` resolves to a dangling path and the backup fails. The fstab entry from T01 prevents this in normal operation; a boot failure that leaves the volume unmounted will be caught by the first failed backup cron.

---

## 8. Definition of done

- [ ] All 8 acceptance criteria pass.
- [ ] `scrapers/scripts/pg-backup.sh` exists and is executable (`chmod +x`).
- [ ] `scrapers/scripts/pg-restore-drill.sh` exists and is executable.
- [ ] `docs/runbooks/backup-and-restore.md` exists and all commands verified on the VPS.
- [ ] `/var/lib/karbonlens/backups` is a symlink to `/mnt/HC_Volume_105261137/karbonlens-backups`.
- [ ] `shellcheck scrapers/scripts/pg-backup.sh scrapers/scripts/pg-restore-drill.sh` exits 0.
- [ ] A manual test backup has been created and verified (non-zero file size, file command confirms gzip + pg_custom).
- [ ] Restore drill has been run once and exited 0.
- [ ] Story's files landed in `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`: `T20 — Backups: nightly pg_dump, 14-day rotation, volume symlink, restore drill`.
- [ ] `TASKS.md` status for T20 flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

**OQ-1 — Encryption at rest**
v0.1 skips application-level encryption. Rationale: Hetzner volumes use AES encryption at the Ceph storage layer (single-tenant host; no untrusted co-tenant access to the block device). Backup files contain credentials (NextAuth session tokens, hashed passwords) and PII (user emails). v0.2 should add GPG symmetric encryption to the backup pipeline before any third party is granted storage access. Flag for Andy's review before adding off-site rsync.

**OQ-2 — Off-site copy**
v0.1 is on-box only. A single Hetzner server failure (not just disk) would lose both the live DB and the local backups. v0.2 adds `rsync` to a Hetzner Storage Box (€4/month, 1 TB) or similar S3-compatible target. The runbook should be updated at that time with rsync + SSH key setup instructions. Andy's call on timeline.

**OQ-3 — Backup size estimate**
Expected compressed size: 50–200 MB uncompressed → 5–30 MB gzipped (pg_dump custom format compresses well). 14 files × 30 MB = ~420 MB maximum retention footprint. Well within the 16 GB free on the volume. Document in the runbook under "Check available disk."

**OQ-4 — CREATEDB privilege for restore drill**
The restore drill requires `karbonlens` to have `CREATEDB`. This was not granted in T01. T20 deployment must include `ALTER ROLE karbonlens CREATEDB;` or the drill must run as the `postgres` superuser. Recommendation: grant `CREATEDB` to `karbonlens` — it is a trusted application role on a single-tenant box and the restore drill is not a scraper-facing operation.

**OQ-5 — Backup alerting**
v0.1 relies on cron emailing root on script failure (`MAILTO` in crontab). v0.2 should add Healthchecks.io (free tier) with a heartbeat ping at the end of `pg-backup.sh` so Andy gets notified if a backup is silently skipped (e.g., cron daemon not running).

---

## 10. References

- `docs/architecture.md` §3 — canonical table list backed up (projects, registries, issuances, retirements, idx_monthly_snapshots, satellite_alerts, regulatory_events, project_scores, project_match_queue, users, accounts, sessions, verification_tokens, notifications).
- `docs/architecture.md` §10 — Operational notes: backups policy (14-day local, weekly off-site in v0.2).
- `docs/TASKS.md` T20 — task block.
- `docs/TASKS.md` T01 — created `/var/lib/karbonlens/backups/`, `karbonlens` OS user, `/opt/karbonlens/`.
- `docs/TASKS.md` T19 — owns `/etc/cron.d/karbonlens`; installs the cron line documented in §3.5.
- `docs/runbooks/vps-setup.md` §8 — `install -d` commands that created the original backup directory; T20 converts it to a symlink.
- `docs/architecture.md` §13 (Phase 3 shipped state) — live DB counts used to calibrate restore drill tolerances and backup size estimates.
