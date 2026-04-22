---
id: T20
title: Backups + pg_dump cron
phase: 4
status: done
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

**Compression format:** `pg_dump -Fc` (custom format) applies zlib compression internally at level 6. No additional gzip wrapper is applied — double-compressing an already-compressed stream wastes CPU and produces a larger file. The output file uses the `.pgdump` extension to signal it is a native pg_dump custom-format file, restorable directly via `pg_restore` with no `gunzip` step.

**Encryption at rest:** v0.1 skips application-level encryption. `pg_dump -Fc` output is NOT encrypted — it is binary-encoded but `strings` can extract token values. Rationale: Hetzner volumes use AES encryption at the Ceph storage layer (single-tenant host; no untrusted co-tenant access to the block device). Backup files contain credentials (NextAuth session tokens, hashed passwords) and PII (user emails). v0.1.1 should add GPG symmetric encryption before any off-site rsync is enabled. This is flagged explicitly as an open question below.

**PGPASSWORD:** T19's `env.template` / `/opt/karbonlens/.env` owns `PGPASSWORD`. T20 scripts `source /opt/karbonlens/.env` at the top; they do not set `PGPASSWORD` themselves.

**Restore drill privilege model:** The `karbonlens` Postgres role stays minimal (no `CREATEDB`). The restore drill uses `sudo -u postgres` for `createdb` and `DROP DATABASE`. Running the drill therefore requires `sudo` access for the operator — documented in the runbook.

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
# Use rm -rf instead of rmdir: hidden files (.gitkeep) are not matched by * and
# would cause rmdir to fail with "Directory not empty".
rm -rf /var/lib/karbonlens/backups
ln -s /mnt/HC_Volume_105261137/karbonlens-backups /var/lib/karbonlens/backups

# Verify the symlink resolves correctly
ls -la /var/lib/karbonlens/backups
# Expected: lrwxrwxrwx ... /var/lib/karbonlens/backups -> /mnt/HC_Volume_105261137/karbonlens-backups
```

The volume must be mounted before Postgres starts (it is mounted at boot via `/etc/fstab`; this is already the case from T01). The backup script does not need to know about the volume path.

#### 3.2 Backup script — `scrapers/scripts/pg-backup.sh`

Create this file in the repo. It is deployed to `/opt/karbonlens/scripts/pg-backup.sh` on the VPS (T19 handles the `chmod +x` and any cron wiring).

```bash
#!/bin/bash
# pg-backup.sh — nightly pg_dump for the karbonlens database.
# Run as: sudo -u karbonlens /opt/karbonlens/scripts/pg-backup.sh
# Cron line (installed by T19):
#   0 2 * * * karbonlens /opt/karbonlens/scripts/pg-backup.sh >> /var/log/karbonlens/backup.log 2>&1

set -euo pipefail

# Guard: fail fast with a clear message if .env is absent (e.g. T19 not yet deployed).
if [ ! -f /opt/karbonlens/.env ]; then
  echo "ERROR: /opt/karbonlens/.env not found. Run T19 deployment first." >&2
  exit 1
fi

# Source env vars (PGPASSWORD lives here; file is chmod 600, karbonlens-owned)
# shellcheck source=/dev/null
source /opt/karbonlens/.env

BACKUP_DIR=/var/lib/karbonlens/backups
DATE=$(date -u +%Y-%m-%d)
BACKUP_FILE="${BACKUP_DIR}/karbonlens-${DATE}.pgdump"

# Trap: remove partial file on any error or signal before the dump completes.
trap 'rm -f "${BACKUP_FILE}"' ERR INT TERM

echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"backup_start\",\"file\":\"${BACKUP_FILE}\"}"

# pg_dump -Fc applies zlib compression internally (level 6). No additional gzip.
# Output written directly to file; pg_restore can consume it without gunzip.
pg_dump -Fc -h localhost -U karbonlens karbonlens > "${BACKUP_FILE}"

# Clear the trap — dump succeeded; file is complete.
trap - ERR INT TERM

SIZE=$(stat -c %s "${BACKUP_FILE}")
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"backup_done\",\"file\":\"${BACKUP_FILE}\",\"size\":${SIZE}}"

# Rotation: delete backup files older than 14 days.
# -print logs deleted filenames to the backup log for visibility.
find "${BACKUP_DIR}" -name 'karbonlens-*.pgdump' -mtime +14 -print -delete

echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"rotation_done\"}"
```

Key design decisions:
- `set -euo pipefail` — any subcommand failure aborts the script and exits non-zero, which cron captures.
- UTC date suffix (`date -u`) — prevents off-by-one on date rollover around midnight in Asia/Jakarta (UTC+7). Files sort lexicographically by date.
- Same-day re-run overwrites the file (same filename) — no duplicate accumulation.
- `trap 'rm -f "${BACKUP_FILE}"' ERR INT TERM` — partial file removed on any failure including OOM-killer SIGTERM. Cleared after successful dump.
- `pg_dump -Fc` only — custom format with internal zlib compression. No double-gzip. File is directly restorable via `pg_restore`.
- `find -print -delete` — deleted filenames appear in the backup log, making rotation failures visible.
- `.pgdump` extension — signals native pg_dump custom format; not a raw gzip file.

**Note on PGPASSWORD:** `/opt/karbonlens/.env` must export `PGPASSWORD`. T19 owns this file's template; T20 requires that `PGPASSWORD=<password>` is present (same value as the password in `DATABASE_URL`). This file is VPS-local, gitignored, `chmod 600`, owned by `karbonlens:karbonlens`. It is never committed to the repository.

#### 3.3 Restore drill script — `scrapers/scripts/pg-restore-drill.sh`

The restore drill uses `sudo -u postgres` for database creation and deletion so that the `karbonlens` Postgres role remains minimal (no `CREATEDB`). Running this script therefore requires the operator to have `sudo` access. See §5 runbook for the one-time `sudo` configuration note.

```bash
#!/bin/bash
# pg-restore-drill.sh — verify the latest backup is restorable and row counts match.
# Requires: sudo access (uses sudo -u postgres for createdb/dropdb).
# Exit 0 iff counts match within tolerance.

set -euo pipefail

# Guard: fail fast with a clear message if .env is absent.
if [ ! -f /opt/karbonlens/.env ]; then
  echo "ERROR: /opt/karbonlens/.env not found. Run T19 deployment first." >&2
  exit 1
fi

# shellcheck source=/dev/null
source /opt/karbonlens/.env

BACKUP_DIR=/var/lib/karbonlens/backups
# Include PID for parallel-safety (two simultaneous drill runs won't collide).
TEST_DB="karbonlens_restoretest_$$"

# Trap: drop the test DB on any exit (set -e abort, signal, or normal exit).
# Uses postgres superuser since karbonlens role has no CREATEDB/DROPDB.
trap 'sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${TEST_DB};" 2>/dev/null || true' EXIT

# Find the most recent backup file
LATEST=$(ls -t "${BACKUP_DIR}"/karbonlens-*.pgdump 2>/dev/null | head -1)
if [ -z "${LATEST}" ]; then
  echo "ERROR: no backup files found in ${BACKUP_DIR}" >&2
  exit 1
fi
echo "Using backup: ${LATEST}"

# Create the test database as postgres superuser (karbonlens role stays minimal).
sudo -u postgres createdb "${TEST_DB}"

# Restore: pg_restore reads pg_dump custom format directly (no gunzip needed).
pg_restore -h localhost -U karbonlens -d "${TEST_DB}" --no-owner --no-privileges "${LATEST}"

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

# Spot-check: verify MAX(id) of projects matches (catches silent FK truncation).
RESTORED_MAX=$(psql -h localhost -U karbonlens -d "${TEST_DB}" -tAc "SELECT MAX(id) FROM projects;")
LIVE_MAX=$(psql -h localhost -U karbonlens -d karbonlens -tAc "SELECT MAX(id) FROM projects;")
if [ "${RESTORED_MAX}" = "${LIVE_MAX}" ]; then
  echo "PASS projects.MAX(id): ${RESTORED_MAX}"
  PASS=$(( PASS + 1 ))
else
  echo "FAIL projects.MAX(id): restored=${RESTORED_MAX}, live=${LIVE_MAX}"
  FAIL=$(( FAIL + 1 ))
fi

# EXIT trap fires DROP DATABASE automatically on any exit path.

echo "Results: ${PASS} PASS, ${FAIL} FAIL"
if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi
exit 0
```

#### 3.4 Runbook — `docs/runbooks/backup-and-restore.md`

A new runbook file. Content is specified in §5 (Inputs & outputs) below.

The restore drill uses `sudo -u postgres` — the operator running it must have `sudo` access (root or a user in the `sudo` group). Document this in the runbook under "One-time setup."

#### 3.5 Cron line (informational — installed by T19)

T19 owns `/etc/cron.d/karbonlens`. T20 documents the exact line T19 should add:

```
0 2 * * * karbonlens /opt/karbonlens/scripts/pg-backup.sh >> /var/log/karbonlens/backup.log 2>&1
```

This fires at 02:00 UTC (09:00 Asia/Jakarta) daily, running as the `karbonlens` Unix user.

### Out of scope (explicit non-goals)

- `pg_dumpall` — we have a single database; per-database `pg_dump` is sufficient.
- Point-in-time recovery / WAL archiving — v0.2. Requires significant PostgreSQL configuration changes.
- Off-site replication (rsync to Hetzner Storage Box or S3/B2) — v0.1.1. See §9 OQ-2.
- Encrypted backups — v0.1.1. See §9 OQ-1. Must land before off-site rsync (OQ-2).
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
 And a file matching /var/lib/karbonlens/backups/karbonlens-YYYY-MM-DD.pgdump exists
 And the file size is > 5MB (pg_dump -Fc compresses to ~5–30MB for a 50–200MB DB)
 And the backup.log contains a JSON line with "backup_done"
```

**AC-2: Same-day re-run overwrites — no duplicate**
```
Given a backup file karbonlens-<today>.pgdump already exists in BACKUP_DIR
When sudo -u karbonlens /opt/karbonlens/scripts/pg-backup.sh
Then the exit code is 0
 And ls BACKUP_DIR | grep <today> | wc -l equals 1 (one file, not two)
 And the file mtime is updated
```

**AC-3: Rotation removes files older than 14 days**
```
Given 20 dummy files named karbonlens-YYYY-MM-DD.pgdump are created in BACKUP_DIR
 And all 20 files have mtime set to 15-35 days ago (touch -d "N days ago")
 And the current backup file for today also exists
When sudo -u karbonlens /opt/karbonlens/scripts/pg-backup.sh
Then all 20 old dummy files are deleted
 And the today file is retained
 And any files with mtime <= 14 days would be retained (test with one at exactly 14 days)
 And the backup.log shows filenames of deleted files (from find -print)
```

**AC-4: Restore drill exits 0; row counts match within tolerance**
```
Given a valid backup file exists in BACKUP_DIR
 And the operator has sudo access (required for sudo -u postgres createdb/dropdb)
When <operator> /opt/karbonlens/scripts/pg-restore-drill.sh
Then the exit code is 0
 And the output contains "PASS projects"
 And the output contains "PASS satellite_alerts" (within 1% tolerance)
 And the output contains "PASS projects.MAX(id)"
 And the output contains "Results: N PASS, 0 FAIL"
 And the karbonlens_restoretest_<PID> database is dropped before the script exits
```

**AC-5: /var/lib/karbonlens/backups is a symlink to the volume**
```
Given the volume /mnt/HC_Volume_105261137 is mounted
When stat /var/lib/karbonlens/backups
Then the path is a symbolic link (file type 'l')
 And the link target is /mnt/HC_Volume_105261137/karbonlens-backups
 And ls /var/lib/karbonlens/backups/ lists the actual backup files on the volume
```

**AC-6: Backup file is pg_dump custom format (not double-compressed)**
```
Given a backup file karbonlens-YYYY-MM-DD.pgdump was created by pg-backup.sh
When file /var/lib/karbonlens/backups/karbonlens-YYYY-MM-DD.pgdump
Then the output matches "^PostgreSQL custom database dump$"
 (pg_dump -Fc output; NOT "gzip compressed data" — no outer gzip wrapper)
When pg_restore --list karbonlens-YYYY-MM-DD.pgdump | head -5
Then the output lists database objects (tables, sequences, etc.) without error
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
- `PGPASSWORD` — sourced from `/opt/karbonlens/.env` (VPS-local, never committed; T19 owns the template; T20 requires `PGPASSWORD=<password>` is present alongside `DATABASE_URL` and other scraper env vars).
- Postgres role `karbonlens` with `CONNECT` on database `karbonlens`. No `CREATEDB` — the restore drill uses `sudo -u postgres` instead (principle of least privilege).
- `/var/lib/karbonlens/backups/` → symlink to `/mnt/HC_Volume_105261137/karbonlens-backups/` (set up during T20 deployment).
- Volume `/mnt/HC_Volume_105261137` — must be mounted at boot (already in `/etc/fstab` from T01).
- Operator `sudo` access — required to run the restore drill (`sudo -u postgres createdb/dropdb`).

**Outputs:**

| File / Path | Action | Notes |
|---|---|---|
| `scrapers/scripts/pg-backup.sh` | Create | Deployed to `/opt/karbonlens/scripts/pg-backup.sh` on VPS |
| `scrapers/scripts/pg-restore-drill.sh` | Create | Deployed to `/opt/karbonlens/scripts/pg-restore-drill.sh` on VPS |
| `docs/runbooks/backup-and-restore.md` | Create | Operator runbook |
| `/var/lib/karbonlens/backups` | Convert to symlink | Manual VPS step; backed by volume |
| `/mnt/HC_Volume_105261137/karbonlens-backups/` | Create dir | Volume-resident storage |
| `/var/log/karbonlens/backup.log` | Append | Structured JSON log lines per run |
| `/var/lib/karbonlens/backups/karbonlens-YYYY-MM-DD.pgdump` | Create/overwrite daily | Backup file (pg_dump custom format, zlib-compressed internally) |

**Content of `docs/runbooks/backup-and-restore.md`** (T20 creates this file):

```markdown
# Backup and restore runbook — KarbonLens

## One-time setup

### Ensure PGPASSWORD is in /opt/karbonlens/.env

The backup script sources `/opt/karbonlens/.env`. This file must contain:

```
PGPASSWORD=<same password as in DATABASE_URL>
```

If it is absent, add it (as root or karbonlens):

```bash
# Check current contents
grep PGPASSWORD /opt/karbonlens/.env || echo "MISSING — add it"
```

### Sudo access for restore drill

The restore drill uses `sudo -u postgres` to create and drop the test database (the `karbonlens` Postgres role has no CREATEDB privilege — least privilege policy). The operator running the drill must have `sudo` access. Verify:

```bash
sudo -u postgres psql -c "SELECT 1;"
# Must succeed without a password prompt
```

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
# Expected: ~16 GB free (25 GB volume). 14 × 30 MB = ~420 MB max retention footprint.
```

## Restore a specific backup to a target database

```bash
# List available backups
ls -lht /var/lib/karbonlens/backups/

# Restore to a named target DB (create with postgres superuser; karbonlens role has no CREATEDB)
TARGET=karbonlens_restored_20260422
sudo -u postgres psql -c "CREATE DATABASE ${TARGET} OWNER karbonlens;"

# pg_restore reads pg_dump custom format directly — no gunzip step needed
pg_restore -h localhost -U karbonlens -d "${TARGET}" \
  --no-owner --no-privileges \
  /var/lib/karbonlens/backups/karbonlens-YYYY-MM-DD.pgdump

# Verify
psql -h localhost -U karbonlens -d "${TARGET}" -c "SELECT COUNT(*) FROM projects;"

# Drop when done
sudo -u postgres psql -c "DROP DATABASE ${TARGET};"
```

## Run the restore drill

Requires sudo access (see One-time setup above).

```bash
/opt/karbonlens/scripts/pg-restore-drill.sh
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
find /var/lib/karbonlens/backups -name 'karbonlens-*.pgdump' -mtime +7 -print -delete
```

## If backup permissions break

```bash
chown karbonlens:karbonlens /mnt/HC_Volume_105261137/karbonlens-backups
chmod 750 /mnt/HC_Volume_105261137/karbonlens-backups
```

## Backup failure alerting (v0.1)

T19 sets `MAILTO=""` in the crontab, so cron does NOT email root on backup failure. In v0.1 the only signal is the backup log and a stale file mtime. Check daily:

```bash
tail -3 /var/log/karbonlens/backup.log
ls -lht /var/lib/karbonlens/backups/ | head -3
```

Healthchecks.io heartbeat alerting is deferred to v0.2 (OQ-5).

## Disaster recovery (worst case: full DB loss)

1. Stop all scrapers / cron if running.
2. Restore the latest backup to the live database:
   ```bash
   # WARNING: drops and recreates the live database
   sudo -u postgres psql -c "DROP DATABASE karbonlens;"
   sudo -u postgres psql -c "CREATE DATABASE karbonlens OWNER karbonlens;"
   LATEST=$(ls -t /var/lib/karbonlens/backups/karbonlens-*.pgdump | head -1)
   pg_restore -h localhost -U karbonlens -d karbonlens \
     --no-owner --no-privileges "${LATEST}"
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

**Soft dependency:**
- T19 — T20 scripts source `/opt/karbonlens/.env` which T19 owns. If T19 has not yet deployed that file, both scripts fail with a clear error message. The T20 `blocked_by` list retains only `[T01]` (T19 and T20 are parallel specs), but T19 must land before T20 scripts are exercised on the VPS.

**Blocks:**
- Nothing in v0.1.

**Informs:**
- T19 — must add the backup cron line documented in §3.5 to `/etc/cron.d/karbonlens`, and must ensure `PGPASSWORD` is included in the `.env` template.

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

**(i) DB offline when cron fires** — `pg_dump` exits non-zero. `set -euo pipefail` propagates the failure; the `trap` fires and removes the partial `.pgdump` file. The script exits non-zero and the failure appears in `backup.log`. Note: T19 sets `MAILTO=""` in the crontab, so cron does NOT email root — the only signal is the log and a stale file mtime. Runbook: check `systemctl status postgresql`.

**(ii) Volume full mid-write** — `pg_dump > "${BACKUP_FILE}"` fails when the filesystem is full. `set -e` triggers the `trap`, which removes the partial file. The script exits non-zero. Runbook: `df -h /mnt/HC_Volume_105261137` and manual cleanup.

**(iii) Backup directory permissions revoked** — `pg_dump >` fails with permission denied. The `trap` fires; partial file removed. Script exits non-zero. Runbook documents `chown karbonlens:karbonlens /mnt/HC_Volume_105261137/karbonlens-backups`.

**(iv) UTC vs local clock on date suffix** — `date -u +%Y-%m-%d` always emits the UTC date. A cron firing at 02:00 UTC emits `2026-04-22`, not `2026-04-21` (which it would be in Asia/Jakarta at that moment). This is correct — the date reflects when the backup was taken in UTC, which sorts consistently. Documented in §3.2.

**(v) Same-day re-run** — the filename is constant per UTC date, so the second run overwrites the first. No duplicates accumulate. The mtime-based rotation then only sees one file per date.

**(vi) OOM kill mid-write** — if the kernel OOM killer sends SIGTERM/SIGKILL to `pg_dump`, the `trap 'rm -f "${BACKUP_FILE}"' ERR INT TERM` fires (SIGTERM is caught; SIGKILL cannot be trapped but leaves the partial file, which will be overwritten on the next successful run since the filename is date-based). The today-dated partial file is replaced the following night at the latest.

**(vii) Restore drill pg_restore failure** — if `pg_restore` exits non-zero (corrupted backup, missing extension, FK violation), `set -e` triggers the `EXIT` trap which drops `karbonlens_restoretest_<PID>` via `sudo -u postgres psql`. No orphaned test databases accumulate.

**(viii) Volume not mounted at boot** — if `/mnt/HC_Volume_105261137` is not mounted, the symlink `/var/lib/karbonlens/backups` resolves to a dangling path and the backup fails. The fstab entry from T01 prevents this in normal operation; a boot failure that leaves the volume unmounted will be caught by the first failed backup cron.

**(ix) Rotation visibility** — `find -delete` is silent. The `-print` flag before `-delete` logs deleted filenames to the backup log, making rotation activity (and any permission-denied failures) visible.

**(x) `rmdir` vs `rm -rf` during symlink setup** — The glob `mv /var/lib/karbonlens/backups/*` does not match hidden files (e.g. `.gitkeep`). `rmdir` would fail if any hidden file remains. The spec uses `rm -rf` instead (safe since directory contents were just moved) with an explanatory comment.

---

## 8. Definition of done

- [ ] All 8 acceptance criteria pass.
- [ ] `scrapers/scripts/pg-backup.sh` exists and is executable (`chmod +x`).
- [ ] `scrapers/scripts/pg-restore-drill.sh` exists and is executable.
- [ ] `docs/runbooks/backup-and-restore.md` exists and all commands verified on the VPS.
- [ ] `/var/lib/karbonlens/backups` is a symlink to `/mnt/HC_Volume_105261137/karbonlens-backups`.
- [ ] `shellcheck scrapers/scripts/pg-backup.sh scrapers/scripts/pg-restore-drill.sh` exits 0.
- [ ] A manual test backup has been created and verified (`file karbonlens-YYYY-MM-DD.pgdump` returns `PostgreSQL custom database dump`; `pg_restore --list` lists objects).
- [ ] Restore drill has been run once and exited 0 (operator has sudo access confirmed).
- [ ] `/opt/karbonlens/.env` contains `PGPASSWORD=<password>` (verify with `grep PGPASSWORD /opt/karbonlens/.env`).
- [ ] Story's files landed in `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`: `T20 — Backups: nightly pg_dump -Fc, 14-day rotation, volume symlink, restore drill`.
- [ ] `TASKS.md` status for T20 flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

**OQ-1 — Encryption at rest**
v0.1 skips application-level encryption. `pg_dump -Fc` output is NOT encrypted — it is binary but `strings` extracts OAuth tokens and user emails in plain text. Hetzner volumes use AES encryption at the Ceph storage layer (single-tenant host; no untrusted co-tenant access to the block device). This is acceptable for v0.1 with no off-site copy. v0.1.1 must add GPG symmetric encryption (`gpg --symmetric --batch --passphrase-fd 0` from `BACKUP_GPG_PASSPHRASE` in `.env`) before any off-site rsync is enabled, since rsync to a Hetzner Storage Box dramatically increases exposure surface.

**OQ-2 — Off-site copy**
v0.1 is on-box only. A Hetzner CX32 host-level failure destroys both the live Postgres data and the Hetzner volume simultaneously (volumes survive disk failure but not host-level catastrophe or accidental server deletion). v0.1.1 extension: add `rsync` to a Hetzner Storage Box (~€4/mo, 1 TB) or similar S3-compatible target — one additional cron line, non-breaking change. Must land after OQ-1 (encryption) to avoid transmitting plaintext backups off-box.

**OQ-3 — Backup size estimate**
Expected compressed size: 50–200 MB uncompressed → 5–30 MB with `pg_dump -Fc` zlib compression (custom format compresses well; no double-gzip overhead). 14 files × 30 MB = ~420 MB maximum retention footprint. Well within the 16 GB free on the volume. Documented in the runbook under "Check available disk."

**OQ-4 — CREATEDB privilege for restore drill** *(resolved)*
The restore drill does NOT use `karbonlens CREATEDB`. Instead `sudo -u postgres createdb / DROP DATABASE` is used, keeping the `karbonlens` Postgres role minimal (principle of least privilege). The operator running the drill must have OS-level `sudo` access. No `ALTER ROLE karbonlens CREATEDB;` required.

**OQ-5 — Backup alerting**
v0.1 relies on manual log inspection (T19 sets `MAILTO=""` — cron does not email on failure). v0.2 should add Healthchecks.io (free tier) with a heartbeat ping at the end of `pg-backup.sh` so Andy gets notified if a backup is silently skipped (e.g., cron daemon not running).

---

## 10. References

- `docs/architecture.md` §3 — canonical table list backed up (projects, registries, issuances, retirements, idx_monthly_snapshots, satellite_alerts, regulatory_events, project_scores, project_match_queue, users, accounts, sessions, verification_tokens, notifications).
- `docs/architecture.md` §10 — Operational notes: backups policy (14-day local, weekly off-site in v0.2).
- `docs/TASKS.md` T20 — task block.
- `docs/TASKS.md` T01 — created `/var/lib/karbonlens/backups/`, `karbonlens` OS user, `/opt/karbonlens/`.
- `docs/TASKS.md` T19 — owns `/etc/cron.d/karbonlens`; installs the cron line documented in §3.5; owns `/opt/karbonlens/.env` template (must include `PGPASSWORD`).
- `docs/runbooks/vps-setup.md` §8 — `install -d` commands that created the original backup directory; T20 converts it to a symlink.
- `docs/architecture.md` §13 (Phase 3 shipped state) — live DB counts used to calibrate restore drill tolerances and backup size estimates.
- `docs/stories/reviews/T20-spec-audit.md` — 4 blocking issues resolved in this revision: B1 (trap cleanup), B2 (double-compression eliminated), B3 (restore drill EXIT trap), B4 (CREATEDB replaced by sudo -u postgres).
